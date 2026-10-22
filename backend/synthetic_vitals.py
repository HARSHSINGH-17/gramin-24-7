from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from uuid import NAMESPACE_URL, UUID, uuid5

from backend.app.models import (
    MeasurementEvent,
    MeasurementType,
    MissingDataEvent,
)


SYNTHETIC_PATIENT_ID = "PC-SYNTH01"
BASE_TIME = datetime(2026, 10, 22, 6, 0, tzinfo=timezone.utc)
SEQUENCE_NAMESPACE = uuid5(NAMESPACE_URL, "https://pahaadcare.example/synthetic-vitals/v1")


class SyntheticScenario(str, Enum):
    NORMAL = "normal"
    ABNORMAL = "abnormal"
    MISSING = "missing"
    STALE = "stale"
    DUPLICATE = "duplicate"
    CONFLICT = "conflict"
    RECOVERY = "recovery"
    FUTURE = "future"
    DEMO = "demo"


@dataclass(frozen=True)
class SyntheticSequence:
    scenario: SyntheticScenario
    measurements: tuple[MeasurementEvent, ...] = ()
    missing: tuple[MissingDataEvent, ...] = ()

    @property
    def events(self) -> tuple[MeasurementEvent | MissingDataEvent, ...]:
        return self.measurements + self.missing


def _event_id(scenario: SyntheticScenario, index: int) -> UUID:
    return uuid5(SEQUENCE_NAMESPACE, f"{scenario.value}:{index}")


def _measurement(
    scenario: SyntheticScenario,
    index: int,
    value: float,
    measured_at: datetime,
    measurement_type: MeasurementType = MeasurementType.HEART_RATE,
) -> MeasurementEvent:
    units = {
        MeasurementType.HEART_RATE: "beats_per_minute",
        MeasurementType.OXYGEN_SATURATION: "percent",
        MeasurementType.BODY_TEMPERATURE: "celsius",
        MeasurementType.SYSTOLIC_BLOOD_PRESSURE: "mmHg",
        MeasurementType.DIASTOLIC_BLOOD_PRESSURE: "mmHg",
    }
    return MeasurementEvent(
        schema_version="1.0",
        event_id=_event_id(scenario, index),
        patient_id=SYNTHETIC_PATIENT_ID,
        measurement_type=measurement_type,
        value=value,
        unit=units[measurement_type],
        measured_at=measured_at,
        source="simulator",
        is_simulated=True,
    )


def _missing(
    scenario: SyntheticScenario,
    index: int,
    category: str,
    observed_at: datetime,
) -> MissingDataEvent:
    return MissingDataEvent(
        event_id=_event_id(scenario, index),
        patient_id=SYNTHETIC_PATIENT_ID,
        category=category,
        expected_measurement_type="oxygen_saturation",
        expected_window_start=observed_at - timedelta(minutes=15),
        expected_window_end=observed_at,
        observed_at=observed_at,
        status="missing" if category == "missing_measurement" else "stale",
    )


def generate_scenario(scenario: SyntheticScenario | str) -> SyntheticSequence:
    selected = SyntheticScenario(scenario)
    normal = _measurement(selected, 0, 78, BASE_TIME)
    abnormal_low = _measurement(selected, 1, 35, BASE_TIME + timedelta(minutes=1))
    abnormal_high = _measurement(selected, 2, 135, BASE_TIME + timedelta(minutes=2))

    if selected is SyntheticScenario.NORMAL:
        return SyntheticSequence(selected, (normal,))
    if selected is SyntheticScenario.ABNORMAL:
        return SyntheticSequence(selected, (abnormal_low, abnormal_high))
    if selected is SyntheticScenario.MISSING:
        return SyntheticSequence(
            selected,
            missing=(_missing(selected, 0, "missing_measurement", BASE_TIME),),
        )
    if selected is SyntheticScenario.STALE:
        stale_time = BASE_TIME - timedelta(hours=2)
        return SyntheticSequence(
            selected,
            (_measurement(selected, 0, 78, stale_time),),
        )
    if selected is SyntheticScenario.DUPLICATE:
        duplicate = _measurement(selected, 0, 78, BASE_TIME)
        return SyntheticSequence(selected, (duplicate, duplicate))
    if selected is SyntheticScenario.CONFLICT:
        original = _measurement(selected, 0, 78, BASE_TIME)
        conflicting = original.model_copy(update={"value": 79})
        return SyntheticSequence(selected, (original, conflicting))
    if selected is SyntheticScenario.RECOVERY:
        return SyntheticSequence(
            selected,
            (
                _measurement(selected, 0, 135, BASE_TIME),
                _measurement(selected, 1, 78, BASE_TIME + timedelta(minutes=1)),
            ),
        )
    if selected is SyntheticScenario.FUTURE:
        return SyntheticSequence(
            selected,
            (_measurement(selected, 0, 78, BASE_TIME + timedelta(days=1)),),
        )

    demo_measurements = (
        _measurement(selected, 0, 78, BASE_TIME),
        _measurement(selected, 1, 35, BASE_TIME + timedelta(minutes=1)),
        _measurement(selected, 2, 135, BASE_TIME + timedelta(minutes=2)),
        _measurement(selected, 3, 98, BASE_TIME + timedelta(minutes=3), MeasurementType.OXYGEN_SATURATION),
        _measurement(selected, 4, 88, BASE_TIME + timedelta(minutes=4), MeasurementType.OXYGEN_SATURATION),
        _measurement(selected, 5, 36.7, BASE_TIME + timedelta(minutes=5), MeasurementType.BODY_TEMPERATURE),
        _measurement(selected, 6, 39, BASE_TIME + timedelta(minutes=6), MeasurementType.BODY_TEMPERATURE),
        _measurement(selected, 7, 120, BASE_TIME + timedelta(minutes=7), MeasurementType.SYSTOLIC_BLOOD_PRESSURE),
        _measurement(selected, 8, 80, BASE_TIME + timedelta(minutes=8), MeasurementType.DIASTOLIC_BLOOD_PRESSURE),
        _measurement(selected, 9, 78, BASE_TIME + timedelta(minutes=9)),
    )
    return SyntheticSequence(
        selected,
        measurements=demo_measurements,
        missing=(_missing(selected, 10, "missing_measurement", BASE_TIME + timedelta(minutes=10)),),
    )
