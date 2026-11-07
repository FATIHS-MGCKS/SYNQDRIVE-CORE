# FSD P5B — Source-link deactivation (implemented)

**Status:** synchronous lifecycle invalidation shipped behind dormant FSD execution flags.

## Behavior

- `invalidateExecutableFsdRunsForDimoSourceLinkInTransaction` runs inside the caller’s Prisma transaction (offboarding, audited ops script, future supersession writers).
- Uses the standard FSD source-link advisory lock (`fsd-discovery:{org}:{vehicle}:{linkId}`).
- Invalidates **both** FSD-3 and FSD-4 executable runs (`PENDING` / `IN_PROGRESS`, `invalidatedAt` null), clears leases, increments run version.
- Preserves stages, evidence, and request ledgers (no cascade delete).
- Offboarding: **vehicle `FOR UPDATE` → sorted per-link FSD invalidation → link deactivation** in one transaction.
- Post-commit DIMO HTTP may still complete; persistence remains fail-closed (`STALE_SOURCE_LINK`) and runs are not resumable as executable after invalidation.
- Token-only drift: unchanged — existing write/dispatch fences; see `P5B_TOKEN_IDENTITY_DRIFT_POLICY.md`.

## Ops / OOB

- Normal production: **no direct SQL** on `vehicle_data_source_links` for deactivation.
- Audited path: `backend/scripts/ops/fsd-lifecycle-deactivate-dimo-source-link.ts` (transactional deactivate + FSD invalidation).

### Operator attribution vs host trust

- **`--actor-user-id`** selects which SynqDrive user record is checked for `MASTER_ADMIN` platform role and written into audit metadata. It does **not** authenticate the SSH shell or database session that invoked the script.
- Production trust boundary for these ops is **host access** (authorized SSH principal + `DATABASE_URL` credentials on the VPS). Operator attribution is a separate, auditable platform identity choice after that boundary.
- Dry-run performs authorization lookup only and performs no mutations.

## Live activation

- FSD orchestration flags remain **default OFF**; live activation is a separate owner-authorized gate.
- Rollout: `P5B_DIRECT_PRODUCTION_ROLLOUT.md`.
