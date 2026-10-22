"""
Milestone 3 Backend Batch Sync and Idempotency Tests
Tests:
- POST /api/v1/sync/events partial-success semantics
- Confirmed delivery (accepted and duplicate statuses)
- Conflict detection on event_id reuse with altered payload
- Patient access control (rejected: patient_access_denied)
- Batch size bounding (1 to 100 events)
"""

from copy import deepcopy
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app.auth import issue_token
from backend.app.main import app, get_settings


def _make_sync_event(
    patient_id: str = "PC-SYNTH01",
    measurement_type: str = "heart_rate",
    value: float = 72.0,
    unit: str = "beats_per_minute",
    minutes_ago: int = 0,
    event_id: str | None = None,
) -> dict:
    t = (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat().replace("+00:00", "Z")
    return {
        "schema_version": "1.0",
        "event_id": event_id or str(uuid4()),
        "patient_id": patient_id,
        "measurement_type": measurement_type,
        "value": value,
        "unit": unit,
        "measured_at": t,
        "source": "patient",
        "is_simulated": True,
    }


def test_sync_events_accepted_and_duplicate(auth_headers) -> None:
    """Verifies new events are accepted, and repeating the same event returns duplicate."""
    client = TestClient(app)
    e1 = _make_sync_event("PC-SYNTH01", "heart_rate", 76.0, minutes_ago=5)
    e2 = _make_sync_event("PC-SYNTH01", "oxygen_saturation", 97.0, unit="percent", minutes_ago=4)

    # Initial batch submit
    res1 = client.post("/api/v1/sync/events", headers=auth_headers, json={"events": [e1, e2]})
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["summary"]["total"] == 2
    assert data1["summary"]["accepted"] == 2
    assert data1["summary"]["duplicate"] == 0

    # Repeat exact same batch: must return duplicate for both
    res2 = client.post("/api/v1/sync/events", headers=auth_headers, json={"events": [e1, e2]})
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["summary"]["total"] == 2
    assert data2["summary"]["accepted"] == 0
    assert data2["summary"]["duplicate"] == 2


def test_sync_events_conflict_on_altered_payload(auth_headers) -> None:
    """Verifies reusing an existing event_id with diverging payload returns conflict."""
    client = TestClient(app)
    stable_id = str(uuid4())
    original_event = _make_sync_event("PC-SYNTH01", "heart_rate", 72.0, event_id=stable_id)

    # First submission accepted
    res1 = client.post("/api/v1/sync/events", headers=auth_headers, json={"events": [original_event]})
    assert res1.status_code == 200
    assert res1.json()["summary"]["accepted"] == 1

    # Second submission with same event_id but altered vital value
    altered_event = deepcopy(original_event)
    altered_event["value"] = 110.0

    res2 = client.post("/api/v1/sync/events", headers=auth_headers, json={"events": [altered_event]})
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["summary"]["conflict"] == 1
    conflict_item = data2["items"][0]
    assert conflict_item["event_id"] == stable_id
    assert conflict_item["status"] == "conflict"
    assert conflict_item["error"] == "event_id_conflict"


def test_sync_events_partial_batch_with_scope_rejection() -> None:
    """Verifies partial batch success: valid patient event accepted while unauthorized patient event is rejected."""
    client = TestClient(app)
    # Clinician token scoped strictly to PC-DEMO01
    scoped_token = issue_token(
        "demo-clinician-only",
        "clinician",
        get_settings(),
        patient_ids=("PC-DEMO01",),
    )
    headers = {"Authorization": f"Bearer {scoped_token}"}

    valid_event = _make_sync_event("PC-DEMO01", "heart_rate", 70.0)
    unauthorized_event = _make_sync_event("PC-SYNTH01", "heart_rate", 75.0)

    res = client.post("/api/v1/sync/events", headers=headers, json={"events": [valid_event, unauthorized_event]})
    assert res.status_code == 200
    data = res.json()
    assert data["summary"]["total"] == 2
    assert data["summary"]["accepted"] == 1
    assert data["summary"]["rejected"] == 1

    item_map = {item["event_id"]: item for item in data["items"]}
    assert item_map[valid_event["event_id"]]["status"] == "accepted"
    assert item_map[unauthorized_event["event_id"]]["status"] == "rejected"
    assert item_map[unauthorized_event["event_id"]]["error"] == "patient_access_denied"


def test_sync_events_bounded_batch_limits(auth_headers) -> None:
    """Verifies batch endpoint enforces 1 <= events <= 100."""
    client = TestClient(app)

    # Empty batch rejected with 422
    res_empty = client.post("/api/v1/sync/events", headers=auth_headers, json={"events": []})
    assert res_empty.status_code == 422

    # Batch exceeding 100 rejected with 422
    too_many = [_make_sync_event("PC-SYNTH01", "heart_rate", 70.0 + i) for i in range(101)]
    res_too_many = client.post("/api/v1/sync/events", headers=auth_headers, json={"events": too_many})
    assert res_too_many.status_code == 422
