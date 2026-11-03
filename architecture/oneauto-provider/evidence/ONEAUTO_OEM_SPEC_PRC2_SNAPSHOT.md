# One Auto OEM specification PR-C2 — suggestion snapshot persistence + Master read API

| Field | Value |
|-------|--------|
| **Operation** | `ONEAUTO_OEM_SPEC_PRC2_IMPLEMENTATION` |
| **Depends on** | PR-C1 normalizer/comparison (merged #2317), PRA schema, PR-B Master OEM PATCH |
| **Feature flag** | `ONEAUTO_OEM_SUGGESTIONS_ENABLED=false` (default OFF) |

## Persistence model

- Table: `one_auto_oem_vin_lookup_eu_suggestion_snapshots`
- **One immutable row per successful `OE_VIN_LOOKUP_EU` job** (`provider_job_id` UNIQUE, FK cascade on job/org/vehicle delete)
- Stores PR-C1 `normalizedSnapshotJson` (includes `providerDataUpdatedAt`, `responseFetchedAt`, `snapshotCreatedAt` in JSON timestamps block)
- Denormalized columns: `response_fetched_at`, `snapshot_created_at`, optional `provider_data_updated_at`, `expires_at` (**copied from job — never extended**)
- `vin_sha256_prefix` for safe DTO display only — **not** used as sole identity gate

## Materialization contract

Triggered **after** provider job transitions to `SUCCEEDED` (same execution worker path; no repeat HTTP).

Gates (all required):

1. `ONEAUTO_OEM_SUGGESTIONS_ENABLED=true`
2. Job status `SUCCEEDED`
3. Job not expired (`expiresAt` present and in the future)
4. `serviceSku === OE_VIN_LOOKUP_EU`
5. Latest stored HTTP 200 response passes OpenAPI `SUCCESS_RESULT_ERROR` envelope + non-null `result` object
6. Full VIN binding: normalized job `vinSnapshot` === vehicle VIN === provider `vehicle_identification_number` when present
7. Org/vehicle binding: vehicle row exists for `(organizationId, vehicleId)`

Behavior:

- **Idempotent** create; existing row → `ALREADY_EXISTS`
- **Immutable**: differing normalized payload vs existing row → `IMMUTABLE_CONFLICT` (no silent overwrite)
- Errors **never** flip job to `FAILED` and **never** re-run provider execution
- Sanitized operational evidence via structured log event `ONEAUTO_OEM_SUGGESTION_MATERIALIZATION`
- **No Vehicle writes**

## Master read API

`GET /admin/organizations/:orgId/vehicles/:vehicleId/oem-specification-suggestions`

- `MASTER_ADMIN` + `OrgScopingGuard` + `MasterAdminMfaGuard`
- Step-up: `STEP_UP_ACTION.MASTER_ONEAUTO_PROVIDER_EXECUTE`
- Read-time `compareOemVinLookupEuSuggestions` against live Vehicle OEM columns + provenance confirmation status
- Excludes snapshots with `expiresAt <= now`
- Safe DTO only (no `vinSnapshot`, raw VIN, `responseBodyJson`, provider secrets)

## Retention cleanup

- Cron scheduler with `SchedulerLeaderGuardService` (`oneauto_oem_suggestion_snapshot_cleanup` registered in `SINGLETON_GLOBAL_SCHEDULER_NAMES`)
- Bounded batch delete (`ONEAUTO_OEM_SUGGESTIONS_CLEANUP_BATCH_SIZE`, default 100)
- Idempotent; no provider calls; no Vehicle mutation

## Bounded recovery (post-SUCCEEDED / crash window)

- `OneAutoOemVinLookupEuSuggestionRecoveryService.recoverMissingSnapshotsBatch()` — leader-guarded via same scheduler name
- Cron: every 10 minutes + before daily cleanup
- Discovers at most `ONEAUTO_OEM_SUGGESTIONS_RECOVERY_BATCH_SIZE` (default 25, cap 200) **SUCCEEDED** `OE_VIN_LOOKUP_EU` jobs with `expiresAt > now` and **no** snapshot row
- Each candidate calls `tryMaterializeFromSucceededJob` (persisted response only; no HTTP)
- In-process `running` guard prevents overlapping recovery batches on one replica

## Tests

- `oneauto-oem-vin-lookup-eu-suggestion.postgres.integration.spec.ts` (22 cases incl. recovery, `ONEAUTO_OEM_SUGGESTIONS_PG=1`)
- Wired into `backend/scripts/test/vehicle-tech-spec-patch-postgres-ci.sh` **before** OEM PATCH 6-pack so PR-C2 PG always executes on CI

## CI baseline note (OEM PATCH 6)

- `vehicle-oem-specification-patch.postgres.integration` concurrent OEM race test is **identical on `main`**; can flake when both updates serialize (both fulfill). Not introduced by PR-C2. Track separately if Vehicle Detail CI fails after OneAuto block passes.

## Code map

| Area | Path |
|------|------|
| Materialization | `oneauto-oem-vin-lookup-eu-suggestion-materialization.service.ts` |
| Read | `oneauto-oem-vin-lookup-eu-suggestion-read.service.ts` |
| Controller | `oneauto-oem-vin-lookup-eu-suggestion.controller.ts` |
| Hook | `oneauto-provider-execution.service.ts` post-`SUCCEEDED` |
| Cleanup | `oneauto-oem-vin-lookup-eu-suggestion-cleanup.*` |

Cross-ref: [ONEAUTO_OEM_SPEC_PRC1_NORMALIZER.md](./ONEAUTO_OEM_SPEC_PRC1_NORMALIZER.md)
