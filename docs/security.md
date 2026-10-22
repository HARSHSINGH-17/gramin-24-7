# PahaadCare RPM — Security Documentation

**Status:** Phase 6.5 — Local prototype security hardening  
**Last updated:** Phase 6.5  
**Scope:** Local development and synthetic-data demonstration only. This is not a production security review.

---

## 1. Demo Account Policy

The demo account is a single, environment-configured identity used exclusively for local development with synthetic data. It is **not** a patient identity, a production account, or a multi-user system.

### Restrictions

- The demo account is enabled only when **all** of the following are true:
  - `PAHAADCARE_ENV=development`
  - `PAHAADCARE_DEMO_ENABLED=true`
  - `PAHAADCARE_HOST` is a loopback address (`127.0.0.1`, `::1`, or `localhost`)
- If `PAHAADCARE_ENV=production`, the application **fails startup** if any demo credential environment variable is set.
- If `PAHAADCARE_HOST` is a non-loopback address, demo authentication returns `403` even if credentials are correct.
- There is no silent fallback to insecure defaults. A missing or incorrect `PAHAADCARE_AUTH_SECRET` always fails.
- All secrets are provided via environment variables or a `.env` file that must not be committed.

### Intended Identity

The demo account represents a synthetic clinician for local testing. All patient data it can access is the fictional patient `PC-SYNTH01`. It must never be used with real patient records.

---

## 2. Token Policy

### Access Token Lifetime

| Setting | Default | Minimum | Maximum |
|---|---|---|---|
| `PAHAADCARE_TOKEN_MINUTES` | 30 minutes | 1 minute | 1440 minutes (24 hours) |

The backend refuses to start with an out-of-range value.

### Token Claims

Every JWT includes:

| Claim | Description |
|---|---|
| `iss` | `pahaadcare-rpm` (issuer) |
| `aud` | `pahaadcare-rpm-client` (audience) |
| `sub` | Username (subject) |
| `role` | User role (`clinician` or `administrator`) |
| `patient_ids` | Permitted patient IDs, or `["*"]` for administrator |
| `jti` | Unique token identifier (UUID4) |
| `iat` | Issued-at time |
| `exp` | Expiry time |

All claims are validated on every protected request: signature, algorithm (`HS256` only), issuer, audience, expiry, issued-at, and required claim presence.

### Token Revocation

- Every token has a unique `jti` (JWT ID) claim.
- The backend maintains a **persistent revocation list** in the SQLite database (`revoked_tokens` table, migration 3).
- Revoked tokens are rejected on every protected request, even if the JWT signature and expiry are still valid.
- Revocation state survives server restarts (stored in SQLite, not memory).
- The `POST /api/v1/auth/logout` endpoint revokes the current token server-side before the client clears its session.
- Complete tokens and secrets are never logged.

### Algorithm

Only `HS256` is accepted. The `alg` field in the JWT header is validated and the `"none"` algorithm is rejected.

---

## 3. Patient-Level Authorization

### Scope Assignment

When a token is issued, the `patient_ids` claim lists the patient IDs the user may access:

- `clinician` demo account: `["PC-SYNTH01"]` (the single synthetic patient)
- `administrator` accounts: `["*"]` (all patients; wildcard)

### Enforcement

Patient scope is checked on:

- `POST /api/v1/measurements` — `patient_id` in the request body must be in the token's `patient_ids`
- `GET /api/v1/demo/rpm-dashboard` — only accessible to users with access to `PC-SYNTH01`
- `POST /api/v1/alerts/{alert_id}/acknowledge` — the alert's patient is resolved from the database; the client does not supply a patient ID to authorize
- `POST /api/v1/alerts/{alert_id}/resolve` — same as above

Cross-patient access returns `403 Forbidden` without disclosing the protected patient's data. A missing or empty `patient_ids` claim also returns `403`.

### Alert Lifecycle Authorization

Alert mutations do not trust a client-supplied patient ID. The backend looks up the alert's actual patient from the database, then verifies the requesting user has access to that patient. This prevents cross-patient manipulation via alert ID guessing.

### Administrator Access

Administrator scope (`["*"]`) is explicit and tested. It is not inferred from a frontend label. The current prototype has no administrator account in the demo configuration; it exists as a verified code path for future use.

---

## 4. Audit Chain

### Record Fields

Each audit record includes:

| Field | Description |
|---|---|
| `audit_id` | UUID stable identifier |
| `created_at` | UTC timestamp |
| `actor_id` | Username of the acting user |
| `action` | Action type (e.g., `alert_acknowledge`, `alert_resolve`) |
| `target_id` | Alert ID or other resource ID |
| `outcome` | `success` or `denied` |
| `metadata` | Minimal context (sensitive keys redacted in exports) |
| `prev_hash` | SHA-256 of the previous record's canonical form |
| `record_hash` | SHA-256 of this record's canonical form |

### Hash Chain

Records form a linked hash chain using SHA-256. Each record's hash covers: `audit_id`, `created_at`, `actor_id`, `action`, `target_id`, `outcome`, `metadata` (sorted), and `prev_hash`. The first record in the chain uses `"0" * 64` as `prev_hash`.

Writes are serialized in a single transaction to prevent concurrent writes from creating an ambiguous chain.

### Limitations

> **This is tamper-evident, not tamper-proof.**
>
> The hash chain detects modifications, deletions, and reorderings in the SQLite database. A privileged attacker with write access to the entire database file could reconstruct a consistent chain after altering records. The chain does not provide protection equivalent to an append-only external audit log.

### Legacy Records

Audit records written before Phase 6.5 do not have `audit_id`, `prev_hash`, or `record_hash` values. They are preserved intact. The integrity chain begins at the first Phase 6.5 record. Legacy rows are documented as outside the chain unless explicitly backfilled and verified.

### Verification

The `verify_audit_chain()` function in `backend/app/repository.py` detects:
- Modified record content (hash mismatch)
- Deleted records (broken `prev_hash` link)
- Reordered records

---

## 5. Audit Export

### Local Export Command

```bash
python -m backend.app.export_audit [--start-id N] [--end-id N] [--output path.json]
```

Or as a library call:

```python
from backend.app.repository import SQLiteRepository
repo = SQLiteRepository(db_path)
records, chain_ok = repo.export_audit(start_seq=1, end_seq=100)
```

### Export Format

The export is a JSON document containing:

```json
{
  "export_version": "1.0",
  "generated_at": "2026-10-22T06:00:00Z",
  "chain_valid": true,
  "record_count": 42,
  "records": [
    {
      "seq": 1,
      "audit_id": "...",
      "created_at": "...",
      "actor_id": "clinician-demo",
      "action": "alert_acknowledge",
      "target_id": "...",
      "outcome": "success",
      "metadata": { "note": "..." },
      "prev_hash": "...",
      "record_hash": "..."
    }
  ]
}
```

### Redaction

The following metadata keys are redacted in all exports (replaced with `"[REDACTED]"`):
`token`, `secret`, `password`, `key`, `auth`

Measurement payloads, full credentials, and bearer tokens are never included in audit records or exports.

### Future Central Sink Readiness

The export format is versioned (`export_version: "1.0"`) and deterministically ordered by sequence number. A future authenticated, encrypted, append-only sink could:
1. Pull exports over a bounded sequence range using `start_seq` / `end_seq`.
2. Verify `chain_valid` before ingestion.
3. Append records to the central store, using `record_hash` and `prev_hash` for cross-system chain continuity.
4. Mark delivery only after confirmed remote acknowledgement.

**No central delivery is implemented in this phase.** Records are not marked as centrally delivered.

---

## 6. Frontend Session Handling

- Tokens are stored in `sessionStorage` only (not `localStorage` or cookies).
- `401 Unauthorized` clears the session and redirects to sign-in without an infinite refresh loop.
- `403 Forbidden` shows an access-denied error without logging the user out or clearing the session.
- Sign-out calls `POST /api/v1/auth/logout` first, then clears session state regardless of the response (in `finally`).
- Duplicate lifecycle submissions are disabled while a request is in flight.
- `409 Conflict` during alert actions displays a clear "no longer actionable" message without misrepresenting server state.
- The synthetic-data banner remains visible throughout the demo workflow.
- Tokens, secrets, and stack traces are never displayed in the UI or written to the browser console.

---

## 7. Production Deployment Requirements

**The current implementation is a local prototype. Before any real use:**

1. Replace the demo account with a reviewed identity provider (OAuth 2.0 / OIDC).
2. Add MFA, account lifecycle management, and role governance.
3. Use a production-grade secret manager; never use `.env` files in production.
4. Add HTTPS with a valid certificate (TLS 1.2+ minimum).
5. Replace SQLite with a production database.
6. Implement an external append-only audit log with access controls independent of the application database.
7. Add rate limiting, brute-force protection, and IP allow-listing for administrative endpoints.
8. Conduct a formal security review and penetration test before handling real patient data.
9. Obtain clinical safety review before using any alert thresholds with real patients.
10. Implement consent management, data retention policies, and right-to-erasure workflows.

---

## 8. Remaining Risks and Non-Goals

| Risk / Non-goal | Status |
|---|---|
| MQTT, Firebase, cloud deployment | **Not implemented. Out of scope for Phase 6.5.** |
| Real patient data integration | **Not implemented. Not permitted in this prototype.** |
| Refresh token rotation | **Not implemented.** The existing application does not demonstrably require it. |
| Multi-user account system | **Not implemented.** Single demo account only. |
| Tamper-proof audit log | **Not claimed.** The SQLite hash chain is tamper-evident only. |
| Centralized audit delivery | **Not implemented.** Export format is defined; no remote sink exists. |
| Rate limiting | **Not implemented.** Required before production. |
| HTTPS enforcement | **Not implemented in backend code.** Required before production. |
| Password reset / account recovery | **Not implemented.** Not applicable to the single demo account. |
