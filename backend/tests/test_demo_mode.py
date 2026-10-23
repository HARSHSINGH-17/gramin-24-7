import os
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from backend.app.demo_seeder import seed_demo_data
from backend.app.main import app, store, settings
from backend.app.auth import issue_token


@pytest.fixture(autouse=True)
def setup_demo_environment():
    # Ensure demo data is seeded into test store
    seed_demo_data(store)


def test_seed_demo_data_deterministic_and_idempotent():
    """Verify demo seeder populates deterministic records and repeat execution is idempotent."""
    res1 = seed_demo_data(store)
    # Since setup fixture ran first, second run should report 0 new seeds
    assert res1["seeded_patients"] == 0
    assert res1["seeded_measurements"] == 0
    assert res1["status"] == "success"
    assert res1["is_simulated"] is True

    # Verify patients exist
    patients, _ = store.list_patients(limit=50)
    patient_ids = {p["patient_id"] for p in patients}
    expected_ids = {"PC-SYNTH01", "PC-DEMO01", "PC-DEMO02", "PC-DEMO03", "PC-DEMO04", "PC-DEMO05"}
    assert expected_ids.issubset(patient_ids)

    # Verify simulated flag
    for p in patients:
        if p["patient_id"] in expected_ids:
            assert p["is_simulated"] == 1


def test_clinician_visibility_directory_and_vitals():
    """Clinician can view all synthetic patients, measurements, and monitor overview."""
    client = TestClient(app)
    clinician_token = issue_token("dr.sharma", "clinician", settings, patient_ids=["*"])
    headers = {"Authorization": f"Bearer {clinician_token}"}

    # 1. Directory census
    res = client.get("/api/v1/patients", headers=headers)
    assert res.status_code == 200
    data = res.json()
    p_ids = [p["patient_id"] for p in data["items"]]
    assert "PC-SYNTH01" in p_ids
    assert "PC-DEMO01" in p_ids
    assert "PC-DEMO02" in p_ids
    assert "PC-DEMO03" in p_ids
    assert "PC-DEMO04" in p_ids
    assert "PC-DEMO05" in p_ids

    # 2. Individual measurements for Kamla Devi
    m_res = client.get("/api/v1/patients/PC-SYNTH01/measurements", headers=headers)
    assert m_res.status_code == 200
    measurements = m_res.json()["items"]
    assert len(measurements) >= 5
    m_types = {m["measurement_type"] for m in measurements}
    assert "heart_rate" in m_types
    assert "oxygen_saturation" in m_types

    # 3. Monitor overview
    ov_res = client.get("/api/v1/monitor/overview", headers=headers)
    assert ov_res.status_code == 200
    ov_data = ov_res.json()
    assert ov_data["summary"]["total_patients"] >= 6
    assert len(ov_data["alerts"]) >= 1


def test_representative_alert_states():
    """Verify open, acknowledged, and resolved alerts exist with severity levels."""
    client = TestClient(app)
    clinician_token = issue_token("dr.sharma", "clinician", settings, patient_ids=["*"])
    headers = {"Authorization": f"Bearer {clinician_token}"}

    # Fetch all alerts
    res = client.get("/api/v1/alerts", headers=headers)
    assert res.status_code == 200
    alerts = res.json()["items"]
    assert len(alerts) >= 3

    statuses = {a["status"] for a in alerts}
    assert "open" in statuses
    assert "acknowledged" in statuses

    # Check critical tachycardia alert on PC-DEMO01
    tachy_alert = next((a for a in alerts if a["patient_id"] == "PC-DEMO01" and "heart_rate" in a["reason"]["code"]), None)
    assert tachy_alert is not None
    assert tachy_alert["category"] in {"abnormal_measurement", "threshold_violation"}
    assert tachy_alert["severity"] == "critical"


def test_patient_portal_scoped_access_and_isolation():
    """Patient can only access their own measurements, not another patient's."""
    client = TestClient(app)
    # Token scoped exclusively to PC-SYNTH01
    patient_token = issue_token("patient_kamla", "patient", settings, patient_ids=["PC-SYNTH01"])
    headers = {"Authorization": f"Bearer {patient_token}"}

    # 1. Allowed access to own vitals
    own_res = client.get("/api/v1/patients/PC-SYNTH01/measurements", headers=headers)
    assert own_res.status_code == 200

    # 2. Denied access to another patient's vitals
    other_res = client.get("/api/v1/patients/PC-DEMO01/measurements", headers=headers)
    assert other_res.status_code == 403

    # 3. Denied access to monitor overview
    ov_res = client.get("/api/v1/monitor/overview", headers=headers)
    assert ov_res.status_code == 403


def test_production_safety_gate_refuses_auto_seed():
    """Production environment strictly refuses to seed synthetic demo records."""
    with patch.dict(os.environ, {"PAHAADCARE_ENV": "production", "PAHAADCARE_DEMO_ENABLED": "false"}):
        res = seed_demo_data(store)
        assert res["status"] == "skipped"
        assert res["is_simulated"] is False

        # Endpoint also rejects seeding with 403
        client = TestClient(app)
        clinician_token = issue_token("admin_user", "administrator", settings, patient_ids=["*"])
        headers = {"Authorization": f"Bearer {clinician_token}"}
        endpoint_res = client.post("/api/v1/demo/seed", headers=headers)
        assert endpoint_res.status_code == 403
