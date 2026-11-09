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

Controlled integration tests use `FSD_P6D_FORCE_MOCK_TRANSPORT=1` (mock providers, no outbound DIMO). Mock transport is **forbidden** on `production_vps` / `NODE_ENV=production` with no override.

## P6D architecture-review remediation (H1–H8)

- **H1** — Live `PREPARE_LIVE_FLEET` / `EXECUTE --provider=live` use `assertFsdP6dLiveCliDatabaseAdmissionV1` (production VPS `synqdrive` or disposable CI when `FSD_DISCOVERY_PERSISTENCE_PG=1`). Mock `EXECUTE` stays on the P6C disposable guard only.
- **H2** — `assertFsdP6dProviderPreDispatchGateV1` before live catalog fetch and fleet execute; catalog dispatch requires `SYNQDRIVE_FSD_P6D_LIVE_CATALOG_DISPATCH_AUTHORIZED=1` (PREPARE without it does zero provider requests).
- **H3 / Blocker A** — Persisted catalog is `LIVE_DIMO_VERIFIED` only when checkpoint records `providerKind: live`, `catalogFetchSucceeded: true`, HTTP 200, ledger `SUCCEEDED`, and matching `declaredCatalogFingerprint`. No run-key/synthetic heuristics.
- **Blocker C** — Live catalog prep uses catalog-only FSD3 orchestration (`maxRequestsPerRun: 1`) for ledger reserve/settlement/idempotency.
- **Blocker D** — `prepareArtifact` + `--fleet-prepare-request-key` required for EXECUTE; CLI writes/reads `--prepare-artifact-out/in`.
- **H4** — Production manifests may omit declared fields; unresolved catalog → `CATALOG_PENDING`. Live fetch accepts only HTTP 200 + `catalogFetchSucceeded !== false` + non-empty signals.
- **H5** — `identityFreeze` artifact compares connection fingerprint, token, and catalog fingerprint between prepare and execute.
- **H6** — Optional per-vehicle `historicalWindow` in fleet manifest; plan row carries effective window; execute stops on plan/execute window drift.

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
