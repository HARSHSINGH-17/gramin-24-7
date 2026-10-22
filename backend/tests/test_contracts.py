from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator, FormatChecker
from pydantic import ValidationError

from backend.app.main import app
from backend.app.models import (
    Alert,
    MeasurementEvent,
    MissingDataEvent,
)
from backend.app.monitoring import alert_from_missing_data
from backend.app.store import EventIdConflict, InMemoryEventStore

ROOT = Path(__file__).resolve().parents[2]
MEASUREMENT_SCHEMA = json.loads(
    (ROOT / "schemas" / "rpm-measurement-event.schema.json").read_text()
)
ALERT_SCHEMA = json.loads(
    (ROOT / "schemas" / "rpm-alert.schema.json").read_text()
)


VALID_EVENT = {
    "schema_version": "1.0",
    "event_id": "2f1f5d33-8d37-4a70-92e0-0d2c98a5d104",
    "patient_id": "PC-DEMO01",
    "measurement_type": "heart_rate",
    "value": 78,
    "unit": "beats_per_minute",
    "measured_at": "2026-10-22T05:59:00Z",
    "source": "simulator",
    "is_simulated": True,
}

STRICT_FORMAT_CHECKER = FormatChecker()


@STRICT_FORMAT_CHECKER.checks("date-time", raises=(TypeError, ValueError))
def is_timezone_aware_datetime(value: object) -> bool:
    if not isinstance(value, str):
        return False
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed.tzinfo is not None and parsed.utcoffset() is not None


@STRICT_FORMAT_CHECKER.checks("uuid", raises=(TypeError, ValueError, AttributeError))
def is_uuid(value: object) -> bool:
    if not isinstance(value, str):
        return False
    UUID(value)
    return True


def test_measurement_schema_accepts_valid_event() -> None:
    Draft202012Validator(
        MEASUREMENT_SCHEMA, format_checker=STRICT_FORMAT_CHECKER
    ).validate(VALID_EVENT)
    MeasurementEvent.model_validate(VALID_EVENT)


@pytest.mark.parametrize(
    ("measurement_type", "value", "unit"),
    [
        ("heart_rate", 78, "beats_per_minute"),
        ("oxygen_saturation", 98, "percent"),
        ("body_temperature", 36.7, "celsius"),
        ("systolic_blood_pressure", 120, "mmHg"),
        ("diastolic_blood_pressure", 80, "mmHg"),
    ],
)
def test_all_supported_measurements_match_schema_and_model(
    measurement_type: str, value: float, unit: str
) -> None:
    payload = {
        **VALID_EVENT,
        "event_id": str(uuid4()),
        "measurement_type": measurement_type,
        "value": value,
        "unit": unit,
    }
    Draft202012Validator(
        MEASUREMENT_SCHEMA, format_checker=STRICT_FORMAT_CHECKER
    ).validate(payload)
    MeasurementEvent.model_validate(payload)


@pytest.mark.parametrize(
    ("measurement_type", "value"),
    [
        ("heart_rate", 19),
        ("oxygen_saturation", 101),
        ("body_temperature", 61),
        ("systolic_blood_pressure", 301),
        ("diastolic_blood_pressure", 201),
    ],
)
def test_measurement_ranges_are_enforced_by_schema_and_model(
    measurement_type: str, value: float
) -> None:
    unit = {
        "heart_rate": "beats_per_minute",
        "oxygen_saturation": "percent",
        "body_temperature": "celsius",
        "systolic_blood_pressure": "mmHg",
        "diastolic_blood_pressure": "mmHg",
    }[measurement_type]
    payload = {
        **VALID_EVENT,
        "event_id": str(uuid4()),
        "measurement_type": measurement_type,
        "value": value,
        "unit": unit,
    }
    errors = list(
        Draft202012Validator(
            MEASUREMENT_SCHEMA, format_checker=STRICT_FORMAT_CHECKER
        ).iter_errors(payload)
    )
    assert errors
    with pytest.raises(ValidationError):
        MeasurementEvent.model_validate(payload)


def test_additional_measurement_properties_are_rejected() -> None:
    payload = {**VALID_EVENT, "unexpected": True}
    errors = list(
        Draft202012Validator(
            MEASUREMENT_SCHEMA, format_checker=STRICT_FORMAT_CHECKER
        ).iter_errors(payload)
    )
    assert errors
    with pytest.raises(ValidationError):
        MeasurementEvent.model_validate(payload)


def test_measurement_schema_rejects_missing_required_field() -> None:
    payload = deepcopy(VALID_EVENT)
    del payload["measurement_type"]

    errors = list(
        Draft202012Validator(
            MEASUREMENT_SCHEMA, format_checker=STRICT_FORMAT_CHECKER
        ).iter_errors(payload)
    )
    assert any("measurement_type" in error.message for error in errors)
    with pytest.raises(ValidationError):
        MeasurementEvent.model_validate(payload)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("unit", "percent"),
        ("measurement_type", "unsupported_vital"),
        ("value", "78"),
    ],
)
def test_measurement_schema_rejects_invalid_values(field: str, value: object) -> None:
    payload = deepcopy(VALID_EVENT)
    payload[field] = value
    errors = list(
        Draft202012Validator(
            MEASUREMENT_SCHEMA, format_checker=STRICT_FORMAT_CHECKER
        ).iter_errors(payload)
    )
    assert errors


def test_measurement_schema_declares_timestamp_format() -> None:
    assert MEASUREMENT_SCHEMA["properties"]["measured_at"]["format"] == "date-time"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("unit", "percent"),
        ("measurement_type", "unsupported_vital"),
        ("value", "78"),
        ("measured_at", "not-a-timestamp"),
        ("measured_at", "2026-10-22T05:59:00"),
    ],
)
def test_measurement_rejects_invalid_contract_values(field: str, value: object) -> None:
    payload = deepcopy(VALID_EVENT)
    payload[field] = value
    with pytest.raises(ValidationError):
        MeasurementEvent.model_validate(payload)


def test_measurement_rejects_non_finite_value() -> None:
    payload = deepcopy(VALID_EVENT)
    payload["value"] = float("nan")
    with pytest.raises(ValidationError, match="finite"):
        MeasurementEvent.model_validate(payload)


@pytest.mark.parametrize(
    "field",
    ["received_at", "device_reference", "health_worker_reference"],
)
def test_measurement_optional_fields_reject_explicit_null(field: str) -> None:
    payload = deepcopy(VALID_EVENT)
    payload[field] = None
    errors = list(
        Draft202012Validator(
            MEASUREMENT_SCHEMA, format_checker=STRICT_FORMAT_CHECKER
        ).iter_errors(payload)
    )
    assert errors
    with pytest.raises(ValidationError):
        MeasurementEvent.model_validate(payload)


def test_future_measurement_is_accepted_until_clock_skew_policy_is_decided() -> None:
    future = deepcopy(VALID_EVENT)
    future["measured_at"] = "2099-10-22T05:59:00Z"
    event = MeasurementEvent.model_validate(future)
    submission = InMemoryEventStore().submit(event)

    assert submission.event.measured_at == event.measured_at
    assert submission.received_at < event.measured_at


def test_missing_data_is_not_a_measurement() -> None:
    missing = MissingDataEvent(
        event_id=uuid4(),
        patient_id="PC-DEMO01",
        category="missing_measurement",
        expected_measurement_type="oxygen_saturation",
        expected_window_start=datetime(2026, 10, 22, 5, 0, tzinfo=timezone.utc),
        expected_window_end=datetime(2026, 10, 22, 5, 15, tzinfo=timezone.utc),
        observed_at=datetime(2026, 10, 22, 5, 16, tzinfo=timezone.utc),
        status="missing",
    )
    assert missing.category.value == "missing_measurement"
    assert not hasattr(missing, "value")
    with pytest.raises(ValidationError):
        MissingDataEvent(
            **missing.model_dump(),
            value=0,
        )


@pytest.mark.parametrize("category", ["missing_measurement", "stale_reading"])
def test_missing_and_stale_data_create_distinct_alerts(category: str) -> None:
    missing = MissingDataEvent(
        event_id=uuid4(),
        patient_id="PC-DEMO01",
        category=category,
        expected_measurement_type="oxygen_saturation",
        expected_window_start=datetime(2026, 10, 22, 5, 0, tzinfo=timezone.utc),
        expected_window_end=datetime(2026, 10, 22, 5, 15, tzinfo=timezone.utc),
        observed_at=datetime(2026, 10, 22, 5, 16, tzinfo=timezone.utc),
        status="missing" if category == "missing_measurement" else "stale",
    )
    alert = alert_from_missing_data(missing)

    assert alert.category.value == category
    assert alert.related_event_id is None
    assert alert.reason.expected_measurement_type.value == "oxygen_saturation"


def test_alert_status_requires_acknowledgement_and_resolution_metadata() -> None:
    base = {
        "schema_version": "1.0",
        "alert_id": str(uuid4()),
        "patient_id": "PC-DEMO01",
        "related_event_id": VALID_EVENT["event_id"],
        "category": "abnormal_measurement",
        "severity": "medium",
        "reason": {
            "code": "heart_rate_above_demo_threshold",
            "message": "Demonstration threshold exceeded.",
            "rule_version": "demo-1",
        },
        "created_at": "2026-10-22T06:00:04Z",
    }
    with pytest.raises(ValidationError):
        Alert.model_validate({**base, "status": "acknowledged"})
    with pytest.raises(ValidationError):
        Alert.model_validate(
            {
                **base,
                "status": "resolved",
                "acknowledgement": {
                    "acknowledged_at": "2026-10-22T06:05:00Z",
                    "acknowledged_by": "user_123",
                },
            }
        )

    acknowledged = Alert.model_validate(
        {
            **base,
            "status": "acknowledged",
            "acknowledgement": {
                "acknowledged_at": "2026-10-22T06:05:00Z",
                "acknowledged_by": "user_123",
            },
        }
    )
    assert acknowledged.status.value == "acknowledged"


def test_json_alert_schema_accepts_resolved_alert() -> None:
    alert = {
        "schema_version": "1.0",
        "alert_id": str(uuid4()),
        "patient_id": "PC-DEMO01",
        "related_event_id": VALID_EVENT["event_id"],
        "category": "abnormal_measurement",
        "severity": "medium",
        "reason": {
            "code": "heart_rate_above_demo_threshold",
            "message": "Demonstration threshold exceeded.",
            "rule_version": "demo-1",
        },
        "created_at": "2026-10-22T06:00:04Z",
        "status": "resolved",
        "acknowledgement": {
            "acknowledged_at": "2026-10-22T06:05:00Z",
            "acknowledged_by": "user_123",
        },
        "resolution": {
            "resolved_at": "2026-10-22T06:20:00Z",
            "resolved_by": "user_123",
            "resolution_code": "follow_up_complete",
        },
    }
    Draft202012Validator(
        ALERT_SCHEMA, format_checker=STRICT_FORMAT_CHECKER
    ).validate(alert)
    Alert.model_validate(alert)


def test_alert_optional_fields_reject_explicit_null() -> None:
    alert = {
        "schema_version": "1.0",
        "alert_id": str(uuid4()),
        "patient_id": "PC-DEMO01",
        "category": "missing_measurement",
        "severity": "medium",
        "reason": {
            "code": "oxygen_saturation_missing_measurement",
            "message": "No measurement.",
            "rule_version": "demo-1",
        },
        "created_at": "2026-10-22T06:00:04Z",
        "status": "open",
        "related_event_id": None,
    }
    errors = list(
        Draft202012Validator(
            ALERT_SCHEMA, format_checker=STRICT_FORMAT_CHECKER
        ).iter_errors(alert)
    )
    assert errors
    with pytest.raises(ValidationError):
        Alert.model_validate(alert)


def test_event_id_is_stable_and_duplicate_submission_is_idempotent() -> None:
    event = MeasurementEvent.model_validate(VALID_EVENT)
    store = InMemoryEventStore()

    first = store.submit(event)
    second = store.submit(event)

    assert first.status == "accepted"
    assert second.status == "duplicate"
    assert second.event.event_id == event.event_id
    assert second.received_at == first.received_at
    assert [alert.alert_id for alert in second.alerts] == [
        alert.alert_id for alert in first.alerts
    ]


def test_same_event_id_with_changed_payload_is_rejected() -> None:
    event = MeasurementEvent.model_validate(VALID_EVENT)
    changed = event.model_copy(update={"value": 79})
    store = InMemoryEventStore()
    store.submit(event)

    with pytest.raises(EventIdConflict, match="event_id_conflict"):
        store.submit(changed)


def test_received_at_is_server_assigned_and_measurement_time_is_preserved() -> None:
    event = MeasurementEvent.model_validate(
        {
            **VALID_EVENT,
            "measured_at": "2020-01-01T00:00:00Z",
            "received_at": "2020-01-01T00:01:00Z",
        }
    )
    submission = InMemoryEventStore().submit(event)

    assert submission.event.measured_at == event.measured_at
    assert submission.received_at != event.received_at
    assert submission.event.received_at == submission.received_at


def test_abnormal_demo_measurement_creates_simulated_alert() -> None:
    payload = deepcopy(VALID_EVENT)
    payload["value"] = 135
    event = MeasurementEvent.model_validate(payload)
    submission = InMemoryEventStore().submit(event)

    assert len(submission.alerts) == 1
    alert = submission.alerts[0]
    assert alert.category.value == "abnormal_measurement"
    assert alert.related_event_id == event.event_id
    assert alert.reason.rule_version == "demo-1"


def test_normal_measurement_creates_no_alert() -> None:
    submission = InMemoryEventStore().submit(MeasurementEvent.model_validate(VALID_EVENT))

    assert submission.alerts == ()


def test_distinct_abnormal_events_share_one_active_demo_alert() -> None:
    first = MeasurementEvent.model_validate({**VALID_EVENT, "value": 135})
    second = MeasurementEvent.model_validate(
        {**VALID_EVENT, "event_id": str(uuid4()), "value": 140}
    )
    store = InMemoryEventStore()

    first_submission = store.submit(first)
    second_submission = store.submit(second)

    assert len(first_submission.alerts) == 1
    assert second_submission.alerts[0].alert_id == first_submission.alerts[0].alert_id


def test_health_and_measurement_endpoints(auth_headers) -> None:
    client = TestClient(app)
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    response = client.post("/api/v1/measurements", json=VALID_EVENT, headers=auth_headers)
    assert response.status_code in {200, 202}
    assert response.json()["event_id"] == VALID_EVENT["event_id"]


def test_demo_dashboard_endpoint_returns_synthetic_snapshot(auth_headers) -> None:
    client = TestClient(app)
    response = client.get("/api/v1/demo/rpm-dashboard", headers=auth_headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["is_simulated"] is True
    assert payload["summary"]["synthetic_patient_count"] == 1
    assert payload["summary"]["measurement_event_count"] >= 10
    assert payload["alerts"]
    assert payload["conditions"]
    assert all(patient["is_simulated"] for patient in payload["patients"])


def test_invalid_api_payload_returns_contract_error(auth_headers) -> None:
    client = TestClient(app)
    payload = deepcopy(VALID_EVENT)
    payload["unit"] = "percent"
    response = client.post("/api/v1/measurements", json=payload, headers=auth_headers)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
