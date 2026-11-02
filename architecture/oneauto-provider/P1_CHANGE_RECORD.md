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

## OEM specification PRA — schema alignment (2026-11-02, draft PR)

- **Scope:** Shared nullable `Vehicle` OEM columns + provenance registry for future Master confirm/import (Vehicle Onboarding authority).
- **Evidence cross-ref:** `architecture/vehicle-onboarding/evidence/ONEAUTO_OEM_SPEC_PRA_SCHEMA_PROVENANCE.md`
- **Non-effects:** `ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS` unchanged; attestation capture still local-only; no job→Vehicle writes; OpenAPI capture mapping unchanged until product PR.

## P2.5E-P1 hardening — capture field coverage & safe publish (2026-11-02)

- **Field coverage:** `bodyType` / `interiorTrim` from `oem_body_type_desc` / `oem_interior_trim_desc`; regression asserts **17** non-VIN OpenAPI result keys mapped.
- **File write safety:** Temp-file create in destination dir (0600) → atomic rename; no partial final artifacts; concurrent publish tests; path/symlink guards unchanged.
- **Tests:** Dedicated HTTP 200 non-JSON guard (no artifact; fingerprint `nonJsonBody`); existing VIN mismatch / 202 / 206 / `success:false` regressions retained.
- **Non-effects:** Unchanged from P2.5E-P1 baseline (no live API in CI, no EXECUTION_VERIFIED, no vehicle writes).
