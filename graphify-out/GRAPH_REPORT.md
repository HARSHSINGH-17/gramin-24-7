# Graph Report - PahaadCare_Source_Code  (2026-10-23)

## Corpus Check
- 87 files · ~111,198 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: .example 3, (none) 3, .bat 1)

## Summary
- 1188 nodes · 3434 edges · 46 communities (35 shown, 11 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 440 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `82d14b37`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- SQLiteRepository
- PahaadCare RPM — Milestone 4: End-to-End Validation and 10-Scenario Evidence
- generate_scenario
- Qf
- MeasurementEvent
- main.py
- test_milestone5_escalation.py
- package.json
- compilerOptions
- model_validator
- RpmDashboard.jsx
- compilerOptions
- PahaadCare RPM API Contract
- tsconfig.json
- PahaadCare RPM — Security Documentation
- offlineQueue.js
- PahaadCare — Offline-First Remote Patient Monitoring (RPM) & Healthcare Platform
- PostgresRepository
- PahaadCare RPM Minimum Testing Strategy
- test_milestone1_apis.py
- issue_token
- PahaadCare RPM — Release Readiness and Verification Evidence
- auth.py
- PahaadCare RPM Contract Backend
- test_milestone3_sync.py
- test_production_security_gate.py
- test_milestone4_validation.py
- PahaadCare RPM — Milestone 5: Alert Escalation and Mock Notification Evidence
- dataQualityAndFreshness.test.js
- seed_live_data.py
- patientTimeSeriesChart.test.js
- test_milestone2_contracts.py
- test_security.py
- vercel.json
- SyntheticScenario
- MissingDataEvent
- 6. Execution Command Log & Pass Rates
- demo_dashboard.py

## God Nodes (most connected - your core abstractions)
1. `SQLiteRepository` - 132 edges
2. `MeasurementEvent` - 74 edges
3. `PostgresRepository` - 69 edges
4. `Alert` - 54 edges
5. `generate_scenario()` - 52 edges
6. `issue_token()` - 47 edges
7. `MonitoringEngine` - 46 edges
8. `Qf()` - 42 edges
9. `EscalationEngine` - 33 edges
10. `DoctorWorkspace()` - 31 edges

## Surprising Connections (you probably didn't know these)
- `6. Automatic vs. Manual Escalation Scheduling` --references--> `EscalationWorker`  [INFERRED]
  docs/release-readiness.md → backend/app/escalation.py
- `Redaction` --references--> `token()`  [INFERRED]
  docs/security.md → backend/app/main.py
- `PahaadCare Unresolved Decisions` --references--> `browser_env()`  [INFERRED]
  docs/unresolved-decisions.md → backend/tests/test_browser.py
- `React/Vite frontend` --references--> `syncManager`  [INFERRED]
  docs/rpm-architecture.md → src/syncManager.js
- `Offline Measurement Queueing` --references--> `syncManager`  [INFERRED]
  README.md → src/syncManager.js

## Import Cycles
- None detected.

## Communities (46 total, 11 thin omitted)

### Community 0 - "SQLiteRepository"
Cohesion: 0.08
Nodes (23): InvalidAlertTransition, SQLiteRepository, test_browser_full_workflow(), test_clean_database_initialization(), abnormal_event(), FixedClock, test_alert_acknowledgement_and_resolution_persist_after_restart(), test_api_lifecycle_endpoints_use_existing_response_contract() (+15 more)

### Community 1 - "PahaadCare RPM — Milestone 4: End-to-End Validation and 10-Scenario Evidence"
Cohesion: 0.16
Nodes (3): browser_env(), StaticHandler, test_browser_restored_onboarding_flow()

### Community 2 - "generate_scenario"
Cohesion: 0.20
Nodes (21): MonitoringEngine, ProcessingOutcome, generate_scenario(), test_scenario_4_stale_measurement_quality_alert(), FixedClock, test_below_and_above_thresholds_create_alerts(), test_conflicting_event_id_is_rejected(), test_duplicate_and_conflict_scenarios_are_intentional() (+13 more)

### Community 3 - "Qf"
Cohesion: 0.06
Nodes (55): Af(), Ce(), Bf(), Df, $f(), fc, Ff, gc() (+47 more)

### Community 4 - "MeasurementEvent"
Cohesion: 0.07
Nodes (34): MeasurementEvent, alert_from_missing_data(), DemonstrationThreshold, evaluate_demo_threshold(), validate_thresholds(), EventRepository, EventIdConflict, EventSubmission (+26 more)

### Community 5 - "main.py"
Cohesion: 0.08
Nodes (44): has_patient_access(), acknowledge_alert(), AcknowledgeRequest, alert_response(), create_patient(), CreatePatientRequest, demo_rpm_dashboard(), error_response() (+36 more)

### Community 6 - "test_milestone5_escalation.py"
Cohesion: 0.07
Nodes (48): EscalationEngine, EscalationWorker, Acknowledgement, AlertCategory, AlertEscalationState, AlertReason, AlertSeverity, AlertStatus (+40 more)

### Community 7 - "package.json"
Cohesion: 0.07
Nodes (29): dependencies, lucide-react, react, react-dom, devDependencies, @types/react, @types/react-dom, typescript (+21 more)

### Community 8 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+10 more)

### Community 10 - "RpmDashboard.jsx"
Cohesion: 0.08
Nodes (66): lucide-react, react, react-dom, ClinicianLogin(), AlertsManager(), DoctorLayout(), DoctorNavigation(), DoctorTopbar() (+58 more)

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
Cohesion: 0.06
Nodes (46): 1. Test Environment & Verification Baseline, 2. 10-Scenario Reproducible Validation Matrix, 3. Offline-to-Online End-to-End Validation Evidence, 4. Alert Lifecycle and Auditability Evidence, 5. Patient Scope Authorization Evidence, 7. Known Limitations & Technical Boundaries, PahaadCare RPM — Milestone 4: End-to-End Validation and 10-Scenario Evidence, State Transition Verification (+38 more)

### Community 19 - "PahaadCare — Offline-First Remote Patient Monitoring (RPM) & Healthcare Platform"
Cohesion: 0.12
Nodes (16): 1. System Architecture & Components, 2. Installation & Quickstart, 3. Launching the Services, 4. Demonstration Accounts & Roles, 5. Automated Regression Test Suite, 6. Offline Queue & Escalation Behavior, 7. Known Prototype Limitations & Safety Boundaries, Multi-Tier Escalation Ladder (+8 more)

### Community 20 - "PostgresRepository"
Cohesion: 0.12
Nodes (3): Alert, EscalationPolicy, PostgresRepository

### Community 22 - "PahaadCare RPM Minimum Testing Strategy"
Cohesion: 0.40
Nodes (4): Execution Gate, PahaadCare RPM Minimum Testing Strategy, Recommended Stack, Required Test Cases

### Community 23 - "test_milestone1_apis.py"
Cohesion: 0.22
Nodes (7): _make_event(), test_alerts_listing_and_filtering(), test_batch_sync_bounds_and_malformed(), test_batch_sync_partial_success_and_conflict(), test_batch_sync_success_and_deduplication(), test_measurement_history_and_ordering(), test_patients_listing_admin_access()

### Community 24 - "issue_token"
Cohesion: 0.16
Nodes (18): issue_token(), auth_headers(), test_patient_scope_authorization_enforcement(), test_error_envelope_sanitization(), test_security_cross_patient_scope_denied(), test_security_process_escalation_authorization(), test_worker_status_endpoint(), test_error_envelopes_do_not_expose_stack_traces_or_internals() (+10 more)

### Community 25 - "PahaadCare RPM — Release Readiness and Verification Evidence"
Cohesion: 0.13
Nodes (14): 1. Verified Features vs. Known Limitations, 2. Environment Variables & Configuration, 3. Setup and Execution Commands, 4. Demo Account Credentials (Synthetic), 5. Verification Test Suite & Pass/Fail Counts, 6. Automatic vs. Manual Escalation Scheduling, 7. Security Audit Findings & Remediation, 8. Repeatable 10-Step Demonstration Script (+6 more)

### Community 26 - "auth.py"
Cohesion: 0.12
Nodes (9): current_user(), decode_token(), hash_password(), require_role(), require_user(), dependency(), unauthorized(), verify_password() (+1 more)

### Community 27 - "PahaadCare RPM Contract Backend"
Cohesion: 0.29
Nodes (6): Deterministic synthetic demonstration, Local authentication setup, PahaadCare RPM Contract Backend, Run locally, Setup, Test

### Community 28 - "test_milestone3_sync.py"
Cohesion: 0.21
Nodes (5): _make_sync_event(), test_sync_events_accepted_and_duplicate(), test_sync_events_bounded_batch_limits(), test_sync_events_conflict_on_altered_payload(), test_sync_events_partial_batch_with_scope_rejection()

### Community 29 - "test_production_security_gate.py"
Cohesion: 0.06
Nodes (14): client(), test_admin_can_provision_clinician_account(), test_database_outage_and_recovery_readiness(), test_duplicate_measurement_submission_idempotency(), test_family_member_cannot_access_unauthorized_patient(), test_family_registration_rejects_missing_patient_id(), test_family_registration_requires_existing_patient(), test_invitation_code_allows_clinician_provisioning() (+6 more)

### Community 30 - "test_milestone4_validation.py"
Cohesion: 0.12
Nodes (13): _get_db_measurement(), test_alert_lifecycle_and_invalid_transition_rejection(), test_audit_trail_cryptographic_verification(), test_scenario_10_offline_sync_and_retry_idempotency(), test_scenario_1_normal_reading(), test_scenario_2_abnormal_reading_triggers_alerts(), test_scenario_5_duplicate_event_idempotency(), test_scenario_6_conflicting_payload_rejection() (+5 more)

### Community 31 - "PahaadCare RPM — Milestone 5: Alert Escalation and Mock Notification Evidence"
Cohesion: 0.15
Nodes (12): 1. System Architecture, 2. Policy Configuration, 3. Escalation Lifecycle & State Transitions, 4. API Endpoints and Authorization, 5. Offline Queue Account Isolation Security Verification, 6. Deterministic Automated Verification, 7. Limitations and Remaining Risks, 8. How to Reproduce the Demo (+4 more)

### Community 32 - "dataQualityAndFreshness.test.js"
Cohesion: 0.33
Nodes (9): DATA_QUALITY_STATUS, DEMO_FRESHNESS_CONFIG, detectTelemetryGaps(), evaluateMeasurementQuality(), formatIngestionTime(), formatObservationTime(), formatRelativeAge(), formatStandardUnit() (+1 more)

### Community 33 - "seed_live_data.py"
Cohesion: 0.14
Nodes (8): main(), create_repository(), migrate(), provision_user(), seed_database(), test_development_allows_sqlite_fallback(), test_production_startup_with_failing_postgres_connection_does_not_fallback(), test_production_startup_without_database_url_fails_strictly()

### Community 37 - "test_milestone2_contracts.py"
Cohesion: 0.16
Nodes (7): _create_sample_event(), test_alert_lifecycle_notes_and_transitions(), test_alert_listing_filters(), test_cross_patient_alert_action_denied(), test_measurement_ordering_chronological(), test_patient_detail_empty_measurements(), test_unauthenticated_requests_fail_401()

### Community 38 - "test_security.py"
Cohesion: 0.20
Nodes (12): ConfigurationError, SecuritySettings, test_production_configuration_rejects_demo_enabled(), test_production_configuration_rejects_short_secret(), test_production_cors_rejects_wildcard(), test_demo_account_rejected_on_non_loopback_host(), test_demo_endpoint_fails_closed_when_disabled(), test_health_is_public_but_protected_routes_require_authentication() (+4 more)

### Community 39 - "vercel.json"
Cohesion: 0.29
Nodes (6): buildCommand, framework, headers, outputDirectory, rewrites, $schema

### Community 41 - "SyntheticScenario"
Cohesion: 0.25
Nodes (7): main(), _event_id(), _measurement(), _missing(), SyntheticScenario, run_validation(), to_payload()

### Community 42 - "MissingDataEvent"
Cohesion: 0.22
Nodes (4): MissingDataEvent, Scope and safety, SyntheticSequence, test_scenario_3_missing_data_event_quality_alert()

### Community 43 - "6. Execution Command Log & Pass Rates"
Cohesion: 0.18
Nodes (9): test_browser_offline_queue_and_sync(), test_browser_patient_selection_and_stale_data(), 1. 10-Scenario End-to-End Validation Script, 2. Milestone 4 Pytest Suite, 3. Full Backend Unit & Integration Suite, 4. Browser Playwright E2E Test Suite, 5. Frontend Node Unit Test Suite, 6. Execution Command Log & Pass Rates (+1 more)

### Community 45 - "demo_dashboard.py"
Cohesion: 0.76
Nodes (5): build_demo_dashboard_snapshot(), _event_record(), _iso(), _quality_record(), ProcessedEvent

## Knowledge Gaps
- **4 isolated node(s):** `@types/react`, `@types/react-dom`, `typescript`, `vite-plugin-pwa`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 379 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `5. Per-Event Status Reconciliation` connect `PahaadCare RPM API Contract` to `offlineQueue.js`?**
  _High betweenness centrality (0.345) - this node is a cross-community bridge._
- **Are the 22 inferred relationships involving `SQLiteRepository` (e.g. with `EscalationEngine` and `Alert`) actually correct?**
  _`SQLiteRepository` has 22 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/react`, `@types/react-dom`, `typescript` to the rest of the system?**
  _4 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `SQLiteRepository` be split into smaller, more focused modules?**
  _Cohesion score 0.0801641586867305 - nodes in this community are weakly interconnected._
- **Why does `getPendingEvents()` connect `offlineQueue.js` to `PahaadCare RPM API Contract`?**
  _High betweenness centrality (0.323) - this node is a cross-community bridge._
- **Are the 29 inferred relationships involving `MeasurementEvent` (e.g. with `MonitoringEngine` and `ProcessedEvent`) actually correct?**
  _`MeasurementEvent` has 29 INFERRED edges - model-reasoned connections that need verification._
- **Should `Qf` be split into smaller, more focused modules?**
  _Cohesion score 0.061581920903954805 - nodes in this community are weakly interconnected._