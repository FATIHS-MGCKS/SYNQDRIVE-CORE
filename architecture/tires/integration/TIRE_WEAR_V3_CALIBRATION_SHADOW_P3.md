# Tire Wear V3 — Calibration Shadow P3 (implementation)

Status: **implemented, default OFF**. Last updated: 2026-11-01.

## Purpose

Prospective, immutable per-wheel V3 predictions in `tire_wear_v3_calibration_snapshot_v1` for later pairing with independent tread-depth measurements. Does **not** change customer Tire V3 reads or wear equations.

## Separation from P3A prior shadow

| Store | Table | Flag | Role |
|-------|-------|------|------|
| P3A prior shadow | `tire_wear_v3_prior_shadow_v1` | `TIRE_WEAR_V3_PRIOR_SHADOW_WRITE_ENABLED` | Full setup JSON fingerprint store |
| **P3 calibration shadow** | `tire_wear_v3_calibration_snapshot_v1` | `TIRE_WEAR_V3_CALIBRATION_SHADOW_WRITE_ENABLED` | Per-wheel calibration snapshots |

Reuse: **`TireWearV3PriorService.computeForSetup(..., { persistShadow: false })`** — no duplicate wear pipeline.

## Activation (ops-only, not enabled by this PR)

```bash
# After migration + deploy review:
TIRE_WEAR_V3_CALIBRATION_SHADOW_WRITE_ENABLED=true
# optional tuning:
# TIRE_WEAR_V3_CALIBRATION_SHADOW_BATCH_SIZE=25
# TIRE_WEAR_V3_CALIBRATION_SHADOW_INTERVAL_MS=900000
```

Scheduler job: `tire_wear_v3_calibration_shadow_writer` (singleton leader via `SchedulerLeaderGuardService`).

## Rollback

1. Set `TIRE_WEAR_V3_CALIBRATION_SHADOW_WRITE_ENABLED=false` (or unset).
2. Restart replicas — writer stops; customer path unchanged.
3. Table is additive; no rollback migration required for safety. Optional DBA purge of calibration rows is out of band.

## Master Admin inspection (read-only)

Global:

- `GET /api/v1/admin/master-intelligence/tire-wear-v3-calibration-shadow/summary`
- `GET /api/v1/admin/master-intelligence/tire-wear-v3-calibration-shadow/writer-health` — includes `telemetryScope: REPLICA_LOCAL` (last tick counters are per API replica, not fleet-global)

Scoped explorer (org → vehicle → setup → snapshot; bounded pagination):

- `GET .../organizations?limit=&offset=`
- `GET .../organizations/:orgId/vehicles?limit=&offset=`
- `GET .../organizations/:orgId/vehicles/:vehicleId/setups`
- `GET .../organizations/:orgId/vehicles/:vehicleId/setups/:tireSetupId/snapshots?wheelPosition=&mountPeriodId=&limit=&cursor=`
- `GET .../organizations/:orgId/vehicles/:vehicleId/setups/:tireSetupId/snapshots/:snapshotId`
- `GET .../organizations/:orgId/vehicles/:vehicleId/setups/:tireSetupId/quality` — sampled policy re-evaluation (`scope: SAMPLED_POLICY_REEVALUATION`), not global census

Legacy (deprecated):

- `GET .../organizations/:orgId/vehicles/:vehicleId/setups/:tireSetupId`

Master UI: Engineering → **Tire V3 Calibration Center** (`tire-v3-calibration-center` view). Read-only; does not enable writer or recompute V3.

Requires `MASTER_ADMIN` role. Every scoped route asserts org/vehicle/setup/snapshot identity chain.

## Idempotency

Unique `idempotency_key` = SHA-256 over org, setup, mount period, wheel, model version, **`calibrationEligibilityDigest`**, schema version. Row still stores canonical customer `input_fingerprint` from the compute result for audit.

## Snapshot cadence (calibration eligibility)

- Canonical customer `inputFingerprint` is **unchanged**.
- Calibration uses `computeTireWearV3CalibrationEligibilityDigest()` — prediction-relevant inputs only (setup, mount, ledger digest, in-period measurements, model/config); **excludes live `currentOdometerKm` telemetry churn**.
- Writer compares latest stored `calibration_eligibility_digest` per setup; **skips V3 compute and inserts** when unchanged (repeat scheduler ticks with stable inputs ⇒ zero new rows).
- **Odometer progression over time:** represented when the **trip usage ledger** changes (new trips / ledger content digest), not on incidental live odometer telemetry drift between ticks.
- New snapshots when ledger trips, measurements-in-period, setup/mount revision, or model config change.
- Idempotency key uses `calibrationEligibilityDigest` + wheel + mount + model version (not odometer-only drift).

## Immutability

- PostgreSQL trigger forbids UPDATE; DELETE requires session `synqdrive.calibration_snapshot_privileged_delete=1` (retention/maintenance only).

## Pairing

Policy module `tire-wear-v3-calibration-pairing.policy.ts` — prospective match only (`computed_at` / `prediction_created_at` strictly before measurement). No coefficient updates.

## Deferred

- Persisted pairing result rows / batch calibration jobs
- Independent measurement-pair store for accuracy MAE/bias (Calibration Center accuracy tab remains NOT_EVALUABLE until then)
