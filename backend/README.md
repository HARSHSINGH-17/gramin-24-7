# PahaadCare RPM Contract Backend

This is the local Phase 5 persistence and lifecycle layer. It uses SQLite only; it does not connect Firebase, MQTT, cloud services, or external authentication. It remains a synthetic hackathon prototype and is not a production clinical system.

## Local authentication setup

The protected measurement, dashboard, acknowledgement, and resolution routes require a bearer token. There is no patient registration system. The local token route authenticates the one environment-configured demo account.

Generate a password hash without storing the password in source control:

```powershell
c:/python314/python.exe -c "from backend.app.auth import hash_password; print(hash_password('replace-with-a-long-local-password'))"
```

Set the printed hash and a random development secret in the shell, or copy [backend/.env.example](.env.example) into your environment configuration. The example contains placeholders only. Example PowerShell setup:

```powershell
$env:PAHAADCARE_ENV = "development"
$env:PAHAADCARE_AUTH_SECRET = "replace-with-a-random-32-character-secret"
$env:PAHAADCARE_DEMO_ENABLED = "true"
$env:PAHAADCARE_DEMO_USERNAME = "clinician-demo"
$env:PAHAADCARE_DEMO_PASSWORD_HASH = "paste-generated-scrypt-hash-here"
$env:PAHAADCARE_DEMO_ROLE = "clinician"
```

Roles are `clinician` and `administrator`; both may access the current prototype monitoring operations. Tokens are signed JWTs with issuer, audience, issued-at, and expiry claims. The frontend stores the token only for the browser session and clears it after a 401/403 response.

## Setup

From the repository root:

```powershell
c:/python314/python.exe -m pip install -r backend/requirements-dev.txt
```

The current environment already provides FastAPI, Pydantic, and `jsonschema`; `pytest` is the only package required for the test command if those packages are already installed.

## Test

```powershell
c:/python314/python.exe -m pytest backend/tests -q
```

## Run locally

```powershell
c:/python314/python.exe -m uvicorn backend.app.main:app --reload
```

The local health endpoint is `http://127.0.0.1:8000/health`.

SQLite is initialized automatically at `backend/data/pahaadcare.sqlite3`. Set `PAHAADCARE_DB_PATH` to use another local path, especially for tests or isolated demonstrations. The database directory is created before the schema is initialized.

The repository stores:

- `measurements`: durable event ID, canonical payload hash, event payload, measurement fields, `measured_at`, and trusted `received_at`.
- `alerts`: durable alert ID, patient/event relationship, reason and rule version, status, acknowledgement metadata, and resolution metadata.

The `measurements.event_id` primary key and `alerts` active-condition unique index protect duplicate event and active-alert creation. Event equality hashes the canonical event payload excluding `received_at`; retries with a different measurement payload return `event_id_conflict`. Each submission and lifecycle mutation uses a SQLite transaction with `BEGIN IMMEDIATE`.

The clinician monitoring dashboard (`src/RpmDashboard.jsx`) connects to the authoritative REST APIs (`GET /api/v1/patients`, `GET /api/v1/patients/{patient_id}/measurements`, `GET /api/v1/alerts`) using `src/rpmApi.js`. The development-only synthetic snapshot at `GET /api/v1/demo/rpm-dashboard` is preserved for deterministic demo reference. The React base URL defaults to `http://127.0.0.1:8000` and can be overridden with `VITE_RPM_API_BASE_URL` or `window.__RPM_API_BASE_URL`.

Alert lifecycle endpoints:

- `POST /api/v1/alerts/{alert_id}/acknowledge`: `open -> acknowledged`; repeating the request returns the current acknowledged alert.
- `POST /api/v1/alerts/{alert_id}/resolve`: `acknowledged -> resolved`; resolving an open alert returns `409`, and repeating resolution returns the current resolved alert.
- Unknown alert IDs return `404`.

Core Monitoring and Synchronization APIs (Milestone 1):

- `GET /api/v1/patients`: returns the authorized patient list with bounded pagination (`limit`, `cursor`).
- `GET /api/v1/patients/{patient_id}/measurements`: paginated historical measurements for an authorized patient, ordered `measured_at DESC, event_id ASC`.
- `GET /api/v1/alerts`: query and filter alerts by status, patient, or category with cursor pagination.
- `POST /api/v1/sync/events`: batch synchronization of offline-queued measurement events with partial-success semantics (accepts valid events while reporting conflicts/permission failures per-item).

The dashboard exposes only the action valid for the current state. A normal measurement does not resolve an alert automatically.

## Deterministic synthetic demonstration

Run the predefined ten-plus-event demonstration sequence from the repository root:

```powershell
c:/python314/python.exe -m backend.demo_synthetic
```

The output includes the processing outcome, stable synthetic event ID, synthetic patient ID, measurement details when present, reason, and alert IDs. It uses only the fictional patient `PC-SYNTH01` and fixed UTC timestamps.

The generator can also be called directly:

```powershell
c:/python314/python.exe -c "from backend.synthetic_vitals import generate_scenario; print(generate_scenario('normal')); print(generate_scenario('abnormal')); print(generate_scenario('missing')); print(generate_scenario('stale')); print(generate_scenario('duplicate')); print(generate_scenario('conflict')); print(generate_scenario('recovery')); print(generate_scenario('future'))"
```

Available scenarios are `normal`, `abnormal`, `missing`, `stale`, `duplicate`, `conflict`, `recovery`, `future`, and `demo`. The `demo` scenario contains at least ten events spanning normal, threshold, and missing-data outcomes. Duplicate and conflict scenarios intentionally reuse one event ID; ordinary generated events use deterministic unique IDs.

## Scope and safety

- Pydantic models mirror the version 1.0 measurement and alert schemas.
- JSON Schema tests load the repository schema files directly.
- The backend additionally rejects malformed and timezone-less timestamps. The installed `jsonschema` validator path checks the declared `format` metadata but does not enforce it during these tests; a future contract revision may add an explicit pattern or a validator configuration change.
- Missing data uses `MissingDataEvent`; it is never encoded as a zero-valued measurement.
- Demonstration thresholds are configurable in `backend/app/monitoring.py` and are not clinically validated.
- All threshold values and alert reasons are `DEMONSTRATION_ONLY`; they are not medical advice and must not be used for clinical decisions.
- Future-dated measurements are currently accepted and preserved because the clock-skew policy is unresolved; the store always assigns a trusted local `received_at`.
- Missing and stale records are represented by `MissingDataEvent` and separate alert categories, never by fabricated measurements.
- The monitoring engine is directly callable from `backend.app.engine.MonitoringEngine`; it does not require an HTTP server or external service.
- Durable production-scale deployment, external identity management, and production authorization governance are not implemented. The local route protection is a prototype baseline only; do not submit real patient data.
- Authentication is a minimal environment-configured prototype baseline, not an identity provider. Do not expose it as a production API or submit real patient data.
- Production requires `PAHAADCARE_AUTH_SECRET` of at least 32 characters, explicit non-wildcard CORS origins, configured credentials, `PAHAADCARE_DEMO_ENABLED=false`, HTTPS termination, and an operational secret manager.
- Demo access fails closed in production configuration. The synthetic dashboard route is protected and is intended only for development/test environments.
- Request bodies are limited by `PAHAADCARE_MAX_BODY_BYTES` (default 64 KiB). Tokens, passwords, and full measurement payloads are not written to the audit log.
- The React application remains on the existing stack. Firebase, MQTT, service workers, wearable integrations, cloud services, and authentication providers are intentionally untouched.
