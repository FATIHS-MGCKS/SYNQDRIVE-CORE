# DS4 production/main reconciliation RC (2026-10-28)

**Mode:** staging branch only — no production deploy, migrate, or flag changes.

| Field | Value |
|-------|--------|
| Production base | `7c240fb9e3a28056c36e26f81a97a50f23e6738d` |
| Main merged | `eabc01005c6d6353bb2d3d3f563e926636d523d3` |
| Reconciled RC | `c931c0a34` (branch `cursor/ds4-prod-main-reconciliation-rc-192d`) |

## Reconciliation method

1. Branch from production SHA `7c240fb9`.
2. Merge `origin/main` @ `eabc01005` (contains #2212, #2215, #2218, #2221).
3. Resolve 3 conflicts (ChangesView, CHANGE_LEDGER, vehicle-intelligence.module) without dropping prod CI guards.

## Production parity (blob-identical prod → RC)

- `clickhouse-hf.service.ts`, `ds4-rpm-hf-v1a-trip-input.service.ts`
- VSI LV standby profile + consumer registry paths
- `vehicle-technical-spec-patch.util.ts`, `vehicles.service.ts`
- `vsi03-p2c-postgres-ci.sh`
- **#2216** vehicle-tech-spec PostgreSQL CI + guard scripts (prod-only vs main; preserved on RC)

## RC delta vs main (intentional prod-only additions)

- `backend/scripts/test/vehicle-tech-spec-patch-postgres-ci.sh`
- `backend/scripts/test/lib/vehicle-tech-spec-patch-postgres-guard.sh`
- `backend/scripts/test/vehicle-tech-spec-patch-postgres-guard.contract.sh`
- `.github/workflows/vehicle-detail-production-readiness.yml` (prod gate wiring)

## DS4 stack on RC

Full assessment L2 + fleet motion admission policy + exposure V2 + postgres CI (27 tests).

## Migrations (forward-only)

Apply order on empty DB (lexicographic):

1. `20261028120000_di_v0_ds4_assessment_l2_v1`
2. `20261028120000_vehicle_engine_displacement_cylinder_count`
3. `20261028143000_di_v0_ds4_assessment_fable_remediation_v1`
4. `20261028160000_di_v0_ds4_assessment_versioned_outbox_v1`

No `DROP TABLE` in DS4 trio; constraint/index adjustments only in remediation migration.

## Post-deploy flags (must remain OFF)

`DI_V0_DS4_ASSESSMENT_*`, `DI_V0_DS4_FLEET_MOTION_GLOBAL_ROLLOUT_AUTHORIZED`, ordinal policy default false, OLI null.

## Rollback

Code: redeploy `7c240fb9`. Schema: forward-only — DS4 tables may remain empty after rollback unless owner authorizes down migration.
