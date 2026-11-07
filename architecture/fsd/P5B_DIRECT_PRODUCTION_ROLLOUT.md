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

**Note (L1):** FSD orchestration config is resolved at process boot (`FsdDiscoveryIntegrationModule` env factory). Changing the variables above does **not** affect already-running PM2 replicas until both processes reload environment and restart:

```bash
# On production VPS as synqdrive-admin — set flags OFF in backend env, then:
pm2 reload synqdrive-backend-3001 --update-env
pm2 reload synqdrive-backend-3002 --update-env
```

Verify both replicas show `FSD3_*` / `FSD4_*` execution disabled in logs or env attestation before declaring dispatch stopped.

## Rollback

1. Set all FSD execution flags OFF (immediate stop of provider dispatch).
2. Redeploy previous known-good SHA if application regression suspected.
3. P5B invalidation is forward-only; no migration rollback.

## Live activation (separate gate)

Requires explicit owner authorization, verified orchestration entrypoint, budget configuration, and a **documented live-activation sign-off** (L2). `FSD3_LIVE_ACTIVATION_BLOCKERS_V1` is an empty static list and is **not** enforced at runtime — do not treat an empty array as “no blockers.”

Minimum activation prerequisites (owner sign-off, not automatic):

1. Production caller wired for `FsdDiscoveryOrchestratorFactoryService` (today: **none**).
2. Lease renewal / ownership policy validated under multi-replica PM2.
3. DIMO provider budget + admission configuration attested.
4. Monitoring for stranded `IN_PROGRESS` runs and unsettled ledger attempts.
5. P5B lifecycle + audit paths deployed (this rollout).

**Not** part of dormant P5B deploy.
