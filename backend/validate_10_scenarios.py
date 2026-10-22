"""
PahaadCare Milestone 4: End-to-End RPM 10-Scenario Validation Script
Validates the complete monitoring workflow against an isolated SQLite test database.

Scenarios validated:
1. Normal readings (accepted, no alerts)
2. Abnormal readings (clinical alerts triggered)
3. Missing measurements (quality alert for missing expected reading)
4. Stale measurements (quality alert for reading outside freshness window)
5. Duplicate event delivery (idempotent deduplication)
6. Conflicting payloads with same event ID (quarantined conflict)
7. Recovery readings following abnormal event (alert remains open until clinician acts)
8. Future-dated measurements (trusted server received_at assigned)
9. Demonstration mode sequence (synthetic vitals with demo boundaries)
10. Offline event queueing and batch synchronization (POST /api/v1/sync/events)
Plus:
- Alert lifecycle (open -> acknowledged -> resolved) & invalid transition rejection
- Audit log hash-chain verification
- Patient-scope authorization enforcement
"""

import json
import os
import sys
import tempfile
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.app.auth import hash_password

_TEMP_DIR = tempfile.TemporaryDirectory(prefix="pahaadcare-m4-")
_DB_PATH = Path(_TEMP_DIR.name) / "validation.sqlite3"
os.environ["PAHAADCARE_DB_PATH"] = str(_DB_PATH)
os.environ["PAHAADCARE_ENV"] = "test"
os.environ["PAHAADCARE_AUTH_SECRET"] = "m4-validation-secret-that-is-at-least-32-chars-long"
os.environ["PAHAADCARE_DEMO_ENABLED"] = "true"
os.environ["PAHAADCARE_DEMO_USERNAME"] = "m4-clinician"
os.environ["PAHAADCARE_DEMO_PASSWORD_HASH"] = hash_password("m4-pass-1234")
os.environ["PAHAADCARE_DEMO_PATIENT_IDS"] = "PC-SYNTH01,PC-DEMO01"

from fastapi.testclient import TestClient
import backend.app.main as main_module
from backend.app.main import app
from backend.app.auth import SecuritySettings, issue_token
from backend.app.engine import MonitoringEngine, ProcessingOutcome
from backend.app.repository import SQLiteRepository
from backend.synthetic_vitals import (
    BASE_TIME,
    SYNTHETIC_PATIENT_ID,
    SyntheticScenario,
    generate_scenario,
)


def to_payload(event):
    return json.loads(event.model_dump_json(exclude_none=True))


def get_db_measurement(repo: SQLiteRepository, event_id: UUID):
    with repo._connection() as conn:
        row = conn.execute("SELECT * FROM measurements WHERE event_id = ?", (str(event_id),)).fetchone()
        return repo._event_from_row(row) if row else None


def run_validation():
    print("=" * 80)
    print("PAHAADCARE RPM MILESTONE 4: 10-SCENARIO VALIDATION RUNNER")
    print("=" * 80)

    # 1. Setup isolated database and environment
    db_path = _DB_PATH
    print(f"[INIT] Isolated test database: {db_path}")

    repo = SQLiteRepository(db_path)
    main_module.store = repo
    test_secret = "m4-validation-secret-that-is-at-least-32-chars-long"
    os.environ["PAHAADCARE_AUTH_SECRET"] = test_secret
    os.environ["PAHAADCARE_ENV"] = "test"
    os.environ["PAHAADCARE_DB_PATH"] = str(db_path)
    main_module.settings = SecuritySettings.from_environment()

    token = issue_token(
        "m4-clinician",
        "clinician",
        main_module.settings,
        patient_ids=(SYNTHETIC_PATIENT_ID, "PC-DEMO01"),
    )
    auth_headers = {"Authorization": f"Bearer {token}"}
    client = TestClient(app)

    clock_time = BASE_TIME + timedelta(minutes=10)
    engine = MonitoringEngine(store=repo, clock=lambda: clock_time)

    results = []

    # -------------------------------------------------------------
    # Scenario 1: Normal readings
    # -------------------------------------------------------------
    seq1 = generate_scenario(SyntheticScenario.NORMAL)
    ev1 = seq1.measurements[0]
    payload1 = to_payload(ev1)
    res1 = client.post("/api/v1/measurements", headers=auth_headers, json=payload1)
    db_measurement1 = get_db_measurement(repo, ev1.event_id)
    passed1 = (
        res1.status_code == 202
        and res1.json()["status"] == "accepted"
        and len(res1.json()["alert_ids"]) == 0
        and db_measurement1 is not None
        and db_measurement1.value == 78.0
    )
    results.append({
        "scenario_id": "1",
        "name": "Normal readings",
        "scenario_enum": SyntheticScenario.NORMAL.value,
        "event_id": str(ev1.event_id),
        "measured_at": ev1.measured_at.isoformat(),
        "input_vital": f"{ev1.measurement_type.value}: {ev1.value} {ev1.unit.value}",
        "expected": "HTTP 202 accepted, 0 alerts created, stored in SQLite",
        "actual": f"HTTP {res1.status_code} {res1.json().get('status')}, {len(res1.json().get('alert_ids', []))} alerts",
        "pass": passed1,
    })

    # -------------------------------------------------------------
    # Scenario 2: Abnormal readings (clinical alerts)
    # -------------------------------------------------------------
    seq2 = generate_scenario(SyntheticScenario.ABNORMAL)
    abnormal_low = seq2.measurements[0]
    abnormal_high = seq2.measurements[1]
    res2_low = client.post("/api/v1/measurements", headers=auth_headers, json=to_payload(abnormal_low))
    res2_high = client.post("/api/v1/measurements", headers=auth_headers, json=to_payload(abnormal_high))
    alerts2 = client.get(f"/api/v1/alerts?patient_id={SYNTHETIC_PATIENT_ID}", headers=auth_headers).json()
    passed2 = (
        res2_low.status_code == 202
        and len(res2_low.json()["alert_ids"]) == 1
        and res2_high.status_code == 202
        and len(res2_high.json()["alert_ids"]) == 1
        and len(alerts2["items"]) >= 2
    )
    results.append({
        "scenario_id": "2",
        "name": "Abnormal readings (clinical alerts)",
        "scenario_enum": SyntheticScenario.ABNORMAL.value,
        "event_id": f"{abnormal_low.event_id}, {abnormal_high.event_id}",
        "measured_at": abnormal_low.measured_at.isoformat(),
        "input_vital": f"low HR {abnormal_low.value} bpm, high HR {abnormal_high.value} bpm",
        "expected": "HTTP 202 accepted, 2 active clinical alerts created in SQLite",
        "actual": f"res_low: {len(res2_low.json().get('alert_ids', []))} alerts, res_high: {len(res2_high.json().get('alert_ids', []))} alerts",
        "pass": passed2,
    })

    # -------------------------------------------------------------
    # Scenario 3: Missing measurements
    # -------------------------------------------------------------
    seq3 = generate_scenario(SyntheticScenario.MISSING)
    missing_event = seq3.missing[0]
    proc_missing = engine.process_missing(missing_event)
    alerts3 = repo.list_alerts(active_only=True)
    missing_alert = next((a for a in alerts3 if a.category.value == "missing_measurement"), None)
    passed3 = (
        proc_missing.outcome == ProcessingOutcome.MISSING
        and len(proc_missing.alerts) == 1
        and missing_alert is not None
        and missing_alert.status.value == "open"
    )
    results.append({
        "scenario_id": "3",
        "name": "Missing measurements",
        "scenario_enum": SyntheticScenario.MISSING.value,
        "event_id": str(missing_event.event_id),
        "measured_at": missing_event.observed_at.isoformat(),
        "input_vital": f"Expected {missing_event.expected_measurement_type.value} within 15min window",
        "expected": "Outcome missing, quality alert created and persisted with status open",
        "actual": f"Outcome {proc_missing.outcome.value}, alert category: {missing_alert.category.value if missing_alert else 'none'}",
        "pass": passed3,
    })

    # -------------------------------------------------------------
    # Scenario 4: Stale measurements
    # -------------------------------------------------------------
    seq4 = generate_scenario(SyntheticScenario.STALE)
    stale_event = seq4.measurements[0]
    proc_stale = engine.process_measurement(stale_event)
    alerts4 = repo.list_alerts()
    stale_alert = next((a for a in alerts4 if a.category.value == "stale_reading"), None)
    passed4 = (
        proc_stale.outcome == ProcessingOutcome.STALE
        and proc_stale.reason == "measurement_timestamp_outside_demo_freshness_window"
        and stale_alert is not None
    )
    results.append({
        "scenario_id": "4",
        "name": "Stale measurements",
        "scenario_enum": SyntheticScenario.STALE.value,
        "event_id": str(stale_event.event_id),
        "measured_at": stale_event.measured_at.isoformat(),
        "input_vital": f"{stale_event.measurement_type.value}: {stale_event.value} measured 2h prior to clock",
        "expected": "Outcome stale, stale_reading quality alert generated",
        "actual": f"Outcome {proc_stale.outcome.value}, reason: {proc_stale.reason}",
        "pass": passed4,
    })

    # -------------------------------------------------------------
    # Scenario 5: Duplicate event delivery
    # -------------------------------------------------------------
    seq5 = generate_scenario(SyntheticScenario.DUPLICATE)
    ev5_first = seq5.measurements[0]
    ev5_dup = seq5.measurements[1]
    res5_first = client.post("/api/v1/measurements", headers=auth_headers, json=to_payload(ev5_first))
    res5_dup = client.post("/api/v1/measurements", headers=auth_headers, json=to_payload(ev5_dup))
    count5 = repo.measurement_count()
    passed5 = (
        res5_first.status_code == 202
        and res5_first.json()["status"] == "accepted"
        and res5_dup.status_code == 200
        and res5_dup.json()["status"] == "duplicate"
        and res5_dup.json()["received_at"] == res5_first.json()["received_at"]
    )
    results.append({
        "scenario_id": "5",
        "name": "Duplicate event delivery",
        "scenario_enum": SyntheticScenario.DUPLICATE.value,
        "event_id": str(ev5_first.event_id),
        "measured_at": ev5_first.measured_at.isoformat(),
        "input_vital": f"{ev5_first.measurement_type.value}: {ev5_first.value} (submitted twice identically)",
        "expected": "First attempt HTTP 202 accepted; retry returns HTTP 200 duplicate with original timestamp",
        "actual": f"1st: HTTP {res5_first.status_code} {res5_first.json().get('status')}; 2nd: HTTP {res5_dup.status_code} {res5_dup.json().get('status')}",
        "pass": passed5,
    })

    # -------------------------------------------------------------
    # Scenario 6: Conflicting payloads with same event ID
    # -------------------------------------------------------------
    seq6 = generate_scenario(SyntheticScenario.CONFLICT)
    ev6_orig = seq6.measurements[0]
    ev6_conflict = seq6.measurements[1]
    res6_orig = client.post("/api/v1/measurements", headers=auth_headers, json=to_payload(ev6_orig))
    res6_conflict = client.post("/api/v1/measurements", headers=auth_headers, json=to_payload(ev6_conflict))
    persisted6 = get_db_measurement(repo, ev6_orig.event_id)
    passed6 = (
        res6_orig.status_code == 202
        and res6_conflict.status_code == 409
        and res6_conflict.json()["error"]["code"] == "event_id_conflict"
        and persisted6 is not None
        and persisted6.value == ev6_orig.value
    )
    results.append({
        "scenario_id": "6",
        "name": "Conflicting payloads with same event ID",
        "scenario_enum": SyntheticScenario.CONFLICT.value,
        "event_id": str(ev6_orig.event_id),
        "measured_at": ev6_orig.measured_at.isoformat(),
        "input_vital": f"Orig value: {ev6_orig.value} bpm vs Altered value: {ev6_conflict.value} bpm",
        "expected": "HTTP 409 event_id_conflict, original record preserved without overwrite",
        "actual": f"Conflict code HTTP {res6_conflict.status_code} {res6_conflict.json().get('error', {}).get('code')}, persisted value={persisted6.value if persisted6 else 'none'}",
        "pass": passed6,
    })

    # -------------------------------------------------------------
    # Scenario 7: Recovery readings following abnormal event
    # -------------------------------------------------------------
    seq7 = generate_scenario(SyntheticScenario.RECOVERY)
    ev7_abnormal = seq7.measurements[0]
    ev7_normal = seq7.measurements[1]
    res7_abnormal = client.post("/api/v1/measurements", headers=auth_headers, json=to_payload(ev7_abnormal))
    alert7_id = UUID(res7_abnormal.json()["alert_ids"][0])
    # Submit recovery reading
    res7_normal = client.post("/api/v1/measurements", headers=auth_headers, json=to_payload(ev7_normal))
    # Check alert status: MUST REMAIN OPEN (normal reading does not auto-resolve alert)
    alert7 = repo.get_alert(alert7_id)
    passed7 = (
        res7_abnormal.status_code == 202
        and len(res7_abnormal.json()["alert_ids"]) == 1
        and res7_normal.status_code == 202
        and len(res7_normal.json()["alert_ids"]) == 0
        and alert7.status.value == "open"
    )
    results.append({
        "scenario_id": "7",
        "name": "Recovery readings following abnormal event",
        "scenario_enum": SyntheticScenario.RECOVERY.value,
        "event_id": f"{ev7_abnormal.event_id} -> {ev7_normal.event_id}",
        "measured_at": ev7_normal.measured_at.isoformat(),
        "input_vital": f"Abnormal {ev7_abnormal.value} bpm followed by Normal {ev7_normal.value} bpm",
        "expected": "Recovery reading accepted; prior clinical alert remains open for explicit clinician review",
        "actual": f"Normal reading accepted (0 alerts); prior alert status remains '{alert7.status.value}'",
        "pass": passed7,
    })

    # -------------------------------------------------------------
    # Scenario 8: Future-dated measurements
    # -------------------------------------------------------------
    seq8 = generate_scenario(SyntheticScenario.FUTURE)
    ev8 = seq8.measurements[0]
    res8 = client.post("/api/v1/measurements", headers=auth_headers, json=to_payload(ev8))
    persisted8 = get_db_measurement(repo, ev8.event_id)
    passed8 = (
        res8.status_code == 202
        and persisted8 is not None
        and persisted8.received_at is not None
        and persisted8.received_at < ev8.measured_at
    )
    results.append({
        "scenario_id": "8",
        "name": "Future-dated measurements and timestamp validation",
        "scenario_enum": SyntheticScenario.FUTURE.value,
        "event_id": str(ev8.event_id),
        "measured_at": ev8.measured_at.isoformat(),
        "input_vital": f"measured_at +1 day in future ({ev8.measured_at.isoformat()})",
        "expected": "Accepted under clock-skew policy; server assigns authoritative trusted received_at",
        "actual": f"HTTP {res8.status_code}, server received_at={persisted8.received_at.isoformat() if persisted8 else 'none'}",
        "pass": passed8,
    })

    # -------------------------------------------------------------
    # Scenario 9: Demonstration mode sequence
    # -------------------------------------------------------------
    seq9 = generate_scenario(SyntheticScenario.DEMO)
    demo_accepted = 0
    demo_alerts = 0
    for m in seq9.measurements:
        r = client.post("/api/v1/measurements", headers=auth_headers, json=to_payload(m))
        if r.status_code in (200, 202):
            demo_accepted += 1
            demo_alerts += len(r.json().get("alert_ids", []))
    passed9 = (demo_accepted == 10 and demo_alerts >= 4)
    results.append({
        "scenario_id": "9",
        "name": "Demonstration mode and simulated boundaries",
        "scenario_enum": SyntheticScenario.DEMO.value,
        "event_id": f"{seq9.measurements[0].event_id} ... ({len(seq9.measurements)} events)",
        "measured_at": seq9.measurements[0].measured_at.isoformat(),
        "input_vital": "10 multi-vital measurements (HR, SpO2, Temp, BP) with demo thresholds",
        "expected": "All 10 demo measurements accepted, triggers demo alerts, all marked is_simulated: true",
        "actual": f"Accepted: {demo_accepted}/10, Alerts triggered: {demo_alerts}",
        "pass": passed9,
    })

    # -------------------------------------------------------------
    # Scenario 10: Offline event queueing and synchronization
    # -------------------------------------------------------------
    seq10 = generate_scenario(SyntheticScenario.OFFLINE_SYNC)
    ev10 = seq10.measurements[0]
    payload10 = to_payload(ev10)
    # 1. Batch sync
    res10_batch = client.post("/api/v1/sync/events", headers=auth_headers, json={"events": [payload10]})
    # 2. Duplicate retry of batch sync
    res10_dup = client.post("/api/v1/sync/events", headers=auth_headers, json={"events": [payload10]})
    # 3. Check measurement history on server
    history10 = client.get(f"/api/v1/patients/{SYNTHETIC_PATIENT_ID}/measurements", headers=auth_headers).json()
    item_in_history = next((item for item in history10["items"] if item["event_id"] == str(ev10.event_id)), None)
    passed10 = (
        res10_batch.status_code == 200
        and res10_batch.json()["summary"]["accepted"] == 1
        and res10_dup.status_code == 200
        and res10_dup.json()["summary"]["duplicate"] == 1
        and item_in_history is not None
        and item_in_history["value"] == 82.5
    )
    results.append({
        "scenario_id": "10",
        "name": "Offline queueing and synchronization after reconnection",
        "scenario_enum": SyntheticScenario.OFFLINE_SYNC.value,
        "event_id": str(ev10.event_id),
        "measured_at": ev10.measured_at.isoformat(),
        "input_vital": f"{ev10.measurement_type.value}: {ev10.value} bpm",
        "expected": "Batch sync returns accepted; retry returns duplicate; reading appears in authoritative history",
        "actual": f"Sync accepted={res10_batch.json()['summary']['accepted']}, dup={res10_dup.json()['summary']['duplicate']}, present in history={item_in_history is not None}",
        "pass": passed10,
    })

    # -------------------------------------------------------------
    # Step 4: Alert Lifecycle & Cryptographic Audit Chain Validation
    # -------------------------------------------------------------
    print("\n[STEP 4] Validating Alert Lifecycle and Auditability...")
    active_alerts = repo.list_alerts(active_only=True)
    target_alert = active_alerts[0]
    target_id = target_alert.alert_id

    # Test invalid transition: open -> resolved (MUST FAIL WITH 409)
    res_inv = client.post(
        f"/api/v1/alerts/{target_id}/resolve",
        headers=auth_headers,
        json={"actor_id": "m4-clinician", "resolution_code": "premature_resolve"},
    )
    invalid_transition_rejected = (res_inv.status_code == 409)

    # Valid transition: open -> acknowledged
    res_ack = client.post(
        f"/api/v1/alerts/{target_id}/acknowledge",
        headers=auth_headers,
        json={"actor_id": "m4-clinician", "note": "Patient being contacted"},
    )
    ack_success = (res_ack.status_code == 200 and res_ack.json()["status"] == "acknowledged")

    # Repeated acknowledge: idempotent success
    res_ack_dup = client.post(
        f"/api/v1/alerts/{target_id}/acknowledge",
        headers=auth_headers,
        json={"actor_id": "m4-clinician"},
    )
    ack_dup_success = (res_ack_dup.status_code == 200 and res_ack_dup.json()["status"] == "acknowledged")

    # Valid transition: acknowledged -> resolved
    res_res = client.post(
        f"/api/v1/alerts/{target_id}/resolve",
        headers=auth_headers,
        json={"actor_id": "m4-clinician", "resolution_code": "vitals_stabilized", "note": "Patient rested"},
    )
    res_success = (res_res.status_code == 200 and res_res.json()["status"] == "resolved")

    # Audit chain cryptographic check
    audit_check = repo.verify_audit_chain()
    audit_valid = audit_check["valid"] and audit_check["checked_records"] >= 3

    # -------------------------------------------------------------
    # Step 5: Patient Scope Authorization Validation
    # -------------------------------------------------------------
    print("\n[STEP 5] Validating Patient Scope Authorization...")
    # Attempt to access an unauthorized patient ID
    res_unauth = client.get("/api/v1/patients/PC-FORBIDDEN/measurements", headers=auth_headers)
    scope_enforced = (res_unauth.status_code == 403)

    # -------------------------------------------------------------
    # Output Results Table
    # -------------------------------------------------------------
    print("\n" + "-" * 80)
    print(f"{'#':<3} | {'Scenario Name':<38} | {'Status':<8} | {'Diagnostic'}")
    print("-" * 80)
    for r in results:
        status_str = "PASS" if r["pass"] else "FAIL"
        print(f"{r['scenario_id']:<3} | {r['name']:<38} | {status_str:<8} | {r['actual']}")
    print("-" * 80)

    print(f"\n[LIFECYCLE] Invalid transition rejection (open->resolved): {'PASS' if invalid_transition_rejected else 'FAIL'}")
    print(f"[LIFECYCLE] Acknowledge alert (open->acknowledged):       {'PASS' if ack_success else 'FAIL'}")
    print(f"[LIFECYCLE] Idempotent re-acknowledge:                     {'PASS' if ack_dup_success else 'FAIL'}")
    print(f"[LIFECYCLE] Resolve alert (acknowledged->resolved):       {'PASS' if res_success else 'FAIL'}")
    print(f"[AUDIT]     Audit hash chain integrity ({audit_check['checked_records']} records):    {'PASS' if audit_valid else 'FAIL'}")
    print(f"[SECURITY]  Cross-patient scope denial (403 Forbidden):    {'PASS' if scope_enforced else 'FAIL'}")

    all_passed = (
        all(r["pass"] for r in results)
        and invalid_transition_rejected
        and ack_success
        and ack_dup_success
        and res_success
        and audit_valid
        and scope_enforced
    )

    print("\n" + "=" * 80)
    if all_passed:
        print("ALL 10 SCENARIOS, LIFECYCLE MUTATIONS, AUDIT CHAINS, AND SECURITY CHECKS PASSED!")
    else:
        print("VALIDATION FAILED ON ONE OR MORE CHECKS.")
    print("=" * 80)

    _TEMP_DIR.cleanup()
    return 0 if all_passed else 1, results, audit_check


if __name__ == "__main__":
    code, _, _ = run_validation()
    sys.exit(code)
