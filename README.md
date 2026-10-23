# PahaadCare — Offline-First Remote Patient Monitoring (RPM) & Healthcare Platform

A demonstration Remote Patient Monitoring (RPM) and healthcare access Progressive Web Application (PWA) designed for remote and underserved Himalayan communities.

> [!IMPORTANT]
> **Hackathon Demonstration Prototype**
> This application is built exclusively for hackathon evaluation, offline synchronization demonstrations, and technical review. It is not clinically validated or intended for actual medical care. All patient profiles, biometric thresholds, and contact targets are synthetic demonstration fixtures. All alerts and escalations use local simulation and SQLite persistence without real external telecommunications (no real SMS, email, or telephone calls). Never input real protected health information (PHI).

---

## 1. System Architecture & Components

PahaadCare is structured as a resilient, offline-first remote patient monitoring prototype:

- **Frontend Application (React + Vite)**:
  - **Single-File Distribution**: Bundled using `vite-plugin-singlefile` into an inlined, self-contained `dist/index.html` suitable for offline distribution, field USB drives, or CDN edge deployment.
  - **Portal Router (`PortalRouter.jsx`)**: Enforces client-side role isolation between the Patient Portal (`#/patient`) and the Clinician Workspace (`#/doctor`). Blocks patient tokens from clinician views with explicit 403 Forbidden screens.
  - **Clinician Workspace (`DoctorWorkspace.jsx` & `DoctorLayout.jsx`)**: Dedicated clinician layout with responsive sidebar navigation, breadcrumbs, live connection & sync status popover, and four integrated views:
    1. **Integrated Overview (`#/doctor`)**: Census metrics, vital KPI tiles, freshness summary, active demo alerts, offline sync bar, queue simulator, and slideout patient detail.
    2. **Patient Directory (`#/doctor/patients`)**: Authorized census with multi-vital telemetry, text search by patient ID/name, conjunctive filters (status, severity, freshness), sorting by clinical urgency, and client-side pagination.
    3. **Individual Patient RPM Dashboard (`#/doctor/patients/:patientId`)**: Longitudinal physiological telemetry, time-range controls (6h, 24h, 7d, all), dual-series Blood Pressure chart, demo threshold bounds, gap detection across observation pauses, chronological observation table with vital filters, and direct alert acknowledge/resolve workflows.
    4. **Alert & Escalation Management (`#/doctor/alerts`)**: Centralized triage workspace with open/acknowledged/overdue/resolved counters, multi-tier escalation policy ladder, background worker status and manual trigger, and audit-compliant Acknowledge/Resolve modals with clinical codes and notes.
- **Offline Event Queue (`src/offlineQueue.js`)**:
  - Durable IndexedDB persistence (`pahaadcare_rpm_offline_db`) surviving tab close and application restart.
  - Explicit lifecycle states: `pending` -> `sending` -> `delivered` | `conflict` | `failed`.
  - User-account binding (`enqueued_by`) preventing cross-user event synchronization.
  - Single-flight concurrency prevention and automatic crash recovery on startup.
- **Synchronization Manager (`src/syncManager.js`)**:
  - Bounded batch dispatch (`POST /api/v1/sync/events`, up to 100 events/batch).
  - Exponential backoff with jitter (max 30s) on transient network failure.
  - Session expiration (401) pause and permanent rejection (403/validation) loop halt.
  - Clear distinction between network connectivity and confirmed server delivery.
- **Data Quality & Freshness Model (`src/dataQuality.js`)**:
  - Single authoritative model across all doctor and patient views.
  - States: `current` (≤15m demo window), `stale` (>15m demo window), `missing` (never fabricated with 0), `sparse` (≤2 readings or large observation gaps), `invalid` (physiological bounds failure), `pending` (offline queued), `syncing`, `delivered`, `conflict` (quarantined), and `failed`.
  - Independent observation timestamps (`measured_at`) vs server ingestion/sync timestamps (`received_at`).
- **Backend Service (Python FastAPI + SQLite)**:
  - **Authentication & Security (`backend/app/auth.py`)**: JWT token authentication with PBKDF2 password hashing, token revocation / logout blacklist, role enforcement (`clinician`, `administrator`, `patient`), and patient-scope authorization.
  - **Monitoring Engine (`backend/app/engine.py`)**: Threshold evaluation, duplicate event deduplication, conflict detection, stale/missing/future timestamp validation, and deterministic scenario generation.
  - **Escalation Engine & Worker (`backend/app/escalation.py`)**: Multi-tier escalation policies, atomic due-alert evaluation, simulated notification dispatch history, and resilient background worker.
  - **Tamper-Evident Audit Logging (`backend/app/repository.py`)**: SHA-256 hash-chained audit ledger recording authentication, alert triage mutations, escalation dispatches, and sync events.

---

## 2. Installation & Quickstart

### Prerequisites
- **Node.js**: v18.0+ or v20.0+ (with npm)
- **Python**: v3.11+ (Python 3.14 verified)
- **Git**
- OS: Windows 10/11, macOS, or Linux

### Step 1: Clone Repository
```bash
git clone https://github.com/HARSHSINGH-17/pahadcare.git
cd pahadcare
```

### Step 2: Backend Virtual Environment Setup
```powershell
# Windows (PowerShell):
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
```

```bash
# macOS / Linux:
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

### Step 3: Frontend Dependencies
```bash
npm install
```

---

## 3. Launching the Services

Run the backend and frontend in separate terminals:

### Terminal 1: Backend API & Escalation Worker
```powershell
# Windows (PowerShell):
.\.venv\Scripts\Activate.ps1
$env:ESCALATION_WORKER_ENABLED="true"
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

```bash
# macOS / Linux:
source .venv/bin/activate
export ESCALATION_WORKER_ENABLED=true
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```
- **API Base URL**: `http://127.0.0.1:8000`
- **Swagger Documentation**: `http://127.0.0.1:8000/docs`
- **Health Check**: `http://127.0.0.1:8000/health`

### Terminal 2: Frontend Development Server
```bash
npm run dev
```
- **Web Application**: `http://localhost:5173`
- Default doctor route: `http://localhost:5173/#/doctor`
- Default patient portal: `http://localhost:5173/#/patient`

---

## 4. Demonstration Accounts & Roles

| Role | Username | Password | Scope / Permissions |
| :--- | :--- | :--- | :--- |
| **Clinician** | `clinician1` | `demo-password-2026` | Authorized for `PC-SYNTH01`, `PC-DEMO01`. Full overview, directory, charts, alert triage & resolution. |
| **Administrator** | `admin` | *(config-driven)* | Global system access, policy inspection, audit export. |
| **Patient** | `PC-DEMO01` | *(local PIN/session)* | Restricted to own personal health passport (`#/patient`). Access to `#/doctor` returns 403 Forbidden. |

---

## 5. Automated Regression Test Suite

All 5 test suites can be executed independently to verify complete system readiness:

```powershell
# 1. Frontend Unit & Integration Tests (65 tests)
npm test

# 2. Production Single-File Bundle Build
npm run build

# 3. Backend Pytest Suite (162 tests)
.\.venv\Scripts\pytest.exe backend/tests -v -k "not test_browser"

# 4. Playwright Browser E2E Suite (3 tests)
.\.venv\Scripts\pytest.exe backend/tests/test_browser.py -v

# 5. 10-Scenario RPM Validation Runner (10 scenarios + lifecycle + audit)
.\.venv\Scripts\python.exe backend/validate_10_scenarios.py

# 6. AST Code Knowledge Graph Update
.\.venv\Scripts\graphify.exe update .
```

---

## 6. Offline Queue & Escalation Behavior

### Offline Measurement Queueing
1. Observations captured while disconnected are validated locally and stored in browser IndexedDB (`rpm_measurement_events`).
2. Measurements are tagged with the active user's identity (`enqueued_by`).
3. If an account logs out, un-synced events remain durably preserved in IndexedDB but will **not** be uploaded by a different clinician or patient account.
4. When connectivity returns, `SyncManager` initiates single-flight batch dispatch with per-event response reconciliation.

### Multi-Tier Escalation Ladder
1. When abnormal readings violate thresholds (e.g., Tachycardia HR > 120 or SpO₂ < 90%), an alert is opened and registered with an escalation policy.
2. If unacknowledged within the policy grace period (e.g., 15 minutes):
   - **Level 1**: Dispatches simulated escalation notification to Primary Community Health Worker (CHW).
   - **Level 2**: If still unacknowledged after secondary interval, escalates to Area Medical Supervisor.
3. Clinician acknowledgment (`POST /api/v1/alerts/{id}/acknowledge`) records the clinician actor, logs clinical notes, and halts pending escalation.
4. Clinician resolution (`POST /api/v1/alerts/{id}/resolve`) requires a standardized clinical resolution code (`clinical_review_complete`, `treatment_administered`, `transferred_care`, `false_positive_sensor`, `resolved_spontaneously`) and closes the alert lifecycle.
5. All notification dispatches are simulated and logged with an explicit disclaimer.

---

## 7. Known Prototype Limitations & Safety Boundaries

1. **Synthetic Data Only**: All patient demographics, telemetry streams, and medical contacts are synthetic demonstration fixtures.
2. **Software Demonstration Rules**: Freshness thresholds (15 minutes) and vital boundaries are software demonstration rules for hackathon simulation, not clinically validated diagnostic thresholds.
3. **No External Telecom Dispatches**: Notification adapters simulate dispatch into SQLite audit tables; no live SMS, phone calls, or emails are transmitted.
4. **Local Database Default**: SQLite is used as the embedded persistence layer. In production, migrate to PostgreSQL with encrypted connection strings and key management.
5. **Regulatory Disclaimer**: PahaadCare is a technology demonstration prototype and is not FDA, CE, or CDSCO cleared as a medical device or diagnostic system.
