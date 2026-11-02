# TDL End-Validation Observability PR1 — Retention, Ops Monitoring, Activation Safety

OPERATION=TDL_END_VALIDATION_OBSERVABILITY_PR1  
PRODUCTION_ACTIVATION=FORBIDDEN (retention + observability flags remain default OFF in this PR)  
MERGE=DRAFT_ONLY

## Scope

PR1 adds **bounded retention** for `trip_end_validation_decision_observations`, **purge-run audit**, **Prometheus ops counters**, **scheduler + leader + PostgreSQL advisory lock**, and **fail-closed activation gates** for PR0 writes. No changes to Trip FSM, CUSUM, ClickHouse assist, provider silence, retry budgets, DS4 admission, or customer trip visibility.

## Retention execution

| Item | Value |
|------|--------|
| Cutoff | `persistedAt < now - retentionDays` (default **90** days, min 90 / max 3650) |
| Selection order | `persistedAt ASC`, `id ASC` |
| Delete pattern | `findMany` (bounded `take`) → `deleteMany` by `id IN (...)` |
| Batch size | Env `TRIP_END_VALIDATION_OBSERVATION_RETENTION_BATCH_SIZE` (default 500, max 2000) |
| Max batches / run | Env `TRIP_END_VALIDATION_OBSERVATION_RETENTION_MAX_BATCHES` (default 200, cap 500) |
| Dry run | Env `TRIP_END_VALIDATION_OBSERVATION_RETENTION_DRY_RUN` (default **true**) |
| Worker enable | Env `TRIP_END_VALIDATION_OBSERVATION_RETENTION_ENABLED` (default **false**) |

### Index strategy

Existing PR0 index `trip_end_validation_decision_observations_persisted_at_idx` supports `WHERE persistedAt < cutoff` with ordered batch fetch. **No additional migration** required for PR1 delete path.

### Lock semantics

1. **Scheduler leader guard** — `SchedulerLeaderGuardService.shouldRun('trip_end_validation_observability_retention')` (PM2 replica `:3002` LEADER pattern).
2. **In-process guard** — single concurrent `runOnce` per Nest instance.
3. **PostgreSQL session advisory lock** — `pg_try_advisory_lock(hashtextextended('tdl:end_validation_obs:retention:global', 0))` inside a **single Prisma interactive transaction** (pinned connection; HV-R22 pattern).

Redis is **not** required for exclusivity.

## Purge audit

Table `trip_end_validation_observability_retention_purge_runs` (global, bounded columns, no tenant PII):

- `eligible_count`, `rows_deleted`, `batch_count`, `duration_ms`, `dry_run`, `status`, `cutoff_at`, `error_message`
- Statuses: `RUNNING`, `COMPLETED`, `FAILED`, `ABANDONED` (stale RUNNING reconciled after env threshold)
- Audit row retention: bounded delete of terminal rows older than `TRIP_END_VALIDATION_OBSERVATION_RETENTION_AUDIT_DAYS` (default 180), `auditTrimBatchSize` per purge run
- Indexes on `(status, completed_at)` and `started_at`

## Lock semantics (PR2310 safety fix)

- **Pinned connection:** `runWithTdlEndValidationObservationRetentionAdvisoryLock` uses Prisma **interactive `$transaction`** (HV-R22 pattern): acquire → all purge batches + audit writes → release on same session.
- Transaction timeout: `computeRetentionPurgeTransactionTimeoutMs(maxBatchesPerRun, batchSize)` capped at 900s.
- DB/transaction errors: fail-closed (`TRANSACTION_FAILED` skip + best-effort `FAILED` audit row outside rolled-back tx).

## Activation safety (fail-closed)

Observability **writes** require all of:

| Class | Checks |
|-------|--------|
| **Operator release** | `TRIP_END_VALIDATION_OBSERVABILITY_ENABLED=true`, non-empty vehicle allowlist, vehicle ∈ allowlist |
| **Manual attestation** | `ACTIVATION_ACK`, `ACK_BEST_EFFORT`, `RETENTION_READY_ACK` (manual only — **not** sufficient alone) |
| **Automatic** | PR0 table exists, PR1 purge audit table exists, retention config valid, ≥1 **completed** purge run (non-dry if retention dry-run disabled) |

Kill-switch: set `TRIP_END_VALIDATION_OBSERVABILITY_ENABLED=false` (writes skip immediately).

## Operations runbook (pre-activation)

1. Apply migrations: PR0 observations + PR1 purge audit (CI/local only until owner deploy).
2. Set retention env on **both** replicas identically; keep `RETENTION_ENABLED=false` until ready.
3. Enable retention worker (`RETENTION_ENABLED=true`), keep `RETENTION_DRY_RUN=true`.
4. Verify cron `45 4 * * *` on leader; confirm purge audit row + Prometheus `…retention_runs_total`.
5. Run one controlled non-dry purge in maintenance window; verify counts.
6. Complete manual owner attestations + pilot allowlist before observability flag.

## Rollback

- Disable `TRIP_END_VALIDATION_OBSERVATION_RETENTION_ENABLED` and `TRIP_END_VALIDATION_OBSERVABILITY_ENABLED`.
- PR1 migration is additive (audit table only); rollback deploy = prior release without scheduler module (observations retained).
- Backup retention policies remain independent of application purge.

## Test evidence

- Unit: config validation, cutoff math, leader skip
- Postgres integration: cutoff boundary, identical `persistedAt`, dry-run, batch cap, advisory lock contention, audit row
- Golden FSM parity + R11/R12 CI gates (unchanged FSM paths)
- Prometheus registry spec includes retention metrics (low cardinality)

## Datenschutz / backup

Application purge removes observability rows past retention; **DB backups** may retain deleted rows until backup rotation — document separately from primary retention.

**Related:** [TDL_END_VALIDATION_OBSERVABILITY_PR0_REPLAY_CONTRACT_V1.md](./TDL_END_VALIDATION_OBSERVABILITY_PR0_REPLAY_CONTRACT_V1.md)
