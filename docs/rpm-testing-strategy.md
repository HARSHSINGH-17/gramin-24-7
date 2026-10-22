# PahaadCare RPM Minimum Testing Strategy

Status: Milestone 1 Active Testing Baseline

The repository possesses a fully automated test baseline running under `pytest` with 110 passing test cases across contracts, persistence, monitoring rules, security, browser e2e workflow, read APIs, and batch event synchronization. Test fixture isolation is strictly enforced.

## Recommended Stack

- Frontend contract/client tests: Vitest with Testing Library, added only when the frontend begins consuming the RPM API.
- Backend schema/domain tests: Python `pytest` with Pydantic models or a JSON Schema validator such as `jsonschema`.
- API tests: FastAPI `TestClient` for request validation, authorization, idempotency, and response contracts.
- Property or boundary tests: Hypothesis may be added for numeric ranges, timestamps, and event identity once the backend exists.
- Contract fixture tests: keep valid and invalid JSON fixtures alongside the schemas so frontend and backend validate the same examples.

## Required Test Cases

1. Accept each supported measurement type with its compatible unit.
2. Reject incompatible units, malformed values, strings, nulls, NaN, and Infinity.
3. Reject invalid timestamps and timestamps without timezone information.
4. Accept `received_at` only as optional server metadata and preserve `measured_at`.
5. Reject simulator events that do not set `is_simulated: true`.
6. Confirm missing data creates a data-quality condition or timeout alert, never a zero-valued measurement.
7. Generate an abnormal-measurement alert from a configured demonstration rule.
8. Generate and deduplicate stale-data and missing-data alerts.
9. Submit the same event twice and confirm one stored event and no duplicate alert.
10. Submit the same event ID with changed content and confirm an idempotency conflict.
11. Submit late and out-of-order events and confirm history ordering by `measured_at` while retaining receipt order metadata.
12. Confirm alert acknowledgement and resolution transitions, authorization, and audit metadata.
13. Confirm offline queue states: local creation is `pending`, active request is `sending`, accepted/duplicate response is `delivered`, and permanent rejection is `failed`.
14. Confirm retries preserve `event_id`, payload, and `measured_at`.
15. Confirm simulated markers remain visible in API responses and UI projections.

## Execution Gate

Before implementation is considered complete, add a test command to `package.json` for frontend tests and a backend test command in the Python service. Run both in CI and report actual results; do not treat schema file presence as test coverage.
