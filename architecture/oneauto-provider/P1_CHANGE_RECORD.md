# One Auto provider P1 — change record

- **Date:** 2026-10-31
- **Scope:** Backend-only Master Admin provider foundation (`backend/src/modules/oneauto-provider/`).
- **Non-effects:** Manual vehicle specifications, Fetch AI Specs, AI empty-field merge, ZB-I upload, vehicle identity, service history, brake/tire/battery intelligence, ConnectedVehiclesHub navigation.
- **Evidence:** `backend/src/modules/oneauto-provider/evidence/VERIFIED_PROVIDER_CONTRACTS.md`

## P2.5B — OpenAPI evidence alignment (2026-11-01)

- **Evidence file:** `docs/provider-evidence/oneauto-six-sku-openapi-evidence.json` (OpenAPI 3.0.3).
- **Documented path corrections:** `/v2` suffix on four `oneauto/*` SKUs; trailing slash on `ezyvin/vinlookup/`; Recall Check → `oneauto/recallcheckfromvin/v2` with `SYNC_ONLY` documented async.
- **Non-effects:** `ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS` remains empty; no outbound API calls; no production activation.
- **Tests:** `oneauto-p25b-openapi-contract-alignment.spec.ts` (offline regression against committed OpenAPI JSON).

## P2.5C — OE_VIN_LOOKUP_EU offline harness (2026-11-01)

- **Evidence:** `backend/src/modules/oneauto-provider/evidence/P25C_VIN_LOOKUP_OFFLINE_HARNESS.md`
- **Harness:** `oneauto-p25c-vin-lookup-offline-harness.spec.ts` — mocked fetch only; synthetic VIN; no live sandbox.
- **Util:** `catalog/oneauto-documented-request.util.ts` — URL builder for documented GET (offline).
- **Non-effects:** `ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS` remains empty in production; harness uses ephemeral test fixtures only.

## P2.5E-A — Offline security hardening (2026-11-01)

- **Scope:** Fail-closed SUCCESS_RESULT_ERROR envelope on HTTP 200; HTTP client `isValidVin`; redirect manual + response byte cap; positive org budget required when `ONEAUTO_ENABLED=true`.
- **Tests:** `oneauto-p25e-offline-security-hardening.spec.ts` (mocked only).
- **Non-effects:** `ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS` remains empty; no live provider calls; no SKU promotions.

## P2.5E-C — Isolated sandbox attestation harness (2026-11-01)

- **Harness:** `attestation/*` + `scripts/ops/oneauto-p25e-c-sandbox-attestation.ts` — offline fixtures default; live production one-shot via `--live-production` + explicit env authorizations (no compile-time disable).
- **Evidence template:** `architecture/oneauto-provider/evidence/P25E_C_ATTESTATION_TEMPLATE.md` (manual fill — never auto-promote registry).
- **Runbook (DE):** `architecture/oneauto-provider/evidence/P25E_C3_PRODUCTION_ONE_SHOT_RUNBOOK.de.md`
- **Non-effects:** No BullMQ, no Prisma, no `ONEAUTO_ENABLED`, no EXECUTION_VERIFIED registry writes; CI uses mocked fetch only.

## P2.5E-E2 — Async response evidence fingerprint (2026-11-02)

- **Scope:** Attestation evidence schema v2 adds `responseFingerprint` — allowlisted async metadata (job id SHA prefix, redacted Location host/path, Retry-After seconds, JSON key names, provider error codes) without raw bodies or credentials.
- **Fixtures:** Additional offline HTTP 202/206/malformed/sensitive-field scenarios in `oneauto-sandbox-attestation-fixtures.ts`.
- **Tests:** `oneauto-sandbox-attestation-response-fingerprint.util.spec.ts`, `oneauto-p25e-e2-async-evidence-hardening.spec.ts`.
- **Evidence:** `architecture/oneauto-provider/evidence/P25E_E2_PROVIDER_DASHBOARD_ASYNC_SEQUENCE.md` — portal 202 then ~22s portal 200 (`is_sqs_call=Y`) is **not** modeled as a second SynqDrive HTTP response in one attestation run.
- **Non-effects:** Still exactly one outbound GET in live attestation; no polling/callback activation; `ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS` unchanged.

## P2.5E-P1 — Secure attestation result capture (2026-11-02)

- **Scope:** Opt-in `--capture-redacted-result` on P25E-C CLI + `oneauto-sandbox-attestation-result-capture.*` (local atomic artifact, mode 0600).
- **Gates:** `ONEAUTO_ATTESTATION_RESULT_CAPTURE_ENABLED=1`, `ONEAUTO_PRODUCTION_ATTESTATION_RESULT_CAPTURE_OWNER_AUTHORIZED=1`, absolute `ONEAUTO_ATTESTATION_RESULT_CAPTURE_OUTPUT_PATH`.
- **Evidence:** `architecture/oneauto-provider/evidence/P25E_P1_SECURE_RESULT_CAPTURE.md`
- **Tests:** `oneauto-p25e-p1-secure-result-capture.spec.ts` (mocked fetch only).
- **Non-effects:** Default attestation remains fingerprint-only; no Prisma/DB; no vehicle apply; registry unchanged.

## OEM specification PR-C1 — VIN lookup normalizer (2026-11-03, draft)

- **Scope:** Pure normalize + compare for six documented `OE_VIN_LOOKUP_EU` desc fields; four code columns unmapped.
- **Evidence:** `architecture/oneauto-provider/evidence/ONEAUTO_OEM_SPEC_PRC1_NORMALIZER.md`
- **Tests:** `oneauto-vin-lookup-oem-suggestion.spec.ts` (Audi A4 sanitized fixture).
- **Non-effects:** EXECUTION_VERIFIED registry empty; no job→Vehicle bridge; attestation capture unchanged.

## OEM specification PR-C2 — suggestion snapshot + Master read (2026-11-03, draft)

- **Scope:** Additive Prisma snapshot per successful `OE_VIN_LOOKUP_EU` job; post-success materialization hook; bounded leader-safe recovery batch; Master GET with read-time comparison; expired snapshot cleanup.
- **Feature flag:** `ONEAUTO_OEM_SUGGESTIONS_ENABLED=false` (default OFF).
- **Scheduler registry:** `oneauto_oem_suggestion_snapshot_cleanup` in `SINGLETON_GLOBAL_SCHEDULER_NAMES`.
- **Evidence:** `architecture/oneauto-provider/evidence/ONEAUTO_OEM_SPEC_PRC2_SNAPSHOT.md`
- **Tests:** `oneauto-oem-vin-lookup-eu-suggestion.postgres.integration.spec.ts` (22 cases via extended `vehicle-tech-spec-patch-postgres-ci.sh`).
- **Non-effects:** No automatic OEM confirmation; no Vehicle writes; no provider re-execution; job expiry unchanged.

## OEM specification PR-C3 — Master Admin suggestion UI (2026-11-03, draft)

- **Scope:** Connected Vehicle OEM section — read-only suggestion panel + per-field confirmed apply via existing PATCH; nine-locale `master.cv.oemSpecs.suggestions.*`.
- **Evidence:** `architecture/oneauto-provider/evidence/ONEAUTO_OEM_SPEC_PRC3_MASTER_UI.md`
- **Tests:** `connected-vehicle-oem-suggestions.util.test.ts`, `ConnectedVehicleOemSpecificationsSection.suggestions.test.tsx`
- **Non-effects:** No backend provider lifecycle changes; no migrations; flag default OFF; no bulk accept.

## OEM specification PRA — schema alignment (2026-11-02, draft PR)

- **Scope:** Shared nullable `Vehicle` OEM columns + provenance registry for future Master confirm/import (Vehicle Onboarding authority).
- **Evidence cross-ref:** `architecture/vehicle-onboarding/evidence/ONEAUTO_OEM_SPEC_PRA_SCHEMA_PROVENANCE.md`
- **Non-effects:** `ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS` unchanged; attestation capture still local-only; no job→Vehicle writes; OpenAPI capture mapping unchanged until product PR.

## P3 — OE_VIN_LOOKUP_EU execution-verified registry (2026-11-03)

- **Scope:** Seed `ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS` with **OE_VIN_LOOKUP_EU** only — sync HTTP 200 path (live E2); async poll **disabled** (live E1 HTTP 202, no polling attestation).
- **Evidence:** `architecture/oneauto-provider/evidence/P3_VIN_LOOKUP_EXECUTION_VERIFIED.md` (reuses P25E-E1/E2 + P25E-P1 capture contract; no new provider calls in PR).
- **Code:** `catalog/oneauto-execution-verified-registry.ts`; catalog runtime `executionMode` override → `SYNC` when verified.
- **Non-effects:** `OE_SERVICE_HISTORY_EU` and other SKUs remain DOCUMENTED-only; no `ONEAUTO_ENABLED` / production env activation in PR; quote/MFA/budget/idempotency/no-retry unchanged.
- **Tests:** `oneauto-p3-vin-lookup-execution-verified-registry.spec.ts`; attestation/P2.5 regression expectations updated for single-SKU registry.

## P4 PR-1 — OE_VIN_LOOKUP_EU async-capable contract correction (2026-11-03)

- **Scope:** Correct execution-verified registry — `ASYNC_CAPABLE` / `asyncCapability: ASYNC_CAPABLE`; E2 HTTP 200 recorded as cached retrieval after E1 HTTP 202; `asyncPollSameUrlWithoutNewCharge` and `http206CompleteSuccessAllowed` remain `false`.
- **Evidence:** `architecture/oneauto-provider/evidence/P4_VIN_LOOKUP_ASYNC_CONTRACT_CORRECTION.md`, `P4_CROSS_VEHICLE_ROOT_CAUSE.md`; P3 doc marked superseded for classification only.
- **Code:** `oneauto-execution-verified-registry.ts` — `pricingSourceVersion` → `synqdrive-p4-vin-lookup-async-capable-v1`.
- **Non-effects:** No runtime 202 handling change in PR-1; no poll/callback; `OE_SERVICE_HISTORY_EU` non-executable; no production env activation.
- **Tests:** `oneauto-p3-vin-lookup-execution-verified-registry.spec.ts`, `oneauto-p4-vin-lookup-contract-classification.spec.ts` (never `SYNC_ONLY` from HTTP 200 alone).

## P4 PR-2 — AWAITING_PROVIDER async job lifecycle (2026-11-03)

- **Scope:** HTTP 202 on async-capable `OE_VIN_LOOKUP_EU` → `AWAITING_PROVIDER` with persisted acceptance response; `providerResultExpiresAt` (default 24h KB assumption); idempotent expiry; duplicate in-flight execute guard; Master UI pending messaging (9 locales).
- **Evidence:** `architecture/oneauto-provider/evidence/P4_ASYNC_JOB_LIFECYCLE.md`
- **Code:** `oneauto-provider-execution.service.ts`, `oneauto-provider.service.ts`, Prisma `provider_result_expires_at`, `ONEAUTO_PROVIDER_RESULT_RETENTION_MS` config.
- **Non-effects:** No provider poll/callback/retry/recovery GET; budget reservation semantics preserved; vendor charge remains `actualChargeKnown=false`.
- **Tests:** `oneauto-p4-async-job-lifecycle.spec.ts`, `oneauto-provider-result-retention.util.spec.ts`

## P4 PR-3 — callback notify-then-retrieval scaffold (2026-11-03, draft)

- **Scope:** Optional `callback_url` on initial dispatch; public callback ingress; inbox persistence; BullMQ `retrieval` phase (single GET); registry `asyncCompletionMode` default **`NONE`**.
- **Evidence:** `architecture/oneauto-provider/evidence/P4_PR3_CALLBACK_COMPLETION.md`
- **Flags (default OFF):** `ONEAUTO_CALLBACK_ENABLED`, `ONEAUTO_CALLBACK_RETRIEVAL_GET_ENABLED`, `ONEAUTO_CALLBACK_RETURN_DATA_IN_CALLBACK`
- **Non-effects:** No live activation without E4 + registry promotion; Service History remains non-executable; no merge/deploy in PR-3 draft.
- **Tests:** `oneauto-p4-pr3-callback-completion.spec.ts`

## P4 E4 — full-data callback completion (2026-11-04, draft)

- **Scope:** `CALLBACK_FULL_DATA` completion path for `OE_VIN_LOOKUP_EU` — initial GET with `return_data_in_callback=true`, job completes on validated callback POST without retrieval GET.
- **Evidence:** `architecture/oneauto-provider/evidence/P4_E4_FULL_DATA_CALLBACK_V1.md`
- **Flags (default OFF):** `ONEAUTO_CALLBACK_FULL_DATA_ENABLED` (decoupled from `ONEAUTO_CALLBACK_RETRIEVAL_GET_ENABLED`); registry seed promoted to `CALLBACK_FULL_DATA` (runtime still OFF until callback env flags).
- **Non-effects:** No live activation without env flags + owner attestation; no migrations.
- **Tests:** `oneauto-p4-e4-full-data-callback.spec.ts`, `oneauto-p4-e4-registry-promotion.spec.ts`, `oneauto-callback-full-data.util.ts`

## P4 E4-R — registry seed promotion CALLBACK_FULL_DATA (2026-11-04)

- **Scope:** `seedOneAutoExecutionVerifiedRegistry()` uses `buildExecutionVerifiedOeVinLookupEuFullDataCallback()`; env callback flags unchanged default OFF.
- **Evidence:** `P4_E4_FULL_DATA_CALLBACK_V1.md` (updated)
- **Tests:** `oneauto-p4-e4-registry-promotion.spec.ts`, P3 registry spec assertion

## P4 E4-L1 — live callback wrapper envelope + provider-failure classification (2026-11-04, draft PR)

- **BEFORE:** Callback body evaluated as bare `SUCCESS_RESULT_ERROR`; any envelope failure → `ONEAUTO_CALLBACK_PAYLOAD_MALFORMED` + HTTP 404.
- **WHY:** First live E4 callbacks (jobs `cmw2hedwi…` Tesla, `cmw2hf8zg…` VW) arrived as `{ status, result: <envelope> }` and both failed as malformed — one was a provider "no data / not charged" answer, one a valid result.
- **CHANGE:** `unwrapOneAutoCallbackBody()`; codes `ONEAUTO_CALLBACK_PROVIDER_FAILURE` / `ONEAUTO_PARTIAL_CONTENT`; provider failures persist envelope (`responsePhase='callback'`) and ack 200 `provider_failure`; success persists unwrapped envelope; `callback[_-]?url` redacted (202 echo carried delivery token).
- **Evidence:** `architecture/oneauto-provider/evidence/P4_E4_LIVE_CALLBACK_INCIDENT_2026-11-04.md`
- **Tests:** `oneauto-p4-e4-callback-wrapped-envelope.spec.ts`; `oneauto-p4-e4-full-data-callback.spec.ts` malformed case now uses non-boolean `success`.
- **Non-effects:** No retrieval GET, no retries, no billing change, no FAILED→SUCCEEDED recovery (designed only), no production deploy/env change in this PR.
- **Known pre-existing failure (main):** `oneauto-p25c-vin-lookup-offline-harness.spec.ts` "fails closed on HTTP 202" expects `ONEAUTO_ASYNC_POLL_UNVERIFIED`; P4 PR-1 made 202 → `AWAITING_PROVIDER`. Not touched here.

## P4 E4-L2 — FAILED-job inbox recovery CLI (2026-11-04, draft PR #2338)

- **Scope:** Owner-invoked recovery for job `cmw2hf8zg…` (VW) from persisted inbox — `OneAutoE4FailedCallbackRecoveryService`, shared `persistFullDataCallbackSuccessInTransaction`, ops CLI `oneauto-e4-recover-failed-callback-job.ts`.
- **Auth:** `ONEAUTO_E4_CALLBACK_RECOVERY_PRODUCTION_AUTHORIZED=1` + `ONEAUTO_E4_CALLBACK_RECOVERY_OWNER_ACK=1`; `--dry-run` first.
- **Audit:** `responsePhase=recovery_audit` row preserves prior `FAILED` / `lastErrorCode`; success clears job error fields after transition.
- **Evidence:** `P4_E4_CALLBACK_URL_REDACTION_REMEDIATION.md` (historical token exposure plan — no prod cleanup).
- **Tests:** `oneauto-e4-failed-callback-recovery.spec.ts`.
- **Non-effects:** No production replay in PR; no provider HTTP; Tesla job remains non-recoverable (provider `success:false`).
- **E4-L2b (hardening):** `persistFullDataCallbackSuccessInTransaction` transitions job before writing audit/callback rows; recovery tx re-validates FAILED/error/org/vehicle/retention; CLI uses `OneAutoE4FailedCallbackRecoveryCliModule` (no Workers/Schedule/Bull).

## E1 — OE_SERVICE_HISTORY_EU Master Admin (2026-11-05, draft PR)

- **Scope:** `OE_SERVICE_HISTORY_EU` on `GET ezyvin/servicehistory/` with E4 `CALLBACK_FULL_DATA` (one initial GET, zero retrieval GET/poll/retry).
- **Registry:** `buildExecutionVerifiedOeServiceHistoryEuFullDataCallback()`; pricing version `synqdrive-e1-service-history-eu-callback-v1`; DE PrePay reference 300 EUR minor (operator-configured).
- **Gates:** `ONEAUTO_SKU_OE_SERVICE_HISTORY_EU_RUNTIME_ENABLED=1` required (default OFF); global callback flags unchanged; no deploy-time paid authorization.
- **Payload:** Bare + wrapped callback envelopes; `service_events[]` validation; empty history vs provider failure vs 206 partial.
- **Budget:** Allowlisted test orgs only — `ONEAUTO_E1_SERVICE_HISTORY_TEST_ORG_IDS` + `ONEAUTO_E1_SERVICE_HISTORY_TEST_ORG_BUDGET_CAP_MINOR` (does not raise global cap).
- **UI:** Master `OneAutoServiceHistoryResultPanel` (9 locales for new keys; pl/fr/cs/nl/es/tr/it serviceHistory strings English pending native review).
- **Evidence:** `architecture/oneauto-provider/evidence/E1_SERVICE_HISTORY_EU_CALLBACK_V1.md`
- **Tests:** `oneauto-e1-service-history-eu.spec.ts`; registry specs updated for second SKU.
- **Non-effects:** No production env activation; no vehicle service-history import; no OEM spec overwrite.

## V1 — OE_SERVICE_HISTORY_EU → VehicleServiceEvent ingestion (PR #2341 review corrections, 2026-11-05)

- **Flag:** `ONEAUTO_OE_SERVICE_HISTORY_INGESTION_ENABLED` accepts `true`/`1`/`yes` vs `false`/`0`/`no`; unknown → off (`oneauto-boolean-env.util.ts` + config test).
- **Migration:** Renamed to `20261103231000_oneauto_oe_service_history_eu_ingestion` (depends on `one_auto_provider_jobs`); vehicle historical key + ingestion event links for cross-job dedup.
- **Isolation:** Provider job `SUCCEEDED` never downgraded by ingestion; ingestion audit `FAILED`/`PARTIAL` independent; callback/execution use safe wrapper (no throw).
- **Idempotency:** Link-table counts; `updateMany` guards against downgrading `SUCCEEDED`; cross-job `LINKED_EXISTING`.
- **HM/OEM:** `hasServiceBaseline` decoupled from imported OneAuto history; UI history cap 100 (count unchanged).
- **Backfill:** Prisma-only CLI + dry-run plan validation (0 provider GET).
- **Evidence:** `ONEAUTO_OE_SERVICE_HISTORY_INGESTION_V1.md` updated.
- **Tests:** ingestion concurrency/cross-job/mapper/backfill-lib; service-compliance baseline regression; `oneauto-oe-service-history-eu-postgres-ci.sh` (fresh + upgrade replay, real PG concurrency).

## P2.5E-P1 hardening — capture field coverage & safe publish (2026-11-02)

- **Field coverage:** `bodyType` / `interiorTrim` from `oem_body_type_desc` / `oem_interior_trim_desc`; regression asserts **17** non-VIN OpenAPI result keys mapped.
- **File write safety:** Temp-file create in destination dir (0600) → atomic rename; no partial final artifacts; concurrent publish tests; path/symlink guards unchanged.
- **Tests:** Dedicated HTTP 200 non-JSON guard (no artifact; fingerprint `nonJsonBody`); existing VIN mismatch / 202 / 206 / `success:false` regressions retained.
- **Non-effects:** Unchanged from P2.5E-P1 baseline (no live API in CI, no EXECUTION_VERIFIED, no vehicle writes).
