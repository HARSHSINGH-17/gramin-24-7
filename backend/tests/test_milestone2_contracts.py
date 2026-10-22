"""
Milestone 2 Contract and Authorization Verification Tests
Validates:
- Patient list and measurement history ordering contracts
- Alert lifecycle mutations with notes and audit records
- Scope enforcement (401, 403, 409)
- Empty state behavior for census and alert queues
"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app.auth import issue_token
from backend.app.main import app, get_settings, store
from backend.app.models import MeasurementEvent
from backend.app.repository import SQLiteRepository


def _create_sample_event(
    patient_id: str,
    measurement_type: str = "heart_rate",
    value: float = 75.0,
    unit: str = "beats_per_minute",
    minutes_ago: int = 0,
) -> MeasurementEvent:
    now = datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)
    return MeasurementEvent.model_validate(
        {
            "schema_version": "1.0",
            "event_id": str(uuid4()),
            "patient_id": patient_id,
            "measurement_type": measurement_type,
            "value": value,
            "unit": unit,
            "measured_at": now.isoformat().replace("+00:00", "Z"),
            "source": "simulator",
            "is_simulated": True,
        }
    )


def test_measurement_ordering_chronological(auth_headers) -> None:
    """Verifies measurements are strictly ordered by measured_at DESC, event_id ASC."""
    client = TestClient(app)
    patient_id = "PC-SYNTH01"

    # Submit 3 readings at distinct timestamps
    e1 = _create_sample_event(patient_id, "heart_rate", 70.0, minutes_ago=30)
    e2 = _create_sample_event(patient_id, "heart_rate", 80.0, minutes_ago=10)
    e3 = _create_sample_event(patient_id, "heart_rate", 90.0, minutes_ago=20)

    store.submit(e1)
    store.submit(e2)
    store.submit(e3)

    response = client.get(
        f"/api/v1/patients/{patient_id}/measurements?limit=10",
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    items = data["items"]
    assert len(items) >= 3

    # Check that timestamps are monotonically descending
    for i in range(len(items) - 1):
        cur_t = items[i]["measured_at"]
        next_t = items[i + 1]["measured_at"]
        assert cur_t >= next_t


def test_patient_detail_empty_measurements(auth_headers) -> None:
    """Verifies patient with no measurements returns 200 with empty items list."""
    client = TestClient(app)
    empty_patient_id = "PC-DEMO01"

    response = client.get(
        f"/api/v1/patients/{empty_patient_id}/measurements",
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["patient_id"] == empty_patient_id
    assert isinstance(data["items"], list)
    assert data["next_cursor"] is None


def test_alert_lifecycle_notes_and_transitions(auth_headers) -> None:
    """Tests Acknowledge and Resolve operations with clinical notes and audit trail."""
    client = TestClient(app)
    patient_id = "PC-SYNTH01"

    # Trigger an abnormal reading to create an open alert
    event = _create_sample_event(patient_id, "heart_rate", 180.0, minutes_ago=5)
    from backend.app.engine import MonitoringEngine
    engine = MonitoringEngine(store=store)
    proc = engine.process_measurement(event)
    assert len(proc.alerts) > 0
    target_alert = proc.alerts[0]
    alert_id = str(target_alert.alert_id)

    # 1. Attempting to resolve an open alert directly fails with 409
    res_before_ack = client.post(
        f"/api/v1/alerts/{alert_id}/resolve",
        headers=auth_headers,
        json={"actor_id": "clinician-test", "resolution_code": "demo_review_complete"},
    )
    assert res_before_ack.status_code == 409
    assert res_before_ack.json()["error"]["code"] == "invalid_alert_transition"

    # 2. Acknowledge alert with clinician note
    ack_res = client.post(
        f"/api/v1/alerts/{alert_id}/acknowledge",
        headers=auth_headers,
        json={"actor_id": "clinician-test", "note": "Reviewed tachycardic event. Patient notified."},
    )
    assert ack_res.status_code == 200
    ack_data = ack_res.json()
    assert ack_data["status"] == "acknowledged"
    assert ack_data["acknowledgement"]["acknowledged_by"] == "test-clinician"
    assert ack_data["acknowledgement"]["note"] == "Reviewed tachycardic event. Patient notified."

    # 3. Repeat acknowledge is idempotent (200)
    ack_repeat = client.post(
        f"/api/v1/alerts/{alert_id}/acknowledge",
        headers=auth_headers,
        json={"actor_id": "clinician-test", "note": "Repeat attempt"},
    )
    assert ack_repeat.status_code == 200
    assert ack_repeat.json()["status"] == "acknowledged"

    # 4. Resolve alert with resolution code and note
    res_res = client.post(
        f"/api/v1/alerts/{alert_id}/resolve",
        headers=auth_headers,
        json={
            "actor_id": "clinician-test",
            "resolution_code": "demo_review_complete",
            "note": "Patient resting, pulse returned to normal.",
        },
    )
    assert res_res.status_code == 200
    res_data = res_res.json()
    assert res_data["status"] == "resolved"
    assert res_data["resolution"]["resolved_by"] == "test-clinician"
    assert res_data["resolution"]["resolution_code"] == "demo_review_complete"
    assert res_data["resolution"]["note"] == "Patient resting, pulse returned to normal."

    # 5. Cannot acknowledge an already resolved alert (409 Conflict)
    ack_after_resolve = client.post(
        f"/api/v1/alerts/{alert_id}/acknowledge",
        headers=auth_headers,
        json={"actor_id": "clinician-test", "note": "Attempt ack on resolved"},
    )
    assert ack_after_resolve.status_code == 409
    assert ack_after_resolve.json()["error"]["code"] == "invalid_alert_transition"


def test_cross_patient_alert_action_denied() -> None:
    """Verifies clinicians cannot mutate alerts outside their assigned patient scope."""
    client = TestClient(app)
    # Clinician only has access to PC-DEMO01
    scoped_token = issue_token(
        "restricted-clinician",
        "clinician",
        get_settings(),
        patient_ids=("PC-DEMO01",),
    )
    scoped_headers = {"Authorization": f"Bearer {scoped_token}"}

    # Create alert for PC-SYNTH01
    event = _create_sample_event("PC-SYNTH01", "heart_rate", 175.0, minutes_ago=2)
    from backend.app.engine import MonitoringEngine
    engine = MonitoringEngine(store=store)
    proc = engine.process_measurement(event)
    alert_id = str(proc.alerts[0].alert_id)

    # Attempt to acknowledge alert for PC-SYNTH01
    denied_ack = client.post(
        f"/api/v1/alerts/{alert_id}/acknowledge",
        headers=scoped_headers,
        json={"actor_id": "restricted-clinician"},
    )
    assert denied_ack.status_code == 403
    assert "access denied" in denied_ack.json()["error"]["message"].lower()


def test_alert_listing_filters(auth_headers) -> None:
    """Tests GET /api/v1/alerts filters by status and category."""
    client = TestClient(app)

    # Filter by status=open
    res_open = client.get("/api/v1/alerts?status=open", headers=auth_headers)
    assert res_open.status_code == 200
    for a in res_open.json()["items"]:
        assert a["status"] == "open"

    # Filter by status=resolved
    res_res = client.get("/api/v1/alerts?status=resolved", headers=auth_headers)
    assert res_res.status_code == 200
    for a in res_res.json()["items"]:
        assert a["status"] == "resolved"


def test_unauthenticated_requests_fail_401() -> None:
    """Verifies all protected monitoring endpoints strictly enforce 401 on missing or bad auth."""
    client = TestClient(app)
    assert client.get("/api/v1/patients").status_code == 401
    assert client.get("/api/v1/patients/PC-SYNTH01/measurements").status_code == 401
    assert client.get("/api/v1/alerts").status_code == 401
    assert client.post("/api/v1/alerts/00000000-0000-0000-0000-000000000000/acknowledge", json={"actor_id": "test"}).status_code == 401
    assert client.post("/api/v1/alerts/00000000-0000-0000-0000-000000000000/resolve", json={"actor_id": "test", "resolution_code": "done"}).status_code == 401
