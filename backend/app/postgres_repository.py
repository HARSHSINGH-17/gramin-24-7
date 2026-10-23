import base64
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import json
import logging
from typing import Any
from urllib.parse import urlparse
from uuid import UUID

import psycopg
from psycopg.rows import dict_row

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
from .repository import AlertNotFound, InvalidAlertTransition
from .store import EventIdConflict, EventSubmission

logger = logging.getLogger("pahaadcare.postgres")


class PostgresRepository:
    """Production PostgreSQL repository with connection management, multi-role auth, and live RPM telemetry."""

    backend_name = "postgresql"

    def __init__(
        self,
        connection_url: str,
        clock: Callable[[], datetime] | None = None,
        thresholds: dict[object, DemonstrationThreshold] | None = None,
    ) -> None:
        # Standardize postgres:// to postgresql:// if passed from hosting platforms like Render or Heroku
        if connection_url.startswith("postgres://"):
            connection_url = connection_url.replace("postgres://", "postgresql://", 1)
        self.connection_url = connection_url
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self._thresholds = validate_thresholds(thresholds or DEMO_THRESHOLDS)
        self.initialize()

    @contextmanager
    def _connection(self) -> Iterator[psycopg.Connection]:
        conn = psycopg.connect(self.connection_url, row_factory=dict_row)
        try:
            yield conn
        finally:
            conn.close()

    def ping(self) -> bool:
        with self._connection() as conn:
            conn.execute("SELECT 1")
            return True

    @contextmanager
    def _transaction(self) -> Iterator[psycopg.Connection]:
        with psycopg.connect(self.connection_url, row_factory=dict_row) as conn:
            with conn.transaction():
                yield conn

    def initialize(self) -> None:
        with self._transaction() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY,
                    applied_at TIMESTAMPTZ NOT NULL
                );

                CREATE TABLE IF NOT EXISTS users (
                    user_id TEXT PRIMARY KEY,
                    username TEXT UNIQUE NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL CHECK (role IN ('clinician', 'administrator', 'patient', 'family')),
                    full_name TEXT NOT NULL,
                    patient_id TEXT,
                    phone TEXT,
                    created_at TEXT NOT NULL,
                    is_active INTEGER NOT NULL DEFAULT 1
                );

                CREATE TABLE IF NOT EXISTS patients (
                    patient_id TEXT PRIMARY KEY,
                    display_name TEXT NOT NULL,
                    age INTEGER,
                    gender TEXT,
                    phone TEXT,
                    village TEXT,
                    district TEXT,
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at TEXT NOT NULL,
                    is_simulated INTEGER NOT NULL DEFAULT 0 CHECK (is_simulated IN (0, 1))
                );

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
                    is_simulated INTEGER NOT NULL DEFAULT 0 CHECK (is_simulated IN (0, 1))
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

                CREATE INDEX IF NOT EXISTS idx_pg_measurements_patient_time
                    ON measurements (patient_id, measured_at DESC);
                CREATE INDEX IF NOT EXISTS idx_pg_alerts_patient_status
                    ON alerts (patient_id, status, created_at DESC);
                CREATE UNIQUE INDEX IF NOT EXISTS uq_pg_active_alert_condition
                    ON alerts (patient_id, category, reason_code, rule_version)
                    WHERE status IN ('open', 'acknowledged');

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

                CREATE TABLE IF NOT EXISTS audit_log (
                    audit_id BIGSERIAL PRIMARY KEY,
                    actor_id TEXT NOT NULL,
                    action TEXT NOT NULL,
                    alert_id TEXT,
                    occurred_at TEXT NOT NULL,
                    success INTEGER NOT NULL CHECK (success IN (0, 1)),
                    metadata_json TEXT NOT NULL,
                    previous_hash TEXT,
                    current_hash TEXT
                );

                CREATE TABLE IF NOT EXISTS revoked_tokens (
                    jti TEXT PRIMARY KEY,
                    revoked_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    actor_id TEXT NOT NULL
                );
                """
            )
            # Default policies
            conn.execute(
                """
                INSERT INTO escalation_policies (
                    policy_id, name, category, min_severity, initial_target_role,
                    escalation_delay_seconds, subsequent_target_role, max_attempts,
                    retry_delay_seconds, stop_on_acknowledge, stop_on_resolve, is_demo
                ) VALUES
                ('policy-critical', 'Critical Demo Policy (5m CHW -> Supervisor)', NULL, 'critical', 'community_health_worker', 300, 'supervisor', 3, 60, 1, 1, 1),
                ('policy-high', 'High Severity Demo Policy (15m CHW -> Supervisor)', NULL, 'high', 'community_health_worker', 900, 'supervisor', 3, 120, 1, 1, 1),
                ('policy-default', 'Standard Warning Demo Policy (30m CHW -> Supervisor)', NULL, 'medium', 'community_health_worker', 1800, 'supervisor', 2, 180, 1, 1, 1)
                ON CONFLICT (policy_id) DO NOTHING
                """
            )

    # ---------------- Auth & User Management ----------------
    def create_user(
        self,
        user_id: str,
        username: str,
        email: str,
        password_hash: str,
        role: str,
        full_name: str,
        patient_id: str | None = None,
        phone: str | None = None,
    ) -> dict:
        now_str = self._iso(datetime.now(timezone.utc))
        with self._transaction() as conn:
            conn.execute(
                """
                INSERT INTO users (
                    user_id, username, email, password_hash, role,
                    full_name, patient_id, phone, created_at, is_active
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 1)
                """,
                (user_id, username.lower(), email.lower(), password_hash, role, full_name, patient_id, phone, now_str),
            )
            return {
                "user_id": user_id,
                "username": username.lower(),
                "email": email.lower(),
                "role": role,
                "full_name": full_name,
                "patient_id": patient_id,
                "phone": phone,
                "created_at": now_str,
                "is_active": True,
            }

    def get_user_by_username_or_email(self, identifier: str) -> dict | None:
        clean = identifier.strip().lower()
        with self._connection() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE (username = %s OR email = %s) AND is_active = 1",
                (clean, clean),
            ).fetchone()
            return dict(row) if row else None

    def get_user_by_id(self, user_id: str) -> dict | None:
        with self._connection() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE user_id = %s AND is_active = 1",
                (user_id,),
            ).fetchone()
            return dict(row) if row else None

    def update_user_password(self, user_id: str, password_hash: str) -> None:
        with self._transaction() as conn:
            conn.execute(
                "UPDATE users SET password_hash = %s WHERE user_id = %s",
                (password_hash, user_id),
            )

    # ---------------- Patient Management ----------------
    def create_patient(
        self,
        patient_id: str,
        display_name: str,
        age: int | None = None,
        gender: str | None = None,
        phone: str | None = None,
        village: str | None = None,
        district: str | None = None,
        status: str = "active",
        is_simulated: int = 0,
    ) -> dict:
        now_str = self._iso(datetime.now(timezone.utc))
        with self._transaction() as conn:
            conn.execute(
                """
                INSERT INTO patients (
                    patient_id, display_name, age, gender, phone,
                    village, district, status, created_at, is_simulated
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (patient_id) DO UPDATE SET
                    display_name = EXCLUDED.display_name,
                    age = COALESCE(EXCLUDED.age, patients.age),
                    gender = COALESCE(EXCLUDED.gender, patients.gender),
                    phone = COALESCE(EXCLUDED.phone, patients.phone),
                    village = COALESCE(EXCLUDED.village, patients.village),
                    district = COALESCE(EXCLUDED.district, patients.district),
                    status = EXCLUDED.status
                """,
                (patient_id, display_name, age, gender, phone, village, district, status, now_str, is_simulated),
            )
            return {
                "patient_id": patient_id,
                "display_name": display_name,
                "age": age,
                "gender": gender,
                "phone": phone,
                "village": village,
                "district": district,
                "status": status,
                "created_at": now_str,
                "is_simulated": bool(is_simulated),
            }

    def get_patient(self, patient_id: str) -> dict | None:
        with self._connection() as conn:
            row = conn.execute(
                "SELECT patient_id, display_name, age, gender, phone, village, district, status, created_at, is_simulated FROM patients WHERE patient_id = %s",
                (patient_id,),
            ).fetchone()
            if not row:
                return None
            return {
                "patient_id": row["patient_id"],
                "display_name": row["display_name"],
                "age": row.get("age"),
                "gender": row.get("gender"),
                "phone": row.get("phone"),
                "village": row.get("village"),
                "district": row.get("district"),
                "status": row["status"],
                "created_at": row["created_at"],
                "is_simulated": bool(row["is_simulated"]),
            }

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
            placeholders = ", ".join("%s" for _ in allowed_patient_ids)
            conditions.append(f"patient_id IN ({placeholders})")
            params.extend(allowed_patient_ids)

        if cursor:
            try:
                decoded_cursor = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
            except Exception:
                decoded_cursor = cursor
            conditions.append("patient_id > %s")
            params.append(decoded_cursor)

        where_clause = f" WHERE {' AND '.join(conditions)}" if conditions else ""
        query = (
            f"SELECT patient_id, display_name, age, gender, phone, village, district, status, created_at, is_simulated "
            f"FROM patients{where_clause} ORDER BY patient_id ASC LIMIT %s"
        )
        params.append(bounded_limit + 1)

        with self._connection() as conn:
            rows = conn.execute(query, params).fetchall()

        has_more = len(rows) > bounded_limit
        selected_rows = rows[:bounded_limit]
        items = [
            {
                "patient_id": row["patient_id"],
                "display_name": row["display_name"],
                "age": row.get("age"),
                "gender": row.get("gender"),
                "phone": row.get("phone"),
                "village": row.get("village"),
                "district": row.get("district"),
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

    # ---------------- Measurements & Telemetry ----------------
    def submit(self, event: MeasurementEvent, evaluate_alerts: bool = True) -> EventSubmission:
        payload_hash = self._payload_hash(event)
        with self._transaction() as conn:
            existing = conn.execute(
                "SELECT * FROM measurements WHERE event_id = %s",
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
                    alerts=self._alerts_for_event(conn, event.event_id),
                )

            received_at = self._trusted_time()
            accepted_event = event.model_copy(update={"received_at": received_at})
            conn.execute(
                """
                INSERT INTO measurements (
                    event_id, patient_id, payload_hash, payload_json, measurement_type,
                    value, unit, measured_at, received_at, source, is_simulated
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
            conn.execute(
                """
                INSERT INTO patients (patient_id, display_name, status, created_at, is_simulated)
                VALUES (%s, %s, 'active', %s, %s)
                ON CONFLICT (patient_id) DO NOTHING
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
                    alert = self._insert_or_get_active_alert(conn, candidate)
                    alerts = (alert,)
            return EventSubmission(
                status="accepted",
                event=accepted_event,
                received_at=received_at,
                alerts=alerts,
            )

    def get_latest_vitals_for_patient(self, patient_id: str) -> dict:
        with self._connection() as conn:
            rows = conn.execute(
                """
                SELECT m.* FROM measurements m
                WHERE m.patient_id = %s
                ORDER BY m.measured_at DESC
                """,
                (patient_id,),
            ).fetchall()

            latest: dict[str, dict] = {}
            for row in rows:
                m_type = row["measurement_type"]
                if m_type not in latest:
                    latest[m_type] = {
                        "event_id": row["event_id"],
                        "measurement_type": m_type,
                        "value": row["value"],
                        "unit": row["unit"],
                        "measured_at": row["measured_at"],
                        "received_at": row["received_at"],
                        "source": row["source"],
                        "is_simulated": bool(row["is_simulated"]),
                    }
            return {
                "patient_id": patient_id,
                "vitals": latest,
                "count": len(rows),
            }

    def list_measurements(
        self,
        patient_id: str,
        measurement_type: str | None = None,
        limit: int = 50,
        cursor: str | None = None,
    ) -> tuple[list[MeasurementEvent], str | None]:
        bounded_limit = max(1, min(limit, 100))
        params: list[object] = [patient_id]
        conditions: list[str] = ["patient_id = %s"]

        if measurement_type:
            conditions.append("measurement_type = %s")
            params.append(measurement_type)

        if cursor:
            try:
                raw_cursor = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
                measured_at_cur, event_id_cur = raw_cursor.split("|", 1)
                conditions.append("(measured_at < %s OR (measured_at = %s AND event_id > %s))")
                params.extend([measured_at_cur, measured_at_cur, event_id_cur])
            except Exception as exc:
                raise ValueError("Invalid cursor format") from exc

        where_clause = " WHERE " + " AND ".join(conditions)
        query = f"SELECT * FROM measurements{where_clause} ORDER BY measured_at DESC, event_id ASC LIMIT %s"
        params.append(bounded_limit + 1)

        with self._connection() as conn:
            rows = conn.execute(query, params).fetchall()

        has_more = len(rows) > bounded_limit
        selected_rows = rows[:bounded_limit]
        items = [self._event_from_row(row) for row in selected_rows]

        next_cursor = None
        if has_more and selected_rows:
            last_row = selected_rows[-1]
            raw_next = f"{last_row['measured_at']}|{last_row['event_id']}"
            next_cursor = base64.urlsafe_b64encode(raw_next.encode("utf-8")).decode("ascii")

        return (items, next_cursor)

    def get_monitor_overview(
        self,
        allowed_patient_ids: list[str] | None = None,
    ) -> dict:
        now = self._clock()
        now_iso = self._iso(now)
        stale_threshold_minutes = 15

        with self._connection() as conn:
            patient_conditions = []
            patient_params = []
            if allowed_patient_ids is not None:
                if not allowed_patient_ids:
                    return {
                        "summary": {
                            "total_patients": 0,
                            "patients_requiring_review": 0,
                            "active_alerts_count": 0,
                            "active_alerts_by_severity": {"critical": 0, "high": 0, "medium": 0, "low": 0},
                            "patients_with_stale_measurements": 0,
                            "patients_with_missing_measurements": 0,
                            "pending_escalations_count": 0,
                            "total_measurements_count": 0,
                        },
                        "patients": [],
                        "alerts": [],
                        "generated_at": now_iso,
                    }
                placeholders = ", ".join("%s" for _ in allowed_patient_ids)
                patient_conditions.append(f"patient_id IN ({placeholders})")
                patient_params.extend(allowed_patient_ids)

            where_sql = (" WHERE " + " AND ".join(patient_conditions)) if patient_conditions else ""
            p_rows = conn.execute(
                f"SELECT patient_id, display_name, status, created_at, is_simulated FROM patients{where_sql} ORDER BY patient_id ASC",
                patient_params,
            ).fetchall()

            patients_list = []
            patients_with_stale = set()
            patients_with_missing = set()
            patients_requiring_review = set()

            vital_types = [
                ("heart_rate", "bpm"),
                ("oxygen_saturation", "%"),
                ("body_temperature", "°C"),
                ("systolic_blood_pressure", "mmHg"),
                ("diastolic_blood_pressure", "mmHg"),
            ]

            alert_conditions = ["status IN ('open', 'acknowledged')"]
            alert_params = []
            if allowed_patient_ids is not None:
                placeholders = ", ".join("%s" for _ in allowed_patient_ids)
                alert_conditions.append(f"patient_id IN ({placeholders})")
                alert_params.extend(allowed_patient_ids)

            alerts_where = " WHERE " + " AND ".join(alert_conditions)
            alert_rows = conn.execute(
                f"SELECT * FROM alerts{alerts_where} ORDER BY created_at DESC",
                alert_params,
            ).fetchall()

            active_alerts = [self._alert_from_row(r) for r in alert_rows]
            alerts_by_patient: dict[str, list] = {}
            for a in active_alerts:
                alerts_by_patient.setdefault(a.patient_id, []).append(a)

            esc_conditions = ["status IN ('pending', 'escalated')"]
            esc_params = []
            if allowed_patient_ids is not None:
                placeholders = ", ".join("%s" for _ in allowed_patient_ids)
                esc_conditions.append(f"patient_id IN ({placeholders})")
                esc_params.extend(allowed_patient_ids)
            esc_where = " WHERE " + " AND ".join(esc_conditions)
            esc_row = conn.execute(
                f"SELECT COUNT(*) as count FROM alert_escalations{esc_where}",
                esc_params,
            ).fetchone()
            pending_esc_count = esc_row["count"] if esc_row else 0

            meas_conditions = []
            meas_params = []
            if allowed_patient_ids is not None:
                placeholders = ", ".join("%s" for _ in allowed_patient_ids)
                meas_conditions.append(f"patient_id IN ({placeholders})")
                meas_params.extend(allowed_patient_ids)
            meas_where = (" WHERE " + " AND ".join(meas_conditions)) if meas_conditions else ""
            meas_row = conn.execute(
                f"SELECT COUNT(*) as count FROM measurements{meas_where}",
                meas_params,
            ).fetchone()
            total_measurements = meas_row["count"] if meas_row else 0

            sev_rank = {"critical": 4, "high": 3, "medium": 2, "low": 1}

            for p_row in p_rows:
                pid = p_row["patient_id"]
                m_rows = conn.execute(
                    "SELECT * FROM measurements WHERE patient_id = %s ORDER BY measured_at DESC",
                    (pid,),
                ).fetchall()

                latest_by_type = {}
                for m_row in m_rows:
                    m_type = m_row["measurement_type"]
                    if m_type not in latest_by_type:
                        latest_by_type[m_type] = m_row

                patient_vitals = {}
                has_stale_vital = False
                has_missing_vital = False
                most_recent_measured_at = None

                for v_key, default_unit in vital_types:
                    m = latest_by_type.get(v_key)
                    if m is None:
                        has_missing_vital = True
                        patient_vitals[v_key] = {
                            "value": None,
                            "unit": default_unit,
                            "measured_at": None,
                            "freshness": "missing",
                        }
                    else:
                        m_at_str = m["measured_at"]
                        if most_recent_measured_at is None or m_at_str > most_recent_measured_at:
                            most_recent_measured_at = m_at_str

                        try:
                            m_dt = datetime.fromisoformat(m_at_str.replace("Z", "+00:00"))
                            age_mins = (now - m_dt).total_seconds() / 60.0
                            is_stale = age_mins > stale_threshold_minutes
                        except Exception:
                            is_stale = False

                        freshness = "stale" if is_stale else "recent"
                        if is_stale:
                            has_stale_vital = True

                        patient_vitals[v_key] = {
                            "event_id": m["event_id"],
                            "value": m["value"],
                            "unit": m["unit"],
                            "measured_at": m["measured_at"],
                            "received_at": m["received_at"],
                            "source": m["source"],
                            "freshness": freshness,
                        }

                if has_stale_vital:
                    patients_with_stale.add(pid)
                if has_missing_vital:
                    patients_with_missing.add(pid)

                p_alerts = alerts_by_patient.get(pid, [])
                highest_sev = "none"
                highest_val = 0
                for a in p_alerts:
                    s_str = a.severity.value if hasattr(a.severity, "value") else str(a.severity)
                    val = sev_rank.get(s_str, 0)
                    if val > highest_val:
                        highest_val = val
                        highest_sev = s_str

                if highest_sev == "critical":
                    monitoring_status = "critical_attention"
                    patients_requiring_review.add(pid)
                elif highest_sev in ("high", "medium") or has_stale_vital or has_missing_vital:
                    monitoring_status = "needs_review"
                    patients_requiring_review.add(pid)
                else:
                    monitoring_status = "normal"

                if has_missing_vital and not latest_by_type:
                    patient_freshness = "missing"
                elif has_stale_vital:
                    patient_freshness = "stale"
                else:
                    patient_freshness = "recent"

                patients_list.append({
                    "patient_id": pid,
                    "display_name": p_row["display_name"],
                    "status": p_row["status"],
                    "is_simulated": bool(p_row["is_simulated"]),
                    "latest_measurements": patient_vitals,
                    "latest_measurement_at": most_recent_measured_at,
                    "freshness_status": patient_freshness,
                    "active_alerts_count": len(p_alerts),
                    "highest_severity": highest_sev,
                    "monitoring_status": monitoring_status,
                    "has_stale_vitals": has_stale_vital,
                    "has_missing_vitals": has_missing_vital,
                })

            sev_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
            for a in active_alerts:
                s = a.severity.value if hasattr(a.severity, "value") else str(a.severity)
                if s in sev_counts:
                    sev_counts[s] += 1

            summary = {
                "total_patients": len(p_rows),
                "patients_requiring_review": len(patients_requiring_review),
                "active_alerts_count": len(active_alerts),
                "active_alerts_by_severity": sev_counts,
                "patients_with_stale_measurements": len(patients_with_stale),
                "patients_with_missing_measurements": len(patients_with_missing),
                "pending_escalations_count": pending_esc_count,
                "total_measurements_count": total_measurements,
            }

            return {
                "summary": summary,
                "patients": patients_list,
                "alerts": [a.model_dump(mode="json", exclude_none=True) for a in active_alerts],
                "generated_at": now_iso,
            }

    # ---------------- Alerts & Triage ----------------
    def save_quality_alert(self, alert: Alert) -> Alert:
        with self._transaction() as conn:
            return self._insert_or_get_active_alert(conn, alert)

    def acknowledge_alert(self, alert_id: UUID, actor_id: str, note: str | None = None) -> Alert:
        with self._transaction() as conn:
            try:
                row = self._alert_row(conn, alert_id)
            except AlertNotFound:
                self._write_audit(
                    conn, actor_id, "alert_acknowledge", alert_id, False,
                    {"reason": "unknown_alert_id"},
                )
                raise
            if row["status"] == AlertStatus.RESOLVED.value:
                self._write_audit(
                    conn, actor_id, "alert_acknowledge", alert_id, False,
                    {"reason": "resolved_alert"},
                )
                raise InvalidAlertTransition("resolved alerts cannot be acknowledged")
            if row["status"] == AlertStatus.ACKNOWLEDGED.value:
                self._write_audit(
                    conn, actor_id, "alert_acknowledge", alert_id, True,
                    {"idempotent": True},
                )
                return self._alert_from_row(row)

            acknowledged_at = self._trusted_time()
            conn.execute(
                """
                UPDATE alerts
                SET status = 'acknowledged', acknowledged_at = %s, acknowledged_by = %s, acknowledgement_note = %s
                WHERE alert_id = %s AND status = 'open'
                """,
                (self._iso(acknowledged_at), actor_id, note, str(alert_id)),
            )
            conn.execute(
                """
                UPDATE alert_escalations
                SET status = 'acknowledged_stopped', next_due_at = NULL, updated_at = %s
                WHERE alert_id = %s AND status IN ('pending', 'escalated')
                """,
                (self._iso(acknowledged_at), str(alert_id)),
            )
            self._write_audit(
                conn, actor_id, "alert_acknowledge", alert_id, True,
                {"note_present": note is not None, "escalation_stopped": True, "acknowledged_at": self._iso(acknowledged_at)},
            )
            return self._alert_from_row(self._alert_row(conn, alert_id))

    def resolve_alert(
        self,
        alert_id: UUID,
        actor_id: str,
        resolution_code: str,
        note: str | None = None,
    ) -> Alert:
        with self._transaction() as conn:
            try:
                row = self._alert_row(conn, alert_id)
            except AlertNotFound:
                self._write_audit(
                    conn, actor_id, "alert_resolve", alert_id, False,
                    {"reason": "unknown_alert_id"},
                )
                raise
            if row["status"] == AlertStatus.OPEN.value:
                self._write_audit(
                    conn, actor_id, "alert_resolve", alert_id, False,
                    {"reason": "open_alert"},
                )
                raise InvalidAlertTransition("open alerts must be acknowledged before resolution")
            if row["status"] == AlertStatus.RESOLVED.value:
                self._write_audit(
                    conn, actor_id, "alert_resolve", alert_id, True,
                    {"idempotent": True},
                )
                return self._alert_from_row(row)

            resolved_at = self._trusted_time()
            conn.execute(
                """
                UPDATE alerts
                SET status = 'resolved', resolved_at = %s, resolved_by = %s, resolution_code = %s, resolution_note = %s
                WHERE alert_id = %s AND status = 'acknowledged'
                """,
                (self._iso(resolved_at), actor_id, resolution_code, note, str(alert_id)),
            )
            conn.execute(
                """
                UPDATE alert_escalations
                SET status = 'resolved_stopped', next_due_at = NULL, updated_at = %s
                WHERE alert_id = %s AND status IN ('pending', 'escalated', 'acknowledged_stopped')
                """,
                (self._iso(resolved_at), str(alert_id)),
            )
            self._write_audit(
                conn, actor_id, "alert_resolve", alert_id, True,
                {"resolution_code": resolution_code, "note_present": note is not None, "escalation_stopped": True, "resolved_at": self._iso(resolved_at)},
            )
            return self._alert_from_row(self._alert_row(conn, alert_id))

    def get_alert(self, alert_id: UUID) -> Alert:
        with self._connection() as conn:
            return self._alert_from_row(self._alert_row(conn, alert_id))

    def list_alerts(self, active_only: bool = False) -> list[Alert]:
        with self._connection() as conn:
            query = "SELECT * FROM alerts"
            if active_only:
                query += " WHERE status IN ('open', 'acknowledged')"
            query += " ORDER BY created_at DESC"
            return [self._alert_from_row(row) for row in conn.execute(query).fetchall()]

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
            conditions.append("patient_id = %s")
            params.append(patient_id)
        elif allowed_patient_ids is not None:
            if not allowed_patient_ids:
                return ([], None)
            placeholders = ", ".join("%s" for _ in allowed_patient_ids)
            conditions.append(f"patient_id IN ({placeholders})")
            params.extend(allowed_patient_ids)

        if status:
            conditions.append("status = %s")
            params.append(status)

        if category:
            conditions.append("category = %s")
            params.append(category)

        if cursor:
            try:
                raw_cursor = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
                created_at_cur, alert_id_cur = raw_cursor.split("|", 1)
                conditions.append("(created_at < %s OR (created_at = %s AND alert_id > %s))")
                params.extend([created_at_cur, created_at_cur, alert_id_cur])
            except Exception as exc:
                raise ValueError("Invalid cursor format") from exc

        where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""
        query = f"SELECT * FROM alerts{where_clause} ORDER BY created_at DESC, alert_id ASC LIMIT %s"
        params.append(bounded_limit + 1)

        with self._connection() as conn:
            rows = conn.execute(query, params).fetchall()

        has_more = len(rows) > bounded_limit
        selected_rows = rows[:bounded_limit]
        items = [self._alert_from_row(row) for row in selected_rows]

        next_cursor = None
        if has_more and selected_rows:
            last_row = selected_rows[-1]
            raw_next = f"{last_row['created_at']}|{last_row['alert_id']}"
            next_cursor = base64.urlsafe_b64encode(raw_next.encode("utf-8")).decode("ascii")

        return (items, next_cursor)

    def _insert_or_get_active_alert(self, conn: psycopg.Connection, alert: Alert) -> Alert:
        row = conn.execute(
            """
            SELECT * FROM alerts
            WHERE patient_id = %s AND category = %s AND reason_code = %s AND rule_version = %s
              AND status IN ('open', 'acknowledged')
            ORDER BY created_at DESC LIMIT 1
            """,
            (alert.patient_id, alert.category.value, alert.reason.code, alert.reason.rule_version),
        ).fetchone()
        if row is not None:
            return self._alert_from_row(row)

        conn.execute(
            """
            INSERT INTO alerts (
                alert_id, patient_id, related_event_id, category, severity, reason_json,
                reason_code, rule_version, created_at, status
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                str(alert.alert_id),
                alert.patient_id,
                str(alert.related_event_id) if alert.related_event_id else None,
                alert.category.value,
                alert.severity.value,
                json.dumps(alert.reason.model_dump(mode="json", exclude_none=True), sort_keys=True),
                alert.reason.code,
                alert.reason.rule_version,
                self._iso(alert.created_at),
                alert.status.value,
            ),
        )

        policy_row = conn.execute(
            """
            SELECT * FROM escalation_policies
            WHERE (category = %s OR category IS NULL)
              AND min_severity = %s
            ORDER BY CASE WHEN category = %s THEN 1 ELSE 2 END
            LIMIT 1
            """,
            (alert.category.value, alert.severity.value, alert.category.value),
        ).fetchone()

        if policy_row is None:
            policy_row = conn.execute(
                "SELECT * FROM escalation_policies WHERE policy_id = %s",
                ("policy-critical" if alert.severity == AlertSeverity.CRITICAL else ("policy-high" if alert.severity == AlertSeverity.HIGH else "policy-default"),),
            ).fetchone()

        policy_id = policy_row["policy_id"] if policy_row else "policy-default"
        delay_seconds = int(policy_row["escalation_delay_seconds"]) if policy_row else 1800
        next_due = alert.created_at + timedelta(seconds=delay_seconds)
        next_due_iso = self._iso(next_due)
        created_at_iso = self._iso(alert.created_at)

        conn.execute(
            """
            INSERT INTO alert_escalations (
                alert_id, policy_id, patient_id, current_level, status,
                created_at, next_due_at, last_escalated_at, attempts_count, updated_at
            ) VALUES (%s, %s, %s, 0, 'pending', %s, %s, NULL, 0, %s)
            ON CONFLICT (alert_id) DO NOTHING
            """,
            (str(alert.alert_id), policy_id, alert.patient_id, created_at_iso, next_due_iso, created_at_iso),
        )
        return alert

    # ---------------- Escalation Engine Integration ----------------
    def list_escalation_policies(self) -> list[EscalationPolicy]:
        with self._connection() as conn:
            rows = conn.execute("SELECT * FROM escalation_policies ORDER BY min_severity DESC").fetchall()
            return [self._policy_from_row(r) for r in rows]

    def get_escalation_policy(self, policy_id: str) -> EscalationPolicy | None:
        with self._connection() as conn:
            row = conn.execute("SELECT * FROM escalation_policies WHERE policy_id = %s", (policy_id,)).fetchone()
            return self._policy_from_row(row) if row else None

    def get_alert_escalation(self, alert_id: UUID) -> AlertEscalationState | None:
        with self._connection() as conn:
            row = conn.execute("SELECT * FROM alert_escalations WHERE alert_id = %s", (str(alert_id),)).fetchone()
            if row is None:
                return None
            notif_rows = conn.execute(
                "SELECT * FROM mock_notifications WHERE alert_id = %s ORDER BY created_at ASC",
                (str(alert_id),),
            ).fetchall()
            notifications = [self._notification_from_row(n) for n in notif_rows]
            return self._escalation_from_row(row, notifications)

    def record_notification(
        self, notification: MockNotification, connection: psycopg.Connection | None = None
    ) -> MockNotification:
        if connection is not None:
            return self._record_notification_with_conn(connection, notification)
        with self._transaction() as conn:
            return self._record_notification_with_conn(conn, notification)

    def _record_notification_with_conn(
        self, conn: psycopg.Connection, notification: MockNotification
    ) -> MockNotification:
        conn.execute(
            """
            INSERT INTO mock_notifications (
                notification_id, alert_id, patient_id, escalation_level,
                recipient_role, recipient_target, channel, message_body,
                created_at, attempted_at, delivery_status, retry_count,
                failure_reason, is_simulated
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (notification_id) DO UPDATE SET
                attempted_at = EXCLUDED.attempted_at,
                delivery_status = EXCLUDED.delivery_status,
                retry_count = EXCLUDED.retry_count,
                failure_reason = EXCLUDED.failure_reason
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
            conn,
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
        with self._connection() as conn:
            clauses = []
            params: list[object] = []
            if alert_id is not None:
                clauses.append("alert_id = %s")
                params.append(str(alert_id))
            if patient_id is not None:
                clauses.append("patient_id = %s")
                params.append(patient_id)
            where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
            rows = conn.execute(f"SELECT * FROM mock_notifications{where} ORDER BY created_at DESC", params).fetchall()
            return [self._notification_from_row(r) for r in rows]

    def find_due_escalations(self, now: datetime) -> list[dict]:
        with self._connection() as conn:
            now_str = self._iso(now)
            return conn.execute(
                """
                SELECT e.*, p.name AS policy_name, p.initial_target_role, p.subsequent_target_role,
                       p.escalation_delay_seconds, p.max_attempts, p.retry_delay_seconds,
                       p.stop_on_acknowledge, p.stop_on_resolve
                FROM alert_escalations e
                JOIN escalation_policies p ON e.policy_id = p.policy_id
                WHERE e.status IN ('pending', 'escalated')
                  AND e.next_due_at IS NOT NULL
                  AND e.next_due_at <= %s
                ORDER BY e.next_due_at ASC
                """,
                (now_str,),
            ).fetchall()

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
        with self._transaction() as conn:
            conn.execute(
                """
                UPDATE alert_escalations
                SET current_level = %s, status = %s, next_due_at = %s, last_escalated_at = %s, attempts_count = %s, updated_at = %s
                WHERE alert_id = %s
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
                conn,
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

    # ---------------- Token Revocation & Audit Chain ----------------
    def revoke_token(self, jti: str, expires_at: datetime, actor_id: str) -> None:
        with self._transaction() as conn:
            conn.execute(
                """
                INSERT INTO revoked_tokens (jti, revoked_at, expires_at, actor_id)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (jti) DO NOTHING
                """,
                (jti, self._iso(datetime.now(timezone.utc)), self._iso(expires_at), actor_id),
            )

    def is_token_revoked(self, jti: str) -> bool:
        with self._connection() as conn:
            row = conn.execute(
                "SELECT 1 FROM revoked_tokens WHERE jti = %s AND expires_at > %s",
                (jti, self._iso(datetime.now(timezone.utc))),
            ).fetchone()
            return row is not None

    def record_audit(
        self,
        actor_id: str,
        action: str,
        alert_id: UUID | None,
        success: bool,
        metadata: dict,
    ) -> None:
        with self._transaction() as conn:
            self._write_audit(conn, actor_id, action, alert_id, success, metadata)

    def _write_audit(
        self,
        conn: psycopg.Connection,
        actor_id: str,
        action: str,
        alert_id: UUID | str | None,
        success: bool,
        metadata: dict,
    ) -> None:
        prev = conn.execute(
            "SELECT current_hash FROM audit_log WHERE current_hash IS NOT NULL ORDER BY audit_id DESC LIMIT 1"
        ).fetchone()
        previous_hash = prev["current_hash"] if prev is not None else None
        occurred_at = self._iso(datetime.now(timezone.utc))
        metadata_json = json.dumps(metadata, sort_keys=True)

        res = conn.execute(
            """
            INSERT INTO audit_log (actor_id, action, alert_id, occurred_at, success, metadata_json, previous_hash, current_hash)
            VALUES (%s, %s, %s, %s, %s, %s, %s, NULL)
            RETURNING audit_id
            """,
            (
                actor_id,
                action,
                str(alert_id) if alert_id is not None else None,
                occurred_at,
                int(success),
                metadata_json,
                previous_hash,
            ),
        ).fetchone()
        audit_id = res["audit_id"]

        canonical = json.dumps(
            {
                "audit_id": audit_id,
                "actor_id": actor_id,
                "action": action,
                "alert_id": str(alert_id) if alert_id is not None else None,
                "occurred_at": occurred_at,
                "success": bool(success),
                "metadata_json": metadata_json,
                "previous_hash": previous_hash,
            },
            sort_keys=True,
            separators=(",", ":"),
        )
        current_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        conn.execute("UPDATE audit_log SET current_hash = %s WHERE audit_id = %s", (current_hash, audit_id))

    def verify_audit_chain(self) -> dict[str, object]:
        with self._connection() as conn:
            rows = conn.execute("SELECT * FROM audit_log ORDER BY audit_id").fetchall()
        last_hash = None
        checked = 0
        legacy = 0
        for row in rows:
            if row["current_hash"] is None:
                if last_hash is not None:
                    return {"valid": False, "checked_records": checked, "legacy_records": legacy, "error": "hashed chain interrupted by legacy row"}
                legacy += 1
                continue
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
            expected = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
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
            clauses.append("audit_id >= %s")
            values.append(int(start_id))
        if end_id is not None:
            clauses.append("audit_id <= %s")
            values.append(int(end_id))
        if start_time is not None:
            st = self._iso(start_time) if isinstance(start_time, datetime) else str(start_time)
            clauses.append("occurred_at >= %s")
            values.append(st)
        if end_time is not None:
            et = self._iso(end_time) if isinstance(end_time, datetime) else str(end_time)
            clauses.append("occurred_at <= %s")
            values.append(et)
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        with self._connection() as conn:
            rows = conn.execute(f"SELECT * FROM audit_log{where} ORDER BY audit_id ASC", values).fetchall()
        records = []
        for row in rows:
            meta = json.loads(row["metadata_json"])
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

    # ---------------- Event Sync ----------------
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

    # ---------------- Helpers ----------------
    def _trusted_time(self) -> datetime:
        value = self._clock()
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("repository clock must return a timezone-aware datetime")
        return value

    @staticmethod
    def _iso(value: datetime) -> str:
        return value.isoformat().replace("+00:00", "Z")

    @staticmethod
    def _parse_iso(val: str | None) -> datetime | None:
        if val is None:
            return None
        return datetime.fromisoformat(val.replace("Z", "+00:00"))

    @staticmethod
    def _payload_json(event: MeasurementEvent) -> str:
        payload = event.model_dump(mode="json", exclude_none=True)
        payload.pop("received_at", None)
        return json.dumps(payload, sort_keys=True, separators=(",", ":"))

    @classmethod
    def _payload_hash(cls, event: MeasurementEvent) -> str:
        return hashlib.sha256(cls._payload_json(event).encode("utf-8")).hexdigest()

    @staticmethod
    def _event_from_row(row: dict) -> MeasurementEvent:
        payload = json.loads(row["payload_json"])
        payload["received_at"] = row["received_at"]
        return MeasurementEvent.model_validate(payload)

    @staticmethod
    def _alert_row(conn: psycopg.Connection, alert_id: UUID) -> dict:
        row = conn.execute("SELECT * FROM alerts WHERE alert_id = %s", (str(alert_id),)).fetchone()
        if row is None:
            raise AlertNotFound(str(alert_id))
        return row

    @staticmethod
    def _alerts_for_event(conn: psycopg.Connection, event_id: UUID) -> tuple[Alert, ...]:
        return tuple(
            PostgresRepository._alert_from_row(row)
            for row in conn.execute(
                "SELECT * FROM alerts WHERE related_event_id = %s ORDER BY created_at",
                (str(event_id),),
            ).fetchall()
        )

    @staticmethod
    def _alert_from_row(row: dict) -> Alert:
        acknowledgement = None
        if row.get("acknowledged_at") is not None:
            acknowledgement = {
                "acknowledged_at": row["acknowledged_at"],
                "acknowledged_by": row["acknowledged_by"],
            }
            if row.get("acknowledgement_note") is not None:
                acknowledgement["note"] = row["acknowledgement_note"]
        resolution = None
        if row.get("resolved_at") is not None:
            resolution = {
                "resolved_at": row["resolved_at"],
                "resolved_by": row["resolved_by"],
                "resolution_code": row["resolution_code"],
            }
            if row.get("resolution_note") is not None:
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
        if row.get("related_event_id") is not None:
            alert_payload["related_event_id"] = row["related_event_id"]
        if acknowledgement is not None:
            alert_payload["acknowledgement"] = acknowledgement
        if resolution is not None:
            alert_payload["resolution"] = resolution
        return Alert.model_validate(alert_payload)

    @staticmethod
    def _policy_from_row(row: dict) -> EscalationPolicy:
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
    def _notification_from_row(row: dict) -> MockNotification:
        return MockNotification.model_validate({
            "notification_id": row["notification_id"],
            "alert_id": row["alert_id"],
            "patient_id": row["patient_id"],
            "escalation_level": row["escalation_level"],
            "recipient_role": row["recipient_role"],
            "recipient_target": row["recipient_target"],
            "channel": row["channel"],
            "message_body": row["message_body"],
            "created_at": PostgresRepository._parse_iso(row["created_at"]),
            "attempted_at": PostgresRepository._parse_iso(row["attempted_at"]),
            "delivery_status": row["delivery_status"],
            "retry_count": row["retry_count"],
            "failure_reason": row["failure_reason"],
            "is_simulated": bool(row["is_simulated"]),
        })

    @staticmethod
    def _escalation_from_row(
        row: dict, notifications: list[MockNotification]
    ) -> AlertEscalationState:
        return AlertEscalationState.model_validate({
            "alert_id": row["alert_id"],
            "policy_id": row["policy_id"],
            "patient_id": row["patient_id"],
            "current_level": row["current_level"],
            "status": row["status"],
            "created_at": PostgresRepository._parse_iso(row["created_at"]),
            "next_due_at": PostgresRepository._parse_iso(row["next_due_at"]),
            "last_escalated_at": PostgresRepository._parse_iso(row["last_escalated_at"]),
            "attempts_count": row["attempts_count"],
            "updated_at": PostgresRepository._parse_iso(row["updated_at"]),
            "notifications": [n.model_dump(mode="json") for n in notifications],
        })
