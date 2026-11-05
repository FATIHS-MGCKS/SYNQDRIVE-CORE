# OE Service Schedule EU — execution activation (standard OneAuto path)

**Operation:** `ONEAUTO_OE_SERVICE_SCHEDULE_SIMPLE_ACTIVATION`  
**Supersedes:** P2 scoped attestation canary (PR #2345) — **do not merge** that approach.

## What changed

`OE_SERVICE_SCHEDULE` is seeded in `seedOneAutoExecutionVerifiedRegistry` with the same **E4 `CALLBACK_FULL_DATA`** pattern as `OE_VIN_LOOKUP_EU` and `OE_SERVICE_HISTORY_EU`:

- Path: `GET oneauto/oeserviceschedulefromvin/v2`
- One initial outbound GET; async completion via full-data callback when provider returns HTTP 202
- No verified async poll; no callback retrieval GET
- Master Admin **existing** quote / execute / MFA / budget / HTTP client / persistence unchanged
- P1 parser + Master result UI unchanged
- Runtime gate: `ONEAUTO_SKU_OE_SERVICE_SCHEDULE_RUNTIME_ENABLED` remains **default OFF**

## Pricing

Public DE PrePay reference: **210 EUR minor** (VAT excluded) — see `oneauto-prepay-reference-prices.ts`.  
Operators configure runtime quotes via existing env:

`ONEAUTO_INDICATIVE_PRICE_OE_SERVICE_SCHEDULE_MINOR=210`

Recommended pricing catalog version label: `synqdrive-oe-service-schedule-eu-callback-v1` (`ONEAUTO_OE_SERVICE_SCHEDULE_EU_PRICING_SOURCE_VERSION`).

This PR does **not** change production budgets or env.

## Live verification status

**Not claimed:** Schedule-specific provider behavior (timing, charges, callback payload edge cases) and account-specific billing remain to be verified during the **first owner-approved live test** after deploy + env activation. Offline tests cover SynqDrive contract handling only.

## Non-effects

- No Service History ingestion
- No OEM / HM suggestion materialization
- No new Prisma models, routes, or permit/canary layers
