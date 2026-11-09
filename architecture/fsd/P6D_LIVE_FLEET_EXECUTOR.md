# FSD P6D — live fleet executor (integration only)

P6C prepared fleet CLI, gates, and mock execution. **P6D** wires the same sequential fleet loop for a **later, separately authorized** live DIMO dispatch using existing `FsdDimoAdapterFactoryService` ports — without PM2 flags, deploy hooks, or automatic live activation.

## Catalog-first

1. Resolve catalog from **persisted FSD3 COMPLETED** evidence (token + connection fingerprint), else
2. Owner-authorized live catalog dispatch (`SYNQDRIVE_FSD_P6D_LIVE_CATALOG_DISPATCH_AUTHORIZED=1`), never manifest-only fields.
3. Dynamic replan via `buildFsdP6cFleetDiscoveryPlanReportV1` on evidence-derived `declaredFieldNames`.

## Live execute fail-closed gates

- `SYNQDRIVE_FSD_P6D_LIVE_FLEET_EXECUTE_AUTHORIZED=1`
- `FSD_P6D_LIVE_FLEET_AUTHORIZED_RELEASE_SHA` matches audit `releaseSha`
- Existing P6C GO/NO-GO (`planCompleteness === 'FULL'`, budget guard, architecture review)
- `FSD3_ONE_SHOT_HOST_ATTESTATION=1`, `SYNQDRIVE_FSD3_ONE_SHOT_LIVE_OWNER_AUTHORIZED=1`
- `MASTER_ADMIN` operator auth per vehicle (preflight)

Controlled integration tests use `FSD_P6D_FORCE_MOCK_TRANSPORT=1` (mock providers, no outbound DIMO).

## CLI

```bash
# Catalog + plan disclosure (DB, no fleet execute)
npx tsx backend/scripts/ops/fsd-fleet-full-discovery-one-shot.ts \
  --mode=PREPARE_LIVE_FLEET \
  --provider=live \
  --fleet-manifest=... \
  --actor-user-id=...

# Live fleet execute (separate owner authorization; not enabled by deploy)
npx tsx backend/scripts/ops/fsd-fleet-full-discovery-one-shot.ts \
  --mode=EXECUTE \
  --provider=live \
  ...
```

`STOP=AWAIT_CHATGPT_ARCHITECTURE_REVIEW` — no merge/deploy/live fleet activation in the P6D integration PR alone.
