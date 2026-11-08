# FSD P6C — four-vehicle full fleet discovery runbook

Production SHA baseline for this preparation: `cfb52cd0f317a3bfec919518ad18d5c94209c7a9`.

## Scope

Sequential privileged operator workflow for:

1. Tesla Model 3
2. VW Tiguan
3. Audi A4
4. VW Arteon

Each vehicle: **FSD3** catalog + snapshot, then **FSD4** historical discovery with **verified FSD3 catalog reuse** (no second catalog provider dispatch when reuse contract passes).

Global PM2 flags `FSD3_*` / `FSD4_*` stay **unchanged**. No scheduler activation.

## Entry CLI

```bash
npx tsx backend/scripts/ops/fsd-fleet-full-discovery-one-shot.ts \
  --mode=OFFLINE_PLAN|AUTHORIZED_READ_ONLY_PREFLIGHT|EXECUTE \
  --fleet-manifest=/path/to/production-fleet-manifest.json \
  --actor-user-id=<MASTER_ADMIN_USER_ID> \
  --provider=mock|live
```

Owner gates (live only, unchanged from P6B):

```bash
export FSD3_ONE_SHOT_HOST_ATTESTATION=1
export SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED=1
```

## Manifest contract (`FSD_P6C_FLEET_MANIFEST_V1`)

- `organizationId` — tenant scope
- `historicalWindow` — `{ fromUtc, toUtc }` UTC ISO; must pass `validateHistoricalWindowForPlanning`
- `budget` — planner + orchestration cap (`maxRequestsPerRun` ≤ env `FSD_P6C_MAX_REQUESTS_PER_RUN_CEILING`, default 12, hard ceiling 64)
- `vehicles[]` in fixed order: `tesla_model_3`, `vw_tiguan`, `audi_a4`, `vw_arteon`
- Per vehicle: `vehicleId`, `providerSourceLinkId`, `discoveryRequestKey`, `historicalRequestKey`, `declaredFieldNames` (from verified catalog evidence — **required for production**)

Offline fixture: `backend/src/modules/vehicle-intelligence/fsd-integration/ops/p6c/__fixtures__/fsd-p6c-offline-fleet-manifest.v1.json` (hydrates reference declared fields for CI only).

## Recommended operator flow

1. **OFFLINE_PLAN** (no DB): planner-derived request counts per vehicle + fleet disclosure total + provider budget guard + GO/NO_GO template (`STOP=AWAIT_CHATGPT_REVIEW`).
2. **AUTHORIZED_READ_ONLY_PREFLIGHT**: MASTER_ADMIN source-link validation per vehicle, token fingerprint, plan guard re-check.
3. Human **ChatGPT / architecture review** (mandatory stop).
4. **EXECUTE** with `--provider=live` only after separate owner live approval (not automated in this PR).

## Planner-derived request budget (offline reference, budget=12, P2E window)

| Vehicle label   | FSD3 planned provider requests | FSD4 planned (catalog reused) | Notes |
|-----------------|--------------------------------:|--------------------------------:|-------|
| tesla_model_3   | 2 | 5 | Tesla P2E 26-signal reference |
| vw_tiguan       | 2 | 4 | VAG offline ICE subset (12 signals) |
| audi_a4         | 2 | 4 | same subset |
| vw_arteon       | 2 | 4 | same subset |

Recompute before live run: `npx tsx backend/scripts/ops/fsd-fleet-full-discovery-one-shot.ts --mode=OFFLINE_PLAN --fleet-manifest=...`.

Fleet sequential disclosure total (offline reference): **25** provider requests across four vehicles (catalog reuse on FSD4).

## Historical window

Production manifest must pin an allowed window within budget `maxHistoricalWindowSeconds` (default 3600s). Offline tests use `FSD_P2E_HISTORICAL_WINDOW_V1` (`2026-11-04T04:32:00Z` → `2026-11-04T04:57:37.477Z`).

## Safety preserved

- MASTER_ADMIN operator authorization + active source-link fences
- Idempotent persistence + lease semantics
- Per-run request ledger + inspector JSON per FSD3/FSD4 `runId`
- UNKNOWN_OUTCOME retry semantics unchanged in orchestrators
- No live DIMO in CI

## GO / NO_GO

CLI emits `goNoGo` with `stop: AWAIT_CHATGPT_REVIEW`. Live execute is **NO_GO** until:

- All vehicle plans `executable`
- Provider budget guard `ok`
- Owner authorization env set
- External review cleared
