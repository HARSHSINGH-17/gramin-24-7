from dataclasses import replace
from datetime import datetime, timedelta, timezone
import os

import jwt
from fastapi.testclient import TestClient
import pytest

from backend.app.auth import SecuritySettings, hash_password, issue_token, verify_password
from backend.app.main import app, settings
from backend.synthetic_vitals import generate_scenario


def test_health_is_public_but_protected_routes_require_authentication() -> None:
    client = TestClient(app)

    assert client.get("/health").status_code == 200
    assert client.post(
        "/api/v1/measurements",
        json=generate_scenario("normal").measurements[0].model_dump(mode="json", exclude_none=True),
    ).status_code == 401
    assert client.get("/api/v1/demo/rpm-dashboard").status_code == 401


def test_invalid_expired_and_bad_signature_tokens_are_rejected(auth_headers) -> None:
    client = TestClient(app)
    event = generate_scenario("normal").measurements[0].model_dump(mode="json", exclude_none=True)
    expired = issue_token(
        "test-clinician",
        "clinician",
        settings,
        now=datetime.now(timezone.utc) - timedelta(hours=2),
    )
    bad_signature = jwt.encode(
        {"sub": "test-clinician", "role": "clinician", "iss": settings.issuer, "aud": settings.audience, "iat": datetime.now(timezone.utc), "exp": datetime.now(timezone.utc) + timedelta(minutes=30)},
        "wrong-secret-that-is-long-enough-123456",
        algorithm="HS256",
    )

    for token in ["not-a-jwt", expired, bad_signature]:
        response = client.post(
            "/api/v1/measurements",
            json=event,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "unauthorized"

    assert client.get("/api/v1/demo/rpm-dashboard", headers=auth_headers).status_code == 200


def test_wrong_role_is_forbidden() -> None:
    client = TestClient(app)
    token = issue_token("viewer", "viewer", settings)

    response = client.get(
        "/api/v1/demo/rpm-dashboard",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


def test_token_endpoint_uses_environment_configured_password() -> None:
    client = TestClient(app)
    bad = client.post(
        "/api/v1/auth/token",
        json={"username": "test-clinician", "password": "wrong-password"},
    )
    good = client.post(
        "/api/v1/auth/token",
        json={"username": "test-clinician", "password": "test-password-1234"},
    )

    assert bad.status_code == 401
    assert good.status_code == 200
    assert good.json()["token_type"] == "bearer"
    assert isinstance(good.json()["access_token"], str)


def test_password_hashing_is_not_plaintext() -> None:
    encoded = hash_password("long-test-password")

    assert encoded != "long-test-password"
    assert verify_password("long-test-password", encoded)
    assert not verify_password("wrong-password", encoded)


def test_demo_endpoint_fails_closed_when_disabled(monkeypatch, auth_headers) -> None:
    import backend.app.main as main_module

    monkeypatch.setattr(main_module, "settings", replace(settings, demo_enabled=False))
    response = TestClient(app).get("/api/v1/demo/rpm-dashboard", headers=auth_headers)

    assert response.status_code == 404


def test_production_configuration_rejects_missing_secret(monkeypatch) -> None:
    monkeypatch.setenv("PAHAADCARE_ENV", "production")
    monkeypatch.delenv("PAHAADCARE_AUTH_SECRET", raising=False)
    monkeypatch.setenv("PAHAADCARE_DEMO_ENABLED", "false")
    monkeypatch.setenv("PAHAADCARE_CORS_ORIGINS", "https://example.invalid")

    with pytest.raises(RuntimeError, match="AUTH_SECRET"):
        SecuritySettings.from_environment()


def test_production_configuration_rejects_demo_access(monkeypatch) -> None:
    monkeypatch.setenv("PAHAADCARE_ENV", "production")
    monkeypatch.setenv("PAHAADCARE_AUTH_SECRET", "production-secret-that-is-long-enough-123456")
    monkeypatch.setenv("PAHAADCARE_DEMO_ENABLED", "true")
    monkeypatch.setenv("PAHAADCARE_CORS_ORIGINS", "https://example.invalid")

    with pytest.raises(RuntimeError, match="Unsafe configuration"):
        SecuritySettings.from_environment()


def test_production_configuration_rejects_demo_credentials_at_startup(monkeypatch) -> None:
    monkeypatch.setenv("PAHAADCARE_ENV", "production")
    monkeypatch.setenv("PAHAADCARE_AUTH_SECRET", "production-secret-that-is-long-enough-123456")
    monkeypatch.setenv("PAHAADCARE_DEMO_ENABLED", "false")
    monkeypatch.setenv("PAHAADCARE_DEMO_USERNAME", "demo-clinician")
    monkeypatch.setenv("PAHAADCARE_CORS_ORIGINS", "https://example.invalid")

    with pytest.raises(RuntimeError, match="Unsafe configuration"):
        SecuritySettings.from_environment()


def test_demo_account_rejected_on_non_loopback_host(monkeypatch) -> None:
    monkeypatch.setenv("PAHAADCARE_ENV", "development")
    monkeypatch.setenv("PAHAADCARE_HOST", "192.168.1.100")
    monkeypatch.setenv("PAHAADCARE_DEMO_ENABLED", "true")
    monkeypatch.setenv("PAHAADCARE_DEMO_USERNAME", "demo-user")
    monkeypatch.setenv("PAHAADCARE_DEMO_PASSWORD_HASH", hash_password("test-password-1234"))

    with pytest.raises(RuntimeError, match="non-loopback"):
        SecuritySettings.from_environment()


def test_token_lifetime_bounds(monkeypatch) -> None:
    monkeypatch.setenv("PAHAADCARE_TOKEN_MINUTES", "0")
    with pytest.raises(RuntimeError, match="PAHAADCARE_TOKEN_MINUTES"):
        SecuritySettings.from_environment()

    monkeypatch.setenv("PAHAADCARE_TOKEN_MINUTES", "2000")
    with pytest.raises(RuntimeError, match="PAHAADCARE_TOKEN_MINUTES"):
        SecuritySettings.from_environment()


def test_token_contains_required_claims() -> None:
    token = issue_token("clinician-demo", "clinician", settings, patient_ids=("PC-SYNTH01",))
    claims = jwt.decode(
        token,
        settings.auth_secret,
        algorithms=["HS256"],
        audience=settings.audience,
        issuer=settings.issuer,
    )
    for required_claim in ("sub", "role", "patient_ids", "jti", "iss", "aud", "iat", "exp"):
        assert required_claim in claims
    assert claims["sub"] == "clinician-demo"
    assert claims["role"] == "clinician"
    assert claims["patient_ids"] == ["PC-SYNTH01"]


def test_token_revocation_and_persistence_across_restart(tmp_path) -> None:
    from backend.app.repository import SQLiteRepository

    db_path = tmp_path / "revocation.sqlite3"
    repo = SQLiteRepository(db_path)
    jti = "test-jti-123"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)

    assert not repo.is_token_revoked(jti)
    repo.revoke_token(jti, expires_at, "test-user")
    assert repo.is_token_revoked(jti)

    # Restart
    restarted = SQLiteRepository(db_path)
    assert restarted.is_token_revoked(jti)


def test_logout_endpoint_revokes_token_server_side(monkeypatch, tmp_path) -> None:
    from backend.app.repository import SQLiteRepository
    import backend.app.main as main_module

    db_path = tmp_path / "logout_test.sqlite3"
    test_store = SQLiteRepository(db_path)
    monkeypatch.setattr(main_module, "store", test_store)

    token = issue_token("test-clinician", "clinician", settings)
    headers = {"Authorization": f"Bearer {token}"}
    client = TestClient(app)

    # Access is valid
    assert client.get("/api/v1/demo/rpm-dashboard", headers=headers).status_code == 200

    # Logout
    logout_res = client.post("/api/v1/auth/logout", headers=headers)
    assert logout_res.status_code == 200
    assert logout_res.json()["status"] == "revoked"

    # Subsequent request using same token must be rejected as 401
    denied = client.get("/api/v1/demo/rpm-dashboard", headers=headers)
    assert denied.status_code == 401
    assert denied.json()["error"]["code"] == "unauthorized"


def test_patient_level_authorization_enforces_scope(monkeypatch, tmp_path) -> None:
    from backend.app.repository import SQLiteRepository
    import backend.app.main as main_module

    test_store = SQLiteRepository(tmp_path / "patient_auth.sqlite3")
    monkeypatch.setattr(main_module, "store", test_store)
    client = TestClient(app)

    # Clinician token permitted only for PC-SYNTH01
    allowed_token = issue_token("clinician-1", "clinician", settings, patient_ids=("PC-SYNTH01",))
    # Clinician token permitted only for PC-OTHER
    other_token = issue_token("clinician-2", "clinician", settings, patient_ids=("PC-OTHER",))

    scenario = generate_scenario("normal")
    event = scenario.measurements[0].model_dump(mode="json", exclude_none=True)
    assert event["patient_id"] == "PC-SYNTH01"

    # Authorized user can submit
    res = client.post("/api/v1/measurements", json=event, headers={"Authorization": f"Bearer {allowed_token}"})
    assert res.status_code == 202

    # Unauthorized user for this patient receives 403 Forbidden
    denied = client.post("/api/v1/measurements", json=event, headers={"Authorization": f"Bearer {other_token}"})
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "forbidden"


def test_cross_patient_alert_lifecycle_is_denied(monkeypatch, tmp_path) -> None:
    from backend.app.repository import SQLiteRepository
    import backend.app.main as main_module

    test_store = SQLiteRepository(tmp_path / "alert_auth.sqlite3")
    monkeypatch.setattr(main_module, "store", test_store)
    client = TestClient(app)

    # Submit abnormal event for PC-SYNTH01
    token_synth = issue_token("clinician-synth", "clinician", settings, patient_ids=("PC-SYNTH01",))
    abnormal = generate_scenario("abnormal").measurements[0].model_dump(mode="json", exclude_none=True)
    submit_res = client.post("/api/v1/measurements", json=abnormal, headers={"Authorization": f"Bearer {token_synth}"})
    alert_id = submit_res.json()["alert_ids"][0]

    # Clinician with access only to PC-DIFFERENT tries to acknowledge
    token_other = issue_token("clinician-other", "clinician", settings, patient_ids=("PC-DIFFERENT",))
    denied = client.post(
        f"/api/v1/alerts/{alert_id}/acknowledge",
        json={"actor_id": "clinician-other", "note": "Attempted cross-patient ack"},
        headers={"Authorization": f"Bearer {token_other}"},
    )
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "forbidden"

    # Verify audit recorded the authorization failure
    audit = test_store.list_audit()
    assert any(row["action"] == "alert_acknowledge" and row["success"] == 0 for row in audit)


def test_administrator_role_explicit_access(monkeypatch, tmp_path) -> None:
    from backend.app.repository import SQLiteRepository
    import backend.app.main as main_module

    test_store = SQLiteRepository(tmp_path / "admin_auth.sqlite3")
    monkeypatch.setattr(main_module, "store", test_store)
    client = TestClient(app)

    # Administrator token with wildcard scope
    admin_token = issue_token("admin-user", "administrator", settings, patient_ids=("*",))
    event = generate_scenario("normal").measurements[0].model_dump(mode="json", exclude_none=True)

    res = client.post("/api/v1/measurements", json=event, headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 202

    dash_res = client.get("/api/v1/demo/rpm-dashboard", headers={"Authorization": f"Bearer {admin_token}"})
    assert dash_res.status_code == 200


def test_tamper_evident_audit_chain_verification_and_tamper_detection(tmp_path) -> None:
    from backend.app.repository import SQLiteRepository
    import sqlite3

    db_path = tmp_path / "tamper_test.sqlite3"
    repo = SQLiteRepository(db_path)

    # Empty chain verification
    empty_status = repo.verify_audit_chain()
    assert empty_status["valid"] is True
    assert empty_status["checked_records"] == 0

    # Submit abnormal event and perform lifecycle mutations to generate audit records
    scenario = generate_scenario("abnormal")
    sub = repo.submit(scenario.measurements[0])
    alert = sub.alerts[0]
    repo.acknowledge_alert(alert.alert_id, "clinician-1", "Acknowledged")
    repo.resolve_alert(alert.alert_id, "clinician-1", "complete", "Resolved")
    repo.record_audit("clinician-1", "follow_up_note", alert.alert_id, True, {"note": "patient stabilized"})

    # Initial chain verification
    chain_status = repo.verify_audit_chain()
    assert chain_status["valid"] is True
    assert chain_status["checked_records"] == 3

    # Tamper 1: Alter an audit row
    with sqlite3.connect(db_path) as conn:
        conn.execute("UPDATE audit_log SET actor_id = 'malicious-actor' WHERE audit_id = 1")
        conn.commit()

    tampered_status = repo.verify_audit_chain()
    assert tampered_status["valid"] is False
    assert "mismatch" in tampered_status["error"]

    # Tamper 2: Restore row 1 and delete intermediate record (row 2)
    with sqlite3.connect(db_path) as conn:
        conn.execute("UPDATE audit_log SET actor_id = 'clinician-1' WHERE audit_id = 1")
        conn.execute("DELETE FROM audit_log WHERE audit_id = 2")
        conn.commit()

    deleted_status = repo.verify_audit_chain()
    assert deleted_status["valid"] is False
    assert "mismatch" in deleted_status["error"]


def test_audit_export_determinism_and_redaction(tmp_path) -> None:
    from backend.app.repository import SQLiteRepository

    db_path = tmp_path / "export_test.sqlite3"
    repo = SQLiteRepository(db_path)

    # Insert test records
    repo.record_audit("user-1", "test_action_1", None, True, {"note": "safe", "token": "sensitive-should-be-redacted"})
    repo.record_audit("user-2", "test_action_2", None, True, {"note": "ok"})

    export_1 = repo.export_audit()
    export_2 = repo.export_audit()

    assert export_1["export_version"] == "1.0"
    assert export_1["centrally_delivered"] is False
    assert export_1["integrity"]["valid"] is True
    assert len(export_1["records"]) == 2
    # Determinism
    assert export_1 == export_2

    # Verify sensitive fields are redacted from export metadata
    rec_meta = export_1["records"][0]["metadata"]
    assert "token" not in rec_meta
    assert rec_meta["note"] == "safe"

    # Bounded range
    bounded = repo.export_audit(start_id=2, end_id=2)
    assert len(bounded["records"]) == 1
    assert bounded["records"][0]["audit_id"] == 2
