# FSD P5B — Source-link deactivation (implemented)

**Status:** synchronous lifecycle invalidation shipped behind dormant FSD execution flags.

**Production note:** Behavior described here reflects the **PR #2357 implementation** on the integration branch. Deployed production at `main` (pre-merge) does not include P5B audited ops, reactivation TOCTOU fences, or expanded FSD CI path filters until owner merge and VPS rollout.

## Behavior

- `invalidateExecutableFsdRunsForDimoSourceLinkInTransaction` runs inside the caller’s Prisma transaction (offboarding, audited ops script, future supersession writers).
- Uses the standard FSD source-link advisory lock (`fsd-discovery:{org}:{vehicle}:{linkId}`).
- Invalidates **both** FSD-3 and FSD-4 executable runs (`PENDING` / `IN_PROGRESS`, `invalidatedAt` null), clears leases, increments run version.
- Preserves stages, evidence, and request ledgers (no cascade delete).
- Offboarding: **vehicle `FOR NO KEY UPDATE` → per-link FSD invalidation (advisory lock + row work) → link `FOR NO KEY UPDATE` deactivation** in one transaction. Row locks use `FOR NO KEY UPDATE` so concurrent FSD run inserts can hold FK `KEY SHARE` without deadlocking.
- Audited DIMO source-link ops: **deactivation audit advisory lock → vehicle `FOR NO KEY UPDATE` → link `FOR NO KEY UPDATE` → FSD invalidation → link deactivate** (same row-lock semantics as offboarding).
- Reactivation (DIMO acquire path): **vehicle `FOR NO KEY UPDATE` → link `FOR NO KEY UPDATE` → policy re-check → link activate → FSD invalidation (REACTIVATED)** in one transaction.
- Post-commit DIMO HTTP may still complete; persistence remains fail-closed (`STALE_SOURCE_LINK`) and runs are not resumable as executable after invalidation.
- Token-only drift: unchanged — existing write/dispatch fences; see `P5B_TOKEN_IDENTITY_DRIFT_POLICY.md`.

## Ops / OOB

- Normal production: **no direct SQL** on `vehicle_data_source_links` for deactivation.
- Audited path: `backend/scripts/ops/fsd-lifecycle-deactivate-dimo-source-link.ts` (transactional deactivate + FSD invalidation).

### Operator attribution vs host trust

- **`--actor-user-id`** selects which SynqDrive user record is checked for `MASTER_ADMIN` platform role and written into audit metadata. It does **not** authenticate the SSH shell or database session that invoked the script.
- Production trust boundary for these ops is **host access** (authorized SSH principal + `DATABASE_URL` credentials on the VPS). Operator attribution is a separate, auditable platform identity choice after that boundary.
- **`--dry-run`:** validates required CLI arguments and `DATABASE_URL` presence, then prints a JSON execution plan and **exits without** Nest bootstrap, operator authorization, database queries, or mutations.

## CI governance (workflow paths)

PR #2357 extends `.github/workflows/fsd-p5a-ci.yml` path filters so FSD Postgres CI also runs when these change:

1. `backend/scripts/ops/fsd-lifecycle-deactivate-dimo-source-link.ts`
2. `architecture/fsd/P5B_*`
3. `backend/src/modules/vehicle-onboarding/services/vehicle-offboarding.service.ts`
4. `backend/src/modules/vehicle-onboarding/vehicle-onboarding.module.ts`

**Owner action required:** The repository `i18n-authority-protection` gate treats workflow file changes as governance authority changes. The trusted owner must apply the **`i18n-governance-authority-change`** label on PR #2357 before merge. Agents must not add this label or bypass the gate. Further commits after approval may require re-approval.

## Live activation

- FSD orchestration flags remain **default OFF**; live activation is a separate owner-authorized gate.
- Rollout: `P5B_DIRECT_PRODUCTION_ROLLOUT.md`.
