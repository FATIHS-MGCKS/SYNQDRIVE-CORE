# P4B16 R1C — Stale COMMITTED attestation recovery (repository)

**Status:** `IMPLEMENTED` · `OFFLINE_VALIDATED` · `NOT_DEPLOYED` · `NOT_ACTIVATED`  
**Scope:** Attestation + `SYNQDRIVE_DEPLOYED_GIT_SHA` mirror only — no redeploy, no PM2/nginx/migrations, no One Auto activation.

## Entrypoint

```bash
SYNQDRIVE_P4B16_RECONCILE_AUTHORIZED=1 \
  bash backend/scripts/ops/vps-reconcile-release-attestation.sh \
  --expected-sha <40-char-hex> \
  [--expected-stale-sha <40-char-hex>]
```

| Gate | Behavior |
|------|----------|
| `SYNQDRIVE_P4B16_RECONCILE_AUTHORIZED=1` | Required (exit **41** if missing) |
| `--expected-sha` | Required; must match `current` release git HEAD and live replicas |
| `--expected-stale-sha` | Optional pin for stale `DEPLOYED_SHA` / mirror (production forensics) |
| `deploy-ci-gate.mjs` | Mandatory PASS for exact `--expected-sha` (skip only via `VPS_P4B16_RECONCILE_SKIP_CI_GATE=1` in offline tests) |
| Attestation lock | Same canonical lock as deploy record path |
| Checksum | Existing state checksum must validate before reconcile |
| Runtime verify | `vps_replica_verify_attestation_reconcile` — health, scheduler leader, nginx dual upstream; **no** post-deploy uptime freshness |
| Deploy evidence | `last-deploy-state.env` `PREVIOUS_SHA` must match stale attestation SHA |
| Migrations | Optional comma list `VPS_P4B16_RECONCILE_REQUIRED_MIGRATIONS` when `DATABASE_URL` set |
| Mirror | Updates **`SYNQDRIVE_DEPLOYED_GIT_SHA` only**; all other `backend.env` keys byte-preserving |
| Generation | Exactly **one** increment via `vps_attest_next_generation` per successful reconcile |
| Evidence | `deploy-state/evidence/p4b16-stale-committed-reconcile-<ts>.env` |

## Crash safety (mirror → state)

Uses existing P4B16 crash hooks and atomic writers only:

1. **Mirror updated, state still stale:** Detected as mirror/state split; resume completes COMMITTED write with a single planned generation (no second mirror pass).
2. **Crash on `before_state_write`:** Re-run reconcile; same generation plan (still stale COMMITTED + mirror already at target).
3. **Mirror failure:** FAILED state write with incremented generation (same as deploy record path); no false COMMITTED.

Hooks: `VPS_ATTESTATION_CRASH_HOOK` (`before_mirror`, `after_mirror`, `before_state_write`) and mirror `after_MIRROR_RENAME`.

## One Auto isolation

Production may carry `ONEAUTO_ENABLED=true` in shared `backend.env`. Reconcile **does not** read or mutate One Auto callback/retrieval flags, budgets, or API keys. **One Auto activation policy is separate from P4B16 attestation** — attestation reconcile only aligns deploy SHA attestation with runtime.

## Validation

```bash
bash backend/scripts/ops/vps-reconcile-release-attestation.selftest.sh
bash backend/scripts/ops/vps-release-attestation.selftest.sh
bash backend/scripts/ops/vps-release-attestation-integration.selftest.sh
bash backend/scripts/ops/vps-release-attestation-exitcode.selftest.sh
```

## Related

- R1B deploy hook + exit **3** partial success: [`P4B16_R1B_DEPLOY_INTEGRATION.md`](P4B16_R1B_DEPLOY_INTEGRATION.md)
- Production runbook exit **3** reconciliation pointer: [`architecture/dsrg/PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md`](../dsrg/PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md)
