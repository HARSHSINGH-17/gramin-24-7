import concurrent.futures
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
import pytest

from backend.app.auth import issue_token
from backend.app.escalation import EscalationEngine
from backend.app.main import app, settings, store
from backend.app.models import (
    Alert,
    AlertCategory,
    AlertEscalationState,
    AlertReason,
    AlertSeverity,
    AlertStatus,
    EscalationRole,
    EscalationStatus,
    EventSource,
    MeasurementEvent,
    MeasurementType,
    MeasurementUnit,
    MockNotification,
    NotificationDeliveryStatus,
)
from backend.app.notifications import MockNotificationAdapter
from backend.app.repository import SQLiteRepository


BASE_TIME = datetime(2026, 3, 20, 10, 0, 0, tzinfo=timezone.utc)


class ControllableClock:
    def __init__(self, initial_time: datetime) -> None:
        self.current = initial_time

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


# 1. Alert acknowledged before escalation deadline
def test_alert_acknowledged_before_escalation_deadline(tmp_path: Path):
    clock = ControllableClock(BASE_TIME)
    repo = SQLiteRepository(tmp_path / "test.db", clock=clock)
    adapter = MockNotificationAdapter(repository=repo, clock=clock)
    engine = EscalationEngine(repository=repo, notification_adapter=adapter, clock=clock)

    alert = repo.save_quality_alert(make_critical_alert(created_at=clock.current))

    esc = repo.get_alert_escalation(alert.alert_id)
    assert esc is not None
    assert esc.status == EscalationStatus.PENDING
    assert esc.current_level == 0
    assert esc.next_due_at == BASE_TIME + timedelta(seconds=300)

    # Clinician acknowledges 2 minutes in (deadline is at 5m)
    clock.advance(minutes=2)
    repo.acknowledge_alert(alert.alert_id, "clinician-demo", "Patient being checked")

    esc_after_ack = repo.get_alert_escalation(alert.alert_id)
    assert esc_after_ack.status == EscalationStatus.ACKNOWLEDGED_STOPPED
    assert esc_after_ack.next_due_at is None

    # Advance clock past the original 5m deadline to 6m
    clock.advance(minutes=4)
    dispatched = engine.process_due_escalations()

    # Confirm no notification was sent
    assert len(dispatched) == 0
    assert len(adapter.dispatched_history) == 0
    final_esc = repo.get_alert_escalation(alert.alert_id)
    assert final_esc.status == EscalationStatus.ACKNOWLEDGED_STOPPED


# 2. Alert remains unacknowledged past the deadline
def test_alert_remains_unacknowledged_past_deadline(tmp_path: Path):
    clock = ControllableClock(BASE_TIME)
    repo = SQLiteRepository(tmp_path / "test.db", clock=clock)
    adapter = MockNotificationAdapter(repository=repo, clock=clock)
    engine = EscalationEngine(repository=repo, notification_adapter=adapter, clock=clock)

    alert = repo.save_quality_alert(make_critical_alert(created_at=clock.current))

    # Advance clock past 5m deadline to 6m without acknowledging
    clock.advance(minutes=6)
    dispatched = engine.process_due_escalations()

    assert len(dispatched) == 1
    notif = dispatched[0]
    assert notif.escalation_level == 1
    assert notif.recipient_role == EscalationRole.COMMUNITY_HEALTH_WORKER
    assert notif.delivery_status == NotificationDeliveryStatus.DELIVERED
    assert notif.is_simulated is True
    assert "SIMULATED NOTIFICATION" in notif.message_body

    esc = repo.get_alert_escalation(alert.alert_id)
    assert esc.status == EscalationStatus.ESCALATED
    assert esc.current_level == 1
    assert esc.attempts_count == 1
    assert len(esc.notifications) == 1
    # Next escalation scheduled at +300s
    assert esc.next_due_at == clock.current + timedelta(seconds=300)


# 3. Alert resolved before the deadline
def test_alert_resolved_before_deadline(tmp_path: Path):
    clock = ControllableClock(BASE_TIME)
    repo = SQLiteRepository(tmp_path / "test.db", clock=clock)
    adapter = MockNotificationAdapter(repository=repo, clock=clock)
    engine = EscalationEngine(repository=repo, notification_adapter=adapter, clock=clock)

    alert = repo.save_quality_alert(make_critical_alert(created_at=clock.current))

    clock.advance(minutes=1)
    repo.acknowledge_alert(alert.alert_id, "clinician-demo", "Acked")
    clock.advance(minutes=1)
    repo.resolve_alert(alert.alert_id, "clinician-demo", "resolved_normal", "All clear")

    esc = repo.get_alert_escalation(alert.alert_id)
    assert esc.status == EscalationStatus.RESOLVED_STOPPED
    assert esc.next_due_at is None

    # Advance past deadline
    clock.advance(minutes=10)
    dispatched = engine.process_due_escalations()
    assert len(dispatched) == 0


# 4. Escalation to a second synthetic recipient
def test_escalation_to_second_synthetic_recipient(tmp_path: Path):
    clock = ControllableClock(BASE_TIME)
    repo = SQLiteRepository(tmp_path / "test.db", clock=clock)
    adapter = MockNotificationAdapter(repository=repo, clock=clock)
    engine = EscalationEngine(repository=repo, notification_adapter=adapter, clock=clock)

    alert = repo.save_quality_alert(make_critical_alert(created_at=clock.current))

    # Advance to Level 1
    clock.advance(minutes=6)
    dispatched_lvl1 = engine.process_due_escalations()
    assert len(dispatched_lvl1) == 1
    assert dispatched_lvl1[0].recipient_role == EscalationRole.COMMUNITY_HEALTH_WORKER

    # Alert remains unacknowledged, advance past subsequent delay (another 6 minutes)
    clock.advance(minutes=6)
    dispatched_lvl2 = engine.process_due_escalations()
    assert len(dispatched_lvl2) == 1
    notif_lvl2 = dispatched_lvl2[0]
    assert notif_lvl2.escalation_level == 2
    assert notif_lvl2.recipient_role == EscalationRole.SUPERVISOR
    assert "Supervisor" in notif_lvl2.recipient_target

    esc = repo.get_alert_escalation(alert.alert_id)
    assert esc.current_level == 2
    assert esc.status == EscalationStatus.MAX_REACHED
    assert len(esc.notifications) == 2


# 5. Failed notification and bounded retry
def test_failed_notification_and_bounded_retry(tmp_path: Path):
    clock = ControllableClock(BASE_TIME)
    repo = SQLiteRepository(tmp_path / "test.db", clock=clock)
    # Fail first 2 attempts
    adapter = MockNotificationAdapter(repository=repo, clock=clock, fail_attempts=2)
    engine = EscalationEngine(repository=repo, notification_adapter=adapter, clock=clock)

    alert = repo.save_quality_alert(make_critical_alert(created_at=clock.current))

    # Attempt 1: Past deadline
    clock.advance(minutes=6)
    dispatched1 = engine.process_due_escalations()
    assert len(dispatched1) == 1
    assert dispatched1[0].delivery_status == NotificationDeliveryStatus.FAILED
    assert dispatched1[0].failure_reason is not None

    esc1 = repo.get_alert_escalation(alert.alert_id)
    assert esc1.attempts_count == 1
    assert esc1.current_level == 0  # not advanced due to failure
    assert esc1.next_due_at == clock.current + timedelta(seconds=60)  # retry delay

    # Attempt 2: After retry delay (60s)
    clock.advance(seconds=65)
    dispatched2 = engine.process_due_escalations()
    assert len(dispatched2) == 1
    assert dispatched2[0].delivery_status == NotificationDeliveryStatus.FAILED

    esc2 = repo.get_alert_escalation(alert.alert_id)
    assert esc2.attempts_count == 2

    # Attempt 3: After retry delay (success now since fail_attempts was 2)
    clock.advance(seconds=65)
    dispatched3 = engine.process_due_escalations()
    assert len(dispatched3) == 1
    assert dispatched3[0].delivery_status == NotificationDeliveryStatus.DELIVERED

    esc3 = repo.get_alert_escalation(alert.alert_id)
    assert esc3.current_level == 1
    assert esc3.attempts_count == 3


# 6. Duplicate scheduler execution
def test_duplicate_scheduler_execution_is_idempotent(tmp_path: Path):
    clock = ControllableClock(BASE_TIME)
    repo = SQLiteRepository(tmp_path / "test.db", clock=clock)
    adapter = MockNotificationAdapter(repository=repo, clock=clock)
    engine = EscalationEngine(repository=repo, notification_adapter=adapter, clock=clock)

    alert = repo.save_quality_alert(make_critical_alert(created_at=clock.current))

    clock.advance(minutes=6)
    # First execution
    first_run = engine.process_due_escalations()
    assert len(first_run) == 1

    # Second execution immediately afterwards at same time
    second_run = engine.process_due_escalations()
    assert len(second_run) == 0

    esc = repo.get_alert_escalation(alert.alert_id)
    assert len(esc.notifications) == 1


# 7. Backend restart with pending escalation work
def test_backend_restart_with_pending_escalation_work(tmp_path: Path):
    db_file = tmp_path / "durable.db"
    clock = ControllableClock(BASE_TIME)

    # Instance 1: Alert is created
    repo1 = SQLiteRepository(db_file, clock=clock)
    alert = repo1.save_quality_alert(make_critical_alert(created_at=clock.current))

    # Backend shutdown / restart: Instance 2 pointing to same database
    clock.advance(minutes=7)
    repo2 = SQLiteRepository(db_file, clock=clock)
    adapter2 = MockNotificationAdapter(repository=repo2, clock=clock)
    engine2 = EscalationEngine(repository=repo2, notification_adapter=adapter2, clock=clock)

    dispatched = engine2.process_due_escalations()
    assert len(dispatched) == 1
    assert dispatched[0].alert_id == alert.alert_id
    assert dispatched[0].escalation_level == 1

    # Verify persisted in database
    esc = repo2.get_alert_escalation(alert.alert_id)
    assert esc.current_level == 1
    assert esc.status == EscalationStatus.ESCALATED


# 8. Concurrent processing of the same due alert
def test_concurrent_processing_of_same_due_alert(tmp_path: Path):
    db_file = tmp_path / "concurrent.db"
    clock = ControllableClock(BASE_TIME)
    repo = SQLiteRepository(db_file, clock=clock)
    adapter = MockNotificationAdapter(repository=repo, clock=clock)
    engine = EscalationEngine(repository=repo, notification_adapter=adapter, clock=clock)

    alert = repo.save_quality_alert(make_critical_alert(created_at=clock.current))
    clock.advance(minutes=6)

    # Spawn 4 concurrent threads trying to process the same due alert
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(engine.process_due_escalations) for _ in range(4)]
        for f in concurrent.futures.as_completed(futures):
            results.extend(f.result())

    # Exactly 1 notification should be dispatched across all threads
    assert len(results) == 1
    notifications = repo.list_notifications(alert_id=alert.alert_id)
    assert len(notifications) == 1


# 9. Patient-scope authorization failures
def test_patient_scope_authorization_failures(tmp_path: Path):
    client = TestClient(app)

    # Token with access restricted only to PC-SYNTH01
    restricted_token = issue_token(
        "restricted-clinician",
        "clinician",
        settings,
        patient_ids=["PC-SYNTH01"],
    )
    headers = {"Authorization": f"Bearer {restricted_token}"}

    # Create an alert for PC-DEMO01
    alert = store.save_quality_alert(make_critical_alert(patient_id="PC-DEMO01"))

    # Attempt to read escalations for PC-DEMO01
    response = client.get(f"/api/v1/alerts/{alert.alert_id}/escalations", headers=headers)
    assert response.status_code == 403
    assert "access denied" in response.json()["error"]["message"].lower()


# 10. Audit-chain integrity after escalation actions
def test_audit_chain_integrity_after_escalation_actions(tmp_path: Path):
    clock = ControllableClock(BASE_TIME)
    repo = SQLiteRepository(tmp_path / "audit_test.db", clock=clock)
    adapter = MockNotificationAdapter(repository=repo, clock=clock)
    engine = EscalationEngine(repository=repo, notification_adapter=adapter, clock=clock)

    alert = repo.save_quality_alert(make_critical_alert(created_at=clock.current))

    clock.advance(minutes=6)
    engine.process_due_escalations()

    clock.advance(minutes=2)
    repo.acknowledge_alert(alert.alert_id, "clinician-demo", "Acknowledged in test")

    integrity = repo.verify_audit_chain()
    assert integrity["valid"] is True
    assert integrity["error"] is None
    assert integrity["checked_records"] > 0


# 11. No further escalation after acknowledgement or resolution
def test_no_further_escalation_after_acknowledgement_or_resolution(tmp_path: Path):
    clock = ControllableClock(BASE_TIME)
    repo = SQLiteRepository(tmp_path / "test.db", clock=clock)
    adapter = MockNotificationAdapter(repository=repo, clock=clock)
    engine = EscalationEngine(repository=repo, notification_adapter=adapter, clock=clock)

    alert = repo.save_quality_alert(make_critical_alert(created_at=clock.current))

    # Escalate to Level 1
    clock.advance(minutes=6)
    engine.process_due_escalations()
    esc = repo.get_alert_escalation(alert.alert_id)
    assert esc.current_level == 1

    # Clinician acknowledges
    clock.advance(minutes=1)
    repo.acknowledge_alert(alert.alert_id, "clinician-demo", "Reviewed")

    # Advance clock past subsequent deadline (+1 hour)
    clock.advance(hours=1)
    dispatched = engine.process_due_escalations()
    assert len(dispatched) == 0

    esc_after = repo.get_alert_escalation(alert.alert_id)
    assert esc_after.status == EscalationStatus.ACKNOWLEDGED_STOPPED
    assert esc_after.current_level == 1
    assert len(esc_after.notifications) == 1  # Still only Level 1


# 12. Dashboard rendering of escalation state via API
def test_dashboard_rendering_of_escalation_state(auth_headers):
    client = TestClient(app)

    alert = store.save_quality_alert(make_critical_alert(patient_id="PC-SYNTH01"))

    # Inspect endpoint
    response = client.get(f"/api/v1/alerts/{alert.alert_id}/escalations", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["alert_id"] == str(alert.alert_id)
    assert data["patient_id"] == "PC-SYNTH01"
    assert data["status"] in ("pending", "escalated")
    assert "current_level" in data
    assert "notifications" in data
    assert "next_due_at" in data


# 13. Escalation policy inspection endpoint
def test_escalation_policy_configuration_inspection(auth_headers):
    client = TestClient(app)
    response = client.get("/api/v1/escalation/policies", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    policies = {p["policy_id"]: p for p in data["items"]}
    assert "policy-critical" in policies
    assert "policy-high" in policies
    assert "policy-default" in policies
    assert policies["policy-critical"]["initial_target_role"] == "community_health_worker"
    assert policies["policy-critical"]["subsequent_target_role"] == "supervisor"
    assert policies["policy-critical"]["is_demo"] is True
