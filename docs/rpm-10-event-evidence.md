# PahaadCare RPM — Milestone 4: End-to-End Validation and 10-Scenario Evidence

Document Version: `1.0.0`  
Validation Date: `2026-10-22`  
Baseline Commit: `be043f8f3078b97251d52bdd01dea92db630263e`  
Repository: `https://github.com/HARSHSINGH-17/pahadcare.git`  
Target Environment: Windows / Node.js v24.12.0 / Python 3.14.2 / SQLite3 / Edge (Chromium Headless)  

> [!IMPORTANT]
> **Clinical Safety & Non-Clinical Disclaimer:**
> PahaadCare is a rural-healthcare remote patient monitoring prototype developed for hackathon demonstration. All patient records, physiological observations, thresholds, and alert notifications are **synthetic** (`is_simulated: true`, `source: "simulator"`). Thresholds are software-demonstration defaults and are **not clinically validated treatment criteria**. Do not enter real patient data.

---

## 1. Test Environment & Verification Baseline

| Parameter | Specification |
|---|---|
| Operating System | Windows 11 (win32) |
| Python Environment | Python 3.14.2 (`.venv`), pytest 8.4.2, FastAPI, Pydantic v2.14, SQLite 3 |
| Frontend Runtime | Node.js v24.12.0, Vite 6.4.4, React 18.3.1 |
| Browser Engine | Playwright 1.58.0 (Microsoft Edge / Chromium headless channel) |
| Database Engine | SQLite 3 (`backend/data/pahaadcare.sqlite3`, isolated test DBs via `tempfile`) |
| Client Storage | Browser IndexedDB (`pahaadcare_rpm_offline_db`, version 1) with `MemoryStore` fallback |
| Primary Synthetic Patient | `PC-SYNTH01` (Synthetic Patient 01) |
| Deterministic Clock Base | `2026-10-22T06:00:00Z` (`BASE_TIME`) |

---

## 2. 10-Scenario Reproducible Validation Matrix

The following scenarios are derived from the versioned synthetic vitals generator (`backend/synthetic_vitals.py`), evaluated through the monitoring engine (`backend/app/engine.py`), persisted to SQLite (`backend/app/repository.py`), and exposed through the authenticated REST API endpoints.

| # | Scenario Name | Synthetic Event ID | Input Payload & Timestamp | Expected Engine & Alert Decision | Expected Persistence & Idempotency | Expected API & Sync Response | Actual Outcome | Status |
|---|---|---|---|---|---|---|---|---|
| **1** | **Normal readings** | `38e932b6-8f02-5528-821c-f0b0372e3dbf` | `heart_rate: 78.0 bpm`, `2026-10-22T06:00:00Z` | `outcome: accepted`, 0 alerts triggered | Stored in SQLite `measurements` table with canonical payload hash | HTTP 202 `accepted`, `alert_ids: []` | HTTP 202 accepted, 0 alerts, persisted value 78.0 bpm | **PASS** |
| **2** | **Abnormal readings (clinical alerts)** | `bca08135-e0c5-5015-a4cb-b26e174764d7`<br>`c9112212-1389-5a37-bd61-8c8583c33e43` | Low HR `35.0 bpm` (`06:01Z`)<br>High HR `135.0 bpm` (`06:02Z`) | `outcome: accepted`, 2 clinical alerts created (`heart_rate_low`, `heart_rate_high`) | 2 measurements and 2 alerts stored in SQLite with `status: open` | HTTP 202 for each with 1 alert ID per response; listed in `GET /api/v1/alerts` | res_low: 1 alert, res_high: 1 alert; both present in `alerts` census | **PASS** |
| **3** | **Missing measurements** | `aea6fd86-7f00-53ed-8476-237dc9ad6c97` | Missing `oxygen_saturation` within expected 15m window | `outcome: missing`, quality alert `missing_measurement` generated | Quality alert persisted in SQLite `alerts` table with `status: open` | Exposes open alert on `GET /api/v1/alerts`; dashboard displays missing vital warning | Outcome `missing`, quality alert category `missing_measurement` open | **PASS** |
| **4** | **Stale measurements** | `aea23f28-b548-531f-b5dd-458078debb7f` | `heart_rate: 78.0 bpm` measured 2 hours prior to clock | `outcome: stale`, quality alert `stale_reading` generated | Measurement persisted; quality alert persisted in SQLite | Dashboard flags row with `Stale` badge; alert listed in `alerts` endpoint | Outcome `stale`, reason `measurement_timestamp_outside_demo_freshness_window` | **PASS** |
| **5** | **Duplicate event delivery** | `821fc04a-c0cf-5e98-9c27-008b93621dbe` | `heart_rate: 78.0 bpm` submitted twice identically | 1st: `accepted`; 2nd: `duplicate` | Single record in `measurements` table; primary key prevents duplicate row | 1st: HTTP 202 `accepted`; 2nd: HTTP 200 `duplicate` with original `received_at` | 1st: HTTP 202 accepted; 2nd: HTTP 200 duplicate; received_at matches | **PASS** |
| **6** | **Conflicting payloads with same event ID** | `e954d0a3-3403-5a9a-8b90-d62054600134` | Orig: `78.0 bpm`<br>Altered: `79.0 bpm` | 1st: `accepted`; 2nd: `conflict` (`event_id_conflict`) | Original payload preserved; conflicting payload rejected without overwrite | 1st: HTTP 202 `accepted`; 2nd: HTTP 409 `event_id_conflict` (or `status: conflict` in batch sync) | HTTP 409 `event_id_conflict`, persisted value remains 78.0 bpm | **PASS** |
| **7** | **Recovery readings following abnormal event** | `4526985f-5bd5-5d84-acf9-4d4d0bec7550`<br>`549b71a8-48e6-51e3-a5a9-fe00ecda4de7` | Abnormal `135.0 bpm` (`06:00Z`) followed by Normal `78.0 bpm` (`06:01Z`) | Both accepted. Normal reading does **not** auto-resolve prior alert | Both measurements stored; prior alert remains `open` until clinician resolves | Normal reading returns 0 alerts; prior alert retains `open` status in database | Normal accepted (0 alerts); prior alert status remains `open` | **PASS** |
| **8** | **Future-dated measurements** | `22dedbb3-3d17-5bce-80ff-6dbf694811c7` | `heart_rate: 78.0 bpm` measured 24h into future | `outcome: accepted` under clock-skew policy | Measurement stored; server assigns trusted local `received_at` | HTTP 202 `accepted`; sorting preserves `measured_at DESC` order | HTTP 202 accepted; server received_at assigned (`2026-10-22T...`) | **PASS** |
| **9** | **Demonstration mode sequence** | `bcaa22ab-9700-5e4d-bbc6-0e58162f6b7f` ... (10 vitals + 1 missing) | 10 multi-vital events (HR, SpO2, Temp, BP) across 10 minutes | Evaluates synthetic thresholds; all events carry `is_simulated: true` | Persists 10 measurements and 4 demo alerts in SQLite | Dashboard loads complete synthetic census with demo badges | Accepted: 10/10 measurements, 4 demo alerts triggered | **PASS** |
| **10** | **Offline queueing & batch sync** | `df41c075-fd0a-506b-9656-4ddcc81f9143` | `heart_rate: 82.5 bpm` captured offline | Stored in IndexedDB; batch dispatched via `POST /api/v1/sync/events` | Stored in SQLite upon sync; retry returns `duplicate` without re-insertion | Sync response item `status: accepted`; retry returns `duplicate` | Sync accepted=1, duplicate retry=1, reflected in server history | **PASS** |

---

## 3. Offline-to-Online End-to-End Validation Evidence

The offline-first workflow was exercised end to end through both browser automation ([`backend/tests/test_browser.py`](file:///c:/Users/harsh/Downloads/PahaadCare_Source_Code_Latest/PahaadCare_Source_Code/backend/tests/test_browser.py)) and unit validation:

1. **Local Observation Queueing:**
   - Clinician entered reading (`86.5 bpm`) for patient `PC-SYNTH01` in dashboard simulation panel.
   - Enqueued into IndexedDB (`pahaadcare_rpm_offline_db`) with `status: "pending"`, `attempt_count: 0`.
   - UI sync bar counter immediately updated: `1 queued`.
2. **Tab Reload & Persistence:**
   - Full browser page reload executed (`page.reload()`).
   - IndexedDB opened; `getQueueSummary()` recovered state from disk.
   - UI sync bar verified persistent state: `1 queued`.
3. **Synchronization & Reconnection:**
   - Network connectivity active; clinician triggered `Sync Now`.
   - Single-flight guard locked `isSyncing: true`.
   - Batch of 1 item submitted to `POST /api/v1/sync/events`.
   - Backend returned HTTP 200 with item status `accepted`.
   - Queue updated item to `delivered` (`delivered_at` populated, `status: "delivered"`).
   - UI counter updated: `1 synchronized`, `0 queued`.
4. **Server Reflection & Idempotency:**
   - Opened patient detail panel for `PC-SYNTH01`: reading `86.5 bpm` appeared in authoritative server history.
   - Retrying the batch sync submitted identical event ID: server returned `duplicate`, preventing duplicate database entry.
5. **Partial Batch & Conflict Safety:**
   - Tested batch containing one authorized patient event and one unauthorized patient event: valid event was `accepted`, unauthorized event was `rejected` with error `patient_access_denied`.
   - Tested batch with altered payload on existing event ID: server returned `conflict` (`event_id_conflict`); client quarantined the event and halted retries.
6. **Account Switch / Shift Handover Safety:**
   - Signing out revokes active session token on backend and clears `sessionStorage`.
   - IndexedDB offline queue was **not** deleted, preserving un-synced measurements across clinician shift handovers.

---

## 4. Alert Lifecycle and Auditability Evidence

### State Transition Verification
Tested against the SQLite repository and REST endpoints:

```
[ OPEN ] ──(acknowledge)──> [ ACKNOWLEDGED ] ──(resolve)──> [ RESOLVED ]
   │                                                            ▲
   └───────────────────(direct resolve: 409)───────────────────┘
```

1. **Invalid Transition (`OPEN` → `RESOLVED`):**
   - Attempted direct resolution of open alert without acknowledgment:
     - Request: `POST /api/v1/alerts/{alert_id}/resolve`
     - Response: **HTTP 409 Conflict** (`open alerts must be acknowledged before resolution`).
     - Audit log: Recorded failed audit record (`alert_resolve`, `success: 0`, `reason: "open_alert"`).
2. **Valid Transition (`OPEN` → `ACKNOWLEDGED`):**
   - Clinician submitted acknowledgment with note:
     - Request: `POST /api/v1/alerts/{alert_id}/acknowledge` with `actor_id: "m4-clinician"`, `note: "Patient contacted"`.
     - Response: **HTTP 200 OK**, `status: "acknowledged"`, `acknowledged_at` populated.
     - Audit log: Recorded successful audit record (`alert_acknowledge`, `success: 1`).
3. **Idempotent Re-Acknowledgment:**
   - Repeated acknowledgment request on already acknowledged alert:
     - Response: **HTTP 200 OK**, returns existing acknowledged alert.
     - Audit log: Recorded idempotent audit record (`{"idempotent": true}`).
4. **Valid Transition (`ACKNOWLEDGED` → `RESOLVED`):**
   - Clinician submitted resolution:
     - Request: `POST /api/v1/alerts/{alert_id}/resolve` with `resolution_code: "vitals_stabilized"`.
     - Response: **HTTP 200 OK**, `status: "resolved"`, `resolved_at` and `resolved_by` populated.
     - Audit log: Recorded successful audit record (`alert_resolve`, `success: 1`).
5. **Recovery Reading Invariance:**
   - A normal vital reading (`78 bpm`) submitted after an abnormal vital (`135 bpm`) does **not** automatically resolve the alert. The alert remained `open` until explicit clinician action, preserving clinical governance.
6. **Cryptographic Audit Hash-Chain Integrity:**
   - Verified via `store.verify_audit_chain()`:
     - Evaluated all sequential audit records in `audit_log`.
     - Each record incorporates `prev_hash` (SHA-256) and computed `curr_hash`.
     - Outcome: **`valid: True`**, 4+ verified chained audit records.

---

## 5. Patient Scope Authorization Evidence

1. **Authorized Scope:**
   - Clinician authenticated with token scoped to `PC-SYNTH01,PC-DEMO01`:
   - `GET /api/v1/patients/PC-SYNTH01/measurements` returned **HTTP 200 OK**.
2. **Unauthorized Scope:**
   - Clinician attempted to request measurements for unassigned patient `PC-FORBIDDEN`:
   - Request: `GET /api/v1/patients/PC-FORBIDDEN/measurements`
   - Response: **HTTP 403 Forbidden** (`Access denied for target patient`).
   - Session preserved: 403 does not destroy clinician session.
3. **Token Revocation Persistence:**
   - Signing out calls `POST /api/v1/auth/logout`.
   - Token JTI recorded in SQLite `revoked_tokens` table.
   - Subsequent request with revoked token returned **HTTP 401 Unauthorized**.

---

## 6. Execution Command Log & Pass Rates

### 1. 10-Scenario End-to-End Validation Script
```powershell
.venv\Scripts\python backend/validate_10_scenarios.py
```
**Result:** **10 / 10 Scenarios Passed**, lifecycle mutations passed, audit chain verified, exit code `0`.

### 2. Milestone 4 Pytest Suite
```powershell
.venv\Scripts\pytest backend/tests/test_milestone4_validation.py -v
```
**Result:** **13 / 13 Passed (0.99s)**.

### 3. Full Backend Unit & Integration Suite
```powershell
.venv\Scripts\pytest backend/tests -m "not browser"
```
**Result:** **136 / 136 Passed (5.42s)**.

### 4. Browser Playwright E2E Test Suite
```powershell
.venv\Scripts\pytest backend/tests/test_browser.py
```
**Result:** **3 / 3 Passed (25.95s)**:
- `test_browser_full_workflow`: Full login, synthetic banner, alert acknowledge/resolve, audit check, 403 isolation, logout revocation.
- `test_browser_patient_selection_and_stale_data`: Census selection, measurement history ordering, stale badge, rapid switching.
- `test_browser_offline_queue_and_sync`: Queue observation into IndexedDB, page reload persistence, Sync Now dispatch, server history confirmation.

### 5. Frontend Node Unit Test Suite
```powershell
npm test
```
**Result:** **15 / 15 Passed (194ms)**.

### 6. Frontend Production Build
```powershell
npm run build
```
**Result:** Built in **3.13s** (`dist/index.html` 342.45 kB inlined singlefile bundle).

---

## 7. Known Limitations & Technical Boundaries

1. **Non-Clinical Defaults:** Demonstration threshold limits (HR: [40, 120] bpm, SpO2: 90%, Temp: [36.0, 38.0] °C, BP: [90/60, 140/90] mmHg) are non-clinical mock rules and must not be used for patient diagnostics.
2. **Single-Node Prototype:** SQLite persistence uses local WAL mode transactions; multi-region distributed synchronization requires an external database engine.
3. **Clock Skew Policy:** Client observation timestamps (`measured_at`) are accepted as submitted; the backend assigns authoritative server `received_at` timestamps for sorting and audit trails.
4. **Quarantine Without Auto-Merge:** Conflicting event payloads with the same `event_id` are permanently quarantined (`status: "conflict"`) to prevent data corruption and require manual review.
