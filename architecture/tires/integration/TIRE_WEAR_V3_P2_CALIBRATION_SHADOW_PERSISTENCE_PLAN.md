# Tire Wear V3 — P2 Calibration Shadow persistence plan

Status: **design only** (writer remains OFF). Last updated: 2026-10-31.

## Verified root cause: zero rows in `tire_wear_v3_prior_shadow_v1`

| Factor | Evidence |
|--------|----------|
| Env default | `TIRE_WEAR_V3_PRIOR_SHADOW_WRITE_ENABLED` defaults **false** (`tire-wear-v3-prior-shadow.config.ts`) |
| Customer read path | `tire-health-v3-read.service.ts` calls `computeForSetup(..., { persistShadow: false })` |
| Lifecycle recompute | `tire-lifecycle.service.ts` uses `persistShadow: false` |
| No batch scheduler | No worker/cron inserts shadow rows independently of `computeForSetup` |
| Gating | `insertShadowRowIdempotent` runs only when `writeEnabled && persistShadow !== false && organizationId` |

Production count 0 is **expected** under current wiring, not a broken table.

## Existing schema (reuse)

Table: `tire_wear_v3_prior_shadow_v1`

- Tenant: `organization_id`, `vehicle_id`, `tire_setup_id`
- Model: `model_version`, `model_config_hash`, `input_fingerprint`
- Payload: `result_payload` (full `TireWearV3PriorSetupResult` JSON)
- Time: `computed_at`

Unique idempotency: `(tire_setup_id, model_version, input_fingerprint)` via repository lookup + create.

## Minimal activation plan (future PR, not P2)

1. **Writer enablement** — ops-only `TIRE_WEAR_V3_PRIOR_SHADOW_WRITE_ENABLED=true` on VPS after review; never tied to customer read flags.
2. **Trigger points** (additive):
   - After successful authoritative customer read compute: optional shadow write with **same** result (duplicate compute avoided by passing `persistShadow: true` only from a dedicated calibration job, not customer path).
   - Preferred: scheduled job enumerates active setups per org, calls `computeForSetup(id, { persistShadow: true })` with `writeEnabled=true` on worker only.
3. **Snapshot contents** (extend payload, no breaking change):
   - Per wheel: `estimatedTreadMm`, `remainingKm`, evidence level, rate interval, flags
   - DS4 exposure summary: `ds4SeverityCoverage`, `ds4SeveritySRel`, ledger km, row count
   - Identity: mount period id, wheel positions, tire ids when resolvable from setup
   - `computedAt` ISO (already present)
4. **Pairing for calibration** — match `vehicle_tire_tread_measurements.measured_at` to latest shadow row with same `tire_setup_id` and `computed_at < measured_at`; never backfill fake historical forecasts.
5. **Safety** — shadow writes must not alter customer path; idempotent; org-scoped queries only.

## P2 scope boundary

This operation **does not** enable the writer or change env defaults.
