from datetime import datetime, timedelta, timezone
from typing import Callable

from backend.synthetic_vitals import BASE_TIME, SYNTHETIC_PATIENT_ID, SyntheticScenario, generate_scenario

from .engine import MonitoringEngine, ProcessedEvent
from .repository import EventRepository


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat().replace("+00:00", "Z")


def _event_record(result: ProcessedEvent) -> dict:
    return {
        "event_id": str(result.event_id),
        "patient_id": result.patient_id,
        "measurement_type": result.measurement_type,
        "value": result.value,
        "unit": result.unit,
        "measured_at": _iso(result.measured_at),
        "received_at": _iso(result.received_at),
        "outcome": result.outcome.value,
        "reason": result.reason,
        "alert_ids": [str(alert_id) for alert_id in result.alert_ids],
        "is_simulated": True,
    }


def _quality_record(result: ProcessedEvent, alert) -> dict:
    record = _event_record(result)
    record["outcome"] = alert.category.value.replace("_reading", "")
    record["reason"] = alert.category.value
    record["alert_ids"] = [str(alert.alert_id)]
    return record


def build_demo_dashboard_snapshot(
    clock: Callable[[], datetime] | None = None,
    store: EventRepository | None = None,
) -> dict:
    demo_clock = clock or (lambda: BASE_TIME + timedelta(minutes=10))
    engine = MonitoringEngine(store=store, clock=demo_clock)
    results: list[ProcessedEvent] = []
    for scenario in (SyntheticScenario.DEMO, SyntheticScenario.STALE):
        for item in generate_scenario(scenario).events:
            if hasattr(item, "measurement_type") and hasattr(item, "value"):
                results.append(engine.process_measurement(item))
            else:
                results.append(engine.process_missing(item))

    measurements = [
        _event_record(result)
        for result in results
        if result.event is not None
    ]
    conditions = [
        _event_record(result)
        for result in results
        if result.outcome.value == "missing"
    ]
    conditions.extend(
        _quality_record(result, alert)
        for result in results
        for alert in result.quality_alerts
    )
    alerts_by_id = {
        str(alert.alert_id): alert.model_dump(mode="json")
        for result in results
        for alert in result.alerts
        if alert.status.value in {"open", "acknowledged"}
    }
    latest_by_type: dict[str, dict] = {}
    for record in measurements:
        measurement_type = record["measurement_type"]
        current = latest_by_type.get(measurement_type)
        if current is None or record["measured_at"] > current["measured_at"]:
            latest_by_type[measurement_type] = record

    generated_at = demo_clock()
    return {
        "schema_version": "demo-1",
        "is_simulated": True,
        "generated_at": _iso(generated_at),
        "summary": {
            "synthetic_patient_count": 1,
            "measurement_event_count": len(measurements),
            "active_alert_count": len(alerts_by_id),
            "missing_condition_count": sum(
                condition["outcome"] == "missing" for condition in conditions
            ),
            "stale_condition_count": sum(
                condition["outcome"] == "stale" for condition in conditions
            ),
        },
        "patients": [
            {
                "patient_id": SYNTHETIC_PATIENT_ID,
                "display_name": "Synthetic demo patient",
                "is_simulated": True,
                "latest_measurements": latest_by_type,
                "alert_ids": list(alerts_by_id),
                "data_quality": conditions,
            }
        ],
        "measurements": measurements,
        "conditions": conditions,
        "alerts": list(alerts_by_id.values()),
    }
