from uuid import uuid4
import pytest
from fastapi.testclient import TestClient

from backend.app.auth import issue_token
from backend.app.main import app, settings
from backend.app.models import EventSource, MeasurementEvent, MeasurementType, MeasurementUnit
from backend.app.repository import SQLiteRepository


def make_measurement_event(patient_id: str = "PC-SYNTH01", event_id: str | None = None) -> dict:
    return {
        "schema_version": "1.0",
        "event_id": str(event_id or uuid4()),
        "patient_id": patient_id,
        "measurement_type": MeasurementType.HEART_RATE.value,
        "value": 72.0,
        "unit": MeasurementUnit.BEATS_PER_MINUTE.value,
        "measured_at": "2026-10-22T10:00:00Z",
        "source": EventSource.PATIENT.value,
        "is_simulated": True,
    }


def test_unauthenticated_requests_are_rejected() -> None:
    client = TestClient(app)
    protected_endpoints = [
        ("GET", "/api/v1/patients"),
        ("GET", "/api/v1/patients/PC-SYNTH01/measurements"),
        ("GET", "/api/v1/alerts"),
        ("POST", "/api/v1/measurements"),
        ("POST", "/api/v1/sync/events"),
        ("GET", "/api/v1/escalation/policies"),
        ("GET", f"/api/v1/alerts/{uuid4()}/escalations"),
        ("POST", f"/api/v1/alerts/{uuid4()}/acknowledge"),
        ("POST", f"/api/v1/alerts/{uuid4()}/resolve"),
        ("POST", "/api/v1/escalation/process"),
        ("GET", "/api/v1/escalation/worker/status"),
        ("GET", "/api/v1/demo/rpm-dashboard"),
        ("GET", "/api/v1/monitor/overview"),
        ("GET", "/api/v1/doctor/census"),
        ("GET", "/api/v1/patients/PC-SYNTH01"),
        ("GET", "/api/v1/demo/thresholds"),
    ]
    for method, path in protected_endpoints:
        if method == "GET":
            response = client.get(path)
        else:
            response = client.post(path, json={})
        assert response.status_code == 401, f"{method} {path} expected 401, got {response.status_code}"
        body = response.json()
        assert "error" in body
        assert body["error"]["code"] == "unauthorized"


def test_patient_token_cannot_call_clinician_only_endpoints(monkeypatch, tmp_path) -> None:
    import backend.app.main as main_module

    test_store = SQLiteRepository(tmp_path / "patient_perms.sqlite3")
    monkeypatch.setattr(main_module, "store", test_store)
    client = TestClient(app)

    patient_token = issue_token("patient-alice", "patient", settings, patient_ids=("PC-SYNTH01",))
    headers = {"Authorization": f"Bearer {patient_token}"}
    fake_alert_id = uuid4()

    # 1. Clinician patient directory
    res_patients = client.get("/api/v1/patients", headers=headers)
    assert res_patients.status_code == 403
    assert res_patients.json()["error"]["code"] == "forbidden"

    # 2. Alert acknowledgment
    res_ack = client.post(
        f"/api/v1/alerts/{fake_alert_id}/acknowledge",
        json={"actor_id": "patient-alice", "note": "Unauthorized ack"},
        headers=headers,
    )
    assert res_ack.status_code == 403
    assert res_ack.json()["error"]["code"] == "forbidden"

    # 3. Alert resolution
    res_res = client.post(
        f"/api/v1/alerts/{fake_alert_id}/resolve",
        json={"actor_id": "patient-alice", "resolution_code": "self_resolved"},
        headers=headers,
    )
    assert res_res.status_code == 403
    assert res_res.json()["error"]["code"] == "forbidden"

    # 4. Escalation policies
    res_esc_pol = client.get("/api/v1/escalation/policies", headers=headers)
    assert res_esc_pol.status_code == 403

    # 5. Alert escalation details
    res_esc_detail = client.get(f"/api/v1/alerts/{fake_alert_id}/escalations", headers=headers)
    assert res_esc_detail.status_code == 403

    # 6. Manual escalation process trigger
    res_esc_proc = client.post("/api/v1/escalation/process", json={}, headers=headers)
    assert res_esc_proc.status_code == 403

    # 7. Escalation worker status
    res_worker = client.get("/api/v1/escalation/worker/status", headers=headers)
    assert res_worker.status_code == 403

    # 8. Clinician demo dashboard
    res_demo = client.get("/api/v1/demo/rpm-dashboard", headers=headers)
    assert res_demo.status_code == 403

    # 9. Cross-patient alerts overview (omitting patient_id query param)
    res_cross_alerts = client.get("/api/v1/alerts", headers=headers)
    assert res_cross_alerts.status_code == 403

    # 10. Clinician monitor overview and census
    res_overview = client.get("/api/v1/monitor/overview", headers=headers)
    assert res_overview.status_code == 403
    res_census = client.get("/api/v1/doctor/census", headers=headers)
    assert res_census.status_code == 403

    # Verify audit logs recorded authorization failures
    audit = test_store.list_audit()
    actions_audited = {row["action"] for row in audit if row["success"] == 0}
    assert "patients_list" in actions_audited
    assert "alert_acknowledge" in actions_audited
    assert "alert_resolve" in actions_audited
    assert "escalation_policies_read" in actions_audited
    assert "escalation_process" in actions_audited
    assert "alerts_read" in actions_audited


def test_patient_can_access_own_data_but_not_cross_patient(monkeypatch, tmp_path) -> None:
    import backend.app.main as main_module

    test_store = SQLiteRepository(tmp_path / "patient_own_data.sqlite3")
    monkeypatch.setattr(main_module, "store", test_store)
    client = TestClient(app)

    # Seed data for PC-SYNTH01 and PC-OTHER
    clinician_token = issue_token("clinician-1", "clinician", settings, patient_ids=("PC-SYNTH01", "PC-OTHER"))
    c_headers = {"Authorization": f"Bearer {clinician_token}"}

    ev1 = make_measurement_event("PC-SYNTH01")
    ev2 = make_measurement_event("PC-OTHER")
    client.post("/api/v1/measurements", json=ev1, headers=c_headers)
    client.post("/api/v1/measurements", json=ev2, headers=c_headers)

    # Patient Alice is authorized ONLY for PC-SYNTH01
    patient_token = issue_token("patient-alice", "patient", settings, patient_ids=("PC-SYNTH01",))
    p_headers = {"Authorization": f"Bearer {patient_token}"}

    # Alice reads own measurements -> 200 OK
    res_own = client.get("/api/v1/patients/PC-SYNTH01/measurements", headers=p_headers)
    assert res_own.status_code == 200
    assert len(res_own.json()["items"]) >= 1

    # Alice reads own patient record -> 200 OK
    res_own_pat = client.get("/api/v1/patients/PC-SYNTH01", headers=p_headers)
    assert res_own_pat.status_code == 200
    assert res_own_pat.json()["patient_id"] == "PC-SYNTH01"

    # Alice reads own alerts -> 200 OK
    res_own_alerts = client.get("/api/v1/alerts?patient_id=PC-SYNTH01", headers=p_headers)
    assert res_own_alerts.status_code == 200

    # Alice submits own measurement -> 202 Accepted
    own_new_event = make_measurement_event("PC-SYNTH01")
    res_submit_own = client.post("/api/v1/measurements", json=own_new_event, headers=p_headers)
    assert res_submit_own.status_code == 202

    # Alice tries to read PC-OTHER measurements -> 403 Forbidden
    res_other_meas = client.get("/api/v1/patients/PC-OTHER/measurements", headers=p_headers)
    assert res_other_meas.status_code == 403
    assert res_other_meas.json()["error"]["code"] == "forbidden"

    # Alice tries to read PC-OTHER patient record -> 403 Forbidden
    res_other_pat = client.get("/api/v1/patients/PC-OTHER", headers=p_headers)
    assert res_other_pat.status_code == 403
    assert res_other_pat.json()["error"]["code"] == "forbidden"

    # Admin reads non-existent patient -> 404 Not Found (clinician with scoped patient_ids gets 403 on out-of-scope)
    admin_token = issue_token("admin-1", "administrator", settings, patient_ids=("*",))
    a_headers = {"Authorization": f"Bearer {admin_token}"}
    res_nonexistent = client.get("/api/v1/patients/PC-NONEXISTENT", headers=a_headers)
    assert res_nonexistent.status_code == 404

    # Alice tries to read PC-OTHER alerts -> 403 Forbidden
    res_other_alerts = client.get("/api/v1/alerts?patient_id=PC-OTHER", headers=p_headers)
    assert res_other_alerts.status_code == 403

    # Alice tries to submit measurement for PC-OTHER -> 403 Forbidden
    other_new_event = make_measurement_event("PC-OTHER")
    res_submit_other = client.post("/api/v1/measurements", json=other_new_event, headers=p_headers)
    assert res_submit_other.status_code == 403

    # Verify audit logged all denied attempts
    audit = test_store.list_audit()
    denied_audits = [row for row in audit if row["success"] == 0 and row["actor_id"] == "patient-alice"]
    assert len(denied_audits) >= 3


def test_error_envelopes_do_not_expose_stack_traces_or_internals() -> None:
    client = TestClient(app)
    # Trigger 404
    r_404 = client.get("/api/v1/unknown-endpoint")
    assert r_404.status_code == 404
    body_404 = r_404.json()
    assert "Traceback" not in str(body_404)
    assert "File \"" not in str(body_404)

    # Trigger 422 validation error
    clinician_token = issue_token("clinician-1", "clinician", settings)
    r_422 = client.post(
        "/api/v1/measurements",
        json={"invalid": "payload"},
        headers={"Authorization": f"Bearer {clinician_token}"},
    )
    assert r_422.status_code == 422
    body_422 = r_422.json()
    assert "error" in body_422
    assert "Traceback" not in str(body_422)
    assert "C:\\" not in str(body_422) and "/home/" not in str(body_422)
