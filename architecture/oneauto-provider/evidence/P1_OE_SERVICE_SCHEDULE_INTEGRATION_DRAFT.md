# P1 — OE Service Schedule integration (draft PR)

**Operation:** `ONEAUTO_OE_SERVICE_SCHEDULE_P1_INTEGRATION`  
**Status:** Implementation draft — **not** execution-verified, **not** production-enabled.

## Implemented (repository)

| Area | Detail |
|------|--------|
| Contract | Reuses documented SKU `OE_SERVICE_SCHEDULE` (`GET` `oneauto/oeserviceschedulefromvin/v2`, VIN param `vehicle_identification_number`, `SUCCESS_RESULT_ERROR`). |
| Parser | `service-schedule/oneauto-oe-service-schedule-eu-provider.util.ts` — `normal_services[]`, `extra_services[]`, nested tasks/parts, unknown fields preserved. |
| E4 callback eval | `evaluateOneAutoFullDataCallbackPayload` branch for schedule; `isOneAutoFullDataCallbackSku` includes SKU (prep only). |
| Runtime gate | `ONEAUTO_SKU_OE_SERVICE_SCHEDULE_RUNTIME_ENABLED` — default **OFF** (fail-closed). |
| Pricing display | DE PrePay reference **210 EUR** minor via existing prepay map; catalog resolves **EUR** when indicative price configured. |
| Master Admin UI | `OneAutoServiceScheduleResultPanel` + parser util (sections A–E, read-only). |
| Persistence | Reuses `OneAutoProviderResponse` only — **no** `VehicleServiceEvent` / HM-OEM mutation. |

## Review corrections (2026-11-05)

- Protected inventory: `hardcoded-copy-inventory.json` unchanged vs `main` (product copy in `master.oneAuto.*` only).
- Strict nested validation: `oneauto-oe-service-schedule-field-validation.util.ts` (backend + mirrored frontend).
- UI integrity states: `VALID_WITH_SERVICES`, `VALID_EMPTY`, `MALFORMED_OR_PARTIAL`, `VIN_MISMATCH`, `RESPONSE_UNAVAILABLE` with localized fallbacks; raw JSON remains in dialog preview.

## Explicitly **not** done

- **Not** added to `seedOneAutoExecutionVerifiedRegistry` — execute path remains `CONTRACT_UNVERIFIED`.
- **No** live/sandbox provider HTTP in this workstream.
- **No** production env, budget, or price auto-configuration.
- **No** attestation record promoting `EXECUTION_VERIFIED`.

## Evidence required before execution promotion

1. Controlled sandbox/live callback sequence for `OE_SERVICE_SCHEDULE` (full-data POST, wrapped + unwrapped envelopes).
2. HTTP 202 initial dispatch + callback completion without retrieval GET (charge-safe).
3. Billing/charge attestation for 210 EUR minor (account + org budget checklist).
4. Operator sign-off on parser samples vs provider payloads (tasks, parts, empty schedule vs empty history).
5. Registry promotion: call `buildExecutionVerifiedOeServiceScheduleEuFullDataCallbackForAttestationOnly()` only after evidence file is linked.

## First controlled sandbox test procedure (owner)

1. Set org indicative price `ONEAUTO_INDICATIVE_PRICE_OE_SERVICE_SCHEDULE_MINOR=210` and pricing catalog version aligned with attestation builder.
2. Enable global One Auto + callback flags per existing E4 runbook; set `ONEAUTO_SKU_OE_SERVICE_SCHEDULE_RUNTIME_ENABLED=1` **only** on sandbox.
3. Promote execution-verified registry entry in a **separate** attested change (not this draft).
4. Master Admin: quote → confirm → single initial GET with callback URL; await callback; verify result panel and raw JSON store.
5. Confirm **no** second GET, **no** service-history ingestion logs, **no** vehicle intelligence side effects.

## Organization budget checks

- Use existing daily cap aggregation (`budgetReservedMinor` on confirmed jobs).
- Do not raise caps in this draft; verify org has headroom before any live test.

## Rollback plan

- Revert PR / disable `ONEAUTO_SKU_OE_SERVICE_SCHEDULE_RUNTIME_ENABLED`.
- Leave execution registry unchanged (schedule remains non-executable).
- No migration — parser/UI/callback prep only.
