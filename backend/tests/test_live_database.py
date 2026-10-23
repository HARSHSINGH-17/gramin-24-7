import pytest
from starlette.testclient import TestClient

from backend.app.main import app, store


@pytest.fixture
def client():
    return TestClient(app)


def test_user_registration_and_login_lifecycle(client):
    # 1. Register a new clinician
    reg_payload = {
        "username": "dr_live_user_01",
        "email": "dr_live_01@pahaadcare.example",
        "password": "SecurePassword2026!",
        "role": "clinician",
        "full_name": "Dr. Aarav Sharma",
        "phone": "+91-9876543210",
        "invitation_code": "test-provisioning-secret-123456",
    }
    res = client.post("/api/v1/auth/register", json=reg_payload)
    assert res.status_code == 201, res.text
    data = res.json()
    assert "access_token" in data
    assert data["role"] == "clinician"
    assert data["username"] == "dr_live_user_01"

    # 2. Duplicate registration should be rejected with 409
    res_dup = client.post("/api/v1/auth/register", json=reg_payload)
    assert res_dup.status_code == 409
    assert res_dup.json()["error"]["code"] == "user_conflict"

    # 3. Log in with the registered clinician
    login_res = client.post(
        "/api/v1/auth/token",
        json={"username": "dr_live_user_01", "password": "SecurePassword2026!"},
    )
    assert login_res.status_code == 200
    token_data = login_res.json()
    assert token_data["role"] == "clinician"
    token = token_data["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 4. Check profile via /auth/me
    me_res = client.get("/api/v1/auth/me", headers=headers)
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data["username"] == "dr_live_user_01"
    assert me_data["full_name"] == "Dr. Aarav Sharma"

    # 5. Invalid password rejected
    bad_login = client.post(
        "/api/v1/auth/token",
        json={"username": "dr_live_user_01", "password": "WrongPassword!"},
    )
    assert bad_login.status_code == 401


def test_patient_registration_and_live_vitals_logging(client):
    # 1. Register a real patient
    pat_reg = {
        "username": "patient_sunita",
        "email": "sunita_devi@pahaadcare.example",
        "password": "PatientSecretPass2026!",
        "role": "patient",
        "full_name": "Sunita Devi",
        "phone": "+91-9876500001",
        "village": "Kedarnath Valley",
        "district": "Rudraprayag",
    }
    res = client.post("/api/v1/auth/register", json=pat_reg)
    assert res.status_code == 201
    pat_data = res.json()
    token = pat_data["access_token"]
    patient_id = pat_data["patient_id"]
    assert patient_id.startswith("PC-PAT")
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Log live vital for this patient directly via API
    vital_payload = {
        "measurement_type": "heart_rate",
        "value": 74.0,
        "unit": "beats_per_minute",
    }
    v_res = client.post(f"/api/v1/patients/{patient_id}/vitals", headers=headers, json=vital_payload)
    assert v_res.status_code == 201
    assert v_res.json()["status"] == "accepted"

    # 3. Log blood oxygen (SpO2)
    spo2_payload = {
        "measurement_type": "oxygen_saturation",
        "value": 98.0,
        "unit": "percent",
    }
    v_res2 = client.post(f"/api/v1/patients/{patient_id}/vitals", headers=headers, json=spo2_payload)
    assert v_res2.status_code == 201

    # 4. Fetch latest vitals for patient
    latest_res = client.get(f"/api/v1/patients/{patient_id}/vitals/latest", headers=headers)
    assert latest_res.status_code == 200
    latest_data = latest_res.json()
    assert latest_data["patient_id"] == patient_id
    assert "heart_rate" in latest_data["vitals"]
    assert latest_data["vitals"]["heart_rate"]["value"] == 74.0
    assert "oxygen_saturation" in latest_data["vitals"]
    assert latest_data["vitals"]["oxygen_saturation"]["value"] == 98.0
    assert latest_data["vitals"]["heart_rate"]["is_simulated"] is False


def test_clinician_can_create_patient_and_view_census(client):
    # Log in as clinician
    login_res = client.post(
        "/api/v1/auth/token",
        json={"username": "dr_live_user_01", "password": "SecurePassword2026!"},
    )
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create new live patient
    new_pat = {
        "patient_id": "PC-LIVE007",
        "display_name": "Mohan Lal",
        "age": 58,
        "gender": "male",
        "phone": "+91-9988776655",
        "village": "Joshimath",
        "district": "Chamoli",
        "status": "active",
    }
    res = client.post("/api/v1/patients", headers=headers, json=new_pat)
    assert res.status_code == 201
    data = res.json()
    assert data["patient_id"] == "PC-LIVE007"
    assert data["display_name"] == "Mohan Lal"
    assert data["is_simulated"] is False

    # Check that patient can be retrieved
    get_res = client.get("/api/v1/patients/PC-LIVE007", headers=headers)
    assert get_res.status_code == 200
    assert get_res.json()["village"] == "Joshimath"
