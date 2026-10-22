# Graph Report - PahaadCare_Source_Code  (2026-10-22)

## Corpus Check
- 57 files · ~70,627 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 1, .bat 1, .example 1)

## Summary
- 918 nodes · 2531 edges · 39 communities (32 shown, 7 thin omitted)
- Extraction: 85% EXTRACTED · 15% INFERRED · 0% AMBIGUOUS · INFERRED: 371 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0ced0671`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- SQLiteRepository
- PahaadCare RPM — Milestone 4: End-to-End Validation and 10-Scenario Evidence
- generate_scenario
- Qf
- MeasurementEvent
- main.py
- repository.py
- package.json
- compilerOptions
- test_milestone1_apis.py
- RpmDashboard.jsx
- compilerOptions
- PahaadCare RPM API Contract
- tsconfig.json
- PahaadCare RPM — Security Documentation
- offlineQueue.js
- PahaadCare — Offline-first healthcare access prototype
- PahaadCare RPM Durable Offline Event Queue and Synchronization Specification
- App.jsx
- PahaadCare RPM Minimum Testing Strategy
- syncManager
- test_security.py
- PahaadCare RPM — Release Readiness and Verification Evidence
- test_milestone1_apis.py
- SecuritySettings
- auth.py
- Login.jsx
- PahaadCare RPM — Milestone 5: Alert Escalation and Mock Notification Evidence
- PahaadCare RPM Contract Backend
- validate_10_scenarios.py
- current_user
- PahaadCare RPM — Milestone 4: End-to-End Validation and 10-Scenario Evidence
- main.jsx
- $f
- 6. Execution Command Log & Pass Rates

## God Nodes (most connected - your core abstractions)
1. `SQLiteRepository` - 117 edges
2. `MeasurementEvent` - 59 edges
3. `generate_scenario()` - 52 edges
4. `MonitoringEngine` - 46 edges
5. `Alert` - 41 edges
6. `Qf()` - 39 edges
7. `issue_token()` - 34 edges
8. `EscalationEngine` - 33 edges
9. `MockNotificationAdapter` - 28 edges
10. `SyntheticScenario` - 28 edges

## Surprising Connections (you probably didn't know these)
- `6. Automatic vs. Manual Escalation Scheduling` --references--> `EscalationWorker`  [INFERRED]
  docs/release-readiness.md → backend/app/escalation.py
- `Redaction` --references--> `token()`  [INFERRED]
  docs/security.md → backend/app/main.py
- `PahaadCare Unresolved Decisions` --references--> `browser_env()`  [INFERRED]
  docs/unresolved-decisions.md → backend/tests/test_browser.py
- `1. Test Environment & Verification Baseline` --references--> `MemoryStore`  [INFERRED]
  docs/rpm-10-event-evidence.md → src/offlineQueue.js
- `Storage Resilience & Privacy Guarantees` --references--> `enqueueMeasurementEvent()`  [INFERRED]
  docs/rpm-offline-sync.md → src/offlineQueue.js

## Import Cycles
- None detected.

## Communities (39 total, 7 thin omitted)

### Community 0 - "SQLiteRepository"
Cohesion: 0.09
Nodes (23): SQLiteRepository, test_browser_full_workflow(), test_audit_hash_chain_integrity_after_repeated_transitions(), test_clean_database_initialization(), abnormal_event(), FixedClock, test_alert_acknowledgement_and_resolution_persist_after_restart(), test_api_lifecycle_endpoints_use_existing_response_contract() (+15 more)

### Community 1 - "PahaadCare RPM — Milestone 4: End-to-End Validation and 10-Scenario Evidence"
Cohesion: 0.14
Nodes (5): browser_env(), StaticHandler, test_browser_offline_queue_and_sync(), test_browser_patient_selection_and_stale_data(), 4. Browser Playwright E2E Test Suite

### Community 2 - "generate_scenario"
Cohesion: 0.07
Nodes (45): build_demo_dashboard_snapshot(), _event_record(), _iso(), _quality_record(), MonitoringEngine, ProcessedEvent, ProcessingOutcome, main() (+37 more)

### Community 3 - "Qf"
Cohesion: 0.16
Nodes (22): pcD(), Qf(), gl(), _i(), Mi(), pcAddFc(), pcCopy(), pcFam() (+14 more)

### Community 4 - "MeasurementEvent"
Cohesion: 0.06
Nodes (39): Alert, DeviceReference, MeasurementEvent, MissingDataEvent, reject_explicit_nulls(), alert_from_missing_data(), DemonstrationThreshold, evaluate_demo_threshold() (+31 more)

### Community 5 - "main.py"
Cohesion: 0.11
Nodes (30): has_patient_access(), acknowledge_alert(), AcknowledgeRequest, alert_response(), demo_rpm_dashboard(), error_response(), get_alert_escalations(), get_escalation_worker_status() (+22 more)

### Community 6 - "repository.py"
Cohesion: 0.07
Nodes (47): EscalationEngine, EscalationWorker, Acknowledgement, AlertCategory, AlertEscalationState, AlertReason, AlertSeverity, AlertStatus (+39 more)

### Community 7 - "package.json"
Cohesion: 0.07
Nodes (30): dependencies, lucide-react, react, react-dom, devDependencies, @types/react, @types/react-dom, typescript (+22 more)

### Community 8 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+10 more)

### Community 9 - "test_milestone1_apis.py"
Cohesion: 0.16
Nodes (7): _create_sample_event(), test_alert_lifecycle_notes_and_transitions(), test_alert_listing_filters(), test_cross_patient_alert_action_denied(), test_measurement_ordering_chronological(), test_patient_detail_empty_measurements(), test_unauthenticated_requests_fail_401()

### Community 10 - "RpmDashboard.jsx"
Cohesion: 0.12
Nodes (35): AccessDeniedError, acknowledgeAlert(), clearStoredToken(), DEMO_STALE_THRESHOLD_MINUTES, fetchAlertEscalation(), fetchAlerts(), fetchEscalationPolicies(), fetchPatientMeasurements() (+27 more)

### Community 11 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, allowImportingTsExtensions, lib, module, moduleDetection, moduleResolution, noEmit, skipLibCheck (+5 more)

### Community 12 - "PahaadCare RPM API Contract"
Cohesion: 0.04
Nodes (40): Client Integration Endpoints, Common Rules, `GET /api/v1/alerts`, `GET /api/v1/demo/rpm-dashboard`, `GET /api/v1/patients`, `GET /api/v1/patients/{patient_id}/measurements`, `GET /health`, Milestone 2 Dashboard Integration & Polling Contract (+32 more)

### Community 17 - "PahaadCare RPM — Security Documentation"
Cohesion: 0.07
Nodes (28): 1. Demo Account Policy, 2. Token Policy, 3. Patient-Level Authorization, 4. Audit Chain, 5. Audit Export, 6. Frontend Session Handling, 7. Production Deployment Requirements, 8. Remaining Risks and Non-Goals (+20 more)

### Community 18 - "offlineQueue.js"
Cohesion: 0.16
Nodes (22): Crash & Reload Recovery, clearDeliveredEvents(), DB_NAME, DB_VERSION, enqueueMeasurementEvent(), getMemoryStore(), getPendingEvents(), getQueuedEvent() (+14 more)

### Community 19 - "PahaadCare — Offline-first healthcare access prototype"
Cohesion: 0.18
Nodes (10): Before any real pilot, Important prototype limits, Install on Android, Multilingual and voice demo (added), PahaadCare — Offline-first healthcare access prototype, Patient ID, caregiver view and doctor report demo, Requirements, Responsive navigation update (+2 more)

### Community 20 - "PahaadCare RPM Durable Offline Event Queue and Synchronization Specification"
Cohesion: 0.14
Nodes (14): 1. Overview & Architecture, 2. IndexedDB Queue Schema, 3. Event Lifecycle & Delivery States, 4. Synchronization Manager (`syncManager.js`), 6. Account-Switch & Shift-Handover Policy, 7. Known Limitations & Future Work, Authentication Enforcement, Batch Limits (+6 more)

### Community 21 - "App.jsx"
Cohesion: 0.12
Nodes (19): Af(), Ce(), Bf(), Df, fc, Ff, gc(), Hf (+11 more)

### Community 22 - "PahaadCare RPM Minimum Testing Strategy"
Cohesion: 0.40
Nodes (4): Execution Gate, PahaadCare RPM Minimum Testing Strategy, Recommended Stack, Required Test Cases

### Community 23 - "syncManager"
Cohesion: 0.28
Nodes (3): getStoredToken(), getStoredUser(), syncManager

### Community 24 - "test_security.py"
Cohesion: 0.16
Nodes (13): issue_token(), test_patient_scope_authorization_enforcement(), test_error_envelope_sanitization(), test_security_process_escalation_authorization(), test_worker_status_endpoint(), test_administrator_role_explicit_access(), test_cross_patient_alert_lifecycle_is_denied(), test_health_is_public_but_protected_routes_require_authentication() (+5 more)

### Community 25 - "PahaadCare RPM — Release Readiness and Verification Evidence"
Cohesion: 0.13
Nodes (14): 1. Verified Features vs. Known Limitations, 2. Environment Variables & Configuration, 3. Setup and Execution Commands, 4. Demo Account Credentials (Synthetic), 5. Verification Test Suite & Pass/Fail Counts, 6. Automatic vs. Manual Escalation Scheduling, 7. Security Audit Findings & Remediation, 8. Repeatable 10-Step Demonstration Script (+6 more)

### Community 27 - "test_milestone1_apis.py"
Cohesion: 0.11
Nodes (12): _make_event(), test_alerts_listing_and_filtering(), test_batch_sync_bounds_and_malformed(), test_batch_sync_partial_success_and_conflict(), test_batch_sync_success_and_deduplication(), test_measurement_history_and_ordering(), test_patients_listing_admin_access(), _make_sync_event() (+4 more)

### Community 28 - "SecuritySettings"
Cohesion: 0.24
Nodes (10): ConfigurationError, require_role(), require_user(), dependency(), SecuritySettings, test_demo_account_rejected_on_non_loopback_host(), test_production_configuration_rejects_demo_access(), test_production_configuration_rejects_demo_credentials_at_startup() (+2 more)

### Community 29 - "auth.py"
Cohesion: 0.42
Nodes (3): hash_password(), verify_password(), test_password_hashing_is_not_plaintext()

### Community 30 - "Login.jsx"
Cohesion: 0.24
Nodes (9): Project structure (latest version), react, _r(), i, ic(), jf(), le(), X() (+1 more)

### Community 31 - "PahaadCare RPM — Milestone 5: Alert Escalation and Mock Notification Evidence"
Cohesion: 0.15
Nodes (12): 1. System Architecture, 2. Policy Configuration, 3. Escalation Lifecycle & State Transitions, 4. API Endpoints and Authorization, 5. Offline Queue Account Isolation Security Verification, 6. Deterministic Automated Verification, 7. Limitations and Remaining Risks, 8. How to Reproduce the Demo (+4 more)

### Community 32 - "PahaadCare RPM Contract Backend"
Cohesion: 0.25
Nodes (7): Deterministic synthetic demonstration, Local authentication setup, PahaadCare RPM Contract Backend, Run locally, Scope and safety, Setup, Test

### Community 33 - "validate_10_scenarios.py"
Cohesion: 0.17
Nodes (3): main(), auth_headers(), to_payload()

### Community 35 - "PahaadCare RPM — Milestone 4: End-to-End Validation and 10-Scenario Evidence"
Cohesion: 0.22
Nodes (8): 1. Test Environment & Verification Baseline, 2. 10-Scenario Reproducible Validation Matrix, 3. Offline-to-Online End-to-End Validation Evidence, 4. Alert Lifecycle and Auditability Evidence, 5. Patient Scope Authorization Evidence, 7. Known Limitations & Technical Boundaries, PahaadCare RPM — Milestone 4: End-to-End Validation and 10-Scenario Evidence, State Transition Verification

### Community 37 - "$f"
Cohesion: 0.67
Nodes (4): $f(), pcCompress(), pcUpload(), Rr()

### Community 38 - "6. Execution Command Log & Pass Rates"
Cohesion: 0.33
Nodes (6): 1. 10-Scenario End-to-End Validation Script, 2. Milestone 4 Pytest Suite, 3. Full Backend Unit & Integration Suite, 5. Frontend Node Unit Test Suite, 6. Execution Command Log & Pass Rates, 6. Frontend Production Build

## Knowledge Gaps
- **4 isolated node(s):** `@types/react`, `@types/react-dom`, `typescript`, `vite-plugin-pwa`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 296 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `5. Per-Event Status Reconciliation` connect `PahaadCare RPM API Contract` to `offlineQueue.js`, `PahaadCare RPM Durable Offline Event Queue and Synchronization Specification`?**
  _High betweenness centrality (0.306) - this node is a cross-community bridge._
- **Are the 21 inferred relationships involving `SQLiteRepository` (e.g. with `EscalationEngine` and `Alert`) actually correct?**
  _`SQLiteRepository` has 21 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/react`, `@types/react-dom`, `typescript` to the rest of the system?**
  _4 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `SQLiteRepository` be split into smaller, more focused modules?**
  _Cohesion score 0.08924050632911393 - nodes in this community are weakly interconnected._
- **Why does `getPendingEvents()` connect `offlineQueue.js` to `PahaadCare RPM API Contract`, `syncManager`?**
  _High betweenness centrality (0.273) - this node is a cross-community bridge._
- **Are the 27 inferred relationships involving `MeasurementEvent` (e.g. with `MonitoringEngine` and `ProcessedEvent`) actually correct?**
  _`MeasurementEvent` has 27 INFERRED edges - model-reasoned connections that need verification._
- **Should `PahaadCare RPM — Milestone 4: End-to-End Validation and 10-Scenario Evidence` be split into smaller, more focused modules?**
  _Cohesion score 0.13725490196078433 - nodes in this community are weakly interconnected._