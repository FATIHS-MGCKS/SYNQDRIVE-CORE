# E1 — OE_SERVICE_HISTORY_EU full-data callback (Master Admin)

**Status:** IMPLEMENTED (repository); **not** production-activated by default.

## Provider contract

| Field | Value |
|-------|--------|
| SKU | `OE_SERVICE_HISTORY_EU` |
| Method / path | `GET` `ezyvin/servicehistory/` |
| Query | `vehicle_identification_number`, `callback_url`, `return_data_in_callback=true` |
| Completion | `CALLBACK_FULL_DATA` (E4 architecture) — one initial GET, zero retrieval GET, zero poll |

## Runtime activation (independent gates)

Deploying code **does not** authorize paid lookups. All must be set explicitly:

| Gate | Env |
|------|-----|
| Global provider | `ONEAUTO_ENABLED=true` |
| SKU runtime | `ONEAUTO_SKU_OE_SERVICE_HISTORY_EU_RUNTIME_ENABLED=1` |
| Callback ingress | `ONEAUTO_CALLBACK_ENABLED=true`, `ONEAUTO_CALLBACK_FULL_DATA_ENABLED=true` |
| Price | `ONEAUTO_INDICATIVE_PRICE_OE_SERVICE_HISTORY_EU_MINOR=300` (DE PrePay reference) |
| Pricing version | `ONEAUTO_PRICING_CATALOG_VERSION=synqdrive-e1-service-history-eu-callback-v1` |

## Budget test allowance (100 minor platform cap)

For allowlisted Master test orgs only (does not raise global cap):

- `ONEAUTO_E1_SERVICE_HISTORY_TEST_ORG_IDS=<uuid[,uuid...]>`
- `ONEAUTO_E1_SERVICE_HISTORY_TEST_ORG_BUDGET_CAP_MINOR=500` (example)

## Callback payload

- Documented `{ success, result, error }` and live wrapper `{ status, result: { success, result, error } }`.
- Validates `vehicle_identification_number`, optional `service_events[]` with attested fields; empty array = successful empty history.
- Provider `success:false` → `ONEAUTO_CALLBACK_PROVIDER_FAILURE`; wrapper `206` → `ONEAUTO_PARTIAL_CONTENT`.

## Master Admin

Structured service history panel (chronological events) in `OneAutoServiceDialog` when SKU succeeds; raw JSON retained for evidence.
