# VSI P1-C — Signal powertrain applicability (2026-10-30)

## Contract (verified)

| Axis | Semantics |
|------|-----------|
| `VsiEmpiricalObservationStatus.NOT_APPLICABLE` | Additive enum value — canonical signal is **not meaningful** for the vehicle’s declared `fuelType` (Vehicle Spec V3 / Prisma `FuelType`). |
| `NEVER_OBSERVED` | Signal **is applicable** but no valid empirical observation in the evaluated profile window. |
| `powertrainApplicability` on profile rows | `APPLICABLE` \| `NOT_APPLICABLE` \| `UNKNOWN` — `UNKNOWN` when `fuelType` is missing (fail-closed; do not infer N/A). |
| Registry | `iceOnly` / `evOnly` on canonical definitions drive applicability (same intent as P3a catalog axis). |

Hybrid / PHEV: HV-pack signals remain **applicable**; ICE-centric signals remain **applicable** — not collapsed to pure ICE or BEV.

`OTHER` fuel: ICE/HV gated signals → **UNKNOWN** (no unproven ICE default). Proven `OBSERVED`/`OBSERVED_STALE` rows are never downgraded to `NOT_APPLICABLE` when fuel metadata disagrees (`powertrainApplicability: UNKNOWN`).

## Root cause (FC-APPLICABILITY)

Profile evaluator materialized `iceOnly` / `evOnly` keys with default empirical `NEVER_OBSERVED` when extractors found no payload, without applying powertrain applicability. P0-a matrix flagged five rows as `MISLEADING_PRESENTATION` (`not_applicable_shown_as_never_observed`).

## Fix

- `vsi-signal-powertrain-applicability.util.ts` — shared resolver + `applyVsiProfileSignalPowertrainApplicability`.
- `evaluateVsiSignalProfile` — post-merge applicability pass using `input.fuelType` from materialization (`vehicle.fuelType`).
- Quality classifier branch for `NOT_APPLICABLE` empirical axis.
- Master read mapper exposes `powertrainApplicability`; RPM dual UI reads `NOT_APPLICABLE` from signal row.
- P0-a classifier treats materialized `NOT_APPLICABLE` as `EXPECTED_BEHAVIOR`.

No changes to cadence (PR #2263), provider fetch meta (PR #2265), polling, adapters, or DB schema.

## P0-a five-row differential (historical matrix unchanged)

| Vehicle | Signal | Before (snapshot) | After (expected profile) |
|---------|--------|-------------------|---------------------------|
| Tesla Model 3 | `engine_rpm` | N/A + `NEVER_OBSERVED` → MISLEADING | `NOT_APPLICABLE` → EXPECTED |
| Tesla Model 3 | `fuel_level_relative` | N/A + `NEVER_OBSERVED` → MISLEADING | `NOT_APPLICABLE` → EXPECTED |
| VW Tiguan | `hv_battery_soc` | N/A + `NEVER_OBSERVED` → MISLEADING | `NOT_APPLICABLE` → EXPECTED |
| Audi A4 | `hv_battery_soc` | N/A + `NEVER_OBSERVED` → MISLEADING | `NOT_APPLICABLE` → EXPECTED |
| VW Arteon | `hv_battery_soc` | N/A + `NEVER_OBSERVED` → MISLEADING | `NOT_APPLICABLE` → EXPECTED |

`SIGNAL_INTEGRITY_MATRIX_2026-10-30.json` is **not** overwritten.

## Verification

```bash
cd backend && npx jest --testPathPatterns='vsi-signal-powertrain-applicability|vsi-profile-evaluator.spec|vsi-signal-quality.classifier.spec|vsi-p0a-signal-integrity-audit.engine|vsi-profile-cadence-stats.util.spec|vsi-provider-last-successful-fetch-meta'
cd frontend && npm run i18n:check && npm test -- --testPathPattern='vsi-master-intelligence-ui|vsi-engine-rpm-dual-provenance'
```
