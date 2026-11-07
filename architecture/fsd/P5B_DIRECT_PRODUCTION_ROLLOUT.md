# FSD P5B — Direct production rollout (no canary)

## Preconditions

- P5B implementation merged to `main` with green FSD Postgres CI and offboarding regression suites.
- No database migration required for P5B (application-only).
- FSD live execution flags remain **OFF** in production env.

## Rollout steps

1. Owner authorizes merge after architecture review.
2. Verify latest `CI gate (all critical jobs)` success on release SHA.
3. `CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED=1` deploy via `cloud-agent-deploy.sh` → rolling replicas **3001** / **3002**.
4. Verify public health, PM2 processes, and release SHA match.
5. Confirm env: `FSD3_*` / `FSD4_*` orchestration and `*_PROVIDER_EXECUTION_ENABLED` unset or `0`; allowlists empty.
6. Smoke: offboard test vehicle in staging/disposable only — not required on production.

## Kill switch (global)

| Control | Effect |
|---------|--------|
| `FSD3_CATALOG_SNAPSHOT_ORCHESTRATION_ENABLED` ≠ `1` | FSD-3 orchestration disabled |
| `FSD4_HISTORICAL_ORCHESTRATION_ENABLED` ≠ `1` | FSD-4 orchestration disabled |
| `FSD3_PROVIDER_EXECUTION_ENABLED` ≠ `1` | No live DIMO HTTP for FSD-3 |
| `FSD4_PROVIDER_EXECUTION_ENABLED` ≠ `1` | No live DIMO HTTP for FSD-4 |
| Empty vehicle allowlists | Fail-closed per vehicle |

## Rollback

1. Set all FSD execution flags OFF (immediate stop of provider dispatch).
2. Redeploy previous known-good SHA if application regression suspected.
3. P5B invalidation is forward-only; no migration rollback.

## Live activation (separate gate)

Requires explicit owner authorization, verified orchestration entrypoint, budget configuration, and removal of remaining live activation blockers documented in FSD config — **not** part of this rollout.
