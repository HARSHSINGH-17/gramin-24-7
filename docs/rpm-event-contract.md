# PahaadCare RPM Event Contract

Status: Phase 2A design contract
Contract version: 1.0.0
Machine-readable schema: [../schemas/rpm-measurement-event.schema.json](../schemas/rpm-measurement-event.schema.json)

## Measurement Event

A measurement event is one observation for one patient. The event is immutable after acceptance except for server-side processing metadata. The canonical identity is `event_id`; Firebase document IDs, MQTT message IDs, and database primary keys must not replace it.

Required fields:

- `schema_version`: currently `1.0`.
- `event_id`: stable UUID identifying this event and reused for every retry.
- `patient_id`: application patient reference. It is not an authorization credential.
- `measurement_type`: one supported vital type.
- `value`: finite numeric scalar. No strings, NaN, Infinity, arrays, or nulls.
- `unit`: unit compatible with `measurement_type`.
- `measured_at`: ISO 8601 date-time with an explicit timezone offset or `Z`.
- `source`: `device`, `health_worker`, `patient`, `simulator`, or `import`.
- `is_simulated`: boolean. Simulator events must set this to `true`.

Optional fields:

- `received_at`: ISO 8601 date-time assigned or recorded when the event reaches a trusted server. It must not replace `measured_at`.
- `device_reference`: non-secret device identifier, model, or firmware reference.
- `health_worker_reference`: non-secret application actor reference when entered by a health worker.

## Supported Measurements and Units

| `measurement_type` | Required `unit` | Demonstration validation range |
|---|---|---:|
| `heart_rate` | `beats_per_minute` | 20 to 300 |
| `oxygen_saturation` | `percent` | 0 to 100 |
| `body_temperature` | `celsius` | -50 to 60 |
| `systolic_blood_pressure` | `mmHg` | 40 to 300 |
| `diastolic_blood_pressure` | `mmHg` | 20 to 200 |

The ranges reject malformed or implausible payloads for software safety, but they are not clinical diagnosis thresholds. Unit compatibility is enforced by the JSON Schema and repeated by backend domain validation.

## Time Semantics

- `measured_at` preserves when the observation occurred, including an offset.
- `received_at` records trusted server receipt or known ingestion time.
- The backend must not rewrite `measured_at` during offline retry.
- Events may arrive late or out of order. Ordering for clinical history is by `measured_at`; ingestion/audit order is by `received_at`.
- The Phase 2C contract layer accepts future-dated measurements, preserves `measured_at`, and records trusted receipt time separately because the clock-skew policy is still unresolved. Production persistence must reject or quarantine future measurements only after that policy is approved; no clinical cutoff is invented here.

## Missing and Stale Data

Missing data is not a measurement event and must never be represented with `value: 0`, a fabricated value, or a placeholder vital. It is represented by a separate monitoring/data-quality record with a category such as `missing_measurement`, `stale_reading`, or `ingestion_failure`, or by an expected-measurement timeout that creates an alert without a measurement event.

A future data-quality event should include its own stable event identity, patient reference, expected measurement type, expected window, observed status, and timestamps. It must not reuse the measurement schema by inserting a fake value.

## Source and Simulation Rules

- `source: simulator` requires `is_simulated: true`.
- `is_simulated: true` is permitted for other explicitly fictional test/import pipelines only when the originating pipeline is documented.
- `source: device` does not prove regulatory approval or device authenticity; device trust must be established separately.
- The UI and API responses must retain the simulation marker.

## Alert Relationship

The backend may create an alert from an accepted measurement event or from a missing/stale/ingestion condition. For measurement-driven alerts, `related_event_id` equals the triggering `event_id`. Missing-data alerts may omit it and instead reference the data-quality condition in `reason`.

Alert shape and lifecycle are defined in [../schemas/rpm-alert.schema.json](../schemas/rpm-alert.schema.json).

## Idempotency and Deduplication

- The backend treats `event_id` as the idempotency key for measurement submission.
- Repeating the same event ID with the same canonical payload returns the original acceptance result and creates no duplicate event or alert.
- Reusing an event ID with a different payload is rejected as `event_id_conflict`.
- Repeated abnormal events are deduplicated into one unresolved alert per patient, alert category, rule version, and deduplication window. Each event remains in history.
- Missing/stale conditions are deduplicated by patient, expected measurement type, condition category, rule version, and active condition window.
- A new alert may be created after the prior alert is resolved and a new condition window begins.
