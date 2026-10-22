from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from backend.app.engine import MonitoringEngine, ProcessingOutcome
from backend.app.models import MeasurementEvent, MeasurementType
from backend.app.monitoring import DEMO_THRESHOLDS, DemonstrationThreshold, validate_thresholds
from backend.app.store import InMemoryEventStore
from backend.synthetic_vitals import (
    BASE_TIME,
    SYNTHETIC_PATIENT_ID,
    SyntheticScenario,
    generate_scenario,
)


class FixedClock:
    def __init__(self, value: datetime) -> None:
        self.value = value

    def __call__(self) -> datetime:
        return self.value


def test_generator_is_deterministic_and_demo_has_at_least_ten_events() -> None:
    first = generate_scenario("demo")
    second = generate_scenario(SyntheticScenario.DEMO)

    assert first == second
    assert len(first.events) >= 10
    assert all(
        getattr(event, "patient_id", SYNTHETIC_PATIENT_ID) == SYNTHETIC_PATIENT_ID
        for event in first.events
    )


def test_normal_generated_ids_are_unique() -> None:
    sequence = generate_scenario("demo")
    ids = [event.event_id for event in sequence.events]

    assert len(ids) == len(set(ids))


def test_duplicate_and_conflict_scenarios_are_intentional() -> None:
    duplicate = generate_scenario("duplicate").measurements
    conflict = generate_scenario("conflict").measurements

    assert duplicate[0].event_id == duplicate[1].event_id
    assert duplicate[0].model_dump() == duplicate[1].model_dump()
    assert conflict[0].event_id == conflict[1].event_id
    assert conflict[0].value != conflict[1].value


@pytest.mark.parametrize(
    "scenario",
    ["normal", "abnormal", "missing", "stale", "duplicate", "conflict", "recovery", "future"],
)
def test_scenarios_are_reproducible(scenario: str) -> None:
    assert generate_scenario(scenario) == generate_scenario(scenario)


def test_normal_reading_is_accepted_without_alert() -> None:
    engine = MonitoringEngine(clock=FixedClock(BASE_TIME))
    result = engine.process_measurement(generate_scenario("normal").measurements[0])

    assert result.outcome is ProcessingOutcome.ACCEPTED
    assert result.alerts == ()
    assert result.value == 78


def test_below_and_above_thresholds_create_alerts() -> None:
    engine = MonitoringEngine(clock=FixedClock(BASE_TIME))
    results = [engine.process_measurement(event) for event in generate_scenario("abnormal").measurements]

    assert all(result.outcome is ProcessingOutcome.ACCEPTED for result in results)
    assert all(result.alerts[0].category.value == "abnormal_measurement" for result in results)
    assert all(result.alerts[0].reason.rule_version == "demo-1" for result in results)


def test_threshold_configuration_is_complete_and_ordered() -> None:
    assert set(DEMO_THRESHOLDS) == set(MeasurementType)
    validate_thresholds(DEMO_THRESHOLDS)
    with pytest.raises(ValueError):
        DemonstrationThreshold(10, 9)
    with pytest.raises(ValueError):
        validate_thresholds({MeasurementType.HEART_RATE: DemonstrationThreshold(40, 120)})


def test_missing_event_has_no_fabricated_value() -> None:
    engine = MonitoringEngine(clock=FixedClock(BASE_TIME))
    result = engine.process_missing(generate_scenario("missing").missing[0])

    assert result.outcome is ProcessingOutcome.MISSING
    assert result.value is None
    assert result.unit is None
    assert result.alerts[0].category.value == "missing_measurement"


def test_no_event_received_is_distinct_from_explicit_missing() -> None:
    engine = MonitoringEngine(clock=FixedClock(BASE_TIME))
    result = engine.process_no_event_received(
        SYNTHETIC_PATIENT_ID, "oxygen_saturation", BASE_TIME
    )

    assert result.outcome is ProcessingOutcome.MISSING
    assert result.reason == "no_event_received"
    assert result.alerts[0].category.value == "missing_measurement"


def test_stale_measurement_uses_injected_clock_and_preserves_measurement_time() -> None:
    now = BASE_TIME
    engine = MonitoringEngine(clock=FixedClock(now), freshness=timedelta(minutes=15))
    stale = generate_scenario("stale").measurements[0]
    result = engine.process_measurement(stale)

    assert result.outcome is ProcessingOutcome.STALE
    assert result.measured_at == stale.measured_at
    assert result.received_at == now
    assert result.alerts[0].category.value == "stale_reading"
    assert result.value == stale.value


def test_future_measurement_is_preserved_under_unresolved_clock_policy() -> None:
    engine = MonitoringEngine(clock=FixedClock(BASE_TIME))
    future = generate_scenario("future").measurements[0]
    result = engine.process_measurement(future)

    assert result.outcome is ProcessingOutcome.ACCEPTED
    assert result.measured_at == future.measured_at
    assert result.received_at == BASE_TIME


def test_duplicate_does_not_create_second_event_or_alert() -> None:
    engine = MonitoringEngine(clock=FixedClock(BASE_TIME))
    duplicate = generate_scenario("duplicate").measurements

    first = engine.process_measurement(duplicate[0])
    second = engine.process_measurement(duplicate[1])

    assert first.outcome is ProcessingOutcome.ACCEPTED
    assert second.outcome is ProcessingOutcome.DUPLICATE
    assert second.alert_ids == first.alert_ids


def test_conflicting_event_id_is_rejected() -> None:
    engine = MonitoringEngine(clock=FixedClock(BASE_TIME))
    conflict = generate_scenario("conflict").measurements

    engine.process_measurement(conflict[0])
    result = engine.process_measurement(conflict[1])

    assert result.outcome is ProcessingOutcome.CONFLICT
    assert result.reason == "event_id_conflict"


def test_repeated_abnormal_events_reuse_active_alert() -> None:
    engine = MonitoringEngine(clock=FixedClock(BASE_TIME))
    first = engine.process_measurement(generate_scenario("abnormal").measurements[0])
    second_event = generate_scenario("abnormal").measurements[0].model_copy(
        update={"event_id": uuid4(), "measured_at": BASE_TIME + timedelta(minutes=1)}
    )
    second = engine.process_measurement(second_event)

    assert first.alert_ids == second.alert_ids


def test_normal_reading_after_abnormal_is_processed_without_new_alert() -> None:
    engine = MonitoringEngine(clock=FixedClock(BASE_TIME))
    abnormal = generate_scenario("recovery").measurements[0]
    normal = generate_scenario("recovery").measurements[1]

    abnormal_result = engine.process_measurement(abnormal)
    normal_result = engine.process_measurement(normal)

    assert abnormal_result.alerts
    assert normal_result.outcome is ProcessingOutcome.ACCEPTED
    assert normal_result.alerts == ()


def test_invalid_measurement_is_rejected_without_storage() -> None:
    engine = MonitoringEngine(clock=FixedClock(BASE_TIME))
    invalid = generate_scenario("normal").measurements[0].model_dump(mode="json")
    invalid["unit"] = "percent"

    result = engine.process_measurement(invalid)

    assert result.outcome is ProcessingOutcome.REJECTED
    assert result.alerts == ()


def test_store_clock_must_be_timezone_aware() -> None:
    store = InMemoryEventStore(clock=lambda: datetime(2026, 10, 22, 6, 0))
    event = generate_scenario("normal").measurements[0]

    with pytest.raises(ValueError, match="timezone-aware"):
        store.submit(event)
