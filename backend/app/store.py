from dataclasses import dataclass
from datetime import datetime, timezone
from collections.abc import Callable
import hashlib
import json
from uuid import UUID

from .models import Alert, MeasurementEvent
from .monitoring import (
    DEMO_THRESHOLDS,
    DemonstrationThreshold,
    evaluate_demo_threshold,
    validate_thresholds,
)


class EventIdConflict(ValueError):
    pass


@dataclass(frozen=True)
class EventSubmission:
    status: str
    event: MeasurementEvent
    received_at: datetime
    alerts: tuple[Alert, ...]


class InMemoryEventStore:
    """Contract-level store; not durable persistence and not production storage."""

    def __init__(
        self,
        clock: Callable[[], datetime] | None = None,
        thresholds: dict | None = None,
    ) -> None:
        self._events: dict[UUID, tuple[str, EventSubmission]] = {}
        self._active_alerts: dict[tuple[str, str, str, str], Alert] = {}
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self._thresholds = validate_thresholds(thresholds or DEMO_THRESHOLDS)

    def submit(
        self,
        event: MeasurementEvent,
        evaluate_alerts: bool = True,
    ) -> EventSubmission:
        payload_hash = self._payload_hash(event)
        existing = self._events.get(event.event_id)
        if existing is not None:
            existing_hash, submission = existing
            if existing_hash != payload_hash:
                raise EventIdConflict("event_id_conflict")
            return EventSubmission(
                status="duplicate",
                event=submission.event,
                received_at=submission.received_at,
                alerts=submission.alerts,
            )

        received_at = self._clock()
        if received_at.tzinfo is None or received_at.utcoffset() is None:
            raise ValueError("store clock must return a timezone-aware datetime")
        accepted_event = event.model_copy(update={"received_at": received_at})
        alert = (
            evaluate_demo_threshold(accepted_event, self._thresholds)
            if evaluate_alerts
            else None
        )
        alerts: tuple[Alert, ...] = ()
        if alert is not None:
            alert_key = (
                alert.patient_id,
                alert.category.value,
                alert.reason.code,
                alert.reason.rule_version,
            )
            active_alert = self._active_alerts.setdefault(alert_key, alert)
            alerts = (active_alert,)
        submission = EventSubmission(
            status="accepted",
            event=accepted_event,
            received_at=received_at,
            alerts=alerts,
        )
        self._events[event.event_id] = (payload_hash, submission)
        return submission

    @staticmethod
    def _payload_hash(event: MeasurementEvent) -> str:
        payload = event.model_dump(mode="json")
        payload.pop("received_at", None)
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
