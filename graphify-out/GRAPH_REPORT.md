# Graph Report - PahaadCare_Source_Code  (2026-10-22)

## Corpus Check
- 48 files · ~56,978 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 1, .bat 1, .example 1)

## Summary
- 728 nodes · 1817 edges · 38 communities (28 shown, 10 thin omitted)
- Extraction: 89% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 206 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2cceb50b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- SQLiteRepository
- SecuritySettings
- generate_scenario
- Qf
- models.py
- main.py
- test_contracts.py
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
- repository.py
- App.jsx
- PahaadCare RPM Minimum Testing Strategy
- MeasurementEvent
- test_security.py
- ContractModel
- model_validator
- test_milestone1_apis.py
- test_milestone3_sync.py
- auth.py
- Login.jsx
- Alert
- PahaadCare RPM Contract Backend
- conftest.py
- current_user
- export_audit.py
- main.jsx
- $f

## God Nodes (most connected - your core abstractions)
1. `SQLiteRepository` - 72 edges
2. `MeasurementEvent` - 58 edges
3. `MonitoringEngine` - 41 edges
4. `generate_scenario()` - 39 edges
5. `Qf()` - 39 edges
6. `Alert` - 37 edges
7. `RpmDashboard()` - 26 edges
8. `issue_token()` - 23 edges
9. `MissingDataEvent` - 20 edges
10. `InMemoryEventStore` - 20 edges

## Surprising Connections (you probably didn't know these)
- `Redaction` --references--> `token()`  [INFERRED]
  docs/security.md → backend/app/main.py
- `PahaadCare Unresolved Decisions` --references--> `browser_env()`  [INFERRED]
  docs/unresolved-decisions.md → backend/tests/test_browser.py
- `React/Vite frontend` --references--> `syncManager`  [INFERRED]
  docs/rpm-architecture.md → src/syncManager.js
- `Project structure (latest version)` --references--> `Qf()`  [INFERRED]
  README.md → src/App.jsx
- `6. Account-Switch & Shift-Handover Policy` --references--> `signOut()`  [INFERRED]
  docs/rpm-offline-sync.md → src/RpmDashboard.jsx

## Import Cycles
- None detected.

## Communities (38 total, 10 thin omitted)

### Community 0 - "SQLiteRepository"
Cohesion: 0.10
Nodes (23): AlertNotFound, InvalidAlertTransition, SQLiteRepository, test_browser_full_workflow(), abnormal_event(), FixedClock, test_alert_acknowledgement_and_resolution_persist_after_restart(), test_api_lifecycle_endpoints_use_existing_response_contract() (+15 more)

### Community 1 - "SecuritySettings"
Cohesion: 0.24
Nodes (10): ConfigurationError, require_role(), require_user(), dependency(), SecuritySettings, test_demo_account_rejected_on_non_loopback_host(), test_production_configuration_rejects_demo_access(), test_production_configuration_rejects_demo_credentials_at_startup() (+2 more)

### Community 2 - "generate_scenario"
Cohesion: 0.08
Nodes (35): build_demo_dashboard_snapshot(), _event_record(), _iso(), _quality_record(), MonitoringEngine, ProcessedEvent, ProcessingOutcome, MissingDataEvent (+27 more)

### Community 3 - "Qf"
Cohesion: 0.16
Nodes (22): pcD(), Qf(), gl(), _i(), Mi(), pcAddFc(), pcCopy(), pcFam() (+14 more)

### Community 4 - "models.py"
Cohesion: 0.36
Nodes (9): AlertCategory, AlertReason, AlertSeverity, AlertStatus, EventSource, MeasurementType, MeasurementUnit, MissingDataCategory (+1 more)

### Community 5 - "main.py"
Cohesion: 0.13
Nodes (22): has_patient_access(), acknowledge_alert(), AcknowledgeRequest, alert_response(), demo_rpm_dashboard(), error_response(), health(), http_exception_handler() (+14 more)

### Community 6 - "test_contracts.py"
Cohesion: 0.12
Nodes (16): is_timezone_aware_datetime(), is_uuid(), test_additional_measurement_properties_are_rejected(), test_alert_optional_fields_reject_explicit_null(), test_alert_status_requires_acknowledgement_and_resolution_metadata(), test_all_supported_measurements_match_schema_and_model(), test_json_alert_schema_accepts_resolved_alert(), test_measurement_optional_fields_reject_explicit_null() (+8 more)

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
Nodes (33): AccessDeniedError, acknowledgeAlert(), clearStoredToken(), DEMO_STALE_THRESHOLD_MINUTES, fetchAlerts(), fetchPatientMeasurements(), fetchPatients(), getApiBaseUrl() (+25 more)

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
Cohesion: 0.08
Nodes (37): 1. Overview & Architecture, 2. IndexedDB Queue Schema, 3. Event Lifecycle & Delivery States, 4. Synchronization Manager (`syncManager.js`), 6. Account-Switch & Shift-Handover Policy, 7. Known Limitations & Future Work, Authentication Enforcement, Batch Limits (+29 more)

### Community 19 - "PahaadCare — Offline-first healthcare access prototype"
Cohesion: 0.18
Nodes (10): Before any real pilot, Important prototype limits, Install on Android, Multilingual and voice demo (added), PahaadCare — Offline-first healthcare access prototype, Patient ID, caregiver view and doctor report demo, Requirements, Responsive navigation update (+2 more)

### Community 20 - "repository.py"
Cohesion: 0.20
Nodes (5): DemonstrationThreshold, evaluate_demo_threshold(), validate_thresholds(), EventIdConflict, test_threshold_configuration_is_complete_and_ordered()

### Community 21 - "App.jsx"
Cohesion: 0.12
Nodes (19): Af(), Ce(), Bf(), Df, fc, Ff, gc(), Hf (+11 more)

### Community 22 - "PahaadCare RPM Minimum Testing Strategy"
Cohesion: 0.40
Nodes (4): Execution Gate, PahaadCare RPM Minimum Testing Strategy, Recommended Stack, Required Test Cases

### Community 23 - "MeasurementEvent"
Cohesion: 0.29
Nodes (11): MeasurementEvent, EventSubmission, InMemoryEventStore, test_abnormal_demo_measurement_creates_simulated_alert(), test_distinct_abnormal_events_share_one_active_demo_alert(), test_event_id_is_stable_and_duplicate_submission_is_idempotent(), test_future_measurement_is_accepted_until_clock_skew_policy_is_decided(), test_normal_measurement_creates_no_alert() (+3 more)

### Community 24 - "test_security.py"
Cohesion: 0.26
Nodes (9): issue_token(), test_administrator_role_explicit_access(), test_cross_patient_alert_lifecycle_is_denied(), test_health_is_public_but_protected_routes_require_authentication(), test_invalid_expired_and_bad_signature_tokens_are_rejected(), test_logout_endpoint_revokes_token_server_side(), test_patient_level_authorization_enforces_scope(), test_token_contains_required_claims() (+1 more)

### Community 25 - "ContractModel"
Cohesion: 0.22
Nodes (4): Acknowledgement, ContractModel, HealthWorkerReference, Resolution

### Community 27 - "test_milestone1_apis.py"
Cohesion: 0.22
Nodes (7): _make_event(), test_alerts_listing_and_filtering(), test_batch_sync_bounds_and_malformed(), test_batch_sync_partial_success_and_conflict(), test_batch_sync_success_and_deduplication(), test_measurement_history_and_ordering(), test_patients_listing_admin_access()

### Community 28 - "test_milestone3_sync.py"
Cohesion: 0.21
Nodes (5): _make_sync_event(), test_sync_events_accepted_and_duplicate(), test_sync_events_bounded_batch_limits(), test_sync_events_conflict_on_altered_payload(), test_sync_events_partial_batch_with_scope_rejection()

### Community 29 - "auth.py"
Cohesion: 0.31
Nodes (3): hash_password(), verify_password(), test_password_hashing_is_not_plaintext()

### Community 30 - "Login.jsx"
Cohesion: 0.24
Nodes (9): Project structure (latest version), react, _r(), i, ic(), jf(), le(), X() (+1 more)

### Community 32 - "PahaadCare RPM Contract Backend"
Cohesion: 0.25
Nodes (7): Deterministic synthetic demonstration, Local authentication setup, PahaadCare RPM Contract Backend, Run locally, Scope and safety, Setup, Test

### Community 37 - "$f"
Cohesion: 0.67
Nodes (4): $f(), pcCompress(), pcUpload(), Rr()

## Knowledge Gaps
- **4 isolated node(s):** `@types/react`, `@types/react-dom`, `typescript`, `vite-plugin-pwa`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 242 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `5. Per-Event Status Reconciliation` connect `PahaadCare RPM API Contract` to `offlineQueue.js`?**
  _High betweenness centrality (0.354) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `SQLiteRepository` (e.g. with `Alert` and `AlertStatus`) actually correct?**
  _`SQLiteRepository` has 7 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/react`, `@types/react-dom`, `typescript` to the rest of the system?**
  _4 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `SQLiteRepository` be split into smaller, more focused modules?**
  _Cohesion score 0.10020120724346077 - nodes in this community are weakly interconnected._
- **Why does `getPendingEvents()` connect `offlineQueue.js` to `PahaadCare RPM API Contract`?**
  _High betweenness centrality (0.316) - this node is a cross-community bridge._
- **Are the 27 inferred relationships involving `MeasurementEvent` (e.g. with `MonitoringEngine` and `ProcessedEvent`) actually correct?**
  _`MeasurementEvent` has 27 INFERRED edges - model-reasoned connections that need verification._
- **Should `generate_scenario` be split into smaller, more focused modules?**
  _Cohesion score 0.07567567567567568 - nodes in this community are weakly interconnected._