from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Protocol
from uuid import UUID, uuid4

from .models import (
    AlertEscalationState,
    AlertSeverity,
    AlertStatus,
    EscalationPolicy,
    EscalationRole,
    EscalationStatus,
    MockNotification,
    NotificationDeliveryStatus,
)
from .notifications import MockNotificationAdapter, SYNTHETIC_RECIPIENT_CONTACTS
from .repository import SQLiteRepository


class EscalationEngine:
    """Evaluates and processes durable alert escalations.

    Features:
    - Durable persistence in SQLite.
    - Idempotent processing: no duplicate notifications per alert, level, and cycle.
    - Level 1 (Community Health Worker) -> Level 2 (Supervisor) progression.
    - Bounded retries with backoff delays.
    - Automatic stopping upon alert acknowledgement or resolution.
    - Hash-chained audit logging for all escalation events.
    """

    def __init__(
        self,
        repository: SQLiteRepository,
        notification_adapter: MockNotificationAdapter | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.repository = repository
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.notification_adapter = notification_adapter or MockNotificationAdapter(repository=repository, clock=self.clock)
        self.notification_adapter.set_repository(repository)

    def _trusted_now(self) -> datetime:
        now = self.clock()
        if now.tzinfo is None or now.utcoffset() is None:
            now = now.replace(tzinfo=timezone.utc)
        return now

    def process_due_escalations(self, now: datetime | None = None) -> list[MockNotification]:
        """Find and process all due escalations atomically.

        Guaranteed idempotent and concurrency-safe via SQLite transactions.
        """
        current_time = now or self._trusted_now()
        if current_time.tzinfo is None or current_time.utcoffset() is None:
            current_time = current_time.replace(tzinfo=timezone.utc)

        due_rows = self.repository.find_due_escalations(current_time)
        dispatched_notifications: list[MockNotification] = []

        for row in due_rows:
            alert_id = UUID(row["alert_id"])
            notification = self._process_single_due_alert(alert_id, current_time)
            if notification is not None:
                dispatched_notifications.append(notification)

        return dispatched_notifications

    def _process_single_due_alert(
        self, alert_id: UUID, current_time: datetime
    ) -> MockNotification | None:
        """Process a single due alert within an isolated IMMEDIATE transaction."""
        with self.repository._transaction() as connection:
            # Re-fetch escalation state with transaction lock to ensure concurrency safety
            esc_row = connection.execute(
                """
                SELECT e.*, p.initial_target_role, p.subsequent_target_role,
                       p.escalation_delay_seconds, p.max_attempts, p.retry_delay_seconds,
                       p.stop_on_acknowledge, p.stop_on_resolve
                FROM alert_escalations e
                JOIN escalation_policies p ON e.policy_id = p.policy_id
                WHERE e.alert_id = ?
                """,
                (str(alert_id),),
            ).fetchone()

            if esc_row is None:
                return None

            # Skip if no longer in pending or escalated status
            if esc_row["status"] not in (EscalationStatus.PENDING.value, EscalationStatus.ESCALATED.value):
                return None

            # Concurrency guard: re-verify next_due_at is still due under the transaction lock
            raw_next_due = esc_row["next_due_at"]
            if not raw_next_due:
                return None
            next_due_dt = datetime.fromisoformat(raw_next_due)
            if next_due_dt.tzinfo is None or next_due_dt.utcoffset() is None:
                next_due_dt = next_due_dt.replace(tzinfo=timezone.utc)
            if next_due_dt > current_time:
                return None

            # Check if alert was acknowledged or resolved in the meantime
            alert_row = connection.execute(
                "SELECT status, severity, category, reason_code FROM alerts WHERE alert_id = ?",
                (str(alert_id),),
            ).fetchone()

            if alert_row is None:
                return None

            alert_status = alert_row["status"]
            if alert_status == AlertStatus.ACKNOWLEDGED.value and esc_row["stop_on_acknowledge"]:
                connection.execute(
                    """
                    UPDATE alert_escalations
                    SET status = 'acknowledged_stopped', next_due_at = NULL, updated_at = ?
                    WHERE alert_id = ?
                    """,
                    (SQLiteRepository._iso(current_time), str(alert_id)),
                )
                self.repository._write_audit(
                    connection, "system", "escalation_stopped_on_acknowledge", alert_id, True,
                    {"reason": "alert_already_acknowledged"},
                )
                return None

            if alert_status == AlertStatus.RESOLVED.value and esc_row["stop_on_resolve"]:
                connection.execute(
                    """
                    UPDATE alert_escalations
                    SET status = 'resolved_stopped', next_due_at = NULL, updated_at = ?
                    WHERE alert_id = ?
                    """,
                    (SQLiteRepository._iso(current_time), str(alert_id)),
                )
                self.repository._write_audit(
                    connection, "system", "escalation_stopped_on_resolve", alert_id, True,
                    {"reason": "alert_already_resolved"},
                )
                return None

            current_level = int(esc_row["current_level"])
            attempts_count = int(esc_row["attempts_count"])
            max_attempts = int(esc_row["max_attempts"])

            # Determine target escalation level and recipient role
            if current_level == 0:
                target_level = 1
                role_str = esc_row["initial_target_role"]
            elif current_level == 1 and esc_row["subsequent_target_role"]:
                target_level = 2
                role_str = esc_row["subsequent_target_role"]
            else:
                # Already at highest level or max attempts
                connection.execute(
                    """
                    UPDATE alert_escalations
                    SET status = 'max_reached', next_due_at = NULL, updated_at = ?
                    WHERE alert_id = ?
                    """,
                    (SQLiteRepository._iso(current_time), str(alert_id)),
                )
                self.repository._write_audit(
                    connection, "system", "escalation_max_reached", alert_id, True,
                    {"current_level": current_level, "attempts_count": attempts_count},
                )
                return None

            # Concurrency check: Ensure no duplicate notification already exists for this alert and level
            existing_notif = connection.execute(
                """
                SELECT notification_id FROM mock_notifications
                WHERE alert_id = ? AND escalation_level = ? AND delivery_status = 'delivered'
                """,
                (str(alert_id), target_level),
            ).fetchone()

            if existing_notif is not None:
                # Already delivered for this level, prevent duplicate
                return None

            recipient_role = EscalationRole(role_str)
            recipient_target = SYNTHETIC_RECIPIENT_CONTACTS.get(
                recipient_role, f"synthetic-{role_str}@pahaadcare.local"
            )

            severity = alert_row["severity"]
            category = alert_row["category"]
            reason_code = alert_row["reason_code"]
            patient_id = esc_row["patient_id"]

            message_body = (
                f"[SIMULATED NOTIFICATION] Escalation Level {target_level}: "
                f"Patient {patient_id} has unacknowledged {severity.upper()} {category} alert "
                f"({reason_code}). Target: {recipient_role.value}. Demonstration only."
            )

            notification = MockNotification(
                notification_id=uuid4(),
                alert_id=alert_id,
                patient_id=patient_id,
                escalation_level=target_level,
                recipient_role=recipient_role,
                recipient_target=recipient_target,
                channel="mock_sms",
                message_body=message_body,
                created_at=current_time,
                attempted_at=current_time,
                delivery_status=NotificationDeliveryStatus.DELIVERED,
                retry_count=attempts_count,
                failure_reason=None,
                is_simulated=True,
            )

            # Send via notification adapter
            dispatched = self.notification_adapter.send(notification)
            self.repository.record_notification(dispatched, connection=connection)

            if dispatched.delivery_status == NotificationDeliveryStatus.FAILED:
                # Delivery failed: handle bounded retry
                new_attempts = attempts_count + 1
                if new_attempts >= max_attempts:
                    new_status = EscalationStatus.MAX_REACHED.value
                    new_next_due = None
                else:
                    new_status = EscalationStatus.PENDING.value
                    retry_delay = int(esc_row["retry_delay_seconds"])
                    new_next_due = current_time + timedelta(seconds=retry_delay)

                connection.execute(
                    """
                    UPDATE alert_escalations
                    SET attempts_count = ?, status = ?, next_due_at = ?, updated_at = ?
                    WHERE alert_id = ?
                    """,
                    (
                        new_attempts,
                        new_status,
                        SQLiteRepository._iso(new_next_due) if new_next_due else None,
                        SQLiteRepository._iso(current_time),
                        str(alert_id),
                    ),
                )
                self.repository._write_audit(
                    connection, "system", "escalation_notification_failed", alert_id, False,
                    {
                        "level": target_level,
                        "attempts_count": new_attempts,
                        "max_attempts": max_attempts,
                        "failure_reason": dispatched.failure_reason,
                        "next_retry": SQLiteRepository._iso(new_next_due) if new_next_due else None,
                    },
                )
                return dispatched

            # Successful delivery: advance escalation state
            new_attempts = attempts_count + 1
            has_next_level = (target_level == 1 and esc_row["subsequent_target_role"] is not None)

            if has_next_level:
                next_delay = int(esc_row["escalation_delay_seconds"])
                new_next_due = current_time + timedelta(seconds=next_delay)
                new_status = EscalationStatus.ESCALATED.value
            else:
                new_next_due = None
                new_status = EscalationStatus.MAX_REACHED.value

            connection.execute(
                """
                UPDATE alert_escalations
                SET current_level = ?, status = ?, next_due_at = ?,
                    last_escalated_at = ?, attempts_count = ?, updated_at = ?
                WHERE alert_id = ?
                """,
                (
                    target_level,
                    new_status,
                    SQLiteRepository._iso(new_next_due) if new_next_due else None,
                    SQLiteRepository._iso(current_time),
                    new_attempts,
                    SQLiteRepository._iso(current_time),
                    str(alert_id),
                ),
            )
            self.repository._write_audit(
                connection, "system", "escalation_level_advanced", alert_id, True,
                {
                    "advanced_to_level": target_level,
                    "recipient_role": recipient_role.value,
                    "status": new_status,
                    "next_due_at": SQLiteRepository._iso(new_next_due) if new_next_due else None,
                },
            )

            return dispatched
