import base64
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
from typing import Protocol
from uuid import UUID

from .auth import has_patient_access
from .models import (
    Alert,
    AlertEscalationState,
    AlertSeverity,
    AlertStatus,
    EscalationPolicy,
    EscalationRole,
    EscalationStatus,
    MeasurementEvent,
    MockNotification,
    NotificationDeliveryStatus,
)
from .monitoring import DEMO_THRESHOLDS, DemonstrationThreshold, evaluate_demo_threshold, validate_thresholds
from .store import EventIdConflict, EventSubmission


class AlertNotFound(LookupError):
    pass


class InvalidAlertTransition(ValueError):
    pass


class EventRepository(Protocol):
    def submit(self, event: MeasurementEvent, evaluate_alerts: bool = True) -> EventSubmission: ...

    def save_quality_alert(self, alert: Alert) -> Alert: ...

    def acknowledge_alert(self, alert_id: UUID, actor_id: str, note: str | None = None) -> Alert: ...

    def resolve_alert(
        self,
        alert_id: UUID,
        actor_id: str,
        resolution_code: str,
        note: str | None = None,
    ) -> Alert: ...

    def get_alert(self, alert_id: UUID) -> Alert: ...


class SQLiteRepository:
    """Durable local repository for the synthetic RPM prototype."""

    def __init__(
        self,
        database_path: str | Path,
        clock: Callable[[], datetime] | None = None,
        thresholds: dict[object, DemonstrationThreshold] | None = None,
    ) -> None:
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self._thresholds = validate_thresholds(thresholds or DEMO_THRESHOLDS)
        self.initialize()

    def initialize(self) -> None:
        with self._connection() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY,
                    applied_at TEXT NOT NULL
                )
                """
            )
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS measurements (
                    event_id TEXT PRIMARY KEY,
                    patient_id TEXT NOT NULL,
                    payload_hash TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    measurement_type TEXT NOT NULL,
                    value REAL NOT NULL,
                    unit TEXT NOT NULL,
                    measured_at TEXT NOT NULL,
                    received_at TEXT NOT NULL,
                    source TEXT NOT NULL,
                    is_simulated INTEGER NOT NULL CHECK (is_simulated IN (0, 1))
                );

                CREATE TABLE IF NOT EXISTS alerts (
                    alert_id TEXT PRIMARY KEY,
                    patient_id TEXT NOT NULL,
                    related_event_id TEXT,
                    category TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    reason_json TEXT NOT NULL,
                    reason_code TEXT NOT NULL,
                    rule_version TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    status TEXT NOT NULL CHECK (status IN ('open', 'acknowledged', 'resolved')),
                    acknowledged_at TEXT,
                    acknowledged_by TEXT,
                    acknowledgement_note TEXT,
                    resolved_at TEXT,
                    resolved_by TEXT,
                    resolution_code TEXT,
                    resolution_note TEXT
                );

                CREATE INDEX IF NOT EXISTS idx_measurements_patient_time
                    ON measurements (patient_id, measured_at DESC);
                CREATE INDEX IF NOT EXISTS idx_alerts_patient_status
                    ON alerts (patient_id, status, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_alerts_related_event
                    ON alerts (related_event_id);
                CREATE UNIQUE INDEX IF NOT EXISTS uq_active_alert_condition
                    ON alerts (patient_id, category, reason_code, rule_version)
                    WHERE status IN ('open', 'acknowledged');

                CREATE TABLE IF NOT EXISTS patients (
                    patient_id TEXT PRIMARY KEY,
                    display_name TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at TEXT NOT NULL,
                    is_simulated INTEGER NOT NULL CHECK (is_simulated IN (0, 1))
                );

                CREATE TABLE IF NOT EXISTS escalation_policies (
                    policy_id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    category TEXT,
                    min_severity TEXT NOT NULL,
                    initial_target_role TEXT NOT NULL,
                    escalation_delay_seconds INTEGER NOT NULL,
                    subsequent_target_role TEXT,
                    max_attempts INTEGER NOT NULL DEFAULT 3,
                    retry_delay_seconds INTEGER NOT NULL DEFAULT 60,
                    stop_on_acknowledge INTEGER NOT NULL DEFAULT 1,
                    stop_on_resolve INTEGER NOT NULL DEFAULT 1,
                    is_demo INTEGER NOT NULL DEFAULT 1
                );

                CREATE TABLE IF NOT EXISTS alert_escalations (
                    alert_id TEXT PRIMARY KEY REFERENCES alerts(alert_id) ON DELETE CASCADE,
                    policy_id TEXT NOT NULL REFERENCES escalation_policies(policy_id),
                    patient_id TEXT NOT NULL,
                    current_level INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL CHECK (status IN ('pending', 'escalated', 'acknowledged_stopped', 'resolved_stopped', 'max_reached')),
                    created_at TEXT NOT NULL,
                    next_due_at TEXT,
                    last_escalated_at TEXT,
                    attempts_count INTEGER NOT NULL DEFAULT 0,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS mock_notifications (
                    notification_id TEXT PRIMARY KEY,
                    alert_id TEXT NOT NULL REFERENCES alerts(alert_id) ON DELETE CASCADE,
                    patient_id TEXT NOT NULL,
                    escalation_level INTEGER NOT NULL,
                    recipient_role TEXT NOT NULL,
                    recipient_target TEXT NOT NULL,
                    channel TEXT NOT NULL,
                    message_body TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    attempted_at TEXT NOT NULL,
                    delivery_status TEXT NOT NULL CHECK (delivery_status IN ('delivered', 'failed', 'retrying')),
                    retry_count INTEGER NOT NULL DEFAULT 0,
                    failure_reason TEXT,
                    is_simulated INTEGER NOT NULL CHECK (is_simulated IN (0, 1))
                );

                CREATE INDEX IF NOT EXISTS idx_alert_escalations_due
                    ON alert_escalations (status, next_due_at);
                CREATE INDEX IF NOT EXISTS idx_alert_escalations_patient
                    ON alert_escalations (patient_id);
                CREATE INDEX IF NOT EXISTS idx_mock_notifications_alert
                    ON mock_notifications (alert_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_mock_notifications_patient
                    ON mock_notifications (patient_id);
                """
            )
            now_iso = self._iso(datetime.now(timezone.utc))
            connection.execute(
                """
                INSERT OR IGNORE INTO patients (patient_id, display_name, status, created_at, is_simulated)
                VALUES
                    ('PC-SYNTH01', 'Synthetic Patient 01', 'active', ?, 1),
                    ('PC-DEMO01', 'Demo Patient', 'active', ?, 1)
                """,
                (now_iso, now_iso),
            )
            connection.execute(
                """
                INSERT OR IGNORE INTO escalation_policies (
                    policy_id, name, category, min_severity, initial_target_role,
                    escalation_delay_seconds, subsequent_target_role, max_attempts,
                    retry_delay_seconds, stop_on_acknowledge, stop_on_resolve, is_demo
                ) VALUES
                ('policy-critical', 'Critical Demo Policy (5m CHW -> Supervisor)', NULL, 'critical', 'community_health_worker', 300, 'supervisor', 3, 60, 1, 1, 1),
                ('policy-high', 'High Severity Demo Policy (15m CHW -> Supervisor)', NULL, 'high', 'community_health_worker', 900, 'supervisor', 3, 120, 1, 1, 1),
                ('policy-default', 'Standard Warning Demo Policy (30m CHW -> Supervisor)', NULL, 'medium', 'community_health_worker', 1800, 'supervisor', 2, 180, 1, 1, 1)
                """
            )
            migration = connection.execute(
                "SELECT MAX(version) AS version FROM schema_migrations"
            ).fetchone()
            current_version = migration["version"] or 0
            if current_version == 0:
                connection.execute(
                    "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)",
                    (1, self._iso(datetime.now(timezone.utc))),
                )
                current_version = 1
            if current_version < 2:
                connection.execute(
                    """
                    CREATE TABLE IF NOT EXISTS audit_log (
                        audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
                        actor_id TEXT NOT NULL,
                        action TEXT NOT NULL,
                        alert_id TEXT,
                        occurred_at TEXT NOT NULL,
                        success INTEGER NOT NULL CHECK (success IN (0, 1)),
                        metadata_json TEXT NOT NULL
                    )
                    """
                )
                connection.execute(
                    "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)",
                    (2, self._iso(datetime.now(timezone.utc))),
                )
            if current_version < 3:
                for column in ("previous_hash", "current_hash"):
                    try:
                        connection.execute(f"ALTER TABLE audit_log ADD COLUMN {column} TEXT")
                    except sqlite3.OperationalError as error:
                        if "duplicate column" not in str(error).lower():
                            raise
                connection.execute(
                    """
                    CREATE TABLE IF NOT EXISTS revoked_tokens (
                        jti TEXT PRIMARY KEY,
                        revoked_at TEXT NOT NULL,
                        expires_at TEXT NOT NULL,
                        actor_id TEXT NOT NULL
                    )
                    """
                )
                connection.execute(
                    "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)",
                    (3, self._iso(datetime.now(timezone.utc))),
                )

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.database_path, timeout=30, isolation_level=None)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 30000")
        try:
            yield connection
        finally:
            connection.close()

    @contextmanager
    def _transaction(self) -> Iterator[sqlite3.Connection]:
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                yield connection
            except Exception:
                if connection.in_transaction:
                    connection.rollback()
                raise
            else:
                if connection.in_transaction:
                    connection.commit()

    def submit(self, event: MeasurementEvent, evaluate_alerts: bool = True) -> EventSubmission:
        payload_hash = self._payload_hash(event)
        with self._transaction() as connection:
            existing = connection.execute(
                "SELECT * FROM measurements WHERE event_id = ?",
                (str(event.event_id),),
            ).fetchone()
            if existing is not None:
                if existing["payload_hash"] != payload_hash:
                    raise EventIdConflict("event_id_conflict")
                stored_event = self._event_from_row(existing)
                return EventSubmission(
                    status="duplicate",
                    event=stored_event,
                    received_at=stored_event.received_at,
                    alerts=self._alerts_for_event(connection, event.event_id),
                )

            received_at = self._trusted_time()
            accepted_event = event.model_copy(update={"received_at": received_at})
            connection.execute(
                """
                INSERT INTO measurements (
                    event_id, patient_id, payload_hash, payload_json, measurement_type,
                    value, unit, measured_at, received_at, source, is_simulated
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(accepted_event.event_id),
                    accepted_event.patient_id,
                    payload_hash,
                    self._payload_json(accepted_event),
                    accepted_event.measurement_type.value,
                    accepted_event.value,
                    accepted_event.unit.value,
                    self._iso(accepted_event.measured_at),
                    self._iso(received_at),
                    accepted_event.source.value,
                    int(accepted_event.is_simulated),
                ),
            )
            connection.execute(
                """
                INSERT OR IGNORE INTO patients (patient_id, display_name, status, created_at, is_simulated)
                VALUES (?, ?, 'active', ?, ?)
                """,
                (
                    accepted_event.patient_id,
                    f"Patient {accepted_event.patient_id}",
                    self._iso(received_at),
                    int(accepted_event.is_simulated),
                ),
            )

            alerts: tuple[Alert, ...] = ()
            if evaluate_alerts:
                candidate = evaluate_demo_threshold(accepted_event, self._thresholds)
                if candidate is not None:
                    alert = self._insert_or_get_active_alert(connection, candidate)
                    alerts = (alert,)
            return EventSubmission(
                status="accepted",
                event=accepted_event,
                received_at=received_at,
                alerts=alerts,
            )

    def save_quality_alert(self, alert: Alert) -> Alert:
        with self._transaction() as connection:
            return self._insert_or_get_active_alert(connection, alert)

    def acknowledge_alert(self, alert_id: UUID, actor_id: str, note: str | None = None) -> Alert:
        with self._transaction() as connection:
            try:
                row = self._alert_row(connection, alert_id)
            except AlertNotFound:
                self._write_audit(
                    connection, actor_id, "alert_acknowledge", alert_id, False,
                    {"reason": "unknown_alert_id"},
                )
                connection.commit()
                raise
            if row["status"] == AlertStatus.RESOLVED.value:
                self._write_audit(
                    connection, actor_id, "alert_acknowledge", alert_id, False,
                    {"reason": "resolved_alert"},
                )
                connection.commit()
                raise InvalidAlertTransition("resolved alerts cannot be acknowledged")
            if row["status"] == AlertStatus.ACKNOWLEDGED.value:
                self._write_audit(
                    connection, actor_id, "alert_acknowledge", alert_id, True,
                    {"idempotent": True},
                )
                return self._alert_from_row(row)
            acknowledged_at = self._trusted_time()
            connection.execute(
                """
                UPDATE alerts
                SET status = 'acknowledged', acknowledged_at = ?, acknowledged_by = ?, acknowledgement_note = ?
                WHERE alert_id = ? AND status = 'open'
                """,
                (self._iso(acknowledged_at), actor_id, note, str(alert_id)),
            )
            # Stop pending escalation if policy specifies stop_on_acknowledge
            connection.execute(
                """
                UPDATE alert_escalations
                SET status = 'acknowledged_stopped', next_due_at = NULL, updated_at = ?
                WHERE alert_id = ? AND status IN ('pending', 'escalated')
                """,
                (self._iso(acknowledged_at), str(alert_id)),
            )
            self._write_audit(
                connection, actor_id, "alert_acknowledge", alert_id, True,
                {"note_present": note is not None, "escalation_stopped": True, "acknowledged_at": self._iso(acknowledged_at)},
            )
            return self._alert_from_row(self._alert_row(connection, alert_id))

    def resolve_alert(
        self,
        alert_id: UUID,
        actor_id: str,
        resolution_code: str,
        note: str | None = None,
    ) -> Alert:
        with self._transaction() as connection:
            try:
                row = self._alert_row(connection, alert_id)
            except AlertNotFound:
                self._write_audit(
                    connection, actor_id, "alert_resolve", alert_id, False,
                    {"reason": "unknown_alert_id"},
                )
                connection.commit()
                raise
            if row["status"] == AlertStatus.OPEN.value:
                self._write_audit(
                    connection, actor_id, "alert_resolve", alert_id, False,
                    {"reason": "open_alert"},
                )
                connection.commit()
                raise InvalidAlertTransition("open alerts must be acknowledged before resolution")
            if row["status"] == AlertStatus.RESOLVED.value:
                self._write_audit(
                    connection, actor_id, "alert_resolve", alert_id, True,
                    {"idempotent": True},
                )
                return self._alert_from_row(row)
            resolved_at = self._trusted_time()
            connection.execute(
                """
                UPDATE alerts
                SET status = 'resolved', resolved_at = ?, resolved_by = ?, resolution_code = ?, resolution_note = ?
                WHERE alert_id = ? AND status = 'acknowledged'
                """,
                (self._iso(resolved_at), actor_id, resolution_code, note, str(alert_id)),
            )
            # Stop pending escalation if policy specifies stop_on_resolve
            connection.execute(
                """
                UPDATE alert_escalations
                SET status = 'resolved_stopped', next_due_at = NULL, updated_at = ?
                WHERE alert_id = ? AND status IN ('pending', 'escalated', 'acknowledged_stopped')
                """,
                (self._iso(resolved_at), str(alert_id)),
            )
            self._write_audit(
                connection, actor_id, "alert_resolve", alert_id, True,
                {"resolution_code": resolution_code, "note_present": note is not None, "escalation_stopped": True, "resolved_at": self._iso(resolved_at)},
            )
            return self._alert_from_row(self._alert_row(connection, alert_id))

    def get_alert(self, alert_id: UUID) -> Alert:
        with self._connection() as connection:
            return self._alert_from_row(self._alert_row(connection, alert_id))

    def list_alerts(self, active_only: bool = False) -> list[Alert]:
        with self._connection() as connection:
            query = "SELECT * FROM alerts"
            if active_only:
                query += " WHERE status IN ('open', 'acknowledged')"
            query += " ORDER BY created_at DESC"
            return [self._alert_from_row(row) for row in connection.execute(query)]

    def list_patients(
        self,
        allowed_patient_ids: list[str] | None = None,
        limit: int = 50,
        cursor: str | None = None,
    ) -> tuple[list[dict], str | None]:
        bounded_limit = max(1, min(limit, 100))
        params: list[object] = []
        conditions: list[str] = []

        if allowed_patient_ids is not None:
            if not allowed_patient_ids:
                return ([], None)
            placeholders = ", ".join("?" for _ in allowed_patient_ids)
            conditions.append(f"patient_id IN ({placeholders})")
            params.extend(allowed_patient_ids)

        if cursor:
            try:
                decoded_cursor = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
            except Exception:
                decoded_cursor = cursor
            conditions.append("patient_id > ?")
            params.append(decoded_cursor)

        where_clause = f" WHERE {' AND '.join(conditions)}" if conditions else ""
        query = (
            f"SELECT patient_id, display_name, status, created_at, is_simulated "
            f"FROM patients{where_clause} ORDER BY patient_id ASC LIMIT ?"
        )
        params.append(bounded_limit + 1)

        with self._connection() as connection:
            rows = connection.execute(query, params).fetchall()

        has_more = len(rows) > bounded_limit
        selected_rows = rows[:bounded_limit]
        items = [
            {
                "patient_id": row["patient_id"],
                "display_name": row["display_name"],
                "status": row["status"],
                "created_at": row["created_at"],
                "is_simulated": bool(row["is_simulated"]),
            }
            for row in selected_rows
        ]
        next_cursor = None
        if has_more and selected_rows:
            last_id = selected_rows[-1]["patient_id"]
            next_cursor = base64.urlsafe_b64encode(last_id.encode("utf-8")).decode("ascii")

        return (items, next_cursor)

    def list_measurements(
        self,
        patient_id: str,
        measurement_type: str | None = None,
        limit: int = 50,
        cursor: str | None = None,
    ) -> tuple[list[MeasurementEvent], str | None]:
        bounded_limit = max(1, min(limit, 100))
        params: list[object] = [patient_id]
        conditions: list[str] = ["patient_id = ?"]

        if measurement_type:
            conditions.append("measurement_type = ?")
            params.append(measurement_type)

        if cursor:
            try:
                raw_cursor = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
                measured_at_cur, event_id_cur = raw_cursor.split("|", 1)
                conditions.append("(measured_at < ? OR (measured_at = ? AND event_id > ?))")
                params.extend([measured_at_cur, measured_at_cur, event_id_cur])
            except Exception as exc:
                raise ValueError("Invalid cursor format") from exc

        where_clause = " WHERE " + " AND ".join(conditions)
        query = f"SELECT * FROM measurements{where_clause} ORDER BY measured_at DESC, event_id ASC LIMIT ?"
        params.append(bounded_limit + 1)

        with self._connection() as connection:
            rows = connection.execute(query, params).fetchall()

        has_more = len(rows) > bounded_limit
        selected_rows = rows[:bounded_limit]
        items = [self._event_from_row(row) for row in selected_rows]

        next_cursor = None
        if has_more and selected_rows:
            last_row = selected_rows[-1]
            raw_next = f"{last_row['measured_at']}|{last_row['event_id']}"
            next_cursor = base64.urlsafe_b64encode(raw_next.encode("utf-8")).decode("ascii")

        return (items, next_cursor)

    def list_alerts_paginated(
        self,
        allowed_patient_ids: list[str] | None = None,
        patient_id: str | None = None,
        status: str | None = None,
        category: str | None = None,
        limit: int = 50,
        cursor: str | None = None,
    ) -> tuple[list[Alert], str | None]:
        bounded_limit = max(1, min(limit, 100))
        params: list[object] = []
        conditions: list[str] = []

        if patient_id:
            conditions.append("patient_id = ?")
            params.append(patient_id)
        elif allowed_patient_ids is not None:
            if not allowed_patient_ids:
                return ([], None)
            placeholders = ", ".join("?" for _ in allowed_patient_ids)
            conditions.append(f"patient_id IN ({placeholders})")
            params.extend(allowed_patient_ids)

        if status:
            conditions.append("status = ?")
            params.append(status)

        if category:
            conditions.append("category = ?")
            params.append(category)

        if cursor:
            try:
                raw_cursor = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
                created_at_cur, alert_id_cur = raw_cursor.split("|", 1)
                conditions.append("(created_at < ? OR (created_at = ? AND alert_id > ?))")
                params.extend([created_at_cur, created_at_cur, alert_id_cur])
            except Exception as exc:
                raise ValueError("Invalid cursor format") from exc

        where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""
        query = f"SELECT * FROM alerts{where_clause} ORDER BY created_at DESC, alert_id ASC LIMIT ?"
        params.append(bounded_limit + 1)

        with self._connection() as connection:
            rows = connection.execute(query, params).fetchall()

        has_more = len(rows) > bounded_limit
        selected_rows = rows[:bounded_limit]
        items = [self._alert_from_row(row) for row in selected_rows]

        next_cursor = None
        if has_more and selected_rows:
            last_row = selected_rows[-1]
            raw_next = f"{last_row['created_at']}|{last_row['alert_id']}"
            next_cursor = base64.urlsafe_b64encode(raw_next.encode("utf-8")).decode("ascii")

        return (items, next_cursor)

    def sync_events(
        self,
        events: list[MeasurementEvent],
        user: dict[str, object],
    ) -> tuple[list[dict], dict]:
        items: list[dict] = []
        counts = {"accepted": 0, "duplicate": 0, "conflict": 0, "rejected": 0}

        for event in events:
            event_id_str = str(event.event_id)
            if not has_patient_access(user, event.patient_id):
                items.append({
                    "event_id": event_id_str,
                    "patient_id": event.patient_id,
                    "status": "rejected",
                    "error": "patient_access_denied",
                    "alert_ids": [],
                })
                counts["rejected"] += 1
                continue

            try:
                submission = self.submit(event)
                alert_ids = [str(a.alert_id) for a in submission.alerts]
                received_at_str = self._iso(submission.received_at)
                if submission.status == "accepted":
                    items.append({
                        "event_id": event_id_str,
                        "patient_id": event.patient_id,
                        "status": "accepted",
                        "received_at": received_at_str,
                        "alert_ids": alert_ids,
                    })
                    counts["accepted"] += 1
                elif submission.status == "duplicate":
                    items.append({
                        "event_id": event_id_str,
                        "patient_id": event.patient_id,
                        "status": "duplicate",
                        "received_at": received_at_str,
                        "alert_ids": alert_ids,
                    })
                    counts["duplicate"] += 1
            except EventIdConflict:
                items.append({
                    "event_id": event_id_str,
                    "patient_id": event.patient_id,
                    "status": "conflict",
                    "error": "event_id_conflict",
                    "alert_ids": [],
                })
                counts["conflict"] += 1
            except Exception as exc:
                items.append({
                    "event_id": event_id_str,
                    "patient_id": event.patient_id,
                    "status": "rejected",
                    "error": str(exc),
                    "alert_ids": [],
                })
                counts["rejected"] += 1

        summary = {
            "total": len(events),
            "accepted": counts["accepted"],
            "duplicate": counts["duplicate"],
            "conflict": counts["conflict"],
            "rejected": counts["rejected"],
        }
        return items, summary

    def measurement_count(self) -> int:
        with self._connection() as connection:
            return int(connection.execute("SELECT COUNT(*) FROM measurements").fetchone()[0])

    def alert_count(self) -> int:
        with self._connection() as connection:
            return int(connection.execute("SELECT COUNT(*) FROM alerts").fetchone()[0])

    def revoke_token(self, jti: str, expires_at: datetime, actor_id: str) -> None:
        with self._transaction() as connection:
            connection.execute(
                "INSERT OR REPLACE INTO revoked_tokens (jti, revoked_at, expires_at, actor_id) VALUES (?, ?, ?, ?)",
                (jti, self._iso(datetime.now(timezone.utc)), self._iso(expires_at), actor_id),
            )

    def is_token_revoked(self, jti: str) -> bool:
        with self._connection() as connection:
            return connection.execute(
                "SELECT 1 FROM revoked_tokens WHERE jti = ? AND expires_at > ?",
                (jti, self._iso(datetime.now(timezone.utc))),
            ).fetchone() is not None

    def record_audit(
        self,
        actor_id: str,
        action: str,
        alert_id: UUID | None,
        success: bool,
        metadata: dict,
    ) -> None:
        with self._transaction() as connection:
            self._write_audit(connection, actor_id, action, alert_id, success, metadata)

    def verify_audit_chain(self) -> dict[str, object]:
        with self._connection() as connection:
            rows = list(connection.execute("SELECT * FROM audit_log ORDER BY audit_id"))
        last_hash = None
        checked = 0
        legacy = 0
        for row in rows:
            if row["current_hash"] is None:
                if last_hash is not None:
                    return {"valid": False, "checked_records": checked, "legacy_records": legacy, "error": "hashed chain interrupted by legacy row"}
                legacy += 1
                continue
            expected = self._audit_hash(row)
            if row["previous_hash"] != last_hash or row["current_hash"] != expected:
                return {"valid": False, "checked_records": checked, "legacy_records": legacy, "error": f"audit record {row['audit_id']} hash mismatch"}
            last_hash = row["current_hash"]
            checked += 1
        return {"valid": True, "checked_records": checked, "legacy_records": legacy, "error": None}

    def export_audit(
        self,
        start_id: int | None = None,
        end_id: int | None = None,
        start_time: str | datetime | None = None,
        end_time: str | datetime | None = None,
    ) -> dict:
        clauses = []
        values: list[object] = []
        if start_id is not None:
            clauses.append("audit_id >= ?")
            values.append(int(start_id))
        if end_id is not None:
            clauses.append("audit_id <= ?")
            values.append(int(end_id))
        if start_time is not None:
            st = self._iso(start_time) if isinstance(start_time, datetime) else str(start_time)
            clauses.append("occurred_at >= ?")
            values.append(st)
        if end_time is not None:
            et = self._iso(end_time) if isinstance(end_time, datetime) else str(end_time)
            clauses.append("occurred_at <= ?")
            values.append(et)
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        with self._connection() as connection:
            rows = list(connection.execute(f"SELECT * FROM audit_log{where} ORDER BY audit_id ASC", values))
        records = []
        for row in rows:
            meta = json.loads(row["metadata_json"])
            # Redact sensitive credentials if ever present in metadata
            redacted_meta = {
                k: v for k, v in meta.items()
                if not any(sensitive in k.lower() for sensitive in ("token", "secret", "password", "key", "auth"))
            }
            records.append({
                "audit_id": row["audit_id"],
                "actor_id": row["actor_id"],
                "action": row["action"],
                "alert_id": row["alert_id"],
                "occurred_at": row["occurred_at"],
                "success": bool(row["success"]),
                "metadata": redacted_meta,
                "previous_hash": row["previous_hash"],
                "current_hash": row["current_hash"],
            })
        return {
            "export_version": "1.0",
            "record_count": len(records),
            "records": records,
            "integrity": self.verify_audit_chain(),
            "centrally_delivered": False,
        }

    def list_audit(self, alert_id: UUID | None = None) -> list[sqlite3.Row]:
        with self._connection() as connection:
            if alert_id is None:
                return list(connection.execute("SELECT * FROM audit_log ORDER BY audit_id"))
            return list(
                connection.execute(
                    "SELECT * FROM audit_log WHERE alert_id = ? ORDER BY audit_id",
                    (str(alert_id),),
                )
            )

    def _insert_or_get_active_alert(self, connection: sqlite3.Connection, alert: Alert) -> Alert:
        row = connection.execute(
            """
            SELECT * FROM alerts
            WHERE patient_id = ? AND category = ? AND reason_code = ? AND rule_version = ?
              AND status IN ('open', 'acknowledged')
            ORDER BY created_at DESC LIMIT 1
            """,
            (alert.patient_id, alert.category.value, alert.reason.code, alert.reason.rule_version),
        ).fetchone()
        if row is not None:
            return self._alert_from_row(row)
        connection.execute(
            """
            INSERT INTO alerts (
                alert_id, patient_id, related_event_id, category, severity, reason_json,
                reason_code, rule_version, created_at, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(alert.alert_id),
                alert.patient_id,
                str(alert.related_event_id) if alert.related_event_id else None,
                alert.category.value,
                alert.severity.value,
                json.dumps(
                    alert.reason.model_dump(mode="json", exclude_none=True),
                    sort_keys=True,
                ),
                alert.reason.code,
                alert.reason.rule_version,
                self._iso(alert.created_at),
                alert.status.value,
            ),
        )

        # Select matching escalation policy
        policy_row = connection.execute(
            """
            SELECT * FROM escalation_policies
            WHERE (category = ? OR category IS NULL)
              AND min_severity = ?
            ORDER BY CASE WHEN category = ? THEN 1 ELSE 2 END
            LIMIT 1
            """,
            (alert.category.value, alert.severity.value, alert.category.value),
        ).fetchone()

        if policy_row is None:
            policy_row = connection.execute(
                """
                SELECT * FROM escalation_policies
                WHERE policy_id = ?
                """,
                ("policy-critical" if alert.severity == AlertSeverity.CRITICAL else ("policy-high" if alert.severity == AlertSeverity.HIGH else "policy-default"),),
            ).fetchone()

        policy_id = policy_row["policy_id"] if policy_row else "policy-default"
        delay_seconds = int(policy_row["escalation_delay_seconds"]) if policy_row else 1800
        next_due = alert.created_at + timedelta(seconds=delay_seconds)
        next_due_iso = self._iso(next_due)
        created_at_iso = self._iso(alert.created_at)

        connection.execute(
            """
            INSERT OR IGNORE INTO alert_escalations (
                alert_id, policy_id, patient_id, current_level, status,
                created_at, next_due_at, last_escalated_at, attempts_count, updated_at
            ) VALUES (?, ?, ?, 0, 'pending', ?, ?, NULL, 0, ?)
            """,
            (str(alert.alert_id), policy_id, alert.patient_id, created_at_iso, next_due_iso, created_at_iso),
        )
        return alert

    @staticmethod
    def _alerts_for_event(connection: sqlite3.Connection, event_id: UUID) -> tuple[Alert, ...]:
        return tuple(
            SQLiteRepository._alert_from_row(row)
            for row in connection.execute(
                "SELECT * FROM alerts WHERE related_event_id = ? ORDER BY created_at",
                (str(event_id),),
            )
        )

    @staticmethod
    def _alert_row(connection: sqlite3.Connection, alert_id: UUID) -> sqlite3.Row:
        row = connection.execute(
            "SELECT * FROM alerts WHERE alert_id = ?", (str(alert_id),)
        ).fetchone()
        if row is None:
            raise AlertNotFound(str(alert_id))
        return row

    @staticmethod
    def _event_from_row(row: sqlite3.Row) -> MeasurementEvent:
        payload = json.loads(row["payload_json"])
        payload["received_at"] = row["received_at"]
        return MeasurementEvent.model_validate(payload)

    @staticmethod
    def _alert_from_row(row: sqlite3.Row) -> Alert:
        acknowledgement = None
        if row["acknowledged_at"] is not None:
            acknowledgement = {
                "acknowledged_at": row["acknowledged_at"],
                "acknowledged_by": row["acknowledged_by"],
            }
            if row["acknowledgement_note"] is not None:
                acknowledgement["note"] = row["acknowledgement_note"]
        resolution = None
        if row["resolved_at"] is not None:
            resolution = {
                "resolved_at": row["resolved_at"],
                "resolved_by": row["resolved_by"],
                "resolution_code": row["resolution_code"],
            }
            if row["resolution_note"] is not None:
                resolution["note"] = row["resolution_note"]
        alert_payload = {
            "schema_version": "1.0",
            "alert_id": row["alert_id"],
            "patient_id": row["patient_id"],
            "category": row["category"],
            "severity": row["severity"],
            "reason": json.loads(row["reason_json"]),
            "created_at": row["created_at"],
            "status": row["status"],
        }
        if row["related_event_id"] is not None:
            alert_payload["related_event_id"] = row["related_event_id"]
        if acknowledgement is not None:
            alert_payload["acknowledgement"] = acknowledgement
        if resolution is not None:
            alert_payload["resolution"] = resolution
        return Alert.model_validate(
            alert_payload
        )

    def _trusted_time(self) -> datetime:
        value = self._clock()
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("repository clock must return a timezone-aware datetime")
        return value

    @staticmethod
    def _write_audit(
        connection: sqlite3.Connection,
        actor_id: str,
        action: str,
        alert_id: UUID | str | None,
        success: bool,
        metadata: dict,
    ) -> None:
        previous = connection.execute(
            "SELECT current_hash FROM audit_log WHERE current_hash IS NOT NULL ORDER BY audit_id DESC LIMIT 1"
        ).fetchone()
        previous_hash = previous["current_hash"] if previous is not None else None
        cursor = connection.execute(
            """
            INSERT INTO audit_log (actor_id, action, alert_id, occurred_at, success, metadata_json, previous_hash, current_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
            """,
            (
                actor_id,
                action,
                str(alert_id) if alert_id is not None else None,
                SQLiteRepository._iso(datetime.now(timezone.utc)),
                int(success),
                json.dumps(metadata, sort_keys=True),
                previous_hash,
            ),
        )
        row = connection.execute("SELECT * FROM audit_log WHERE audit_id = ?", (cursor.lastrowid,)).fetchone()
        connection.execute(
            "UPDATE audit_log SET current_hash = ? WHERE audit_id = ?",
            (SQLiteRepository._audit_hash(row), cursor.lastrowid),
        )

    @staticmethod
    def _audit_hash(row: sqlite3.Row) -> str:
        canonical = json.dumps(
            {
                "audit_id": row["audit_id"],
                "actor_id": row["actor_id"],
                "action": row["action"],
                "alert_id": row["alert_id"],
                "occurred_at": row["occurred_at"],
                "success": bool(row["success"]),
                "metadata_json": row["metadata_json"],
                "previous_hash": row["previous_hash"],
            },
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    @staticmethod
    def _iso(value: datetime) -> str:
        return value.isoformat().replace("+00:00", "Z")

    @staticmethod
    def _payload_json(event: MeasurementEvent) -> str:
        payload = event.model_dump(mode="json", exclude_none=True)
        payload.pop("received_at", None)
        return json.dumps(payload, sort_keys=True, separators=(",", ":"))

    @classmethod
    def _payload_hash(cls, event: MeasurementEvent) -> str:
        return hashlib.sha256(cls._payload_json(event).encode("utf-8")).hexdigest()

    def list_escalation_policies(self) -> list[EscalationPolicy]:
        with self._connection() as connection:
            rows = connection.execute("SELECT * FROM escalation_policies ORDER BY min_severity DESC").fetchall()
            return [self._policy_from_row(r) for r in rows]

    def get_escalation_policy(self, policy_id: str) -> EscalationPolicy | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT * FROM escalation_policies WHERE policy_id = ?",
                (policy_id,),
            ).fetchone()
            return self._policy_from_row(row) if row else None

    def get_alert_escalation(self, alert_id: UUID) -> AlertEscalationState | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT * FROM alert_escalations WHERE alert_id = ?",
                (str(alert_id),),
            ).fetchone()
            if row is None:
                return None
            notif_rows = connection.execute(
                "SELECT * FROM mock_notifications WHERE alert_id = ? ORDER BY created_at ASC",
                (str(alert_id),),
            ).fetchall()
            notifications = [self._notification_from_row(n) for n in notif_rows]
            return self._escalation_from_row(row, notifications)

    def record_notification(
        self, notification: MockNotification, connection: sqlite3.Connection | None = None
    ) -> MockNotification:
        if connection is not None:
            return self._record_notification_with_conn(connection, notification)
        with self._transaction() as conn:
            return self._record_notification_with_conn(conn, notification)

    def _record_notification_with_conn(
        self, connection: sqlite3.Connection, notification: MockNotification
    ) -> MockNotification:
        connection.execute(
            """
            INSERT OR REPLACE INTO mock_notifications (
                notification_id, alert_id, patient_id, escalation_level,
                recipient_role, recipient_target, channel, message_body,
                created_at, attempted_at, delivery_status, retry_count,
                failure_reason, is_simulated
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(notification.notification_id),
                str(notification.alert_id),
                notification.patient_id,
                notification.escalation_level,
                notification.recipient_role.value if hasattr(notification.recipient_role, "value") else str(notification.recipient_role),
                notification.recipient_target,
                notification.channel,
                notification.message_body,
                self._iso(notification.created_at),
                self._iso(notification.attempted_at),
                notification.delivery_status.value if hasattr(notification.delivery_status, "value") else str(notification.delivery_status),
                notification.retry_count,
                notification.failure_reason,
                int(notification.is_simulated),
            ),
        )
        self._write_audit(
            connection,
            "system",
            "mock_notification_dispatched",
            notification.alert_id,
            notification.delivery_status in (NotificationDeliveryStatus.DELIVERED, "delivered"),
            {
                "notification_id": str(notification.notification_id),
                "escalation_level": notification.escalation_level,
                "recipient_role": str(notification.recipient_role.value if hasattr(notification.recipient_role, "value") else notification.recipient_role),
                "delivery_status": str(notification.delivery_status.value if hasattr(notification.delivery_status, "value") else notification.delivery_status),
                "retry_count": notification.retry_count,
            },
        )
        return notification

    def list_notifications(
        self, alert_id: UUID | None = None, patient_id: str | None = None
    ) -> list[MockNotification]:
        with self._connection() as connection:
            clauses = []
            params: list[object] = []
            if alert_id is not None:
                clauses.append("alert_id = ?")
                params.append(str(alert_id))
            if patient_id is not None:
                clauses.append("patient_id = ?")
                params.append(patient_id)
            where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
            rows = connection.execute(
                f"SELECT * FROM mock_notifications{where} ORDER BY created_at DESC",
                params,
            ).fetchall()
            return [self._notification_from_row(r) for r in rows]

    def find_due_escalations(self, now: datetime) -> list[sqlite3.Row]:
        with self._connection() as connection:
            now_str = self._iso(now)
            return list(
                connection.execute(
                    """
                    SELECT e.*, p.name AS policy_name, p.initial_target_role, p.subsequent_target_role,
                           p.escalation_delay_seconds, p.max_attempts, p.retry_delay_seconds,
                           p.stop_on_acknowledge, p.stop_on_resolve
                    FROM alert_escalations e
                    JOIN escalation_policies p ON e.policy_id = p.policy_id
                    WHERE e.status IN ('pending', 'escalated')
                      AND e.next_due_at IS NOT NULL
                      AND e.next_due_at <= ?
                    ORDER BY e.next_due_at ASC
                    """,
                    (now_str,),
                )
            )

    def update_escalation_state(
        self,
        alert_id: UUID,
        current_level: int,
        status: str | EscalationStatus,
        next_due_at: datetime | None,
        last_escalated_at: datetime | None,
        attempts_count: int,
        actor_id: str = "system",
    ) -> None:
        status_val = status.value if hasattr(status, "value") else str(status)
        now_dt = self._trusted_time()
        with self._transaction() as connection:
            connection.execute(
                """
                UPDATE alert_escalations
                SET current_level = ?, status = ?, next_due_at = ?, last_escalated_at = ?, attempts_count = ?, updated_at = ?
                WHERE alert_id = ?
                """,
                (
                    current_level,
                    status_val,
                    self._iso(next_due_at) if next_due_at else None,
                    self._iso(last_escalated_at) if last_escalated_at else None,
                    attempts_count,
                    self._iso(now_dt),
                    str(alert_id),
                ),
            )
            self._write_audit(
                connection,
                actor_id,
                "escalation_state_updated",
                alert_id,
                True,
                {
                    "current_level": current_level,
                    "status": status_val,
                    "attempts_count": attempts_count,
                    "next_due_at": self._iso(next_due_at) if next_due_at else None,
                },
            )

    @staticmethod
    def _parse_iso(val: str | None) -> datetime | None:
        if val is None:
            return None
        return datetime.fromisoformat(val.replace("Z", "+00:00"))

    @staticmethod
    def _policy_from_row(row: sqlite3.Row) -> EscalationPolicy:
        return EscalationPolicy.model_validate({
            "policy_id": row["policy_id"],
            "name": row["name"],
            "category": row["category"],
            "min_severity": row["min_severity"],
            "initial_target_role": row["initial_target_role"],
            "escalation_delay_seconds": row["escalation_delay_seconds"],
            "subsequent_target_role": row["subsequent_target_role"],
            "max_attempts": row["max_attempts"],
            "retry_delay_seconds": row["retry_delay_seconds"],
            "stop_on_acknowledge": bool(row["stop_on_acknowledge"]),
            "stop_on_resolve": bool(row["stop_on_resolve"]),
            "is_demo": bool(row["is_demo"]),
        })

    @staticmethod
    def _notification_from_row(row: sqlite3.Row) -> MockNotification:
        return MockNotification.model_validate({
            "notification_id": row["notification_id"],
            "alert_id": row["alert_id"],
            "patient_id": row["patient_id"],
            "escalation_level": row["escalation_level"],
            "recipient_role": row["recipient_role"],
            "recipient_target": row["recipient_target"],
            "channel": row["channel"],
            "message_body": row["message_body"],
            "created_at": SQLiteRepository._parse_iso(row["created_at"]),
            "attempted_at": SQLiteRepository._parse_iso(row["attempted_at"]),
            "delivery_status": row["delivery_status"],
            "retry_count": row["retry_count"],
            "failure_reason": row["failure_reason"],
            "is_simulated": bool(row["is_simulated"]),
        })

    @staticmethod
    def _escalation_from_row(
        row: sqlite3.Row, notifications: list[MockNotification]
    ) -> AlertEscalationState:
        return AlertEscalationState.model_validate({
            "alert_id": row["alert_id"],
            "policy_id": row["policy_id"],
            "patient_id": row["patient_id"],
            "current_level": row["current_level"],
            "status": row["status"],
            "created_at": SQLiteRepository._parse_iso(row["created_at"]),
            "next_due_at": SQLiteRepository._parse_iso(row["next_due_at"]),
            "last_escalated_at": SQLiteRepository._parse_iso(row["last_escalated_at"]),
            "attempts_count": row["attempts_count"],
            "updated_at": SQLiteRepository._parse_iso(row["updated_at"]),
            "notifications": [n.model_dump(mode="json") for n in notifications],
        })
