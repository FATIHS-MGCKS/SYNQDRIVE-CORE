# One Auto P4 — OE_VIN_LOOKUP_EU async-capable contract correction

**Epistemic status:** Registry correction from committed forensics — **no new provider calls in this PR**.

## Corrected interpretation (P4 forensics)

| Run | HTTP | Outbound GETs | Meaning |
|-----|------|---------------|---------|
| **E1** | **202** | **1** | Async **acceptance** — provider job queued (`HTTP_202_ASYNC`) |
| **E2** | **200**, `success=true` | **1** | **Retrieval** of E1-completed result within provider **24h retention** — not proof of sync-first-call |

Cross-refs:

- [P25E_E2_PROVIDER_DASHBOARD_ASYNC_SEQUENCE.md](./P25E_E2_PROVIDER_DASHBOARD_ASYNC_SEQUENCE.md)
- [P4_CROSS_VEHICLE_ROOT_CAUSE.md](./P4_CROSS_VEHICLE_ROOT_CAUSE.md) (production Arteon/Audi/Tesla `ONEAUTO_ASYNC_POLL_UNVERIFIED` after P3 `SYNC_ONLY` misclassification)

## Registry entry (code)

File: `backend/src/modules/oneauto-provider/catalog/oneauto-execution-verified-registry.ts`

| Field | P3 (superseded) | P4 (current) |
|-------|-----------------|--------------|
| `catalogExecutionMode` | `SYNC` | **`ASYNC_CAPABLE`** |
| `asyncCapability` | `SYNC_ONLY` | **`ASYNC_CAPABLE`** |
| `asyncPollSameUrlWithoutNewCharge` | `false` | **`false`** (unchanged — no attested free poll) |
| `http206CompleteSuccessAllowed` | `false` | **`false`** (unchanged) |
| `pricingSourceVersion` | `synqdrive-p3-vin-lookup-e2-sync-200-v1` | **`synqdrive-p4-vin-lookup-async-capable-v1`** |

## Explicitly **not** changed

- `OE_SERVICE_HISTORY_EU` and all other SKUs — remain DOCUMENTED-only / non-executable.
- Callback / webhook activation — **not** in P4 PR-1.
- Automatic same-URL polling after 202 — **not** enabled.

## Runtime follow-up (separate PR-2)

HTTP 202 → persistent `AWAITING_PROVIDER` (no second GET, no poll) — see P4 PR-2 lifecycle PR.

## Production env note (operator)

After merge + deploy, set `ONEAUTO_PRICING_CATALOG_VERSION=synqdrive-p4-vin-lookup-async-capable-v1` before execute (quote/confirm mismatch otherwise). **Not** applied in this PR.
