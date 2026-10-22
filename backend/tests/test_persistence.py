from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sqlite3
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app.engine import MonitoringEngine, ProcessingOutcome
from backend.app.main import app
from backend.app.models import MeasurementEvent
from backend.app.repository import (
    AlertNotFound,
    InvalidAlertTransition,
    SQLiteRepository,
)
from backend.synthetic_vitals import BASE_TIME, generate_scenario


class FixedClock:
    def __init__(self, value: datetime) -> None:
        self.value = value

    def __call__(self) -> datetime:
        return self.value


def abnormal_event():
    return generate_scenario("abnormal").measurements[0]


def test_database_initialization_creates_schema(tmp_path: Path) -> None:
    database_path = tmp_path / "rpm.sqlite3"
    repository = SQLiteRepository(database_path)

    assert database_path.exists()
    assert repository.measurement_count() == 0
    assert repository.alert_count() == 0


def test_schema_migration_adds_version_and_audit_table_without_resetting_data(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "rpm.sqlite3"
    first = SQLiteRepository(database_path, clock=FixedClock(BASE_TIME))
    first.submit(abnormal_event())
    with sqlite3.connect(database_path) as connection:
        connection.execute("DROP TABLE schema_migrations")
        connection.execute("DROP TABLE audit_log")

    migrated = SQLiteRepository(database_path, clock=FixedClock(BASE_TIME))
    with sqlite3.connect(database_path) as connection:
        versions = [row[0] for row in connection.execute("SELECT version FROM schema_migrations ORDER BY version")]
        audit_exists = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'audit_log'"
        ).fetchone()

    assert migrated.measurement_count() == 1
    assert versions == [1, 2, 3]
    assert audit_exists is not None


def test_measurement_and_alert_round_trip(tmp_path: Path) -> None:
    repository = SQLiteRepository(tmp_path / "rpm.sqlite3", clock=FixedClock(BASE_TIME))
    event = abnormal_event()

    submission = repository.submit(event)
    restarted = SQLiteRepository(repository.database_path, clock=FixedClock(BASE_TIME))
    duplicate = restarted.submit(event)

    assert submission.status == "accepted"
    assert restarted.measurement_count() == 1
    assert restarted.alert_count() == 1
    assert duplicate.status == "duplicate"
    assert duplicate.event.measured_at == event.measured_at
    assert duplicate.event.received_at == submission.received_at
    assert duplicate.alerts[0].alert_id == submission.alerts[0].alert_id


def test_payload_identity_ignores_client_received_at_but_preserves_measurement_time(
    tmp_path: Path,
) -> None:
    repository = SQLiteRepository(tmp_path / "rpm.sqlite3", clock=FixedClock(BASE_TIME))
    first = MeasurementEvent.model_validate(
        {
            **abnormal_event().model_dump(mode="json", exclude_none=True),
            "received_at": "2020-01-01T00:00:00Z",
        }
    )
    second = first.model_copy(update={"received_at": datetime(2024, 1, 1, tzinfo=timezone.utc)})

    repository.submit(first)
    repeated = repository.submit(second)

    assert repeated.status == "duplicate"
    assert repeated.event.measured_at == first.measured_at
    assert repository.measurement_count() == 1


def test_conflicting_event_id_is_restart_safe(tmp_path: Path) -> None:
    database_path = tmp_path / "rpm.sqlite3"
    first_repository = SQLiteRepository(database_path, clock=FixedClock(BASE_TIME))
    first_repository.submit(abnormal_event())

    conflicting_repository = SQLiteRepository(database_path, clock=FixedClock(BASE_TIME))
    conflicting = abnormal_event().model_copy(update={"value": 36})

    with pytest.raises(ValueError, match="event_id_conflict"):
        conflicting_repository.submit(conflicting)
    assert conflicting_repository.measurement_count() == 1


def test_failed_processing_rolls_back_measurement_and_alert(tmp_path: Path) -> None:
    repository = SQLiteRepository(
        tmp_path / "rpm.sqlite3",
        clock=lambda: datetime(2026, 10, 22, 6, 0),
    )

    with pytest.raises(ValueError, match="timezone-aware"):
        repository.submit(abnormal_event())

    assert repository.measurement_count() == 0
    assert repository.alert_count() == 0


def test_concurrent_duplicate_submissions_create_one_record(tmp_path: Path) -> None:
    database_path = tmp_path / "rpm.sqlite3"
    event = abnormal_event()

    def submit_once() -> str:
        repository = SQLiteRepository(database_path, clock=FixedClock(BASE_TIME))
        return repository.submit(event).status

    with ThreadPoolExecutor(max_workers=6) as executor:
        statuses = list(executor.map(lambda _: submit_once(), range(6)))

    assert statuses.count("accepted") == 1
    assert statuses.count("duplicate") == 5
    repository = SQLiteRepository(database_path)
    assert repository.measurement_count() == 1
    assert repository.alert_count() == 1


def test_alert_acknowledgement_and_resolution_persist_after_restart(tmp_path: Path) -> None:
    database_path = tmp_path / "rpm.sqlite3"
    repository = SQLiteRepository(database_path, clock=FixedClock(BASE_TIME))
    alert = repository.submit(abnormal_event()).alerts[0]

    acknowledged = repository.acknowledge_alert(alert.alert_id, "clinician-demo", "Reviewed")
    restarted = SQLiteRepository(database_path, clock=FixedClock(BASE_TIME + timedelta(minutes=1)))
    persisted = restarted.get_alert(alert.alert_id)
    resolved = restarted.resolve_alert(
        alert.alert_id,
        "clinician-demo",
        "follow_up_complete",
        "Demonstration resolution",
    )
    resolved_after_restart = SQLiteRepository(database_path).get_alert(alert.alert_id)

    assert acknowledged.status.value == "acknowledged"
    assert persisted.status.value == "acknowledged"
    assert persisted.acknowledgement.acknowledged_by == "clinician-demo"
    assert resolved.status.value == "resolved"
    assert resolved_after_restart.resolution.resolution_code == "follow_up_complete"
    audit = restarted.list_audit(alert.alert_id)
    assert [row["action"] for row in audit] == ["alert_acknowledge", "alert_resolve"]
    assert all(row["success"] == 1 for row in audit)


def test_repeated_lifecycle_requests_are_deterministic(tmp_path: Path) -> None:
    repository = SQLiteRepository(tmp_path / "rpm.sqlite3", clock=FixedClock(BASE_TIME))
    alert = repository.submit(abnormal_event()).alerts[0]

    first_ack = repository.acknowledge_alert(alert.alert_id, "clinician-demo")
    second_ack = repository.acknowledge_alert(alert.alert_id, "different-actor")
    first_resolution = repository.resolve_alert(alert.alert_id, "clinician-demo", "complete")
    second_resolution = repository.resolve_alert(alert.alert_id, "different-actor", "different")

    assert second_ack.acknowledgement.acknowledged_by == first_ack.acknowledgement.acknowledged_by
    assert second_resolution.resolution.resolution_code == first_resolution.resolution.resolution_code


def test_invalid_transitions_and_unknown_alerts(tmp_path: Path) -> None:
    repository = SQLiteRepository(tmp_path / "rpm.sqlite3", clock=FixedClock(BASE_TIME))
    alert = repository.submit(abnormal_event()).alerts[0]

    with pytest.raises(InvalidAlertTransition):
        repository.resolve_alert(alert.alert_id, "clinician-demo", "too_soon")
    repository.acknowledge_alert(alert.alert_id, "clinician-demo")
    repository.resolve_alert(alert.alert_id, "clinician-demo", "complete")
    with pytest.raises(InvalidAlertTransition):
        repository.acknowledge_alert(alert.alert_id, "clinician-demo")

    unknown_id = uuid4()
    with pytest.raises(AlertNotFound):
        repository.get_alert(unknown_id)
    with pytest.raises(AlertNotFound):
        repository.acknowledge_alert(unknown_id, "clinician-demo")
    failed_audit = repository.list_audit(unknown_id)
    assert failed_audit[-1]["success"] == 0


def test_new_abnormal_event_after_resolution_gets_new_alert(tmp_path: Path) -> None:
    repository = SQLiteRepository(tmp_path / "rpm.sqlite3", clock=FixedClock(BASE_TIME))
    first = repository.submit(abnormal_event()).alerts[0]
    repository.acknowledge_alert(first.alert_id, "clinician-demo")
    repository.resolve_alert(first.alert_id, "clinician-demo", "complete")

    second_event = abnormal_event().model_copy(update={"event_id": uuid4()})
    second = repository.submit(second_event).alerts[0]

    assert second.alert_id != first.alert_id
    assert repository.alert_count() == 2


def test_engine_missing_and_stale_alerts_are_persisted(tmp_path: Path) -> None:
    database_path = tmp_path / "rpm.sqlite3"
    clock = FixedClock(BASE_TIME)
    repository = SQLiteRepository(database_path, clock=clock)
    engine = MonitoringEngine(store=repository, clock=clock)

    missing_result = engine.process_missing(generate_scenario("missing").missing[0])
    stale_result = engine.process_measurement(generate_scenario("stale").measurements[0])
    restarted = SQLiteRepository(database_path)

    assert missing_result.outcome is ProcessingOutcome.MISSING
    assert stale_result.outcome is ProcessingOutcome.STALE
    assert restarted.alert_count() == 2
    assert {alert.category.value for alert in restarted.list_alerts()} == {
        "missing_measurement",
        "stale_reading",
    }


def test_api_lifecycle_endpoints_use_existing_response_contract(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, auth_headers
) -> None:
    import backend.app.main as main_module

    monkeypatch.setattr(
        main_module,
        "store",
        SQLiteRepository(tmp_path / "api.sqlite3", clock=FixedClock(BASE_TIME)),
    )
    client = TestClient(app)
    event = abnormal_event().model_dump(mode="json", exclude_none=True)
    accepted = client.post("/api/v1/measurements", json=event, headers=auth_headers)
    alert_id = accepted.json()["alert_ids"][0]

    acknowledged = client.post(
        f"/api/v1/alerts/{alert_id}/acknowledge",
        json={"actor_id": "clinician-demo", "note": "Reviewed"},
        headers=auth_headers,
    )
    resolved = client.post(
        f"/api/v1/alerts/{alert_id}/resolve",
        json={"actor_id": "clinician-demo", "resolution_code": "complete"},
        headers=auth_headers,
    )
    invalid = client.post(
        f"/api/v1/alerts/{alert_id}/resolve",
        json={"actor_id": "clinician-demo", "resolution_code": "again"},
        headers=auth_headers,
    )
    unknown = client.post(
        f"/api/v1/alerts/{uuid4()}/acknowledge",
        json={"actor_id": "clinician-demo"},
        headers=auth_headers,
    )

    assert accepted.status_code == 202
    assert acknowledged.status_code == 200
    assert acknowledged.json()["status"] == "acknowledged"
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "resolved"
    assert invalid.status_code == 200
    assert invalid.json()["status"] == "resolved"
    assert unknown.status_code == 404
