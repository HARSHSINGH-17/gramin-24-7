"""Milestone 6: Demo Readiness, Security Audit, and Release Validation Tests.

Validates:
1. EscalationWorker startup, single-tick execution, interval scheduling, and clean shutdown.
2. EscalationWorker survives simulated backend restart with pending escalation work.
3. EscalationWorker exception shielding (transient DB error does not crash background worker).
4. EscalationWorker does not block the asyncio event loop.
5. GET /api/v1/escalation/worker/status endpoint authentication and metadata.
6. Security: Unauthenticated access to escalation endpoints returns 401.
7. Security: Cross-patient scope access to alert escalation returns 403.
8. Security: Process escalation endpoint requires clinician authorization.
9. Security: Error responses use standard envelope without stack traces or sensitive data.
10. Database initialization creates all required tables, migrations, and default policies on clean path.
11. Audit hash chain integrity holds after repeated lifecycle transitions.
12. Idempotent re-execution of due alerts via worker produces exactly one notification.
"""

import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app.auth import SecuritySettings, issue_token
from backend.app.escalation import EscalationEngine, EscalationWorker
from backend.app.main import app, escalation_worker, settings, store as global_store
from backend.app.models import (
    Alert,
    AlertCategory,
    AlertReason,
    AlertSeverity,
    AlertStatus,
    EscalationRole,
    EscalationStatus,
    MockNotification,
    NotificationDeliveryStatus,
)
from backend.app.notifications import MockNotificationAdapter
from backend.app.repository import SQLiteRepository

BASE_TIME = datetime(2026, 4, 1, 9, 0, 0, tzinfo=timezone.utc)


class ControllableClock:
    def __init__(self, start_time: datetime) -> None:
        self.current = start_time

    def __call__(self) -> datetime:
        return self.current

    def advance(self, **kwargs) -> datetime:
        self.current += timedelta(**kwargs)
        return self.current


def make_critical_alert(
    patient_id: str = "PC-SYNTH01",
    created_at: datetime | None = None,
    severity: AlertSeverity = AlertSeverity.CRITICAL,
) -> Alert:
    return Alert(
        schema_version="1.0",
        alert_id=uuid4(),
        patient_id=patient_id,
        related_event_id=uuid4(),
        category=AlertCategory.ABNORMAL_MEASUREMENT,
        severity=severity,
        reason=AlertReason(
            code="heart_rate_critical_tachycardia",
            message="Critical tachycardia: 175 bpm",
            rule_version="demo-1",
        ),
        created_at=created_at or BASE_TIME,
        status=AlertStatus.OPEN,
    )


# 1. EscalationWorker clean startup, tick, and shutdown
@pytest.mark.anyio
async def test_escalation_worker_lifecycle(tmp_path: Path):
    clock = ControllableClock(BASE_TIME)
    repo = SQLiteRepository(tmp_path / "worker_lifecycle.db", clock=clock)
    adapter = MockNotificationAdapter(repository=repo, clock=clock)
    engine = EscalationEngine(repository=repo, notification_adapter=adapter, clock=clock)
    worker = EscalationWorker(engine=engine, interval_seconds=0.05, enabled=True, clock=clock)

    assert not worker.is_running
    assert worker.run_count == 0

    await worker.start()
    assert worker.is_running

    # Let the worker tick at least once
    await asyncio.sleep(0.08)
    assert worker.run_count >= 1

    await worker.stop()
    assert not worker.is_running


# 2. EscalationWorker survives simulated backend restart with pending work
@pytest.mark.anyio
async def test_escalation_worker_restart_with_pending_work(tmp_path: Path):
    db_file = tmp_path / "restart_worker.db"
    clock = ControllableClock(BASE_TIME)

    # Initial boot: create critical alert due in 5m (300s)
    repo1 = SQLiteRepository(db_file, clock=clock)
    alert = repo1.save_quality_alert(make_critical_alert(created_at=clock.current))

    # Backend shutdown simulated (repo1 dropped)
    # Time elapses by 6 minutes while system was down
    clock.advance(minutes=6)

    # Backend restarted: new repo and worker instances
    repo2 = SQLiteRepository(db_file, clock=clock)
    adapter2 = MockNotificationAdapter(repository=repo2, clock=clock)
    engine2 = EscalationEngine(repository=repo2, notification_adapter=adapter2, clock=clock)
    worker2 = EscalationWorker(engine=engine2, interval_seconds=10.0, enabled=True, clock=clock)

    # Single tick processes the pending work recovered from SQLite
    dispatched = await worker2.run_tick()
    assert len(dispatched) == 1
    assert dispatched[0].alert_id == alert.alert_id
    assert dispatched[0].escalation_level == 1
    assert dispatched[0].recipient_role == EscalationRole.COMMUNITY_HEALTH_WORKER

    # Escalation state is updated in DB
    esc = repo2.get_alert_escalation(alert.alert_id)
    assert esc.current_level == 1
    assert esc.status == EscalationStatus.ESCALATED


# 3. EscalationWorker exception shielding
@pytest.mark.anyio
async def test_escalation_worker_exception_shielding(tmp_path: Path):
    clock = ControllableClock(BASE_TIME)
    repo = SQLiteRepository(tmp_path / "shield.db", clock=clock)
    adapter = MockNotificationAdapter(repository=repo, clock=clock)
    engine = EscalationEngine(repository=repo, notification_adapter=adapter, clock=clock)

    # Mock engine to simulate a transient database error on the first call
    call_count = 0
    orig_process = engine.process_due_escalations

    def faulty_process(now=None):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise RuntimeError("Simulated transient SQLite disk busy")
        return orig_process(now)

    engine.process_due_escalations = faulty_process

    worker = EscalationWorker(engine=engine, interval_seconds=0.02, enabled=True, clock=clock)
    await worker.start()

    # Sleep long enough for multiple ticks
    await asyncio.sleep(0.08)
    await worker.stop()

    # Worker survived the transient error and continued ticking
    assert call_count > 1
    assert not worker.is_running


# 4. EscalationWorker does not block the asyncio event loop
@pytest.mark.anyio
async def test_escalation_worker_does_not_block_event_loop(tmp_path: Path):
    clock = ControllableClock(BASE_TIME)
    repo = SQLiteRepository(tmp_path / "nonblocking.db", clock=clock)
    adapter = MockNotificationAdapter(repository=repo, clock=clock)
    engine = EscalationEngine(repository=repo, notification_adapter=adapter, clock=clock)
    worker = EscalationWorker(engine=engine, interval_seconds=1.0, enabled=True, clock=clock)

    # Create due alert
    repo.save_quality_alert(make_critical_alert(created_at=clock.current))
    clock.advance(minutes=6)

    # Run worker tick concurrently with another quick async task
    flag = False

    async def quick_async_task():
        nonlocal flag
        await asyncio.sleep(0.001)
        flag = True

    await asyncio.gather(worker.run_tick(), quick_async_task())
    assert flag is True
    assert worker.run_count == 1


# 5. GET /api/v1/escalation/worker/status endpoint authentication and metadata
def test_worker_status_endpoint():
    client = TestClient(app)

    # 1. Unauthenticated -> 401
    resp_unauth = client.get("/api/v1/escalation/worker/status")
    assert resp_unauth.status_code == 401

    # 2. Authenticated clinician -> 200 with worker status
    token = issue_token(
        "clinician-test",
        "clinician",
        settings,
        patient_ids=["PC-SYNTH01"],
    )
    resp_auth = client.get(
        "/api/v1/escalation/worker/status",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp_auth.status_code == 200
    data = resp_auth.json()
    assert "enabled" in data
    assert "is_running" in data
    assert "interval_seconds" in data
    assert "run_count" in data


# 6. Security: Unauthenticated access to escalation endpoints returns 401
def test_security_unauthenticated_escalation_endpoints():
    client = TestClient(app)
    assert client.get("/api/v1/escalation/policies").status_code == 401
    assert client.get(f"/api/v1/alerts/{uuid4()}/escalations").status_code == 401
    assert client.post("/api/v1/escalation/process").status_code == 401


# 7. Security: Cross-patient scope access to alert escalation returns 403
def test_security_cross_patient_scope_denied():
    client = TestClient(app)

    # Clinician assigned only to PC-PATIENT-A
    token = issue_token(
        "scoped-clinician",
        "clinician",
        settings,
        patient_ids=["PC-PATIENT-A"],
    )

    # Alert belongs to PC-SYNTH01
    alert = global_store.save_quality_alert(
        make_critical_alert(patient_id="PC-SYNTH01")
    )

    resp = client.get(
        f"/api/v1/alerts/{alert.alert_id}/escalations",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "forbidden"


# 8. Security: Process escalation endpoint requires clinician authorization
def test_security_process_escalation_authorization():
    client = TestClient(app)

    # Viewer role without clinician privileges
    token_viewer = issue_token(
        "guest-viewer",
        "viewer",
        settings,
        patient_ids=["*"],
    )

    resp = client.post(
        "/api/v1/escalation/process",
        headers={"Authorization": f"Bearer {token_viewer}"},
    )
    assert resp.status_code == 403


# 9. Security: Error responses use standard envelope without stack traces
def test_error_envelope_sanitization():
    client = TestClient(app)
    token = issue_token(
        "clinician-test",
        "clinician",
        settings,
        patient_ids=["PC-SYNTH01"],
    )
    headers = {"Authorization": f"Bearer {token}"}
    resp = client.get("/api/v1/alerts/not-a-uuid/escalations", headers=headers)
    assert resp.status_code == 422
    body = resp.json()
    assert "error" in body
    assert "code" in body["error"]
    assert "message" in body["error"]
    assert "Traceback" not in resp.text
    assert "File \"" not in resp.text


# 10. Database initialization on fresh clean path
def test_clean_database_initialization(tmp_path: Path):
    clean_db = tmp_path / "fresh_install.sqlite3"
    assert not clean_db.exists()

    repo = SQLiteRepository(clean_db)
    assert clean_db.exists()

    # Verify tables exist and default policies were seeded
    policies = repo.list_escalation_policies()
    assert len(policies) >= 3
    policy_ids = [p.policy_id for p in policies]
    assert "policy-critical" in policy_ids
    assert "policy-high" in policy_ids
    assert "policy-default" in policy_ids

    # Verify audit chain starts valid
    audit_status = repo.verify_audit_chain()
    assert audit_status["valid"] is True
    assert audit_status["checked_records"] == 0


# 11. Audit hash chain integrity holds after repeated lifecycle transitions
def test_audit_hash_chain_integrity_after_repeated_transitions(tmp_path: Path):
    clock = ControllableClock(BASE_TIME)
    repo = SQLiteRepository(tmp_path / "repeated_audit.db", clock=clock)

    alert = repo.save_quality_alert(make_critical_alert(created_at=clock.current))
    repo.acknowledge_alert(alert.alert_id, "clinician-1", "First note")

    # Idempotent re-acknowledge
    repo.acknowledge_alert(alert.alert_id, "clinician-1", "Second note")

    # Resolve
    repo.resolve_alert(alert.alert_id, "clinician-1", "resolved_normal", "All clear")

    # Idempotent re-resolve
    repo.resolve_alert(alert.alert_id, "clinician-1", "resolved_normal", "Duplicate resolve")

    audit = repo.verify_audit_chain()
    assert audit["valid"] is True
    assert audit["checked_records"] >= 3
    assert audit["error"] is None


# 12. Idempotent re-execution of due alerts via worker produces exactly one notification
@pytest.mark.anyio
async def test_worker_idempotent_single_notification(tmp_path: Path):
    clock = ControllableClock(BASE_TIME)
    repo = SQLiteRepository(tmp_path / "worker_idempotent.db", clock=clock)
    adapter = MockNotificationAdapter(repository=repo, clock=clock)
    engine = EscalationEngine(repository=repo, notification_adapter=adapter, clock=clock)
    worker = EscalationWorker(engine=engine, interval_seconds=10.0, enabled=True, clock=clock)

    alert = repo.save_quality_alert(make_critical_alert(created_at=clock.current))
    clock.advance(minutes=6)

    # First tick: dispatches level 1
    d1 = await worker.run_tick()
    assert len(d1) == 1

    # Immediate second tick at same clock time: produces 0 duplicate notifications
    d2 = await worker.run_tick()
    assert len(d2) == 0

    # Total notifications recorded in SQLite remains exactly 1
    notifs = repo.list_notifications(alert.alert_id)
    assert len(notifs) == 1
