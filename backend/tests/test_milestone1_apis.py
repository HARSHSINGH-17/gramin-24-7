from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app.auth import issue_token
from backend.app.main import app, get_settings
from backend.app.models import MeasurementEvent
from backend.app.repository import SQLiteRepository
from backend.synthetic_vitals import generate_scenario


def _make_event(
    patient_id: str = "PC-SYNTH01",
    measurement_type: str = "heart_rate",
    value: float = 72.0,
    unit: str = "beats_per_minute",
    offset_minutes: int = 0,
    event_id: str | None = None,
) -> dict:
    t = (datetime(2026, 10, 22, 6, 0, 0, tzinfo=timezone.utc) + timedelta(minutes=offset_minutes)).isoformat().replace("+00:00", "Z")
    return {
        "schema_version": "1.0",
        "event_id": event_id or str(uuid4()),
        "patient_id": patient_id,
        "measurement_type": measurement_type,
        "value": value,
        "unit": unit,
        "measured_at": t,
        "source": "simulator",
        "is_simulated": True,
    }


def test_patients_listing_authorized_and_scoped(auth_headers) -> None:
    client = TestClient(app)
    response = client.get("/api/v1/patients", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "request_id" in data
    patient_ids = [p["patient_id"] for p in data["items"]]
    assert "PC-SYNTH01" in patient_ids or "PC-DEMO01" in patient_ids


def test_patients_listing_admin_access() -> None:
    client = TestClient(app)
    admin_token = issue_token("admin-user", "administrator", get_settings(), patient_ids=("*",))
    response = client.get("/api/v1/patients", headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 200
    data = response.json()
    patient_ids = [p["patient_id"] for p in data["items"]]
    assert "PC-SYNTH01" in patient_ids
    assert "PC-DEMO01" in patient_ids


def test_patients_pagination(auth_headers) -> None:
    client = TestClient(app)
    page1 = client.get("/api/v1/patients?limit=1", headers=auth_headers)
    assert page1.status_code == 200
    p1_data = page1.json()
    assert len(p1_data["items"]) <= 1


def test_measurement_history_and_ordering(auth_headers) -> None:
    client = TestClient(app)
    # Submit two measurements with distinct timestamps
    e1 = _make_event(patient_id="PC-SYNTH01", value=70.0, offset_minutes=1)
    e2 = _make_event(patient_id="PC-SYNTH01", value=75.0, offset_minutes=5)
    r1 = client.post("/api/v1/measurements", json=e1, headers=auth_headers)
    r2 = client.post("/api/v1/measurements", json=e2, headers=auth_headers)
    assert r1.status_code in {200, 202}
    assert r2.status_code in {200, 202}

    # Query history
    res = client.get("/api/v1/patients/PC-SYNTH01/measurements", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["patient_id"] == "PC-SYNTH01"
    items = body["items"]
    assert len(items) >= 2
    # Verify deterministic ordering: measured_at descending
    for i in range(len(items) - 1):
        assert items[i]["measured_at"] >= items[i + 1]["measured_at"]
    # Verify separate received_at
    assert items[0]["received_at"] is not None


def test_measurement_history_cross_patient_denied(auth_headers) -> None:
    client = TestClient(app)
    res = client.get("/api/v1/patients/PC-UNAUTHORIZED/measurements", headers=auth_headers)
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "forbidden"


def test_measurement_history_invalid_cursor(auth_headers) -> None:
    client = TestClient(app)
    res = client.get("/api/v1/patients/PC-SYNTH01/measurements?cursor=not-a-valid-cursor!!!", headers=auth_headers)
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "invalid_cursor"


def test_alerts_listing_and_filtering(auth_headers) -> None:
    client = TestClient(app)
    # Submit an abnormal measurement to trigger an alert
    abnormal = _make_event(patient_id="PC-SYNTH01", value=145.0, offset_minutes=10)
    sub = client.post("/api/v1/measurements", json=abnormal, headers=auth_headers)
    assert sub.status_code in {200, 202}

    res = client.get("/api/v1/alerts", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert "items" in body
    assert len(body["items"]) >= 1

    # Filter by status
    filtered = client.get("/api/v1/alerts?status=open", headers=auth_headers)
    assert filtered.status_code == 200
    for alert in filtered.json()["items"]:
        assert alert["status"] == "open"


def test_alerts_listing_cross_patient_denied(auth_headers) -> None:
    client = TestClient(app)
    res = client.get("/api/v1/alerts?patient_id=PC-UNAUTHORIZED", headers=auth_headers)
    assert res.status_code == 403


def test_batch_sync_success_and_deduplication(auth_headers) -> None:
    client = TestClient(app)
    ev1 = _make_event(patient_id="PC-SYNTH01", value=71.0, offset_minutes=11)
    ev2 = _make_event(patient_id="PC-SYNTH01", value=72.0, offset_minutes=12)

    batch_payload = {"events": [ev1, ev2]}
    res = client.post("/api/v1/sync/events", json=batch_payload, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["summary"]["total"] == 2
    assert data["summary"]["accepted"] == 2
    assert data["summary"]["duplicate"] == 0
    assert len(data["items"]) == 2
    assert data["items"][0]["status"] == "accepted"
    assert data["items"][1]["status"] == "accepted"

    # Repeat exact same batch: must be idempotent duplicate
    res_repeat = client.post("/api/v1/sync/events", json=batch_payload, headers=auth_headers)
    assert res_repeat.status_code == 200
    repeat_data = res_repeat.json()
    assert repeat_data["summary"]["total"] == 2
    assert repeat_data["summary"]["accepted"] == 0
    assert repeat_data["summary"]["duplicate"] == 2
    assert repeat_data["items"][0]["status"] == "duplicate"


def test_batch_sync_partial_success_and_conflict(auth_headers) -> None:
    client = TestClient(app)
    # Event A: valid authorized
    ev_a = _make_event(patient_id="PC-SYNTH01", value=68.0, offset_minutes=15)
    # Event B: cross-patient unauthorized
    ev_b = _make_event(patient_id="PC-UNAUTHORIZED", value=69.0, offset_minutes=16)
    # Event C: conflict (reuse ev_a's event_id with different value)
    ev_c_conflict = deepcopy(ev_a)
    ev_c_conflict["value"] = 120.0  # altered value

    # First submit ev_a
    client.post("/api/v1/sync/events", json={"events": [ev_a]}, headers=auth_headers)

    # Now send batch with ev_c_conflict and ev_b and a new valid ev_d
    ev_d = _make_event(patient_id="PC-SYNTH01", value=74.0, offset_minutes=17)
    res = client.post("/api/v1/sync/events", json={"events": [ev_d, ev_b, ev_c_conflict]}, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["summary"]["total"] == 3
    assert data["summary"]["accepted"] == 1  # ev_d accepted
    assert data["summary"]["rejected"] == 1  # ev_b rejected (patient_access_denied)
    assert data["summary"]["conflict"] == 1  # ev_c_conflict (event_id_conflict)

    results_by_id = {item["event_id"]: item for item in data["items"]}
    assert results_by_id[ev_d["event_id"]]["status"] == "accepted"
    assert results_by_id[ev_b["event_id"]]["status"] == "rejected"
    assert results_by_id[ev_b["event_id"]]["error"] == "patient_access_denied"
    assert results_by_id[ev_c_conflict["event_id"]]["status"] == "conflict"
    assert results_by_id[ev_c_conflict["event_id"]]["error"] == "event_id_conflict"


def test_batch_sync_bounds_and_malformed(auth_headers) -> None:
    client = TestClient(app)
    # Empty batch is rejected by schema (min_length=1)
    res_empty = client.post("/api/v1/sync/events", json={"events": []}, headers=auth_headers)
    assert res_empty.status_code == 422

    # Malformed event payload inside batch is rejected
    bad_event = _make_event(patient_id="PC-SYNTH01")
    bad_event["value"] = "not-a-number"
    res_bad = client.post("/api/v1/sync/events", json={"events": [bad_event]}, headers=auth_headers)
    assert res_bad.status_code == 422
