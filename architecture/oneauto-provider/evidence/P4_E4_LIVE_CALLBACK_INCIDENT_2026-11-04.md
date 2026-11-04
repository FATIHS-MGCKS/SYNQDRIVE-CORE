# One Auto P4 E4 — first live full-data callback: incident forensics (2026-11-04)

**Epistemic:** `CONFIRMED` from production read-only forensics (DB rows, nginx access log) on runtime SHA `1afc5f7717622e5ab0125197569f6061613d0868` after E4 flag activation (`ONEAUTO_CALLBACK_ENABLED=true`, `ONEAUTO_CALLBACK_FULL_DATA_ENABLED=true`, `ONEAUTO_CALLBACK_RETRIEVAL_GET_ENABLED=false`, pricing `synqdrive-p4-vin-lookup-async-capable-v1`).
**Decision status:** Parser correction `PROPOSED` in this PR (draft, not deployed). All values below are redacted (no VIN, no delivery token, no raw payload).

## Timeline (UTC; Europe/Berlin = UTC+1)

| Time | Event | Evidence |
|------|-------|----------|
| 18:59:56 | Master quote (Tesla Model 3, org `faa710c9…`, vehicle `68868291…`) | `quote_issued_at` |
| 19:00:01.878 | Cost confirmed → job `cmw2hedwi008it0ysm2jb107j` CREATED (36 minor reserved, pricing p4) | `one_auto_provider_jobs` |
| 19:00:02.167 | Initial provider GET dispatched (**1** outbound GET; `poll_attempt_count=0`) | `initial_provider_dispatch_at` |
| 19:00:02.551 | Provider HTTP **202** `{ success:true, result:{ status:'Accepted', message, function:'Vin Lookup', callBackUrl } }` → `AWAITING_PROVIDER` | `one_auto_provider_responses` (phase `initial`) |
| 19:00:08.143 | Provider callback POST received (`axios/1.13.2`, AWS IP) → inbox row stored | `one_auto_provider_callback_inbox` |
| 19:00:08.208 | Job → **FAILED** `ONEAUTO_CALLBACK_PAYLOAD_MALFORMED`; HTTP **404** returned to provider | job `updated_at`, nginx |
| 19:00:42 | Second Master execute, job `cmw2hf8zg005mrfvji5e134ns` (VW, vehicle `8c850ff1…`), same path | job row |
| 19:00:47 | Callback for job 2 → inbox row; FAILED same code; 404 to provider | inbox / nginx |
| 19:01:08 / 19:01:47 | Provider **re-delivered** both callbacks after ~60 s → `duplicate` (inbox SHA dedupe) → HTTP 200 | nginx 200 / 37 bytes |

`retrieval_provider_dispatch_at` is `NULL` for both jobs (zero retrieval GET). No PM2 restarts; no env changes during the window.

## Observed callback body shapes (redacted)

Job 1 (Tesla, 184 bytes):

```json
{ "status": 206, "result": { "success": false, "result": null, "error": "There is no data available for this vehicle identification number.  You have not been charged." } }
```

Job 2 (VW):

```json
{ "status": 200, "result": { "success": true, "result": { "...17 OpenAPI vinlookup result keys..." } } }
```

**Contract delta:** The documented `SUCCESS_RESULT_ERROR` envelope is delivered **nested under `result`**, beside the provider's own HTTP `status`. The pre-fix parser evaluated the wrapper itself → `evaluateSuccessResultErrorEnvelope` → `missing_success` → `ONEAUTO_CALLBACK_PAYLOAD_MALFORMED` for **both** a provider business failure (job 1) and a valid result (job 2).

## Root cause

1. `evaluateOneAutoFullDataCallbackPayload()` assumed the callback body *is* the envelope; the live body is `{ status, result: <envelope> }`.
2. Any envelope failure (including documented `success:false`) was collapsed to `ONEAUTO_CALLBACK_PAYLOAD_MALFORMED` and answered with HTTP 404, so provider business failures were indistinguishable from unreadable payloads.

## Outcome per job

| Job | Provider answer | Complete data in inbox? | Recovery without new GET |
|-----|-----------------|-------------------------|--------------------------|
| `cmw2hedwi…` (Tesla Model 3) | **No data for this VIN** (`success:false`, wrapper 206, provider states "not charged") | **No** — nothing to recover | N/A — a correct classification would be `ONEAUTO_CALLBACK_PROVIDER_FAILURE`; no successful result exists |
| `cmw2hf8zg…` (VW) | Valid full-data result (`success:true`, wrapper 200) | **Yes** (redacted inbox payload) | Possible in principle (see below) — **not** performed; requires owner decision |

## Fix (this PR)

- `unwrapOneAutoCallbackBody()` — accepts `{ status, result: <envelope> }` and bare envelopes; exposes `wrapperStatus`.
- Classification: `success:false` → `ONEAUTO_CALLBACK_PROVIDER_FAILURE`; wrapper `206` + `success:true` → `ONEAUTO_PARTIAL_CONTENT` (mirrors sync path, `http206CompleteSuccessAllowed=false`); unreadable → `ONEAUTO_CALLBACK_PAYLOAD_MALFORMED` (+ `topLevelKeys` diagnostic).
- Provider failures persist the redacted **envelope** as `one_auto_provider_responses` (`responsePhase='callback'`, `httpStatus=wrapperStatus`) and answer HTTP **200** `disposition:'provider_failure'` (authenticated, processed; avoids provider re-delivery on 404). Malformed/incomplete/VIN-mismatch keep 404 `payload_rejected`.
- Success persists the **unwrapped** envelope so `getJobResult` and OEM materialization see the same shape as the sync HTTP 200 path. Raw wrapped body remains in the inbox.
- Redaction: `callback[_-]?url` added to `SENSITIVE_KEY` — the provider's 202 echo `callBackUrl` contains the per-job delivery token and was persisted unredacted (finding from this forensics).
- Tests: `oneauto-p4-e4-callback-wrapped-envelope.spec.ts` (built from the two observed shapes).

## Recovery design for job 2 (not implemented — owner decision)

Preconditions: job `FAILED` with `lastErrorCode='ONEAUTO_CALLBACK_PAYLOAD_MALFORMED'`, `retrieval_provider_dispatch_at IS NULL`, exactly one non-duplicate inbox row whose payload evaluates `ok:true` under the fixed parser, VIN binding (job snapshot = vehicle VIN = result VIN) satisfied, within `provider_result_expires_at`. Action: explicit owner-invoked ops command (not scheduler, not API) that re-runs `ingestFullDataCallback` semantics from the stored inbox payload inside one transaction — persist envelope response, `FAILED → SUCCEEDED` only when all preconditions hold, keep `lastErrorCode` history in the change ledger, then `tryMaterializeFromSucceededJob`. **No provider HTTP, no new charge, no manual SQL.** Out of scope for this PR because it introduces a `FAILED → SUCCEEDED` transition.

**Update (PR #2338 extension):** `OneAutoE4FailedCallbackRecoveryService` + `scripts/ops/oneauto-e4-recover-failed-callback-job.ts` implement this design. Prior failure preserved in `one_auto_provider_responses` with `responsePhase='recovery_audit'`. Production execution still requires owner env authorizations and is **not** run in the PR.

## Historical callback URL token exposure

See `P4_E4_CALLBACK_URL_REDACTION_REMEDIATION.md` — inventory/redaction plan only; no production cleanup in PR #2338.

## Invariants preserved

Token SHA-256 lookup, tenant/vehicle binding, inbox dedupe, expiry handling, RUNNING/AWAITING race guard, zero retrieval GET, `attempts:1` / `ONEAUTO_MAX_RETRIES=0`, budget reservation semantics unchanged.
