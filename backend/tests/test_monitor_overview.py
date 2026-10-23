from datetime import datetime, timedelta, timezone
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient

from backend.app.auth import issue_token
from backend.app.main import app, settings
from backend.app.models import Alert, AlertCategory, AlertSeverity, AlertStatus, MeasurementEvent, MeasurementType, MeasurementUnit, EventSource
from backend.app.repository import SQLiteRepository


@pytest.fixture
def test_env(tmp_path, monkeypatch):
    import backend.app.main as main_module
    db_path = tmp_path / "overview_test.sqlite3"
    test_clock = lambda: datetime(2026, 10, 22, 12, 0, tzinfo=timezone.utc)
    repo = SQLiteRepository(db_path, clock=test_clock)
    monkeypatch.setattr(main_module, "store", repo)
    return {"repo": repo, "clock": test_clock}


def test_monitor_overview_metrics_and_scope(test_env):
    repo = test_env["repo"]
    client = TestClient(app)

    # 1. Insert known measurements for PC-SYNTH01 (recent heart rate, stale spo2)
    recent_time = datetime(2026, 10, 22, 11, 55, tzinfo=timezone.utc) # 5m ago (recent)
    stale_time = datetime(2026, 10, 22, 11, 30, tzinfo=timezone.utc)  # 30m ago (stale > 15m)

    ev_hr = MeasurementEvent(
        schema_version="1.0",
        event_id=uuid4(),
        patient_id="PC-SYNTH01",
        measurement_type=MeasurementType.HEART_RATE,
        value=74.0,
        unit=MeasurementUnit.BEATS_PER_MINUTE,
        measured_at=recent_time,
        source=EventSource.PATIENT,
        is_simulated=True,
    )
    repo.submit(ev_hr)

    ev_spo2 = MeasurementEvent(
        schema_version="1.0",
        event_id=uuid4(),
        patient_id="PC-SYNTH01",
        measurement_type=MeasurementType.OXYGEN_SATURATION,
        value=97.0,
        unit=MeasurementUnit.PERCENT,
        measured_at=stale_time,
        source=EventSource.PATIENT,
        is_simulated=True,
    )
    repo.submit(ev_spo2)

    # 2. Insert active critical alert for PC-SYNTH01
    alert_critical = Alert(
        schema_version="1.0",
        alert_id=uuid4(),
        patient_id="PC-SYNTH01",
        related_event_id=ev_hr.event_id,
        category=AlertCategory.ABNORMAL_MEASUREMENT,
        severity=AlertSeverity.CRITICAL,
        reason={"code": "hr_critical_high", "message": "Critical tachycardia", "rule_version": "1.0"},
        created_at=recent_time,
        status=AlertStatus.OPEN,
    )
    repo.save_quality_alert(alert_critical)

    # 3. Request overview with clinician token scoped to PC-SYNTH01
    clinician_token = issue_token("clinician-bob", "clinician", settings, patient_ids=("PC-SYNTH01",))
    res = client.get("/api/v1/monitor/overview", headers={"Authorization": f"Bearer {clinician_token}"})
    assert res.status_code == 200
    data = res.json()

    summary = data["summary"]
    assert summary["total_patients"] == 1
    assert summary["active_alerts_count"] == 1
    assert summary["active_alerts_by_severity"]["critical"] == 1
    assert summary["active_alerts_by_severity"]["high"] == 0
    assert summary["patients_with_stale_measurements"] == 1 # 1 distinct patient has stale vital
    assert summary["patients_with_missing_measurements"] == 1 # missing temp, sys, dia
    assert summary["patients_requiring_review"] == 1

    patients = data["patients"]
    assert len(patients) == 1
    p = patients[0]
    assert p["patient_id"] == "PC-SYNTH01"
    assert p["highest_severity"] == "critical"
    assert p["monitoring_status"] == "critical_attention"

    # Verify vitals have independent timestamps and freshness states
    vitals = p["latest_measurements"]
    assert vitals["heart_rate"]["value"] == 74.0
    assert vitals["heart_rate"]["freshness"] == "recent"
    assert vitals["heart_rate"]["measured_at"] is not None

    assert vitals["oxygen_saturation"]["value"] == 97.0
    assert vitals["oxygen_saturation"]["freshness"] == "stale"
    assert vitals["oxygen_saturation"]["measured_at"] is not None

    # Missing vitals must not fabricate 0
    assert vitals["body_temperature"]["value"] is None
    assert vitals["body_temperature"]["freshness"] == "missing"
    assert vitals["body_temperature"]["measured_at"] is None

    # 4. Request with admin token (sees both PC-SYNTH01 and PC-DEMO01)
    admin_token = issue_token("admin-lead", "administrator", settings, patient_ids=())
    res_admin = client.get("/api/v1/monitor/overview", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_admin.status_code == 200
    data_admin = res_admin.json()
    assert data_admin["summary"]["total_patients"] == 2

    # 5. Verify /api/v1/doctor/census alias returns equivalent result
    res_census = client.get("/api/v1/doctor/census", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_census.status_code == 200
    assert res_census.json()["summary"]["total_patients"] == 2
