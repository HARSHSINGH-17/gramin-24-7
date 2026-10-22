from collections.abc import Callable
from datetime import datetime, timezone
from typing import Protocol
from uuid import UUID, uuid4

from .models import (
    EscalationRole,
    MockNotification,
    NotificationDeliveryStatus,
)


SYNTHETIC_RECIPIENT_CONTACTS = {
    EscalationRole.COMMUNITY_HEALTH_WORKER: "+91-99999-00001 (simulated CHW)",
    EscalationRole.SUPERVISOR: "+91-99999-00002 (simulated Supervisor)",
}


class NotificationAdapter(Protocol):
    """Adapter interface for alert notifications."""

    def send(self, notification: MockNotification) -> MockNotification: ...


class MockNotificationAdapter:
    """Mock notification adapter for hackathon demonstration.

    Does NOT send real SMS, emails, phone calls, or push notifications.
    Records delivery attempts, simulated status, and retries in persistent storage.
    """

    def __init__(
        self,
        repository=None,
        clock: Callable[[], datetime] | None = None,
        fail_recipients: set[str] | None = None,
        fail_attempts: int = 0,
    ) -> None:
        self.repository = repository
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self.fail_recipients = set(fail_recipients or ())
        self.fail_attempts = fail_attempts
        self._attempt_tracker: dict[UUID, int] = {}
        self.dispatched_history: list[MockNotification] = []

    def set_repository(self, repository) -> None:
        self.repository = repository

    def send(self, notification: MockNotification) -> MockNotification:
        now = self._clock()
        if now.tzinfo is None or now.utcoffset() is None:
            now = now.replace(tzinfo=timezone.utc)

        current_attempts = self._attempt_tracker.get(notification.alert_id, 0)
        self._attempt_tracker[notification.alert_id] = current_attempts + 1

        should_fail = (
            notification.recipient_target in self.fail_recipients
            or current_attempts < self.fail_attempts
        )

        delivery_status = (
            NotificationDeliveryStatus.FAILED if should_fail else NotificationDeliveryStatus.DELIVERED
        )
        failure_reason = (
            "simulated_mock_transport_failure" if should_fail else None
        )

        updated = notification.model_copy(
            update={
                "attempted_at": now,
                "delivery_status": delivery_status,
                "failure_reason": failure_reason,
                "is_simulated": True,
            }
        )

        self.dispatched_history.append(updated)
        return updated
