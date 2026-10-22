from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from collections.abc import Callable
from enum import Enum
from typing import Any
from uuid import UUID, NAMESPACE_URL, uuid5

from pydantic import ValidationError

from .models import Alert, MeasurementEvent, MissingDataEvent
from .monitoring import alert_from_missing_data
from .repository import EventRepository
from .store import EventIdConflict, EventSubmission, InMemoryEventStore


class ProcessingOutcome(str, Enum):
    ACCEPTED = "accepted"
    DUPLICATE = "duplicate"
    CONFLICT = "conflict"
    REJECTED = "rejected"
    MISSING = "missing"
    STALE = "stale"


@dataclass(frozen=True)
class ProcessedEvent:
    outcome: ProcessingOutcome
    event_id: UUID
    patient_id: str
    event: MeasurementEvent | None
    measurement_type: str | None
    value: float | None
    unit: str | None
    measured_at: datetime | None
    received_at: datetime | None
    alerts: tuple[Alert, ...] = ()
    quality_alerts: tuple[Alert, ...] = ()
    reason: str | None = None

    @property
    def alert_ids(self) -> tuple[UUID, ...]:
        return tuple(alert.alert_id for alert in self.alerts)


class MonitoringEngine:
    def __init__(
        self,
        store: EventRepository | None = None,
        clock: Callable[[], datetime] | None = None,
        freshness: timedelta = timedelta(minutes=15),
    ) -> None:
        self.store = store or InMemoryEventStore(clock=clock)
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.freshness = freshness
        self._quality_alerts: dict[tuple[str, str, str], Alert] = {}

    def process_measurement(self, payload: MeasurementEvent | dict[str, Any]) -> ProcessedEvent:
        try:
            event = payload if isinstance(payload, MeasurementEvent) else MeasurementEvent.model_validate(payload)
        except ValidationError as error:
            event_id = UUID(int=0)
            patient_id = "unknown"
            if isinstance(payload, dict):
                raw_event_id = payload.get("event_id")
                raw_patient_id = payload.get("patient_id")
                try:
                    event_id = UUID(str(raw_event_id))
                except (AttributeError, TypeError, ValueError):
                    pass
                if isinstance(raw_patient_id, str):
                    patient_id = raw_patient_id
            return ProcessedEvent(
                outcome=ProcessingOutcome.REJECTED,
                event_id=event_id,
                patient_id=patient_id,
                event=None,
                measurement_type=None,
                value=None,
                unit=None,
                measured_at=None,
                received_at=None,
                reason=str(error),
            )

        try:
            submission = self.store.submit(event)
        except EventIdConflict:
            return self._outcome_from_event(
                ProcessingOutcome.CONFLICT,
                event,
                reason="event_id_conflict",
            )

        outcome = (
            ProcessingOutcome.ACCEPTED
            if submission.status == "accepted"
            else ProcessingOutcome.DUPLICATE
        )
        result = self._outcome_from_submission(outcome, submission)
        if outcome is ProcessingOutcome.DUPLICATE:
            stale_alert = self._stale_alert(submission.event)
            if stale_alert is not None:
                return self._outcome_from_submission(
                    outcome,
                    submission,
                    quality_alerts=(stale_alert,),
                    reason="measurement_timestamp_outside_demo_freshness_window",
                )
            return result

        stale_alert = self._stale_alert(submission.event)
        if stale_alert is not None:
            result = self._outcome_from_submission(
                ProcessingOutcome.STALE,
                submission,
                alerts=(stale_alert,),
                quality_alerts=(stale_alert,),
                reason="measurement_timestamp_outside_demo_freshness_window",
            )
        return result

    def process_missing(self, event: MissingDataEvent) -> ProcessedEvent:
        alert = self._quality_alert(event)
        return ProcessedEvent(
            outcome=ProcessingOutcome.MISSING,
            event_id=event.event_id,
            patient_id=event.patient_id,
            event=None,
            measurement_type=event.expected_measurement_type.value,
            value=None,
            unit=None,
            measured_at=None,
            received_at=self._now(),
            alerts=(alert,),
            reason=event.category.value,
        )

    def process_no_event_received(
        self,
        patient_id: str,
        measurement_type: str,
        observed_at: datetime | None = None,
    ) -> ProcessedEvent:
        observed = observed_at or self._now()
        data_quality = MissingDataEvent(
            event_id=uuid5(
                NAMESPACE_URL,
                f"no-event:{patient_id}:{measurement_type}:{observed.isoformat()}",
            ),
            patient_id=patient_id,
            category="missing_measurement",
            expected_measurement_type=measurement_type,
            expected_window_start=observed - self.freshness,
            expected_window_end=observed,
            observed_at=observed,
            status="missing",
        )
        result = self.process_missing(data_quality)
        return ProcessedEvent(
            **{**result.__dict__, "reason": "no_event_received"}
        )

    def _stale_alert(self, event: MeasurementEvent) -> Alert | None:
        now = self._now()
        if event.measured_at >= now - self.freshness:
            return None
        data_quality = MissingDataEvent(
            event_id=uuid5(
                NAMESPACE_URL,
                f"stale:{event.event_id}:{event.measured_at.isoformat()}",
            ),
            patient_id=event.patient_id,
            category="stale_reading",
            expected_measurement_type=event.measurement_type,
            expected_window_start=event.measured_at,
            expected_window_end=now,
            observed_at=now,
            status="stale",
        )
        return self._quality_alert(data_quality)

    def _quality_alert(self, event: MissingDataEvent) -> Alert:
        if hasattr(self.store, "save_quality_alert"):
            return self.store.save_quality_alert(alert_from_missing_data(event))
        key = (event.patient_id, event.expected_measurement_type.value, event.category.value)
        alert = self._quality_alerts.get(key)
        if alert is None:
            alert = alert_from_missing_data(event)
            self._quality_alerts[key] = alert
        return alert

    def _now(self) -> datetime:
        now = self.clock()
        if now.tzinfo is None or now.utcoffset() is None:
            raise ValueError("engine clock must return a timezone-aware datetime")
        return now

    @staticmethod
    def _outcome_from_submission(
        outcome: ProcessingOutcome,
        submission: EventSubmission,
        alerts: tuple[Alert, ...] | None = None,
        quality_alerts: tuple[Alert, ...] = (),
        reason: str | None = None,
    ) -> ProcessedEvent:
        event = submission.event
        return ProcessedEvent(
            outcome=outcome,
            event_id=event.event_id,
            patient_id=event.patient_id,
            event=event,
            measurement_type=event.measurement_type.value,
            value=event.value,
            unit=event.unit.value,
            measured_at=event.measured_at,
            received_at=submission.received_at,
            alerts=submission.alerts if alerts is None else alerts,
            quality_alerts=quality_alerts,
            reason=reason,
        )

    @staticmethod
    def _outcome_from_event(
        outcome: ProcessingOutcome,
        event: MeasurementEvent,
        reason: str,
    ) -> ProcessedEvent:
        return ProcessedEvent(
            outcome=outcome,
            event_id=event.event_id,
            patient_id=event.patient_id,
            event=event,
            measurement_type=event.measurement_type.value,
            value=event.value,
            unit=event.unit.value,
            measured_at=event.measured_at,
            received_at=event.received_at,
            reason=reason,
        )
