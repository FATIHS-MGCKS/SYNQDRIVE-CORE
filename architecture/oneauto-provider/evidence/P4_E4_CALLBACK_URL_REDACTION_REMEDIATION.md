# One Auto P4 E4 — historical `callBackUrl` / callback token exposure (remediation plan)

**Epistemic:** `CONFIRMED` from production read-only forensics on job `cmw2hedwi…` / `cmw2hf8zg…` (2026-11-04). **No cleanup executed in PR #2338.**

## Finding

Initial HTTP **202** responses persisted `result.callBackUrl` with the **full public callback URL**, including the per-job opaque delivery token. `redactProviderResponseBody()` did not match `callBackUrl` (camelCase) until PR #2338 added `callback[_-]?url` to `SENSITIVE_KEY`.

Affected rows (known):

| Artifact | Table | Phase | Risk |
|----------|-------|-------|------|
| Initial async acceptance | `one_auto_provider_responses` | `initial` | Plaintext delivery token in JSON |
| Callback inbox (wrapped body) | `one_auto_provider_callback_inbox` | n/a | Provider may echo `callback_url` in nested payloads (future redaction on ingest) |

Inbox rows for the 2026-11-04 incident store **redacted** top-level shapes only; the **initial** response row for each job is the primary token exposure surface.

## Remediation principles

1. **Owner authorization required** — separate from E4 recovery; no automated agent cleanup.
2. **Read-only inventory first** — count rows where `response_body_json #>> '{result,callBackUrl}'` matches the public callback path pattern (or `callback_url`).
3. **No provider HTTP** — DB-only mutation.
4. **Preserve audit** — do not delete job history; replace token substrings with `[REDACTED]` in JSON copies or append a corrective audit response row documenting the redaction batch id.
5. **Rotate only if needed** — delivery tokens are job-scoped; jobs are terminal (`FAILED`). Rotation is **not** required for completed/failed jobs unless a token could still accept callbacks (disabled path returns 404/503 for unknown tokens). Document “accept risk / monitor nginx” vs “invalidate token column” decision in owner sign-off.
6. **Post-deploy prevention** — merged PR #2338 redacts on **new** writes; this plan addresses **historical** rows only.

## Proposed owner-invoked procedure (not implemented)

1. Deploy PR #2338+ to production (parser + redaction).
2. Set `ONEAUTO_E4_CALLBACK_URL_REDACTION_OWNER_AUTHORIZED=1` (new env — to be introduced with a dedicated ops script in a follow-up PR if owner approves this plan).
3. Run inventory SQL (read-only) on production replica or primary during maintenance window; store counts + SHA256 of query result in evidence (no row dumps in git).
4. Run batch update in a transaction:
   - For each `one_auto_provider_responses` row where `response_phase='initial'` and JSON path `result.callBackUrl` or `result.callback_url` is a string containing `/webhooks/oneauto/provider-callback/`, replace value with `[REDACTED]` using `jsonb_set`.
5. Verify zero remaining plaintext tokens via repeat inventory query.
6. Optional: export redacted evidence file to owner secure storage — **never** commit tokens.

## Out of scope for PR #2338

- No production SQL in this change set.
- No new env vars wired until owner approves this plan.
- No deletion of inbox or response rows.

## Related code (prevention)

- `backend/src/modules/oneauto-provider/oneauto-provider-redact.util.ts` — `callback[_-]?url` redaction (forward fix).
- `architecture/oneauto-provider/evidence/P4_E4_LIVE_CALLBACK_INCIDENT_2026-11-04.md` — incident timeline.
