"""
Milestone 4: End-to-End RPM 10-Scenario Validation and Evidence Tests
Verifies the complete RPM workflow against the FastAPI endpoints and SQLite store.
"""

import json
from datetime import timedelta
from uuid import UUID

from fastapi.testclient import TestClient
import pytest

from backend.app.auth import issue_token
from backend.app.engine import MonitoringEngine, ProcessingOutcome
from backend.app.main import app, get_settings, store
from backend.app.repository import SQLiteRepository
from backend.synthetic_vitals import (
    BASE_TIME,
    SYNTHETIC_PATIENT_ID,
    SyntheticScenario,
    generate_scenario,
)


def _to_payload(event) -> dict:
    return json.loads(event.model_dump_json(exclude_none=True))


def _get_db_measurement(repo: SQLiteRepository, event_id: UUID):
    with repo._connection() as conn:
        row = conn.execute("SELECT * FROM measurements WHERE event_id = ?", (str(event_id),)).fetchone()
        return repo._event_from_row(row) if row else None


def test_scenario_1_normal_reading(auth_headers) -> None:
    """Scenario 1: Normal reading accepted without triggering alerts."""
    client = TestClient(app)
    seq = generate_scenario(SyntheticScenario.NORMAL)
    ev = seq.measurements[0]
    res = client.post("/api/v1/measurements", headers=auth_headers, json=_to_payload(ev))
    assert res.status_code == 202
    data = res.json()
    assert data["status"] == "accepted"
    assert len(data["alert_ids"]) == 0

    saved = _get_db_measurement(store, ev.event_id)
    assert saved is not None
    assert saved.value == 78.0


def test_scenario_2_abnormal_reading_triggers_alerts(auth_headers) -> None:
    """Scenario 2: Abnormal readings trigger active clinical alerts."""
    client = TestClient(app)
    seq = generate_scenario(SyntheticScenario.ABNORMAL)
    res_low = client.post("/api/v1/measurements", headers=auth_headers, json=_to_payload(seq.measurements[0]))
    res_high = client.post("/api/v1/measurements", headers=auth_headers, json=_to_payload(seq.measurements[1]))

    assert res_low.status_code == 202
    assert len(res_low.json()["alert_ids"]) == 1
    assert res_high.status_code == 202
    assert len(res_high.json()["alert_ids"]) == 1

    alerts_res = client.get(f"/api/v1/alerts?patient_id={SYNTHETIC_PATIENT_ID}", headers=auth_headers)
    assert alerts_res.status_code == 200
    active_alerts = alerts_res.json()["items"]
    assert len(active_alerts) >= 2


def test_scenario_3_missing_data_event_quality_alert() -> None:
    """Scenario 3: Missing measurements create quality alerts."""
    from backend.app.store import InMemoryEventStore
    seq = generate_scenario(SyntheticScenario.MISSING)
    missing_event = seq.missing[0]
    clock_fn = lambda: BASE_TIME + timedelta(minutes=10)
    engine = MonitoringEngine(store=InMemoryEventStore(clock=clock_fn), clock=clock_fn)
    proc = engine.process_missing(missing_event)
    assert proc.outcome == ProcessingOutcome.MISSING
    assert len(proc.alerts) == 1
    assert proc.alerts[0].category.value == "missing_measurement"


def test_scenario_4_stale_measurement_quality_alert() -> None:
    """Scenario 4: Stale measurements generate stale_reading quality alerts."""
    from backend.app.store import InMemoryEventStore
    seq = generate_scenario(SyntheticScenario.STALE)
    stale_event = seq.measurements[0]
    clock_fn = lambda: BASE_TIME + timedelta(minutes=10)
    engine = MonitoringEngine(store=InMemoryEventStore(clock=clock_fn), clock=clock_fn)
    proc = engine.process_measurement(stale_event)
    assert proc.outcome == ProcessingOutcome.STALE
    assert proc.reason == "measurement_timestamp_outside_demo_freshness_window"
    assert len(proc.quality_alerts) == 1
    assert proc.quality_alerts[0].category.value == "stale_reading"


def test_scenario_5_duplicate_event_idempotency(auth_headers) -> None:
    """Scenario 5: Repeated submissions of the same event_id return duplicate."""
    client = TestClient(app)
    seq = generate_scenario(SyntheticScenario.DUPLICATE)
    res_first = client.post("/api/v1/measurements", headers=auth_headers, json=_to_payload(seq.measurements[0]))
    res_second = client.post("/api/v1/measurements", headers=auth_headers, json=_to_payload(seq.measurements[1]))

    assert res_first.status_code == 202
    assert res_first.json()["status"] == "accepted"
    assert res_second.status_code == 200
    assert res_second.json()["status"] == "duplicate"
    assert res_second.json()["received_at"] == res_first.json()["received_at"]


def test_scenario_6_conflicting_payload_rejection(auth_headers) -> None:
    """Scenario 6: Reusing an event_id with diverging payload returns 409 conflict."""
    client = TestClient(app)
    seq = generate_scenario(SyntheticScenario.CONFLICT)
    res_orig = client.post("/api/v1/measurements", headers=auth_headers, json=_to_payload(seq.measurements[0]))
    res_conflict = client.post("/api/v1/measurements", headers=auth_headers, json=_to_payload(seq.measurements[1]))

    assert res_orig.status_code == 202
    assert res_conflict.status_code == 409
    assert res_conflict.json()["error"]["code"] == "event_id_conflict"

    persisted = _get_db_measurement(store, seq.measurements[0].event_id)
    assert persisted is not None
    assert persisted.value == seq.measurements[0].value


def test_scenario_7_recovery_does_not_autoresolve_alert(auth_headers) -> None:
    """Scenario 7: Normal reading following abnormal reading does NOT auto-resolve alert."""
    client = TestClient(app)
    seq = generate_scenario(SyntheticScenario.RECOVERY)
    res_abnormal = client.post("/api/v1/measurements", headers=auth_headers, json=_to_payload(seq.measurements[0]))
    assert res_abnormal.status_code == 202
    alert_id = UUID(res_abnormal.json()["alert_ids"][0])

    # Subsequent recovery reading
    res_recovery = client.post("/api/v1/measurements", headers=auth_headers, json=_to_payload(seq.measurements[1]))
    assert res_recovery.status_code == 202
    assert len(res_recovery.json()["alert_ids"]) == 0

    # Ensure prior alert remains open
    alert = store.get_alert(alert_id)
    assert alert.status.value == "open"


def test_scenario_8_future_timestamp_with_server_received_at(auth_headers) -> None:
    """Scenario 8: Future-dated measurement accepted with trusted server timestamp."""
    client = TestClient(app)
    seq = generate_scenario(SyntheticScenario.FUTURE)
    ev = seq.measurements[0]
    res = client.post("/api/v1/measurements", headers=auth_headers, json=_to_payload(ev))
    assert res.status_code == 202
    saved = _get_db_measurement(store, ev.event_id)
    assert saved is not None
    assert saved.received_at is not None
    assert saved.received_at < ev.measured_at


def test_scenario_9_demo_scenario_simulated_boundaries(auth_headers) -> None:
    """Scenario 9: Demo sequence verifies simulated flags and demonstration thresholds."""
    client = TestClient(app)
    seq = generate_scenario(SyntheticScenario.DEMO)
    for m in seq.measurements:
        res = client.post("/api/v1/measurements", headers=auth_headers, json=_to_payload(m))
        assert res.status_code in (200, 202)
        saved = _get_db_measurement(store, m.event_id)
        assert saved.is_simulated is True
        assert saved.source.value == "simulator"


def test_scenario_10_offline_sync_and_retry_idempotency(auth_headers) -> None:
    """Scenario 10: Batch sync accepts offline event, retry returns duplicate."""
    client = TestClient(app)
    seq = generate_scenario(SyntheticScenario.OFFLINE_SYNC)
    ev = seq.measurements[0]
    payload = _to_payload(ev)

    # 1. Initial batch sync
    res_sync = client.post("/api/v1/sync/events", headers=auth_headers, json={"events": [payload]})
    assert res_sync.status_code == 200
    assert res_sync.json()["summary"]["accepted"] == 1

    # 2. Duplicate retry
    res_dup = client.post("/api/v1/sync/events", headers=auth_headers, json={"events": [payload]})
    assert res_dup.status_code == 200
    assert res_dup.json()["summary"]["duplicate"] == 1

    # 3. Present in server measurement history
    history = client.get(f"/api/v1/patients/{SYNTHETIC_PATIENT_ID}/measurements", headers=auth_headers).json()
    item = next((i for i in history["items"] if i["event_id"] == str(ev.event_id)), None)
    assert item is not None
    assert item["value"] == 82.5


def test_alert_lifecycle_and_invalid_transition_rejection(auth_headers) -> None:
    """Validates open -> acknowledged -> resolved transitions and rejects open -> resolved."""
    client = TestClient(app)
    alerts = store.list_alerts(active_only=True)
    assert len(alerts) > 0
    target_alert = alerts[0]
    target_id = target_alert.alert_id

    # 1. Invalid transition: direct open -> resolved rejected with 409
    res_inv = client.post(
        f"/api/v1/alerts/{target_id}/resolve",
        headers=auth_headers,
        json={"actor_id": "test-clinician", "resolution_code": "premature"},
    )
    assert res_inv.status_code == 409

    # 2. Valid transition: open -> acknowledged
    res_ack = client.post(
        f"/api/v1/alerts/{target_id}/acknowledge",
        headers=auth_headers,
        json={"actor_id": "test-clinician", "note": "Acknowledged alert"},
    )
    assert res_ack.status_code == 200
    assert res_ack.json()["status"] == "acknowledged"

    # 3. Idempotent repeat: acknowledge already acknowledged alert
    res_ack_dup = client.post(
        f"/api/v1/alerts/{target_id}/acknowledge",
        headers=auth_headers,
        json={"actor_id": "test-clinician"},
    )
    assert res_ack_dup.status_code == 200
    assert res_ack_dup.json()["status"] == "acknowledged"

    # 4. Valid transition: acknowledged -> resolved
    res_res = client.post(
        f"/api/v1/alerts/{target_id}/resolve",
        headers=auth_headers,
        json={"actor_id": "test-clinician", "resolution_code": "resolved_normal", "note": "Resolved"},
    )
    assert res_res.status_code == 200
    assert res_res.json()["status"] == "resolved"


def test_audit_trail_cryptographic_verification() -> None:
    """Verifies audit trail hash-chain validity."""
    audit_status = store.verify_audit_chain()
    assert audit_status["valid"] is True
    assert audit_status["checked_records"] >= 2


def test_patient_scope_authorization_enforcement() -> None:
    """Verifies unauthorized patient IDs are blocked with 403 Forbidden."""
    client = TestClient(app)
    scoped_token = issue_token(
        "strictly-demo01",
        "clinician",
        get_settings(),
        patient_ids=("PC-DEMO01",),
    )
    headers = {"Authorization": f"Bearer {scoped_token}"}

    # Attempt to access PC-SYNTH01
    res = client.get("/api/v1/patients/PC-SYNTH01/measurements", headers=headers)
    assert res.status_code == 403
