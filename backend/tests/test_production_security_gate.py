"""Comprehensive Production Security Gate and Verification Test Suite.

Validates:
1. Production database enforcement (refusal of SQLite fallback in production).
2. Production startup secret and demo account restrictions.
3. Prevention of public privileged role registration (clinician/administrator).
4. Administrator-controlled clinician provisioning.
5. Family member authorization & patient scoping.
6. Patient-to-patient data isolation.
7. Seeder protection in production mode.
8. Manual measurement auditability, actor recording, and duplication handling.
9. Production CORS configuration.
"""

from datetime import datetime, timezone
import json
import os
import pytest
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app.auth import (
    ConfigurationError,
    SecuritySettings,
    decode_token,
    has_patient_access,
    hash_password,
    issue_token,
)
from backend.app.main import app, create_repository
from backend.app.models import EventSource, MeasurementEvent, MeasurementType, MeasurementUnit
from backend.app.repository import SQLiteRepository


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def store():
    from backend.app.main import store
    return store


@pytest.fixture
def settings():
    from backend.app.main import settings
    return settings


# ---------------- Priority 1: Production Database & Fallback Protection ----------------

def test_production_startup_without_database_url_fails_strictly(monkeypatch):
    """When PAHAADCARE_ENV=production and DATABASE_URL is missing, startup MUST raise RuntimeError."""
    monkeypatch.setenv("PAHAADCARE_ENV", "production")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("PAHAADCARE_DATABASE_URL", raising=False)

    with pytest.raises(RuntimeError) as excinfo:
        create_repository()

    assert "Production environment (PAHAADCARE_ENV=production) requires DATABASE_URL" in str(excinfo.value)
    assert "Automatic SQLite fallback is strictly prohibited" in str(excinfo.value)


def test_production_startup_with_failing_postgres_connection_does_not_fallback(monkeypatch):
    """When PAHAADCARE_ENV=production and PostgreSQL connection fails, MUST raise RuntimeError without fallback."""
    monkeypatch.setenv("PAHAADCARE_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@127.0.0.1:5432/pahaadcare")

    with patch("psycopg.connect", side_effect=Exception("Connection refused")):
        with pytest.raises(RuntimeError) as excinfo:
            create_repository()

    assert "Production PostgreSQL connection failed" in str(excinfo.value)
    assert "Automatic SQLite fallback is strictly prohibited" in str(excinfo.value)


def test_development_allows_sqlite_fallback(monkeypatch, tmp_path):
    """In development, SQLite is permitted for local zero-config offline execution."""
    monkeypatch.setenv("PAHAADCARE_ENV", "development")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    db_file = tmp_path / "dev.sqlite3"
    monkeypatch.setenv("PAHAADCARE_DB_PATH", str(db_file))

    repo = create_repository()
    assert getattr(repo, "backend_name", "") == "sqlite"


# ---------------- Priority 2: Production Secrets & Demo Account Restrictions ----------------

def test_production_configuration_rejects_short_secret(monkeypatch):
    """In production, secrets under 32 characters must raise ConfigurationError."""
    monkeypatch.setenv("PAHAADCARE_ENV", "production")
    monkeypatch.setenv("PAHAADCARE_AUTH_SECRET", "too-short")
    monkeypatch.delenv("PAHAADCARE_DEMO_ENABLED", raising=False)
    monkeypatch.delenv("PAHAADCARE_DEMO_USERNAME", raising=False)
    monkeypatch.delenv("PAHAADCARE_DEMO_PASSWORD_HASH", raising=False)

    with pytest.raises(ConfigurationError) as excinfo:
        SecuritySettings.from_environment()

    assert "PAHAADCARE_AUTH_SECRET must be at least 32 characters" in str(excinfo.value)


def test_production_configuration_rejects_demo_enabled(monkeypatch):
    """In production, PAHAADCARE_DEMO_ENABLED=true must raise ConfigurationError."""
    monkeypatch.setenv("PAHAADCARE_ENV", "production")
    monkeypatch.setenv("PAHAADCARE_AUTH_SECRET", "a" * 32)
    monkeypatch.setenv("PAHAADCARE_DEMO_ENABLED", "true")

    with pytest.raises(ConfigurationError) as excinfo:
        SecuritySettings.from_environment()

    assert "demo account and demo endpoints cannot be configured or enabled in production" in str(excinfo.value)


# ---------------- Priority 2: Public Registration & Role Escalation Prevention ----------------

def test_public_registration_blocks_unauthorized_clinician_creation(client):
    """Public unauthenticated registration cannot create a clinician account."""
    res = client.post(
        "/api/v1/auth/register",
        json={
            "username": f"fake_doc_{uuid4().hex[:6]}",
            "email": f"fake_{uuid4().hex[:6]}@hospital.org",
            "password": "SecurePassword2026!",
            "role": "clinician",
            "full_name": "Unauthorized Doctor Attempt",
        },
    )
    assert res.status_code == 403
    payload = res.json()
    assert payload["error"]["code"] == "forbidden"
    assert "Public registration cannot create privileged" in payload["error"]["message"]


def test_public_registration_blocks_unauthorized_admin_creation(client):
    """Public unauthenticated registration cannot create an administrator account."""
    res = client.post(
        "/api/v1/auth/register",
        json={
            "username": f"fake_admin_{uuid4().hex[:6]}",
            "email": f"fake_admin_{uuid4().hex[:6]}@domain.org",
            "password": "SecurePassword2026!",
            "role": "administrator",
            "full_name": "Unauthorized Admin Attempt",
        },
    )
    assert res.status_code == 403
    payload = res.json()
    assert payload["error"]["code"] == "forbidden"


def test_admin_can_provision_clinician_account(client, store, settings):
    """An authenticated administrator CAN provision a new clinician account."""
    admin_token = issue_token("admin_master", "administrator", settings)
    new_clinician_user = f"doc_{uuid4().hex[:6]}"

    res = client.post(
        "/api/v1/auth/register",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "username": new_clinician_user,
            "email": f"{new_clinician_user}@hospital.org",
            "password": "DoctorValidPassword2026!",
            "role": "clinician",
            "full_name": "Dr. Verified Clinician",
        },
    )
    assert res.status_code == 201
    payload = res.json()
    assert payload["role"] == "clinician"
    assert payload["username"] == new_clinician_user


def test_invitation_code_allows_clinician_provisioning(client, monkeypatch):
    """Valid administrative provisioning key allows clinician onboarding."""
    secret_key = "secure-provisioning-secret-key-12345"
    monkeypatch.setenv("PAHAADCARE_PROVISIONING_SECRET", secret_key)
    new_user = f"doc_key_{uuid4().hex[:6]}"

    res = client.post(
        "/api/v1/auth/register",
        json={
            "username": new_user,
            "email": f"{new_user}@hospital.org",
            "password": "DoctorValidPassword2026!",
            "role": "clinician",
            "full_name": "Dr. Key Onboarded",
            "invitation_code": secret_key,
        },
    )
    assert res.status_code == 201
    assert res.json()["role"] == "clinician"


# ---------------- Priority 2: Family & Patient Scoping Security ----------------

def test_family_registration_requires_existing_patient(client):
    """Family member registration fails with 404 if the patient record does not exist."""
    res = client.post(
        "/api/v1/auth/register",
        json={
            "username": f"family_{uuid4().hex[:6]}",
            "email": f"fam_{uuid4().hex[:6]}@gmail.com",
            "password": "FamilyPassword2026!",
            "role": "family",
            "full_name": "Family Member",
            "patient_id": "PC-NONEXISTENT",
        },
    )
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "patient_not_found"


def test_family_registration_rejects_missing_patient_id(client):
    """Family member registration fails with 422 if patient_id is omitted."""
    res = client.post(
        "/api/v1/auth/register",
        json={
            "username": f"family_{uuid4().hex[:6]}",
            "email": f"fam_{uuid4().hex[:6]}@gmail.com",
            "password": "FamilyPassword2026!",
            "role": "family",
            "full_name": "Family Member",
        },
    )
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "missing_patient_id"


def test_family_member_cannot_access_unauthorized_patient(client, store, settings):
    """Family member token scoped to Patient A CANNOT access Patient B (403 Forbidden)."""
    fam_token = issue_token("fam_user", "family", settings, patient_ids=("PC-PAT001",))

    # Attempt to read vitals of PC-PAT002
    res = client.get(
        "/api/v1/patients/PC-PAT002/vitals/latest",
        headers={"Authorization": f"Bearer {fam_token}"},
    )
    assert res.status_code == 403


def test_patient_cannot_access_other_patient_vitals(client, store, settings):
    """Patient Alice CANNOT access Patient Bob's vitals (403 Forbidden)."""
    alice_token = issue_token("alice", "patient", settings, patient_ids=("PC-ALICE",))

    res = client.get(
        "/api/v1/patients/PC-BOB/vitals/latest",
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    assert res.status_code == 403


def test_wildcard_scope_denied_for_non_clinician():
    """has_patient_access MUST NOT grant wildcard access to family or patient even if present."""
    fake_patient_user = {"sub": "bad_user", "role": "patient", "patient_ids": ["*"]}
    fake_family_user = {"sub": "bad_fam", "role": "family", "patient_ids": ["*"]}
    clinician_user = {"sub": "good_doc", "role": "clinician", "patient_ids": ["*"]}

    assert has_patient_access(fake_patient_user, "PC-ANY01") is False
    assert has_patient_access(fake_family_user, "PC-ANY01") is False
    assert has_patient_access(clinician_user, "PC-ANY01") is True


# ---------------- Priority 1 & 2: Seeder Protection in Production ----------------

def test_seeder_refuses_production_without_flag(monkeypatch):
    """seed_live_data.py exits with code 1 if run in production without explicit confirmation."""
    monkeypatch.setenv("PAHAADCARE_ENV", "production")
    from backend.seed_live_data import seed_database

    with pytest.raises(SystemExit) as excinfo:
        seed_database(allow_production=False)

    assert excinfo.value.code == 1


# ---------------- Priority 3: Manual Measurement Ingestion & Audit ----------------

def test_manual_measurement_records_actor_and_source(client, store, settings):
    """Clinician manual measurement entry records actor ID, source HEALTH_WORKER, and audit event."""
    clinician_token = issue_token("dr_test", "clinician", settings, patient_ids=("*",))
    patient_id = "PC-PATTEST01"

    res = client.post(
        f"/api/v1/patients/{patient_id}/vitals",
        headers={"Authorization": f"Bearer {clinician_token}"},
        json={
            "measurement_type": "heart_rate",
            "value": 72.0,
            "unit": "beats_per_minute",
        },
    )
    assert res.status_code == 201
    event_id = res.json()["event_id"]

    # Verify audit log recorded the authenticated clinician actor
    recent_audits = store.list_audit()
    matched = [
        a for a in recent_audits
        if a["action"] == "vital_recorded" and a["actor_id"] == "dr_test"
    ]
    assert len(matched) > 0
    meta = json.loads(matched[0]["metadata_json"]) if matched[0]["metadata_json"] else {}
    assert meta.get("source") == "health_worker"
    assert meta.get("patient_id") == patient_id


# ---------------- Priority 4: CORS Configuration ----------------

def test_production_cors_rejects_wildcard(monkeypatch):
    """SecuritySettings rejects wildcard '*' in production CORS origins."""
    monkeypatch.setenv("PAHAADCARE_ENV", "production")
    monkeypatch.setenv("PAHAADCARE_AUTH_SECRET", "x" * 32)
    monkeypatch.delenv("PAHAADCARE_DEMO_ENABLED", raising=False)
    monkeypatch.delenv("PAHAADCARE_DEMO_USERNAME", raising=False)
    monkeypatch.delenv("PAHAADCARE_DEMO_PASSWORD_HASH", raising=False)
    monkeypatch.setenv("PAHAADCARE_CORS_ORIGINS", "*")

    with pytest.raises(ConfigurationError) as excinfo:
        SecuritySettings.from_environment()

    assert "production CORS origins must be explicit and non-wildcard" in str(excinfo.value)


# ---------------- Priority 5: Additional Regression Tests ----------------

def test_duplicate_measurement_submission_idempotency(client, store, settings):
    """Verifies that duplicate measurement submissions are idempotent and do not duplicate records."""
    token = issue_token("dr_dedup", "clinician", settings, patient_ids=("*",))
    event_id = str(uuid4())
    patient_id = "PC-PATDEDUP01"

    payload = {
        "schema_version": "1.0",
        "event_id": event_id,
        "patient_id": patient_id,
        "measurement_type": "heart_rate",
        "value": 75.0,
        "unit": "beats_per_minute",
        "measured_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "patient",
        "is_simulated": False,
    }

    # 1. First submission -> Accepted
    res1 = client.post(
        "/api/v1/measurements",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    assert res1.status_code == 202
    assert res1.json()["status"] == "accepted"

    # 2. Retry with exact same payload -> Duplicate acknowledged, not duplicated
    res2 = client.post(
        "/api/v1/measurements",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    assert res2.status_code == 200
    assert res2.json()["status"] == "duplicate"

    # Verify database has exactly 1 measurement for this event_id
    with store._connection() as conn:
        count = conn.execute("SELECT COUNT(*) FROM measurements WHERE event_id = ?", (event_id,)).fetchone()[0]
        assert count == 1

    # 3. Conflicting retry (same event_id, different value) -> 409 Conflict
    conflict_payload = dict(payload, value=120.0)
    res3 = client.post(
        "/api/v1/measurements",
        headers={"Authorization": f"Bearer {token}"},
        json=conflict_payload,
    )
    assert res3.status_code == 409
    assert res3.json()["error"]["code"] == "event_id_conflict"


def test_database_outage_and_recovery_readiness(client):
    """Verifies that database outage returns 503 degraded and recovery restores 200 ready."""
    # 1. Normal state: healthy and connected
    res1 = client.get("/api/v1/ready")
    assert res1.status_code == 200
    assert res1.json()["status"] == "ready"
    assert res1.json()["database"] == "connected"

    # 2. Outage: database connection failure
    with patch("backend.app.main.store.ping", side_effect=Exception("Database connection timeout")):
        res2 = client.get("/api/v1/ready")
        assert res2.status_code == 503
        assert res2.json()["status"] == "degraded"
        assert res2.json()["database"] == "unreachable"

    # 3. Recovery: database connection restored
    res3 = client.get("/api/v1/ready")
    assert res3.status_code == 200
    assert res3.json()["status"] == "ready"


def test_migration_and_backup_restoration_integrity(tmp_path, store):
    """Verifies non-destructive SQLite backup, restoration to disposable database, and integrity check."""
    import sqlite3

    backup_file = tmp_path / "pahaadcare_backup.sqlite3"
    restore_file = tmp_path / "pahaadcare_restored.sqlite3"

    # 1. Perform online backup from live store
    with store._connection() as src_conn:
        with sqlite3.connect(backup_file) as dst_conn:
            src_conn.backup(dst_conn)

    assert backup_file.exists()
    assert backup_file.stat().st_size > 0

    # 2. Restore backup into a separate disposable target database
    with sqlite3.connect(backup_file) as src_backup:
        with sqlite3.connect(restore_file) as dst_restore:
            src_backup.backup(dst_restore)

    assert restore_file.exists()

    # 3. Verify SQLite internal PRAGMA integrity
    with sqlite3.connect(restore_file) as restored_conn:
        integrity = restored_conn.execute("PRAGMA integrity_check").fetchall()
        assert integrity == [("ok",)]

        # Verify table structure & record preservation
        with store._connection() as orig_conn:
            for table in ("users", "patients", "measurements", "alerts", "audit_log"):
                orig_count = orig_conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                restored_count = restored_conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                assert orig_count == restored_count, f"Table {table} count mismatch"

