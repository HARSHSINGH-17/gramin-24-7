# PahaadCare RPM API Contract

Status: Milestone 1 Active Contract; covers health, authentication, measurements, patients, measurement history, alerts listing and lifecycle, and batch event synchronization (`POST /api/v1/sync/events`)
API version: `v1`
Transport: HTTPS JSON

## Common Rules

- All protected endpoints require an authenticated bearer token and role-based authorization.
- Patient IDs identify resources but do not grant access.
- JSON request bodies use `Content-Type: application/json`.
- Measurement submission is idempotent by `event_id`; acknowledgement and resolution operations are idempotent by alert ID plus target state.
- List endpoints require cursor or page pagination before production use.
- Server timestamps are authoritative for `received_at`, alert creation, acknowledgement, and resolution.
- Validation failures do not partially persist an event.
- Protected endpoints require `Authorization: Bearer <JWT>`. The local prototype supports environment-configured `clinician` and `administrator` roles; authorization is enforced by the backend.

Structured error shape:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request contains invalid fields.",
    "details": [
      { "field": "unit", "reason": "unit_incompatible_with_measurement_type" }
    ],
    "request_id": "req_123"
  }
}
```

Common status codes: `400` malformed request, `401` unauthenticated, `403` unauthorized, `404` resource not found, `409` idempotency conflict, `422` schema/domain validation failure, `429` rate limited, `500` server failure.

## `GET /health`

Purpose: process and dependency health, not patient health.

Authorization: public liveness may expose only process status; detailed dependency readiness requires an operator credential.

Response `200`:

```json
{
  "status": "ok",
  "service": "pahaadcare-rpm-api",
  "api_version": "v1",
  "checked_at": "2026-10-22T06:00:00Z"
}
```

No pagination. Must not include patient data or secrets.

## `POST /api/v1/auth/token`

Purpose: local prototype sign-in for the environment-configured demo account. This is not patient registration or a production identity provider.

Authorization: public endpoint; credentials are checked against the configured username and scrypt password hash. No password is persisted or returned.

Request:

```json
{ "username": "clinician-demo", "password": "provided-locally" }
```

Response `200`:

```json
{ "access_token": "<signed-jwt>", "token_type": "bearer" }
```

Invalid credentials return `401`. The token contains signed issuer, audience, subject, role, issued-at, and expiry claims. The frontend keeps it in session storage only.

## `POST /api/v1/measurements`

Purpose: validate and accept one measurement event.

Authorization: authenticated `clinician` or `administrator` role. The local prototype has no patient registration or device identity provider.

Request: the measurement object defined in [rpm-event-contract.md](rpm-event-contract.md) and the measurement JSON Schema.

Response `202` for a newly accepted event:

```json
{
  "event_id": "2f1f5d33-8d37-4a70-92e0-0d2c98a5d104",
  "status": "accepted",
  "patient_id": "PC-DEMO01",
  "received_at": "2026-10-22T06:00:03Z",
  "alert_ids": [],
  "request_id": "req_123"
}
```

A repeated identical event returns `200` with `status: "duplicate"`, the original `received_at`, and the original `alert_ids`. Reusing the ID with different content returns `409` `event_id_conflict`. Invalid schema, incompatible unit, invalid timestamp, or unauthorized patient returns a structured error.

Not paginated. The operation is idempotent by `event_id`.

## `GET /api/v1/demo/rpm-dashboard`

Purpose: development-only deterministic synthetic snapshot for the clinician dashboard prototype.

Authorization: authenticated `clinician` or `administrator` role, and only when demo mode is enabled in a non-production environment. Production configuration fails closed if demo access is enabled. This endpoint returns only the fictional patient `PC-SYNTH01`.

Response `200` contains:

- `schema_version`: `demo-1`.
- `is_simulated`: `true`.
- `generated_at`: deterministic UTC generation timestamp.
- `summary`: counts for synthetic patients, returned measurements, active alerts, missing conditions, and stale conditions.
- `patients`: synthetic patient rows with `latest_measurements`, `alert_ids`, and `data_quality`.
- `measurements`: event-shaped records returned by the Phase 3 monitoring engine, including `event_id`, measurement fields, `measured_at`, `received_at`, `outcome`, and `alert_ids`.
- `conditions`: missing/stale event-shaped records with `value` and `unit` absent rather than fabricated.
- `alerts`: alert objects matching the version 1.0 alert schema.

This endpoint is not one of the shared production API resources and does not add patient management, acknowledgement, resolution, persistence, authentication, MQTT, or Firebase behavior.

## `GET /api/v1/patients`

Purpose: list patients visible to the authenticated user.

Authorization: clinician/admin for multiple patients; patient/caregiver receives only authorized records.

Query: `cursor`, `limit` (bounded, for example 1-100), optional `status` and search filter.

Response `200`:

```json
{
  "items": [
    { "patient_id": "PC-DEMO01", "display_name": "Demo Patient", "status": "active" }
  ],
  "next_cursor": null,
  "request_id": "req_123"
}
```

Pagination required. No sensitive clinical detail in the list response unless authorized.

## `GET /api/v1/patients/{patient_id}/measurements`

Purpose: retrieve a patient's accepted measurement history.

Authorization: patient/caregiver/clinician access policy for that patient.

Query: `cursor`, `limit`, `measurement_type`, `measured_from`, `measured_to`, and optional `include_simulated`.

Response `200`:

```json
{
  "patient_id": "PC-DEMO01",
  "items": [
    {
      "schema_version": "1.0",
      "event_id": "2f1f5d33-8d37-4a70-92e0-0d2c98a5d104",
      "patient_id": "PC-DEMO01",
      "measurement_type": "heart_rate",
      "value": 78,
      "unit": "beats_per_minute",
      "measured_at": "2026-10-22T05:59:00Z",
      "received_at": "2026-10-22T06:00:03Z",
      "source": "simulator",
      "is_simulated": true
    }
  ],
  "next_cursor": null,
  "request_id": "req_123"
}
```

Pagination required. Out-of-order arrivals are returned in requested order, defaulting to `measured_at` descending. `404` or an authorization-safe empty response must be selected as a global policy before implementation.

## `GET /api/v1/alerts`

Purpose: list alerts visible to the authenticated user.

Authorization: clinician/admin for assigned patients; patient/caregiver for authorized patient scope.

Query: `cursor`, `limit`, `patient_id`, `status`, `severity`, `category`, `created_from`, and `created_to`.

Response `200`:

```json
{
  "items": [
    {
      "schema_version": "1.0",
      "alert_id": "c2fd9bc7-d4a2-4de4-8ab7-cfcb5f24da2d",
      "patient_id": "PC-DEMO01",
      "related_event_id": "2f1f5d33-8d37-4a70-92e0-0d2c98a5d104",
      "category": "abnormal_measurement",
      "severity": "medium",
      "reason": { "code": "heart_rate_above_demo_threshold", "message": "Demonstration threshold exceeded.", "rule_version": "demo-1" },
      "created_at": "2026-10-22T06:00:04Z",
      "status": "open"
    }
  ],
  "next_cursor": null,
  "request_id": "req_123"
}
```

Pagination required. Alerts must preserve `SIMULATED` context through the related event or response projection.

## `POST /api/v1/alerts/{alert_id}/acknowledge`

Purpose: transition an open alert to acknowledged.

Authorization: authenticated clinician or other explicitly authorized responder.

Request:

```json
{ "actor_id": "user_123", "note": "Reviewed and contacted patient." }
```

Response `200`:

```json
{
  "alert_id": "c2fd9bc7-d4a2-4de4-8ab7-cfcb5f24da2d",
  "status": "acknowledged",
  "acknowledged_at": "2026-10-22T06:05:00Z",
  "acknowledged_by": "user_123",
  "request_id": "req_124"
}
```

Repeated acknowledgement of an already acknowledged alert returns the current representation. Resolving directly from `open` is rejected with `409` in the local implementation. A normal measurement never resolves an alert automatically.

Not paginated. Idempotent for the same target state; lifecycle metadata is persisted locally. Unknown alert IDs return `404`; resolved alerts return `409` if acknowledgement is attempted.

## `POST /api/v1/alerts/{alert_id}/resolve`

Purpose: transition an acknowledged alert to resolved.

Authorization: authenticated clinician or authorized responder.

Request:

```json
{ "actor_id": "user_123", "resolution_code": "follow_up_complete", "note": "Follow-up completed." }
```

Response `200`:

```json
{
  "alert_id": "c2fd9bc7-d4a2-4de4-8ab7-cfcb5f24da2d",
  "status": "resolved",
  "resolved_at": "2026-10-22T06:20:00Z",
  "resolved_by": "user_123",
  "resolution_code": "follow_up_complete",
  "request_id": "req_125"
}
```

Repeated resolution returns the current representation. A resolved alert is immutable except for audit metadata. Not paginated. Idempotent for the same target state. Unknown alert IDs return `404`; open alerts return `409` until acknowledged.

## `POST /api/v1/sync/events`

Purpose: batch synchronization endpoint for offline-queued measurement events.

Authorization: authenticated `clinician` or `administrator` role. Each event within the batch is checked against the user's patient authorization scope.

Batch Execution Policy: **Best-Effort Partial Execution**.
In remote rural healthcare, network windows are brief. If one event in a batch has an authorization failure or ID conflict, valid vital readings in the same batch are still persisted and ingested. The response provides a deterministic per-event disposition so the client queue knows exactly which events reached `delivered` state and which failed.

Request:
```json
{
  "events": [
    {
      "schema_version": "1.0",
      "event_id": "2f1f5d33-8d37-4a70-92e0-0d2c98a5d104",
      "patient_id": "PC-DEMO01",
      "measurement_type": "heart_rate",
      "value": 78,
      "unit": "beats_per_minute",
      "measured_at": "2026-10-22T05:59:00Z",
      "source": "simulator",
      "is_simulated": true
    }
  ]
}
```

Constraints:
- Bounded batch size: 1 to 100 events per request.
- Request body size limited by `PAHAADCARE_MAX_BODY_BYTES`.

Response `200`:
```json
{
  "summary": {
    "total": 1,
    "accepted": 1,
    "duplicate": 0,
    "conflict": 0,
    "rejected": 0
  },
  "items": [
    {
      "event_id": "2f1f5d33-8d37-4a70-92e0-0d2c98a5d104",
      "patient_id": "PC-DEMO01",
      "status": "accepted",
      "received_at": "2026-10-22T06:00:03Z",
      "alert_ids": []
    }
  ],
  "request_id": "req_126"
}
```

Per-event statuses:
- `accepted`: newly persisted measurement, alert checks evaluated.
- `duplicate`: identical event payload previously received (idempotent retry).
- `conflict`: event ID previously used with different measurement values (`event_id_conflict`).
- `rejected`: patient scope denied (`patient_access_denied`) or event validation error.

## Synchronization Acknowledgement

The frontend queue uses local states `pending`, `sending`, `delivered`, and `failed`:

- `pending`: durable local event exists; no delivery attempt is active.
- `sending`: a request is active; delivery is unknown until the response arrives.
- `delivered`: the backend returned `accepted` or `duplicate` for the stable event ID.
- `failed`: the last attempt received a permanent rejection or exhausted retry policy; the error is retained for user/operator review.

A local queue write must never be displayed as server delivery. Network failures leave the event retryable and preserve `event_id`, `measured_at`, and payload. The server response is the only transition to `delivered`.

## Milestone 2 Dashboard Integration & Polling Contract

The clinician monitoring dashboard (`src/RpmDashboard.jsx`) directly integrates with the REST APIs via the shared frontend client (`src/rpmApi.js`).

### Client Integration Endpoints
- `POST /api/v1/auth/token`: Session sign-in, token stored strictly in `sessionStorage` (`pahaadcare-rpm-token`).
- `POST /api/v1/auth/logout`: Server-side token revocation and client session cleanup.
- `GET /api/v1/patients`: Patient census listing.
- `GET /api/v1/patients/{patient_id}/measurements`: Patient-specific measurement history with cursor pagination.
- `GET /api/v1/alerts`: Active and historical alerts filterable by `status`, `category`, and `patient_id`.
- `POST /api/v1/alerts/{alert_id}/acknowledge`: Transitions `open` -> `acknowledged`, attaches optional clinician note, records audit.
- `POST /api/v1/alerts/{alert_id}/resolve`: Transitions `acknowledged` -> `resolved`, attaches resolution code and optional note, records audit.

### Refresh and Freshness Semantics
- **Controlled Polling Interval:** Default 12 seconds (`DEFAULT_POLL_INTERVAL_MS = 12000`).
- **Overlapping Request Prevention:** Background polling uses an in-flight guard ref to skip ticks if a prior cycle is active.
- **Visibility Optimization:** Listens to `visibilitychange`; polling is paused when the browser tab is hidden and resumes immediately when focused.
- **Stale Data Threshold:** Demo freshness threshold is 15 minutes (`DEMO_STALE_THRESHOLD_MINUTES = 15`). Readings with `measured_at` older than 15 minutes display a `Stale` badge.
- **Failure Preservation:** If a refresh cycle encounters network failure, previously loaded patient data is preserved in the UI alongside a clear warning banner.
- **Race Condition Prevention:** Patient detail queries use `AbortController` and target patient ID tracking to ensure rapid patient switching never displays out-of-order responses.
- **Session Safety:** `401 Unauthorized` responses immediately clear `sessionStorage` and revert to the login panel. `403 Forbidden` responses display permission denial without terminating authenticated clinician sessions.
