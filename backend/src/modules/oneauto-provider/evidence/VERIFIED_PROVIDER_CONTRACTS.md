# One Auto API — provider contracts (SynqDrive)

Last updated: **2026-11-01** (P2.5B OpenAPI evidence alignment). No live paid provider calls from this workstream.

## OpenAPI evidence (P2.5B)

Canonical six-SKU contract snapshot: `docs/provider-evidence/oneauto-six-sku-openapi-evidence.json` (OpenAPI **3.0.3**).  
Regression: `oneauto-p25b-openapi-contract-alignment.spec.ts`.

## Evidence states (orthogonal)

| State | Meaning | Outbound HTTP | Master Admin execute |
|-------|---------|---------------|----------------------|
| **UNVERIFIED** | No vendor attestation in repo | Blocked | Blocked |
| **DOCUMENTED** | Official marketing/service page paths + auth + VIN param recorded | **Blocked** | **Blocked** |
| **EXECUTION_VERIFIED** | Async poll billing, HTTP 206, pricing, and parsing attested on registry entry | Allowlisted only | Allowed when flag + env price |

**DOCUMENTED ≠ EXECUTABLE.** Documented contracts live in `catalog/oneauto-documented-contracts.ts`.  
Execution registry `ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS` remains **empty** until a follow-up attestation PR.

## Official references

| Source | URL |
|--------|-----|
| Swagger UI | https://swagger.oneautoapi.com/ (OpenAPI JSON typically account-gated) |
| DE pricing (PrePay / Business) | https://www.oneautoapi.com/pricing/de/ |
| Async methods | https://docs.oneautoapi.com/knowledgebase/working-with-asynchronous-api-methods/ |
| Status codes | https://docs.oneautoapi.com/knowledgebase/understanding-status-codes/ |
| API keys | https://docs.oneautoapi.com/knowledgebase/creating-api-keys/ |

## DOCUMENTED — six SKUs (GET)

Auth header: **`x-api-key`**. VIN query: **`vehicle_identification_number`**.  
Sandbox host: `https://sandbox.oneautoapi.com`. Live host: `https://api.oneautoapi.com`.

| SKU | Path | Async capability (documented) |
|-----|------|--------------------------------|
| OE_SERVICE_HISTORY_EU | `ezyvin/servicehistory/` | ASYNC_CAPABLE → catalog `ASYNC_POLL` |
| OE_SERVICE_SCHEDULE | `oneauto/oeserviceschedulefromvin/v2` | ASYNC_CAPABLE → `ASYNC_POLL` |
| OE_BUILD_DECODE | `oneauto/oebuilddecode/v2` | ASYNC_CAPABLE → `ASYNC_CAPABLE` |
| OE_BUILD_SHEET_EU | `oneauto/oebuildsheeteuropefromvin/v2` | ASYNC_CAPABLE → `ASYNC_POLL` |
| OE_VIN_LOOKUP_EU | `ezyvin/vinlookup/` | ASYNC_CAPABLE → `ASYNC_CAPABLE` |
| RECALL_CHECK | `oneauto/recallcheckfromvin/v2` | SYNC_ONLY (OpenAPI: VIN only, no callback params) → `SYNC` |

Service page URLs are listed on each entry in `oneauto-documented-contracts.ts` (`evidenceSources`).

## EXECUTION_VERIFIED registry

**Empty.** No SKU may call the provider until an entry is added with:

- `evidenceState: 'EXECUTION_VERIFIED'`
- Explicit `asyncPollSameUrlWithoutNewCharge` (required `true` to enable same-URL polling after 202)
- Explicit `http206CompleteSuccessAllowed` (required `true` to treat HTTP 206 as job success)
- `pricingSourceVersion` + env `ONEAUTO_INDICATIVE_PRICE_<SKU>_MINOR`

## HTTP client (P2.5A)

- Contract-driven `executeProviderGet` — no `Authorization` / `vin` fallbacks.
- Base URL host allowlist: `sandbox.oneautoapi.com`, `api.oneautoapi.com` only.
- Path allowlist: **execution-verified** contracts only.
- **No automatic retries** for billable requests (`ONEAUTO_MAX_RETRIES` default **0**).
- API keys never logged.
- **P2.5E:** `redirect: manual`; bounded response read (`ONEAUTO_MAX_RESPONSE_BYTES`); HTTP 200 `success===false` fails job; `isValidVin` at HTTP client; positive `ONEAUTO_ORG_DAILY_BUDGET_MINOR` required when enabled.

## Async / billing safety

- Same-URL polling after **202** is **fail-closed** until `asyncPollSameUrlWithoutNewCharge` is attested on an execution-verified entry.
- **Callbacks / webhooks** are documented but **not activated**.
- **HTTP 206** is **not** job success unless `http206CompleteSuccessAllowed` on execution-verified entry.
- `actualChargeKnown` remains **false** until provider billing evidence exists.
- **P2.5E:** HTTP 200 with OpenAPI `success:false` does **not** complete jobs (`ONEAUTO_PROVIDER_ENVELOPE_FAILURE`); envelope does not prove non-billing.

## DE PrePay reference prices (EUR minor, VAT excluded)

Reference only — **not** auto-loaded into quotes. See `catalog/oneauto-prepay-reference-prices.ts`.

| SKU | PrePay EUR minor |
|-----|------------------|
| OE_SERVICE_HISTORY_EU | 300 |
| OE_SERVICE_SCHEDULE | 210 |
| OE_BUILD_DECODE | 180 |
| OE_BUILD_SHEET_EU | 195 |
| OE_VIN_LOOKUP_EU | 36 |
| RECALL_CHECK | UNVERIFIED (see service page) |

Catalog default currency remains **GBP** until operators configure env indicative prices after account verification.

## SynqDrive safety (unchanged)

- `ONEAUTO_ENABLED=false` by default.
- Cost confirmation + quote TTL + idempotency before enqueue.
- Master Admin MFA on execute (`MASTER_ONEAUTO_PROVIDER_EXECUTE`).
- External JSON stored only — no auto-write to vehicle specs / service history.
