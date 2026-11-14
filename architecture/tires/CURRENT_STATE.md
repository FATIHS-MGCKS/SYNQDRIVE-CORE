# Tires Health — Current State (bootstrap V0.1, 2026-10-24)

Registry coverage: `AUDIT_IN_PROGRESS`. Repository baseline `7a993eca6` (P3-PR6 main; P3-PR7 adds `core.tire.read.v1` only); Production baseline `c169ddfab` (`VERIFIED_READ_ONLY`, not re-verified this change). Three status axes are kept separate: registry coverage (this header), epistemic state (per statement below), decision/validation status (`decisions/DECISION_REGISTER.md`).

## 1. Ownership and boundaries

| Concern | Owner | Epistemic |
|---------|-------|-----------|
| Tire setups, lifecycle, mount periods, odometer anchor | **Tires Health** | CONFIRMED |
| Tread/pressure measurements, evidence provenance, ground truth | **Tires Health** | CONFIRMED |
| Tire Wear Model V2 (`tire-wear-v2`), snapshots, fingerprint dedupe, alerts | **Tires Health** | CONFIRMED |
| Tire Wear V3 customer read (`TireHealthV3ReadService`, cutover env defaults **OFF**) | **Tires Health** | CONFIRMED (code on `main`; production flag state **UNKNOWN**) |
| Tire Wear V3 P3A distance prior (`tire-wear-v3-prior-*`, β=0; shadow persist gated separately) | **Tires Health** | CONFIRMED (productive prior path wired; DS4 β=0) |
| Trip usage ledger + canonical-finalization attribution | **Tires Health** (hook lives in Trips coordinator) | CONFIRMED |
| REST `/vehicles/:vehicleId/tires/*` | **Tires Health** (controller shared in `vehicle-intelligence.controller.ts`) | CONFIRMED |
| Driving-Impact aggregates (`vehicle_driving_impact_current`, `trip_driving_impact`) | **Driving Intelligence** | CONFIRMED |
| DS4 Motion Engine, Event Detector, shadow worker, payload contract | **Driving Intelligence** | CONFIRMED |
| Tire rental-health policy, review overrides, hard block | **Rental Health** (consumes `TireHealthSummary`) | CONFIRMED |
| Frontend tire surfaces (rental insights, fleet condition, operator measure flow) | **Tires Health** UI; design authority Figma | CONFIRMED |

## 2. Production status (summary)

Production-active since July 2026 remediation. 6 vehicles / 6 active setups, hourly recalculation (2046 snapshots in 30 days), 1308 ledger rows all carrying a Driving-Impact summary, 7 open alerts, 5 tread measurements, 0 wear data points. Details: [`evidence/PRODUCTION_BASELINE.md`](evidence/PRODUCTION_BASELINE.md). Epistemic: CONFIRMED (read-only SQL, 2026-10-24).

## 3. Tire Wear Model V2 — exact current inputs (CONFIRMED, code `1c1e3bfa4`)

Composite wear rate (`tire-wear-model.service.ts`):

`baseWearMmPerKm × axleFactor × usageFactor × behaviorFactor × temperatureFactor × pressureFactor × loadFactor × seasonMismatchFactor × kFactor × regen × interactionPenalty`

| Factor | Source | Exact parameters (`tire-health.config.ts`) |
|--------|--------|--------------------------------------------|
| usageFactor | `vehicle_driving_impact_current.citySharePct / highwaySharePct / countryRoadSharePct` via `DrivingImpactService.getVehicleImpactForTire(vehicleId)` | `usageFactors` city 1.12 · highway 0.95 · countryRoad 1.03; clamp 0.93–1.15 |
| behaviorFactor | same row: `longitudinalStressScore`, `brakingStressScore`, `drivingStressScore` (0–100) | `behaviorFactorWeights` longitudinal 0.50 · braking 0.35 · drivingStress 0.15 → `behaviorScoreAnchors` 0→0.97, 20→1.00, 50→1.08, 75→1.20, 100→1.35; modulated by `spec.aggressiveDrivingSensitivity`; clamp 0.97–1.35 |
| temperatureFactor | 90-day `vehicleTrip.outsideTemperatureStartC` | `temperatureFactors` below0 1.03 · 0–5 1.02 · 5–28 1.00 · 28–35 1.03 · above35 1.06 |
| heat stress (inside interaction) | ambient + speed + pressure + **behaviorFactor** | `heatStress` weights 0.40/0.25/0.20/0.15, highSpeed ≥130 km/h bonus 0.04, factor 0.98–1.12 |
| pressureFactor | pressure context builder (canonical pressure signals) | `pressure` nominal 2.5 bar, underinflation 0.3/0.6 bar, factor 1.00–1.18 |
| axleFactor / loadFactor | drivetrain + steering axle bias | `drivetrainBias`, `steeringAxleBias`, `loadBiasDampingCoeff` 0.35 |
| baseWearMmPerKm | tire spec / season life tables | `*LifeKm` tables (e.g. WINTER 25–35k, ALL_SEASON 30–40k) |

Where `vehicle_driving_impact_current` is absent (`impact === null`), `computeUsageFactor` and `computeBehaviorFactor` both return the neutral value `1.0` (CONFIRMED, `tire-wear-model.service.ts`). This is the existing precedent for a **neutral** fallback that any DS4 shadow input must mirror.

Driving-Impact stress scores are **HF-derived** (hardAccel/hardBrake per 100 km from trip behaviour enrichment) — they are **not** DS4 motion events. The ledger copies `harshAccelCount/harshBrakeCount/harshCornerCount`, which are deprecated aliases of the same HF counts (`TIRE-CONTRA-HARSH-COUNTERS-DEPRECATED-ALIAS-001`).

## 4. Execution and safety mechanisms (CONFIRMED)

- Hourly `TireRecalculationScheduler` (leader-guarded) → BullMQ `dimo.tire.recalculation` → `TireRecalculationProcessor` → `TireHealthService`.
- Snapshot dedupe by recalculation fingerprint; model version stamped (`TIRE_WEAR_MODEL_VERSION = 'tire-wear-v2'`).
- Ledger idempotent via `sourceFingerprint`; trigger `canonical_finalization` from `TripAnalysisCoordinator` on terminal COMPLETED|SKIPPED; replay/backfill behind safety guards.
- Tenant scope: `VehicleOwnershipGuard` on controller; services vehicleId-scoped.
- Rental gate: `tire-rental-health.policy.ts` (`isTireRentalHardBlocked`) in Rental Health consumes `TireHealthSummary`.

## 5. DS4 Motion Engine — availability for tires (CONFIRMED, cross-module)

| Aspect | State |
|--------|-------|
| Where | EXP-021 motion-core **shadow** worker, post-trip retrospective; gzip payloads in `di_v0_motion_core_shadow_runs_v1` |
| Who | allowlisted org + vehicles only (Production: 4 of 6 vehicles) |
| What | `ACCELERATION` / `DECELERATION` events with `quality` OK/DEGRADED/LIMITED/ARTEFACT_SUSPECT and `flags` |
| Persisted fields | kind, startLabel, endLabel, startSpeedKmh, endSpeedKmh, deltaKmh, quality, flags — **no** meanAccelMps2 / durationS / peak |
| Speed basis | `speedAuthority` C4_ONLY or C5_1_PREFERRED (C5.1 admitted for explicit make/model only) |
| Read interface | `DiV0MotionCoreShadowTripMapReadService.readForTrip(organizationId, vehicleId, tripId)` — returns `runId`, `combinedInputIdentity`, `pinnedSnapshotHash`, `status` (`PENDING` \| `FAILED` \| `SUCCEEDED` \| `SUCCEEDED_EMPTY`), `newerFailedRunId` / `newerFailedRunStatus` (org-scoped) |
| Validation state | Fable review B1–B7; P1/P2 hardening merged (#2154); numeric intensities **not** physically validated (B3) |
| Tire consumer | **P2 implemented (EXPERIMENTAL, `TIRE_DS4_SHADOW_ENABLED=false` default):** queue `dimo.tire.ds4-shadow`, processor + catch-up scheduler, table `tire_ds4_motion_shadow_input_v1`; enqueue on ledger CREATED/UPDATED only; terminal markers block retry loops only (not later succeeded DS4 runs); contract [`integration/TIRE_DS4_SHADOW_DATA_CONTRACT.md`](integration/TIRE_DS4_SHADOW_DATA_CONTRACT.md) |

Full comparison and target architecture: [`integration/DS4_MOTION_INTEGRATION_AUDIT.md`](integration/DS4_MOTION_INTEGRATION_AUDIT.md).

## 6. Owner decisions recorded (all PROPOSED, 2026-10-24)

1. `TIRE-DEC-PRESERVE-EXISTING-STACK-001` — keep management, lifecycle, ledger, API, UI, safety.
2. `TIRE-DEC-V2-FROZEN-TO-BE-SUPERSEDED-001` — V2 obsolete as future basis, unchanged until controlled replacement.
3. `TIRE-DEC-DS4-FUTURE-LOAD-BASIS-SHADOW-ONLY-001` — DS4 is the future driving-load basis; shadow only; no new wear formula now.
4. `TIRE-DEC-DS4-CONSERVATIVE-ADMISSION-POLICY-001` — quality-gated admission (proposed, not implemented).
5. `TIRE-DEC-NO-DOUBLE-COUNTING-001` — one acceleration/braking source per factor.

## 7. Known gaps (canonical list in `contradictions/KNOWLEDGE_GAPS.md`)

Sparse ground truth; DS4 intensity fields not persisted; allowlist coverage; out-of-sample validity; B3 attenuation; mixed speed authority; no DS4 node in DI graph; setup-count reconciliation; SynqDrive Code views not updated (documentation-only constraint).
