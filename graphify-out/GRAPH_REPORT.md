# Graph Report - PahaadCare_Source_Code  (2026-10-22)

## Corpus Check
- 43 files · ~50,219 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 1, .bat 1, .example 1)

## Summary
- 646 nodes · 1613 edges · 21 communities (17 shown, 4 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 195 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c23c10ef`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- SQLiteRepository
- repository.py
- generate_scenario
- Qf
- models.py
- main.py
- MeasurementEvent
- package.json
- compilerOptions
- test_milestone1_apis.py
- RpmDashboard.jsx
- compilerOptions
- PahaadCare RPM API Contract
- tsconfig.json
- PahaadCare RPM — Security Documentation
- test_browser.py
- PahaadCare — Offline-first healthcare access prototype
- PahaadCare RPM Minimum Testing Strategy

## God Nodes (most connected - your core abstractions)
1. `SQLiteRepository` - 72 edges
2. `MeasurementEvent` - 58 edges
3. `MonitoringEngine` - 41 edges
4. `generate_scenario()` - 39 edges
5. `Qf()` - 39 edges
6. `Alert` - 37 edges
7. `RpmDashboard()` - 23 edges
8. `issue_token()` - 21 edges
9. `MissingDataEvent` - 20 edges
10. `InMemoryEventStore` - 20 edges

## Surprising Connections (you probably didn't know these)
- `Redaction` --references--> `token()`  [INFERRED]
  docs/security.md → backend/app/main.py
- `PahaadCare Unresolved Decisions` --references--> `browser_env()`  [INFERRED]
  docs/unresolved-decisions.md → backend/tests/test_browser.py
- `Project structure (latest version)` --references--> `Qf()`  [INFERRED]
  README.md → src/App.jsx
- `Project structure (latest version)` --references--> `jf()`  [INFERRED]
  README.md → src/Login.jsx
- `Scope and safety` --references--> `MonitoringEngine`  [INFERRED]
  backend/README.md → backend/app/engine.py

## Import Cycles
- None detected.

## Communities (21 total, 4 thin omitted)

### Community 0 - "SQLiteRepository"
Cohesion: 0.12
Nodes (19): SQLiteRepository, abnormal_event(), FixedClock, test_alert_acknowledgement_and_resolution_persist_after_restart(), test_api_lifecycle_endpoints_use_existing_response_contract(), test_concurrent_duplicate_submissions_create_one_record(), submit_once(), test_conflicting_event_id_is_restart_safe() (+11 more)

### Community 1 - "repository.py"
Cohesion: 0.08
Nodes (26): ConfigurationError, current_user(), hash_password(), issue_token(), require_role(), require_user(), dependency(), SecuritySettings (+18 more)

### Community 2 - "generate_scenario"
Cohesion: 0.09
Nodes (38): build_demo_dashboard_snapshot(), _event_record(), _iso(), _quality_record(), MonitoringEngine, ProcessedEvent, ProcessingOutcome, MissingDataEvent (+30 more)

### Community 3 - "Qf"
Cohesion: 0.06
Nodes (55): Project structure (latest version), react, react-dom, Af(), Ce(), Bf(), Df, $f() (+47 more)

### Community 4 - "models.py"
Cohesion: 0.08
Nodes (19): Acknowledgement, AlertCategory, AlertReason, AlertSeverity, AlertStatus, ContractModel, DeviceReference, EventSource (+11 more)

### Community 5 - "main.py"
Cohesion: 0.12
Nodes (24): has_patient_access(), acknowledge_alert(), AcknowledgeRequest, alert_response(), demo_rpm_dashboard(), error_response(), health(), http_exception_handler() (+16 more)

### Community 6 - "MeasurementEvent"
Cohesion: 0.07
Nodes (31): main(), Alert, MeasurementEvent, EventRepository, EventIdConflict, EventSubmission, InMemoryEventStore, is_timezone_aware_datetime() (+23 more)

### Community 7 - "package.json"
Cohesion: 0.07
Nodes (29): dependencies, lucide-react, react, react-dom, devDependencies, @types/react, @types/react-dom, typescript (+21 more)

### Community 8 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+10 more)

### Community 9 - "test_milestone1_apis.py"
Cohesion: 0.08
Nodes (14): _make_event(), test_alerts_listing_and_filtering(), test_batch_sync_bounds_and_malformed(), test_batch_sync_partial_success_and_conflict(), test_batch_sync_success_and_deduplication(), test_measurement_history_and_ordering(), test_patients_listing_admin_access(), _create_sample_event() (+6 more)

### Community 10 - "RpmDashboard.jsx"
Cohesion: 0.14
Nodes (31): AccessDeniedError, acknowledgeAlert(), clearStoredToken(), DEMO_STALE_THRESHOLD_MINUTES, fetchAlerts(), fetchPatientMeasurements(), fetchPatients(), getApiBaseUrl() (+23 more)

### Community 11 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, allowImportingTsExtensions, lib, module, moduleDetection, moduleResolution, noEmit, skipLibCheck (+5 more)

### Community 12 - "PahaadCare RPM API Contract"
Cohesion: 0.05
Nodes (39): Client Integration Endpoints, Common Rules, `GET /api/v1/alerts`, `GET /api/v1/demo/rpm-dashboard`, `GET /api/v1/patients`, `GET /api/v1/patients/{patient_id}/measurements`, `GET /health`, Milestone 2 Dashboard Integration & Polling Contract (+31 more)

### Community 17 - "PahaadCare RPM — Security Documentation"
Cohesion: 0.07
Nodes (28): 1. Demo Account Policy, 2. Token Policy, 3. Patient-Level Authorization, 4. Audit Chain, 5. Audit Export, 6. Frontend Session Handling, 7. Production Deployment Requirements, 8. Remaining Risks and Non-Goals (+20 more)

### Community 18 - "test_browser.py"
Cohesion: 0.15
Nodes (4): browser_env(), StaticHandler, test_browser_full_workflow(), test_browser_patient_selection_and_stale_data()

### Community 19 - "PahaadCare — Offline-first healthcare access prototype"
Cohesion: 0.18
Nodes (10): Before any real pilot, Important prototype limits, Install on Android, Multilingual and voice demo (added), PahaadCare — Offline-first healthcare access prototype, Patient ID, caregiver view and doctor report demo, Requirements, Responsive navigation update (+2 more)

### Community 22 - "PahaadCare RPM Minimum Testing Strategy"
Cohesion: 0.40
Nodes (4): Execution Gate, PahaadCare RPM Minimum Testing Strategy, Recommended Stack, Required Test Cases

## Knowledge Gaps
- **4 isolated node(s):** `@types/react`, `@types/react-dom`, `typescript`, `vite-plugin-pwa`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 218 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SQLiteRepository` connect `SQLiteRepository` to `repository.py`, `models.py`, `main.py`, `MeasurementEvent`, `test_milestone1_apis.py`, `test_browser.py`?**
  _High betweenness centrality (0.112) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `SQLiteRepository` (e.g. with `Alert` and `AlertStatus`) actually correct?**
  _`SQLiteRepository` has 7 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/react`, `@types/react-dom`, `typescript` to the rest of the system?**
  _4 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `SQLiteRepository` be split into smaller, more focused modules?**
  _Cohesion score 0.12057112638815441 - nodes in this community are weakly interconnected._
- **Why does `MeasurementEvent` connect `MeasurementEvent` to `SQLiteRepository`, `generate_scenario`, `models.py`, `main.py`, `test_milestone1_apis.py`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **Are the 27 inferred relationships involving `MeasurementEvent` (e.g. with `MonitoringEngine` and `ProcessedEvent`) actually correct?**
  _`MeasurementEvent` has 27 INFERRED edges - model-reasoned connections that need verification._
- **Should `repository.py` be split into smaller, more focused modules?**
  _Cohesion score 0.07755102040816327 - nodes in this community are weakly interconnected._