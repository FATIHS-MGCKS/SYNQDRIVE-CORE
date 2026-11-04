# P4B16 R1B — Deploy / rollback integration (repository)

**Status:** `IMPLEMENTED` · `OFFLINE_VALIDATED` · `NOT_DEPLOYED` · `NOT_ACTIVATED`  
**Baseline:** `main` @ `7266dbefc197e912947cd2aefe95941440161114` (R1A libs merged #1980)  
**Production:** no VPS mutations in R1B · no pin promotion · no enforcement changes

## Hooks

| Path | When | Action |
|------|------|--------|
| `vps-deploy-release.sh` | After `vps_replica_verify_post_deploy` **PASS** | Source `vps-release-attestation-integration.lib.sh` from **candidate** `RELEASE_OPS_DIR`; `vps_p4b16_publish_after_deploy_verify` (lock → record → release) |
| `vps_replica_rollback()` | After rollback `vps_replica_verify_post_deploy` **PASS** | `vps_p4b16_publish_after_rollback_verify` via **live** ops tree (`lib/vps-production-replica.lib.sh` dirname) |
| `vps_replica_rollback()` | Guard / eligibility **denied** | `vps_p4b16_on_rollback_denied` — verify + mirror alignment only; **no** new `DEPLOYED_SHA` |
| `vps-rollback-production-release.sh` | Manual | Delegates to `vps_replica_rollback` (same hooks) |

**Ordering:** Attestation never runs before replica verification. No extra PM2 restart. No new HTTP endpoint.

**Library availability:** Hooks load P4B16 libs from the target release ops directory (deploy) or current ops tree (rollback). Releases **without** `vps-release-attestation-integration.lib.sh` log a legacy-path warning and **do not** claim attestation protection. If the integration file is present but `vps-release-attestation.lib.sh` is missing, callers treat the outcome as **partial success (exit 3)** — not silent full success.

**Exit codes:** Callers capture attestation/rollback status with `set +e` / explicit `$?` (never inside `if ! cmd; then $?` — that records the `if` test status, not the command). Rollback exit **3** means replicas restored; attestation incomplete — not an unsafe physical rollback failure.

**Pinned executor:** `vps-deploy-release.sh` still runs from the pinned executor checkout; post-verify attestation uses libs shipped in the **cloned release** at `REQUESTED_SHA`, not the executor tree alone.

## Partial success (exit 3)

If replicas pass `vps_replica_verify_post_deploy` but durable attestation fails (lock, mirror, state write):

- Deploy script exits **`3`** with `PARTIAL_SUCCESS` messaging.
- Does **not** roll back a healthy promotion solely for attestation failure.
- Rollback path returns **`3`** similarly when replicas are restored but attestation persistence fails.

## Stale COMMITTED recovery (R1C)

When deploy exits **3** but replicas and `current` already match the requested SHA, use attestation-only reconcile (no redeploy):

- Script: `backend/scripts/ops/vps-reconcile-release-attestation.sh`
- Design/evidence: [`P4B16_R1C_STALE_COMMITTED_RECOVERY.md`](P4B16_R1C_STALE_COMMITTED_RECOVERY.md)
- Runtime verify: `vps_replica_verify_attestation_reconcile` (no uptime freshness gate)

## `vps_replica_verify_post_deploy` — identity guarantees (actual)

Implemented in `lib/vps-production-replica.lib.sh`. **Does not** assert per-process build SHA via a dedicated runtime-identity HTTP contract.

| Check | Guarantee |
|-------|-----------|
| `vps_replica_verify_no_mixed_sha` | `current` symlink git HEAD equals `target_sha`; each PM2 replica exists, port listens, health + readiness HTTP OK, uptime ≤ `SYNQDRIVE_MAX_UPTIME_AFTER_DEPLOY_SEC` (restart freshness heuristic) |
| Scheduler | Leader convergence script + expected leader count |
| Nginx (dual replica) | Config contains dual upstream 3001+3002 |
| Optional | `SYNQDRIVE_EXTERNAL_HEALTH_URL` curl |

Attestation **re-invokes** this verifier inside `vps_attest_record_deploy_success` / rollback record (second pass after deploy script’s first pass). Same guarantees; not independent per-process SHA attestation.

## Explicit non-scope (R1B)

- No automatic APDS / `APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA` update
- No pin promotion or app deployment from this change
- No EXP021 Gate-6 or RFRF state changes
- No VO5C security-floor rollback behavior changes
- Legacy deploy paths without P4B16 files: documented as **not attestation-protected**

## Validation

```bash
bash backend/scripts/ops/vps-release-attestation.selftest.sh
bash backend/scripts/ops/vps-reconcile-release-attestation.selftest.sh
bash backend/scripts/ops/vps-release-attestation-integration.selftest.sh
bash backend/scripts/ops/vps-release-attestation-exitcode.selftest.sh
bash architecture/dsrg/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
```
