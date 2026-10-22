# Graph Report - PahaadCare_Source_Code  (2026-10-22)

## Corpus Check
- 54 files · ~66,116 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 1, .bat 1, .example 1)

## Summary
- 852 nodes · 2342 edges · 36 communities (29 shown, 7 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 314 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `33e9383e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- SQLiteRepository
- PahaadCare RPM — Milestone 4: End-to-End Validation and 10-Scenario Evidence
- generate_scenario
- Qf
- MeasurementEvent
- main.py
- test_persistence.py
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
- test_milestone3_sync.py
- test_milestone1_apis.py
- createMockIndexedDB
- auth.py
- Login.jsx
- PahaadCare RPM Contract Backend
- validate_10_scenarios.py
- current_user
- main.jsx
- $f

## God Nodes (most connected - your core abstractions)
1. `SQLiteRepository` - 109 edges
2. `MeasurementEvent` - 59 edges
3. `generate_scenario()` - 52 edges
4. `MonitoringEngine` - 46 edges
5. `Alert` - 39 edges
6. `Qf()` - 39 edges
7. `issue_token()` - 29 edges
8. `SyntheticScenario` - 28 edges
9. `RpmDashboard()` - 27 edges
10. `EscalationEngine` - 25 edges

## Surprising Connections (you probably didn't know these)
- `Redaction` --references--> `token()`  [INFERRED]
  docs/security.md → backend/app/main.py
- `PahaadCare Unresolved Decisions` --references--> `browser_env()`  [INFERRED]
  docs/unresolved-decisions.md → backend/tests/test_browser.py
- `1. Test Environment & Verification Baseline` --references--> `MemoryStore`  [INFERRED]
  docs/rpm-10-event-evidence.md → src/offlineQueue.js
- `Storage Resilience & Privacy Guarantees` --references--> `enqueueMeasurementEvent()`  [INFERRED]
  docs/rpm-offline-sync.md → src/offlineQueue.js
- `7. Known Limitations & Future Work` --references--> `clearDeliveredEvents()`  [INFERRED]
  docs/rpm-offline-sync.md → src/offlineQueue.js

## Import Cycles
- None detected.

## Communities (36 total, 7 thin omitted)

### Community 0 - "SQLiteRepository"
Cohesion: 0.08
Nodes (29): EscalationEngine, AlertEscalationState, EscalationPolicy, EscalationRole, EscalationStatus, MockNotification, NotificationDeliveryStatus, MockNotificationAdapter (+21 more)

### Community 1 - "PahaadCare RPM — Milestone 4: End-to-End Validation and 10-Scenario Evidence"
Cohesion: 0.07
Nodes (19): browser_env(), StaticHandler, test_browser_offline_queue_and_sync(), test_browser_patient_selection_and_stale_data(), 1. 10-Scenario End-to-End Validation Script, 1. Test Environment & Verification Baseline, 2. 10-Scenario Reproducible Validation Matrix, 2. Milestone 4 Pytest Suite (+11 more)

### Community 2 - "generate_scenario"
Cohesion: 0.06
Nodes (48): build_demo_dashboard_snapshot(), _event_record(), _iso(), _quality_record(), MonitoringEngine, ProcessedEvent, ProcessingOutcome, MissingDataEvent (+40 more)

### Community 3 - "Qf"
Cohesion: 0.16
Nodes (22): pcD(), Qf(), gl(), _i(), Mi(), pcAddFc(), pcCopy(), pcFam() (+14 more)

### Community 4 - "MeasurementEvent"
Cohesion: 0.06
Nodes (49): Acknowledgement, Alert, AlertCategory, AlertReason, AlertSeverity, AlertStatus, ContractModel, DeviceReference (+41 more)

### Community 5 - "main.py"
Cohesion: 0.12
Nodes (28): has_patient_access(), acknowledge_alert(), AcknowledgeRequest, alert_response(), demo_rpm_dashboard(), error_response(), get_alert_escalations(), health() (+20 more)

### Community 6 - "test_persistence.py"
Cohesion: 0.21
Nodes (15): abnormal_event(), FixedClock, test_alert_acknowledgement_and_resolution_persist_after_restart(), test_api_lifecycle_endpoints_use_existing_response_contract(), test_concurrent_duplicate_submissions_create_one_record(), submit_once(), test_conflicting_event_id_is_restart_safe(), test_database_initialization_creates_schema() (+7 more)

### Community 7 - "package.json"
Cohesion: 0.07
Nodes (30): dependencies, lucide-react, react, react-dom, devDependencies, @types/react, @types/react-dom, typescript (+22 more)

### Community 8 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+10 more)

### Community 9 - "test_milestone1_apis.py"
Cohesion: 0.15
Nodes (7): _create_sample_event(), test_alert_lifecycle_notes_and_transitions(), test_alert_listing_filters(), test_cross_patient_alert_action_denied(), test_measurement_ordering_chronological(), test_patient_detail_empty_measurements(), test_unauthenticated_requests_fail_401()

### Community 10 - "RpmDashboard.jsx"
Cohesion: 0.12
Nodes (35): AccessDeniedError, acknowledgeAlert(), clearStoredToken(), DEMO_STALE_THRESHOLD_MINUTES, fetchAlertEscalation(), fetchAlerts(), fetchEscalationPolicies(), fetchPatientMeasurements() (+27 more)

### Community 11 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, allowImportingTsExtensions, lib, module, moduleDetection, moduleResolution, noEmit, skipLibCheck (+5 more)

### Community 12 - "PahaadCare RPM API Contract"
Cohesion: 0.05
Nodes (39): Client Integration Endpoints, Common Rules, `GET /api/v1/alerts`, `GET /api/v1/demo/rpm-dashboard`, `GET /api/v1/patients`, `GET /api/v1/patients/{patient_id}/measurements`, `GET /health`, Milestone 2 Dashboard Integration & Polling Contract (+31 more)

### Community 17 - "PahaadCare RPM — Security Documentation"
Cohesion: 0.07
Nodes (28): 1. Demo Account Policy, 2. Token Policy, 3. Patient-Level Authorization, 4. Audit Chain, 5. Audit Export, 6. Frontend Session Handling, 7. Production Deployment Requirements, 8. Remaining Risks and Non-Goals (+20 more)

### Community 18 - "offlineQueue.js"
Cohesion: 0.19
Nodes (20): clearDeliveredEvents(), DB_NAME, DB_VERSION, enqueueMeasurementEvent(), getMemoryStore(), getPendingEvents(), getQueuedEvent(), getQueueSummary() (+12 more)

### Community 19 - "PahaadCare — Offline-first healthcare access prototype"
Cohesion: 0.18
Nodes (10): Before any real pilot, Important prototype limits, Install on Android, Multilingual and voice demo (added), PahaadCare — Offline-first healthcare access prototype, Patient ID, caregiver view and doctor report demo, Requirements, Responsive navigation update (+2 more)

### Community 20 - "PahaadCare RPM Durable Offline Event Queue and Synchronization Specification"
Cohesion: 0.12
Nodes (16): 1. Overview & Architecture, 2. IndexedDB Queue Schema, 3. Event Lifecycle & Delivery States, 4. Synchronization Manager (`syncManager.js`), 5. Per-Event Status Reconciliation, 6. Account-Switch & Shift-Handover Policy, 7. Known Limitations & Future Work, Authentication Enforcement (+8 more)

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
Cohesion: 0.19
Nodes (15): issue_token(), SecuritySettings, test_patient_scope_authorization_enforcement(), test_administrator_role_explicit_access(), test_demo_account_rejected_on_non_loopback_host(), test_health_is_public_but_protected_routes_require_authentication(), test_invalid_expired_and_bad_signature_tokens_are_rejected(), test_logout_endpoint_revokes_token_server_side() (+7 more)

### Community 25 - "test_milestone3_sync.py"
Cohesion: 0.21
Nodes (5): _make_sync_event(), test_sync_events_accepted_and_duplicate(), test_sync_events_bounded_batch_limits(), test_sync_events_conflict_on_altered_payload(), test_sync_events_partial_batch_with_scope_rejection()

### Community 27 - "test_milestone1_apis.py"
Cohesion: 0.22
Nodes (7): _make_event(), test_alerts_listing_and_filtering(), test_batch_sync_bounds_and_malformed(), test_batch_sync_partial_success_and_conflict(), test_batch_sync_success_and_deduplication(), test_measurement_history_and_ordering(), test_patients_listing_admin_access()

### Community 29 - "auth.py"
Cohesion: 0.24
Nodes (4): ConfigurationError, hash_password(), verify_password(), test_password_hashing_is_not_plaintext()

### Community 30 - "Login.jsx"
Cohesion: 0.24
Nodes (9): Project structure (latest version), react, _r(), i, ic(), jf(), le(), X() (+1 more)

### Community 32 - "PahaadCare RPM Contract Backend"
Cohesion: 0.29
Nodes (6): Deterministic synthetic demonstration, Local authentication setup, PahaadCare RPM Contract Backend, Run locally, Setup, Test

### Community 33 - "validate_10_scenarios.py"
Cohesion: 0.17
Nodes (4): main(), auth_headers(), get_db_measurement(), to_payload()

### Community 34 - "current_user"
Cohesion: 0.20
Nodes (5): current_user(), require_role(), require_user(), dependency(), unauthorized()

### Community 37 - "$f"
Cohesion: 0.67
Nodes (4): $f(), pcCompress(), pcUpload(), Rr()

## Knowledge Gaps
- **4 isolated node(s):** `@types/react`, `@types/react-dom`, `typescript`, `vite-plugin-pwa`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 272 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `5. Per-Event Status Reconciliation` connect `PahaadCare RPM Durable Offline Event Queue and Synchronization Specification` to `generate_scenario`, `offlineQueue.js`?**
  _High betweenness centrality (0.317) - this node is a cross-community bridge._
- **Are the 16 inferred relationships involving `SQLiteRepository` (e.g. with `EscalationEngine` and `Alert`) actually correct?**
  _`SQLiteRepository` has 16 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/react`, `@types/react-dom`, `typescript` to the rest of the system?**
  _4 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `SQLiteRepository` be split into smaller, more focused modules?**
  _Cohesion score 0.07584158415841584 - nodes in this community are weakly interconnected._
- **Why does `getPendingEvents()` connect `offlineQueue.js` to `PahaadCare RPM Durable Offline Event Queue and Synchronization Specification`, `syncManager`?**
  _High betweenness centrality (0.283) - this node is a cross-community bridge._
- **Are the 27 inferred relationships involving `MeasurementEvent` (e.g. with `MonitoringEngine` and `ProcessedEvent`) actually correct?**
  _`MeasurementEvent` has 27 INFERRED edges - model-reasoned connections that need verification._
- **Should `PahaadCare RPM — Milestone 4: End-to-End Validation and 10-Scenario Evidence` be split into smaller, more focused modules?**
  _Cohesion score 0.06818181818181818 - nodes in this community are weakly interconnected._