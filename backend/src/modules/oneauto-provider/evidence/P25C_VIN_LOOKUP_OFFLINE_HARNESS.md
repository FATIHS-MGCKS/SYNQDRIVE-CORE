# One Auto P2.5C — OE_VIN_LOOKUP_EU offline harness & sandbox readiness

Last updated: **2026-11-01**. **No live provider calls** from this workstream.

## Contract (DOCUMENTED + OpenAPI 3.0.3 evidence)

| Field | Value | Evidence |
|-------|--------|----------|
| SKU | `OE_VIN_LOOKUP_EU` | `oneauto-documented-contracts.ts` |
| Method | `GET` | OpenAPI `/ezyvin/vinlookup/` |
| Path | `ezyvin/vinlookup/` (trailing slash) | `docs/provider-evidence/oneauto-six-sku-openapi-evidence.json` |
| Sandbox base (config default) | `https://sandbox.oneautoapi.com` | `oneauto-provider.config.ts` |
| Live base (config default) | `https://api.oneautoapi.com` | same |
| Auth | Header `x-api-key` | OpenAPI `components.securitySchemes` |
| Required query | `vehicle_identification_number` | OpenAPI parameters |
| Optional query | `callback_url`, `return_data_in_callback` | OpenAPI (not sent by SynqDrive client today) |
| Response envelope (OpenAPI 200) | `success`, `result`, optional `error` string | OpenAPI schema |
| OpenAPI HTTP responses listed | **200 only** | No 202/4xx/5xx in committed OpenAPI snapshot |
| Async (marketing/KB) | ASYNC_CAPABLE + optional callbacks | `ASYNC_KB`; **not** attested for poll billing |
| Runtime parsing | `OPAQUE_JSON` — no field-level validation | P2.5A policy |

## Offline harness scope (P2.5C)

- `oneauto-p25c-vin-lookup-offline-harness.spec.ts` — mocked `fetch` only; synthetic VIN `WBA12345678901234`.
- Uses **test-only** `EXECUTION_VERIFIED` fixture objects in memory; **does not** write to `ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS` for production paths except temporary `Map.set` in isolated tests with `afterEach` cleanup.
- **Not** proof of real sandbox/live provider behavior.

## Billing & sandbox readiness (offline audit)

| Item | Status | Notes |
|------|--------|-------|
| Sandbox base URL documented | **CONFIRMED** | Config + OpenAPI `servers[0]` |
| Sandbox credentials in repo | **BLOCKED** | Must not commit; `ONEAUTO_API_KEY` env only |
| Free vs billable sandbox calls | **UNKNOWN** | No vendor sandbox billing attestation in repo |
| Approved sandbox test VIN list | **UNKNOWN** | OpenAPI example `ABCDE123456F78910` is documentation only |
| Rate limits | **UNKNOWN** | Not in OpenAPI snapshot |
| 202 same-URL poll non-billable | **UNKNOWN** | KB/marketing only; `asyncPollSameUrlWithoutNewCharge=false` |
| Callback billing / behavior | **UNKNOWN** | Documented optional params; not implemented |
| DE PrePay reference (36 EUR minor) | **CONFIRMED** (reference only) | `oneauto-prepay-reference-prices.ts`; not auto-loaded |
| `ONEAUTO_ENABLED` default | **CONFIRMED** false | No activation |
| Execution registry | **CONFIRMED** empty | No outbound allowlist |

## Live sandbox GO/NO-GO

**NO-GO** until: execution-verified attestation PR, env indicative price, owner-authorized sandbox key, and **observed** sandbox responses (out of scope for P2.5C).
