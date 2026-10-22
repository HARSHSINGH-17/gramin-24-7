# Graph Report - PahaadCare_Source_Code  (2026-10-22)

## Corpus Check
- 41 files · ~47,266 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 1, .bat 1, .example 1)

## Summary
- 602 nodes · 1497 edges · 25 communities (20 shown, 5 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 190 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `73ef30ab`
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
- App.jsx
- PahaadCare — Offline-first healthcare access prototype
- Login.jsx
- PahaadCare RPM Contract Backend
- PahaadCare RPM Minimum Testing Strategy
- main.jsx
- $f

## God Nodes (most connected - your core abstractions)
1. `SQLiteRepository` - 71 edges
2. `MeasurementEvent` - 56 edges
3. `Qf()` - 39 edges
4. `generate_scenario()` - 38 edges
5. `Alert` - 37 edges
6. `MonitoringEngine` - 36 edges
7. `MissingDataEvent` - 20 edges
8. `InMemoryEventStore` - 20 edges
9. `issue_token()` - 19 edges
10. `ProcessingOutcome` - 18 edges

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

## Communities (25 total, 5 thin omitted)

### Community 0 - "SQLiteRepository"
Cohesion: 0.10
Nodes (21): Alert, SQLiteRepository, test_browser_full_workflow(), abnormal_event(), FixedClock, test_alert_acknowledgement_and_resolution_persist_after_restart(), test_api_lifecycle_endpoints_use_existing_response_contract(), test_concurrent_duplicate_submissions_create_one_record() (+13 more)

### Community 1 - "repository.py"
Cohesion: 0.05
Nodes (28): ConfigurationError, current_user(), hash_password(), issue_token(), require_role(), require_user(), dependency(), SecuritySettings (+20 more)

### Community 2 - "generate_scenario"
Cohesion: 0.12
Nodes (33): build_demo_dashboard_snapshot(), _event_record(), _iso(), _quality_record(), MonitoringEngine, ProcessedEvent, ProcessingOutcome, MissingDataEvent (+25 more)

### Community 3 - "Qf"
Cohesion: 0.16
Nodes (22): pcD(), Qf(), gl(), _i(), Mi(), pcAddFc(), pcCopy(), pcFam() (+14 more)

### Community 4 - "models.py"
Cohesion: 0.09
Nodes (19): Acknowledgement, AlertCategory, AlertReason, AlertSeverity, AlertStatus, ContractModel, DeviceReference, EventSource (+11 more)

### Community 5 - "main.py"
Cohesion: 0.12
Nodes (24): has_patient_access(), acknowledge_alert(), AcknowledgeRequest, alert_response(), demo_rpm_dashboard(), error_response(), health(), http_exception_handler() (+16 more)

### Community 6 - "MeasurementEvent"
Cohesion: 0.08
Nodes (29): MeasurementEvent, EventRepository, EventIdConflict, EventSubmission, InMemoryEventStore, is_timezone_aware_datetime(), is_uuid(), test_abnormal_demo_measurement_creates_simulated_alert() (+21 more)

### Community 7 - "package.json"
Cohesion: 0.07
Nodes (29): dependencies, lucide-react, react, react-dom, devDependencies, @types/react, @types/react-dom, typescript (+21 more)

### Community 8 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+10 more)

### Community 9 - "test_milestone1_apis.py"
Cohesion: 0.15
Nodes (7): _make_event(), test_alerts_listing_and_filtering(), test_batch_sync_bounds_and_malformed(), test_batch_sync_partial_success_and_conflict(), test_batch_sync_success_and_deduplication(), test_measurement_history_and_ordering(), test_patients_listing_admin_access()

### Community 10 - "RpmDashboard.jsx"
Cohesion: 0.26
Nodes (10): API_BASE_URL, displayReading(), formatTime(), Metric(), PatientDetail(), PatientTable(), READING_TYPES, readingStatus() (+2 more)

### Community 11 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, allowImportingTsExtensions, lib, module, moduleDetection, moduleResolution, noEmit, skipLibCheck (+5 more)

### Community 12 - "PahaadCare RPM API Contract"
Cohesion: 0.05
Nodes (36): Common Rules, `GET /api/v1/alerts`, `GET /api/v1/demo/rpm-dashboard`, `GET /api/v1/patients`, `GET /api/v1/patients/{patient_id}/measurements`, `GET /health`, PahaadCare RPM API Contract, `POST /api/v1/alerts/{alert_id}/acknowledge` (+28 more)

### Community 17 - "PahaadCare RPM — Security Documentation"
Cohesion: 0.07
Nodes (28): 1. Demo Account Policy, 2. Token Policy, 3. Patient-Level Authorization, 4. Audit Chain, 5. Audit Export, 6. Frontend Session Handling, 7. Production Deployment Requirements, 8. Remaining Risks and Non-Goals (+20 more)

### Community 18 - "App.jsx"
Cohesion: 0.12
Nodes (19): Af(), Ce(), Bf(), Df, fc, Ff, gc(), Hf (+11 more)

### Community 19 - "PahaadCare — Offline-first healthcare access prototype"
Cohesion: 0.18
Nodes (10): Before any real pilot, Important prototype limits, Install on Android, Multilingual and voice demo (added), PahaadCare — Offline-first healthcare access prototype, Patient ID, caregiver view and doctor report demo, Requirements, Responsive navigation update (+2 more)

### Community 20 - "Login.jsx"
Cohesion: 0.24
Nodes (9): Project structure (latest version), react, _r(), i, ic(), jf(), le(), X() (+1 more)

### Community 21 - "PahaadCare RPM Contract Backend"
Cohesion: 0.29
Nodes (6): Deterministic synthetic demonstration, Local authentication setup, PahaadCare RPM Contract Backend, Run locally, Setup, Test

### Community 22 - "PahaadCare RPM Minimum Testing Strategy"
Cohesion: 0.40
Nodes (4): Execution Gate, PahaadCare RPM Minimum Testing Strategy, Recommended Stack, Required Test Cases

### Community 24 - "$f"
Cohesion: 0.67
Nodes (4): $f(), pcCompress(), pcUpload(), Rr()

## Knowledge Gaps
- **4 isolated node(s):** `@types/react`, `@types/react-dom`, `typescript`, `vite-plugin-pwa`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 206 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SQLiteRepository` connect `SQLiteRepository` to `repository.py`, `generate_scenario`, `models.py`, `main.py`, `MeasurementEvent`, `test_milestone1_apis.py`?**
  _High betweenness centrality (0.131) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `SQLiteRepository` (e.g. with `Alert` and `AlertStatus`) actually correct?**
  _`SQLiteRepository` has 7 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/react`, `@types/react-dom`, `typescript` to the rest of the system?**
  _4 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `SQLiteRepository` be split into smaller, more focused modules?**
  _Cohesion score 0.10351966873706005 - nodes in this community are weakly interconnected._
- **Why does `MeasurementEvent` connect `MeasurementEvent` to `SQLiteRepository`, `repository.py`, `generate_scenario`, `models.py`, `main.py`, `test_milestone1_apis.py`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Are the 26 inferred relationships involving `MeasurementEvent` (e.g. with `MonitoringEngine` and `ProcessedEvent`) actually correct?**
  _`MeasurementEvent` has 26 INFERRED edges - model-reasoned connections that need verification._
- **Should `repository.py` be split into smaller, more focused modules?**
  _Cohesion score 0.05136986301369863 - nodes in this community are weakly interconnected._