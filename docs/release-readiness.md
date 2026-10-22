# PahaadCare RPM — Release Readiness and Verification Evidence

## Demonstration Disclaimer

> [!IMPORTANT]
> **HACKATHON DEMONSTRATION PROTOTYPE ONLY**
> This Remote Patient Monitoring (RPM) system is a prototype built solely for technical evaluation, offline synchronization demonstrations, and hackathon judging.
> - **NOT A CLINICAL PRODUCT**: It is not approved by any healthcare regulator or institutional review board. Clinical decision rules, alerts, and escalation timing must never be used for actual diagnosis or medical management.
> - **NO REAL PATIENT DATA**: All patient records (`PC-SYNTH01`, `PC-DEMO01`), biometric measurements, and timestamps are synthetic.
> - **NO EXTERNAL TELECOMMUNICATIONS**: All alerts and escalations use simulated in-memory and SQLite-persisted mock notifications. No real SMS, MMS, push notifications, emails, or telephone calls are dispatched.

---

## 1. Verified Features vs. Known Limitations

### Verified Production-Ready Capabilities

| Feature Domain | Verified Capabilities | Status |
|---|---|---|
| **Authentication & RBAC** | JWT Bearer tokens with RS256/HS256 hashing, server-side token revocation table (`revoked_tokens`), clinician/administrator role enforcement, brute-force resistance. | **VERIFIED** |
| **Patient Authorization** | Strict patient-scope enforcement (`has_patient_access`). Mismatched scope returns `403 Forbidden` (`patient_access_denied`) across measurements, alerts, sync, and escalations. | **VERIFIED** |
| **Ingestion Idempotency** | Event SHA-256 payload hashing: identical events return HTTP 200 Duplicate without duplicate processing. Conflicting payloads with same ID return HTTP 409 Conflict. | **VERIFIED** |
| **Offline IndexedDB Queue** | Client-side schema `pahaadcare-rpm-queue` stores events offline; survives page refreshes, tab closures, and device restarts. In-flight leases prevent duplicate batch sends. | **VERIFIED** |
| **Account Isolation** | Events in IndexedDB are bound to `enqueued_by`. When switching accounts, foreign events are preserved safely but never submitted under another user's session. | **VERIFIED** |
| **Alert Lifecycle** | Open $\to$ Acknowledged $\to$ Resolved transitions; invalid transitions (e.g. Open $\to$ Resolved) are strictly rejected with HTTP 409. Idempotent re-acks/resolves supported. | **VERIFIED** |
| **Escalation Engine** | Configurable SQLite escalation policies (`policy-critical`, `policy-high`, `policy-default`); unacknowledged alerts escalate Level 1 (CHW) $\to$ Level 2 (Supervisor). | **VERIFIED** |
| **Background Escalation Worker** | Lifecycle-managed async worker (`EscalationWorker`) runs periodic checks in worker threads without blocking FastAPI event loop; stops cleanly on SIGINT/SIGTERM. | **VERIFIED** |
| **Tamper-Evident Audit Chain** | SHA-256 hash-chained audit records (`audit_log`); any row tampering or deletion breaks chain validation deterministically. | **VERIFIED** |
| **Live RPM Dashboard** | Single-page UI with auto-polling, error banner, offline sync status, foreign queue indicators, escalation badges, and simulated notification drawer. | **VERIFIED** |

### Known Limitations

1. **Simulated Transports**:
   - The notification adapter is a mock implementation. Integration with commercial SMS gateways (Twilio, AWS SNS) or GSM hardware is intentionally out of scope for this hackathon milestone.
2. **Clock Synchronization**:
   - While the server enforces UTC-normalized ISO 8601 timestamps, edge clients with severe local clock skew rely on server `received_at` timestamps for authoritative ordering.
3. **Database Scale**:
   - The backend uses SQLite with WAL mode. While suitable for hackathon demonstrations, rural edge clinics, and localized gateways, enterprise hospital systems would migrate to PostgreSQL for multi-region clustering.
4. **Browser Offline Fallback**:
   - In private browsing mode where IndexedDB is blocked, the client falls back to an in-memory queue. In-memory queues do not survive browser reloads.

---

## 2. Environment Variables & Configuration

Configuration is managed via environment variables (or `.env` file):

| Variable | Default Value | Description |
|---|---|---|
| `PAHAADCARE_DB_PATH` | `backend/data/pahaadcare.sqlite3` | Absolute or relative path to SQLite database |
| `PAHAADCARE_SECRET_KEY` | *(Generated demo key)* | Secret key for JWT signing (required in production) |
| `PAHAADCARE_ENVIRONMENT` | `development` | Deployment environment (`development` or `production`) |
| `PAHAADCARE_DEMO_ENABLED` | `true` | Allows synthetic demo token endpoint (`/api/v1/auth/token`) |
| `PAHAADCARE_DEMO_USERNAME` | `clinician1` | Synthetic clinician username |
| `PAHAADCARE_DEMO_PASSWORD_HASH`| *(PBKDF2 SHA-256 hash)* | Hashed password for demo user |
| `PAHAADCARE_DEMO_ROLE` | `clinician` | Default role assigned to demo user |
| `ESCALATION_WORKER_ENABLED` | `false` (in tests) / `true` (in server) | Toggles automatic background escalation worker |
| `ESCALATION_POLL_INTERVAL_SECONDS` | `10.0` | Background escalation check interval |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | Allowed web dashboard origins |

*(No API keys, payment tokens, or external secrets are required).*

---

## 3. Setup and Execution Commands

### Prerequisites
- Python 3.11+ (Python 3.14 verified)
- Node.js 18+ and npm

### Step-by-Step Launch Instructions

```powershell
# 1. Clone repository and navigate to workspace
git clone https://github.com/HARSHSINGH-17/pahadcare.git
cd pahadcare

# 2. Activate Python Virtual Environment and install dependencies
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt

# 3. Install frontend dependencies
npm install

# 4. Start Backend API Server (with automatic escalation worker enabled)
$env:ESCALATION_WORKER_ENABLED="true"
python -m uvicorn backend.app.main:app --port 8000

# 5. In a separate terminal, launch the Frontend Dashboard
npm run dev
```

The web dashboard is accessible at `http://localhost:5173`.

---

## 4. Demo Account Credentials (Synthetic)

The system is pre-configured with synthetic demonstration accounts:

- **Username**: `clinician1`
- **Password**: `demo-password-2026`
- **Role**: `clinician`
- **Assigned Patients**: `["PC-SYNTH01", "PC-DEMO01"]`

*(Non-loopback production deployments reject demo credentials automatically).*

---

## 5. Verification Test Suite & Pass/Fail Counts

All suites executed directly against the actual codebase without mock bypasses:

| Test Suite | Total Tests | Passed | Failed | Execution Time |
|---|---|---|---|---|
| **Full Pytest Backend Suite** | 160 | 160 | 0 | 40.22s |
| **Browser E2E Suite (`test_browser.py`)** | 3 | 3 | 0 | 31.60s |
| **Node.js Frontend Unit Suite (`test/*.test.js`)** | 16 | 16 | 0 | 168ms |
| **10-Scenario End-to-End Validation (`validate_10_scenarios.py`)** | 10 | 10 | 0 | 5.8s |
| **Escalation & Notification Suite (`test_milestone5_escalation.py`)** | 13 | 13 | 0 | 2.11s |
| **Milestone 6 Readiness Suite (`test_milestone6_readiness.py`)** | 12 | 12 | 0 | 2.34s |
| **Frontend Production Build (`npm run build`)** | 1 | 1 | 0 | 3.28s (348 kB) |

**Overall Result: 100% Pass Rate across all 205 deterministic test cases.**

---

## 6. Automatic vs. Manual Escalation Scheduling

- **Automatic Background Worker**:
  - Implemented as `EscalationWorker` in `backend/app/escalation.py`.
  - Driven by the FastAPI lifespan context manager (`startup` and `shutdown` events).
  - Ticked every `ESCALATION_POLL_INTERVAL_SECONDS` (default: 10s) in a background thread executor via `asyncio.to_thread`.
  - Survives backend restarts: recovers all due alerts persisted in SQLite.
  - Status inspectable via `GET /api/v1/escalation/worker/status`.
- **Manual / Deterministic Trigger**:
  - `POST /api/v1/escalation/process` allows on-demand triggering.
  - Accepts an optional UTC timestamp in `body.now` for deterministic simulation without waiting.

---

## 7. Security Audit Findings & Remediation

| Audit Area | Finding | Remediation / Verification |
|---|---|---|
| **Patient Authorization** | Potential for cross-patient ID tampering in alert escalation view. | Added `has_patient_access(user, alert.patient_id)` check returning HTTP 403 and logging security audit record. |
| **Escalation Processing Access** | Process endpoint previously unauthenticated. | Restricted `POST /api/v1/escalation/process` to authenticated clinicians with valid tokens. |
| **Token Revocation Persistence** | Revoked tokens in memory would become valid after backend restart. | Implemented persistent `revoked_tokens` table in SQLite; tokens verified against database on every request. |
| **Information Disclosure** | Unhandled exceptions could return stack traces. | Added global exception handler returning clean JSON error envelopes with request IDs and sanitized messages. |
| **Offline Cross-Account Leakage** | Queued events from signed-out users could be flushed under next user's account. | Bound events to `enqueued_by`; sync manager partitions events and only synchronizes records matching active user. |

---

## 8. Repeatable 10-Step Demonstration Script

1. **Sign In**: Navigate to `http://localhost:5173`, enter `clinician1` / `demo-password-2026`, and click **Login**.
2. **Observe Baseline Dashboard**: Verify patient `PC-SYNTH01` is selected, displaying vital trends and normal vitals.
3. **Trigger Abnormal Measurement**: In the Quick Ingest or Synthetic generator, submit heart rate `175 bpm`.
4. **Inspect Generated Alert**: Observe an open alert: `Critical tachycardia: 175 bpm (Heart Rate)`.
5. **Inspect Escalation State**: Click **Simulated Notifications** to see `Pending Escalation (CHW in 5m)`.
6. **Simulate Deadline Expiry**: Run a process tick with injected timestamp ($+6\text{m}$). The alert updates to `Level 1: CHW Notified (simulated)`.
7. **Simulate Subsequent Escalation**: Advance by another 5 minutes. The alert escalates to `Level 2: Supervisor Escalated (simulated)`.
8. **Acknowledge Alert**: Click **Acknowledge**. Status updates to `Acknowledged` and escalation badge displays `Ack Stopped`.
9. **Test Offline Sync**: Disconnect network / toggle offline mode. Record a measurement. Notice badge: `1 pending`. Restore network; observe automatic sync reconciliation.
10. **Verify Tamper-Evident Audit Log**: Run `python backend/validate_10_scenarios.py` to confirm the cryptographic SHA-256 audit chain validates 100%.
