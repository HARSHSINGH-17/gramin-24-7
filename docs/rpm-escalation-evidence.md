# PahaadCare RPM — Milestone 5: Alert Escalation and Mock Notification Evidence

## Demonstration Disclaimer

> [!IMPORTANT]
> **HACKATHON DEMONSTRATION PROTOTYPE ONLY**
> This Remote Patient Monitoring (RPM) escalation and mock notification system is an experimental prototype created exclusively for hackathon evaluation and technical demonstration.
> - **NOT CLINICALLY VALIDATED**: Thresholds, timing intervals, escalation policies, and recipient roles are demonstration parameters, not clinical protocols.
> - **NO REAL TELECOMMUNICATIONS**: All notifications are mock records stored in SQLite and displayed within the dashboard. The system does not transmit real SMS, MMS, WhatsApp, email, push notifications, MQTT packets, or voice calls.
> - **NO REAL PATIENT DATA**: All patient profiles, vital measurements, and contact endpoints are synthetic fixtures (`PC-SYNTH01`, `PC-DEMO01`, `+91-99999-00001`, etc.).

---

## 1. System Architecture

The alert escalation subsystem provides a durable, idempotent, and auditable escalation workflow on top of the PahaadCare SQLite and FastAPI backend:

```mermaid
flowchart TD
    Ingest[Event Ingestion / Quality Alerts] --> Evaluate[Monitoring Engine]
    Evaluate -->|Abnormal / Critical| CreateAlert[Create Alert & Register Escalation State]
    CreateAlert -->|Initial Deadline: 5m / 15m / 30m| DB[(SQLite: alert_escalations)]
    
    Scheduler[EscalationEngine / Process Endpoint] -->|Query Due Deadlines| DB
    Scheduler -->|Lock Row BEGIN IMMEDIATE| EvalStatus{Alert Status?}
    
    EvalStatus -->|Acknowledged| StopAck[Set status='acknowledged_stopped']
    EvalStatus -->|Resolved| StopRes[Set status='resolved_stopped']
    EvalStatus -->|Unacknowledged & Due| Dispatch[MockNotificationAdapter.send]
    
    Dispatch -->|Delivered| RecordDelivered[mock_notifications table]
    Dispatch -->|Simulated Failure| RecordFailed[Schedule Bounded Retry]
    
    RecordDelivered --> AdvanceState[Advance Level 1 (CHW) -> Level 2 (Supervisor)]
    RecordDelivered --> Audit[Hash-Chained Audit Log]
    RecordFailed --> Audit
    StopAck --> Audit
    StopRes --> Audit
```

### Components

1. **`AlertEscalationState` & Persistence (`backend/app/models.py`, `backend/app/repository.py`)**:
   - Persists per-alert escalation state in the `alert_escalations` table.
   - Configurable policies stored in `escalation_policies`.
   - Notifications logged in `mock_notifications`.
   - Bounded retries with backoff intervals.
2. **`NotificationAdapter` & `MockNotificationAdapter` (`backend/app/notifications.py`)**:
   - Standardized adapter interface decoupled from delivery channels.
   - Mock adapter records synthetic recipient contacts (`+91-99999-00001` for Community Health Worker, `+91-99999-00002` for Supervisor).
   - Zero external credentials, paid APIs, or cloud telemetry.
3. **`EscalationEngine` (`backend/app/escalation.py`)**:
   - Atomic per-alert execution using SQLite `BEGIN IMMEDIATE` transactions.
   - Evaluates whether alerts remain unacknowledged past deadline.
   - Level progression: Level 0 (pending) $\to$ Level 1 (`community_health_worker`) $\to$ Level 2 (`supervisor`) $\to$ `max_reached`.
   - Concurrency guard verifies `next_due_at <= current_time` under row lock to prevent race conditions across parallel threads or restart cycles.
   - Stopped immediately upon alert acknowledgement or resolution.
   - Tamper-evident hash-chained audit logging for every level advancement and failure.
4. **Offline Queue Account Isolation (`src/offlineQueue.js`, `src/syncManager.js`)**:
   - Measurements enqueued in IndexedDB carry an `enqueued_by` user attribute.
   - When users switch or sign out, foreign events remain safely preserved in IndexedDB but are excluded from active sync batches.
   - Eliminates accidental cross-account data leaks.
5. **Dashboard Integration (`src/RpmDashboard.jsx`, `src/styles.css`, `src/rpmApi.js`)**:
   - Live escalation badges: `Level 1: CHW Notified (simulated)`, `Level 2: Supervisor Escalated (simulated)`, `Pending Escalation`, `Ack Stopped`.
   - Awaiting duration counter and next escalation deadline indicator.
   - Collapsible simulated notification drawer with delivery status badges and demonstration tags.
   - Account isolation banner displaying preserved foreign events if present.

---

## 2. Policy Configuration

Default escalation policies seeded in `escalation_policies`:

| Policy ID | Name | Min Severity | Initial Recipient | Delay | Subsequent Recipient | Max Attempts | Retry Delay | Stop on Ack | Stop on Resolve |
|---|---|---|---|---|---|---|---|---|---|
| `policy-critical` | Critical Demo Policy | `critical` | `community_health_worker` | 300s (5m) | `supervisor` | 3 | 60s | Yes (1) | Yes (1) |
| `policy-high` | High Severity Demo Policy | `high` | `community_health_worker` | 900s (15m) | `supervisor` | 3 | 120s | Yes (1) | Yes (1) |
| `policy-default` | Standard Warning Demo Policy | `medium` | `community_health_worker` | 1800s (30m) | `supervisor` | 2 | 180s | Yes (1) | Yes (1) |

All timing, roles, and escalation boundaries are explicitly isolated in configuration rows rather than hardcoded throughout application logic.

---

## 3. Escalation Lifecycle & State Transitions

```
[Open Alert Created]
         │
         ▼
     [pending] ────(Ack before deadline)────► [acknowledged_stopped]
         │                                            ▲
         │ (Deadline reached)                         │
         ▼                                            │
  [Mock Sent to CHW]                                  │
         │                                            │
         ▼                                            │
    [escalated] (Level 1) ───(Ack before Level 2)─────┤
         │                                            │
         │ (Level 2 deadline reached)                 │
         ▼                                            │
[Mock Sent to Supervisor]                             │
         │                                            │
         ▼                                            │
   [max_reached] (Level 2) ──(Ack or Resolve)─────────┘
```

- **Acknowledge Before Deadline**: Escalation transitions immediately to `acknowledged_stopped`. `next_due_at` set to `NULL`. No notification dispatched.
- **Resolve Before Deadline**: Escalation transitions immediately to `resolved_stopped`. `next_due_at` set to `NULL`. No notification dispatched.
- **Unacknowledged Past Deadline**: Escalation engine dispatches Level 1 simulated notification to `community_health_worker`, sets status to `escalated`, and sets `next_due_at` to $+300\text{s}$.
- **Unacknowledged Past Subsequent Deadline**: Escalation engine dispatches Level 2 simulated notification to `supervisor`, sets status to `max_reached`, and clears `next_due_at`.
- **Delivery Failure**: Failure logged with retry counter incremented. `next_due_at` rescheduled by `retry_delay_seconds`. If retries reach `max_attempts`, status transitions to `max_reached`.
- **Post-Escalation Acknowledge/Resolve**: Further scheduler runs ignore alerts with `acknowledged_stopped` or `resolved_stopped`.

---

## 4. API Endpoints and Authorization

All escalation endpoints strictly enforce JWT authentication, clinician role validation, and patient scope authorization:

1. `GET /api/v1/escalation/policies`
   - Requires valid JWT bearer token with clinician role (`clinician`, `chw_nurse`, or `administrator`).
   - Returns list of configured escalation policies.
2. `GET /api/v1/alerts/{alert_id}/escalations`
   - Requires valid JWT bearer token.
   - Enforces patient scope: If caller's `assigned_patients` does not include the alert's `patient_id` (and caller is not administrator), returns `403 Forbidden` (`patient_access_denied`).
   - Returns current escalation state (`current_level`, `status`, `next_due_at`, `attempts_count`) and list of mock notifications.
3. `POST /api/v1/escalation/process`
   - Demonstration trigger endpoint allowing injected `now` parameter for deterministic testing without sleeps.
   - Evaluates due alerts and dispatches simulated notifications.

---

## 5. Offline Queue Account Isolation Security Verification

As required by Milestone 5 Section 8:
- Queued events in IndexedDB include `enqueued_by` bound to the active user's identity.
- When an account switch or sign-out occurs:
  - Stored credentials/tokens are wiped from memory/session.
  - The queue is **never** wiped, preventing catastrophic data loss in offline rural settings.
  - `getPendingEvents(limit, db, activeUser)` filters strictly by `enqueued_by`, preventing User B from submitting User A's queued measurements.
  - The dashboard sync bar renders a foreign pending indicator (`1 item pending from another account preserved`) alerting the user that previous data is safely stored on the device.

---

## 6. Deterministic Automated Verification

### Test Summary

| Test Suite | Total Tests | Passed | Failed | Duration |
|---|---|---|---|---|
| **Backend Escalation Suite (`test_milestone5_escalation.py`)** | 13 | 13 | 0 | 2.11s |
| **Full Backend Test Suite (`backend/tests/`)** | 148 | 148 | 0 | 38.16s |
| **Node Frontend Unit Suite (`test/*.test.js`)** | 16 | 16 | 0 | 191ms |
| **10-Scenario End-to-End Validation (`validate_10_scenarios.py`)** | 10 | 10 | 0 | 6.2s |
| **Frontend Production Build (`npm run build`)** | 1 | 1 | 0 | 3.56s (348 kB) |

### Milestone 5 Test Scenarios Breakdown

```powershell
.venv\Scripts\pytest backend\tests\test_milestone5_escalation.py -v
```

1. `test_alert_acknowledged_before_escalation_deadline` — **PASSED**
   - Verified alert acknowledged within 2 minutes stops escalation; 0 notifications dispatched.
2. `test_alert_remains_unacknowledged_past_deadline` — **PASSED**
   - Verified unacknowledged alert past 5 minutes dispatches Level 1 notification to `community_health_worker`.
3. `test_alert_resolved_before_deadline` — **PASSED**
   - Verified resolving alert stops pending escalation without dispatching notifications.
4. `test_escalation_to_second_synthetic_recipient` — **PASSED**
   - Verified unacknowledged alert past subsequent deadline advances to Level 2 and dispatches to `supervisor`.
5. `test_failed_notification_and_bounded_retry` — **PASSED**
   - Verified mock adapter delivery failure initiates bounded retries and halts at `max_reached`.
6. `test_duplicate_scheduler_execution_is_idempotent` — **PASSED**
   - Verified running scheduler 3 consecutive times on the same due alert produces exactly 1 notification.
7. `test_backend_restart_with_pending_escalation_work` — **PASSED**
   - Verified SQLite persistence across repository reinitialization recovers pending escalation work and dispatches on due time.
8. `test_concurrent_processing_of_same_due_alert` — **PASSED**
   - Verified 4 concurrent worker threads contending on the same due alert produce exactly 1 notification without race condition.
9. `test_patient_scope_authorization_failures` — **PASSED**
   - Verified clinician with unauthorized patient scope receives `403 Forbidden` (`patient_access_denied`) when requesting escalation history.
10. `test_audit_chain_integrity_after_escalation_actions` — **PASSED**
    - Verified SHA-256 tamper-evident hash chain remains completely valid after escalation and acknowledgement mutations.
11. `test_no_further_escalation_after_acknowledgement_or_resolution` — **PASSED**
    - Verified advance of 60 minutes after acknowledgement produces 0 additional notifications.
12. `test_dashboard_rendering_of_escalation_state` — **PASSED**
    - Verified `/api/v1/alerts/{alert_id}/escalations` returns full escalation state and notification history for dashboard consumption.
13. `test_escalation_policy_configuration_inspection` — **PASSED**
    - Verified `/api/v1/escalation/policies` endpoint returns seeded policies with configured delays and synthetic roles.

### Frontend Account Isolation Tests Breakdown

```powershell
npm test
```

- `15. Sign-out or account switch preserves pending events without silent data loss` — **PASSED**
- `16. User account isolation prevents cross-account submission after sign-out and switch` — **PASSED**

---

## 7. Limitations and Remaining Risks

1. **Simulated Transports Only**:
   - The system intentionally does not integrate with Twilio, AWS SNS, Firebase Cloud Messaging, or real GSM modems.
   - In a production environment, real SMS and telephony adapters must handle network carrier rate limits, delivery receipts (DLR), and subscriber status.
2. **Clock Skew in Distributed Settings**:
   - While server-side escalation relies on UTC timestamps, edge devices in rural clinics may experience clock drift. Offline event reconciliation relies on server-assigned `received_at` for ordering.
3. **In-Process Scheduler vs Celery/Temporal**:
   - For hackathon demonstration, the scheduler is triggered deterministically via `/api/v1/escalation/process` and repository timers. A high-volume production deployment would use a distributed durable task runner like Temporal or Celery with Redis/PostgreSQL.

---

## 8. How to Reproduce the Demo

1. **Activate Python Virtual Environment & Install Dependencies**:
   ```powershell
   .\.venv\Scripts\Activate.ps1
   pip install -r backend/requirements.txt
   npm install
   ```
2. **Execute Full Backend Test Suite**:
   ```powershell
   pytest -v
   ```
3. **Execute Offline Queue and Account Isolation Suite**:
   ```powershell
   npm test
   ```
4. **Execute 10-Scenario Validation Runner**:
   ```powershell
   python backend/validate_10_scenarios.py
   ```
5. **Launch Backend Server**:
   ```powershell
   python -m uvicorn backend.app.main:app --port 8000
   ```
6. **Launch Frontend Development Server**:
   ```powershell
   npm run dev
   ```
7. **Interact via Browser**:
   - Navigate to `http://localhost:5173`.
   - Log in with demonstration credentials (`clinician1` / `demo-password-2026`).
   - Trigger demo synthetic data generation.
   - Observe simulated escalation badges, awaiting timer, next deadline, and toggle the simulated notification drawer on active alerts.
