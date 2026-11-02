# Driving Intelligence — Current State

**Reconstruction maturity:** SUBSTANTIAL (code + audits; first live multi-cadence calibration executed — cadence conclusion open)  
**Audited code baseline:** workspace `main` at authority bootstrap (2026-09-06)

## Executive summary

SynqDrive Driving Intelligence today is a **dual-path post-trip enrichment system** anchored on **DIMO Segment-backed `VehicleTrip` rows**. Production scoring uses **Driving Impact Engine V1** (`drivingStressScore` = vehicle operational load 0–100). A **V2 durable pipeline** exists behind `DRIVING_INTELLIGENCE_V2_ENABLED` (code default **false**; **Production sets `true`** — read-only env check EXP-021 C1D.10 / C1D.10A, 2026-09-27; 778 V2 `NATIVE_EVENTS` stages COMPLETED in 60 days). **Reference Capture** provides an isolated HF recovery / block-polling laboratory.

**ARCHITECTURE IMPLEMENTED ≠ HF SCALABILITY HYPOTHESIS VALIDATED.**

### Production deployment semantics (post PR #1533, 2026-09-05)

| Term | Value |
|------|-------|
| **CODE_DEPLOYED** | **YES** — HF Recovery policy + C.1a–e on `main` / production binary |
| **REFERENCE_CAPTURE_INFRASTRUCTURE** | **ENABLED** on production (`REFERENCE_CAPTURE_ENABLED=true` post 3A.2) |
| **REFERENCE_CAPTURE_SETTLEMENT_SHADOW** | **ENABLED** on production post EXP-021D (`REFERENCE_CAPTURE_SETTLEMENT_SHADOW_ENABLED=true`, 2026-09-07) — forensic experiment channel only; no auto-start |
| **HF_RECOVERY_V2_FEATURE_ENABLED** | **NO** — `HF_RECOVERY_POLICY_V2_ENABLED=false` |
| **LIVE_CANARY_EXECUTED** | **NO** — empty canary allowlist; zero active calibration sessions (post GATE 2 baseline restored) |
| **DI-DEF-019** | **FIXED_PRODUCTION_VALIDATED** — GATE 1 PG integration + GATE 2 stationary dress rehearsal (2026-09-06) |
| **LIVE_MULTI_CADENCE_CALIBRATION** | **EXP-019 + EXP-020 (2026-09-07)** — video GT + bias-control; **window geometry matrix**: W060–W300 identical union; P50 first-obs ~27s; post-trip P1 optimal; **NO cadence winner** |
| **HF_30S_BLOCK_POLLING_VALIDATED** | **NO** |
| **Production HF authority** | **LEGACY** — whole-trip `fetchHighFrequency`; Recovery V2 **not active** |

Do **not** say "HF Recovery V2 not deployed" — say **code deployed, feature disabled**. Detail: `evidence/production/DEPLOYMENT_STATE.md`.

**Cross-authority handoff (TDL-OQ-001, 2026-09-25):** Trip Detection invokes `TripPostFinalizeAnalysisProducer` after persisted `COMPLETED`; DI owns `initializeForCompletedTrip`, durable runs/jobs, BullMQ `driving.intelligence.jobs`, and `DrivingAnalysisReconciliationService` recovery. Evidence: [TDL_OQ_001_COMPLETED_TO_DI_HANDOFF_AUDIT_2026-09-25.md](../trip-detection-lifecycle/evidence/TDL_OQ_001_COMPLETED_TO_DI_HANDOFF_AUDIT_2026-09-25.md) (TDL-EVID-OQ001-HANDOFF-001). Verdict: **`RESOLVED_WITH_BOUNDED_GAPS`** (not DB⊕queue atomic).

### DI V0 shadow pure core (EXP-021 C1D.5 S0/S1 — 2026-09-26)

| Item | State |
|------|-------|
| **Path** | `backend/src/modules/vehicle-intelligence/driving-intelligence/core/` |
| **Runtime caller** | **None** — library only; not registered in Nest workers |
| **Contract** | `DI_SOURCE_QUALITY_CONTRACT_V0_1` + `DI_KINEMATIC_ESTIMATE_V0_1`; calibration `CALIBRATION_UNSET_V0` (injected bundle) |
| **L3** | Centred-path haversine mean × 3.6; support labels **calendar** t−1 s, t, t+1; all FRESH; no hold/release/gap |
| **Invariant** | Driving Intelligence derives claims only from evidence whose availability, temporal semantics, source family and provenance are explicit; unsupported point values are withheld |
| **Shadow persistence (S2)** | `di_v0_shadow_runs` + `di_v0_shadow_intervals` — **library + Prisma only**; tenant identity verified at write boundary; DB CHECK constraints; tx-scoped persistence; completion counts derived from stored intervals; no runtime caller; not customer-facing. **Production schema PRESENT (corrected C1D.10A):** migration `20260926193000_di_v0_shadow_persistence` applied 2026-09-26 23:46:11 UTC by the ordinary deploy of release `20260926234014_v4994` (`1b5a7f6c`, PR #1801 — `vps-deploy-release.sh` always runs `prisma:migrate:deploy`); **0 runs / 0 intervals, 0 inserts ever** (`pg_stat_user_tables`). Schema present ≠ S4 runtime active ≠ shadow runs executed ≠ customer-visible use — DI V0 stays **dormant**. Evidence: [EXP021_C1D10A_AUTHORITY_CORRECTION.md](evidence/EXP021_C1D10A_AUTHORITY_CORRECTION.md); contradiction DI-CONTRA-S2-PROD-MIGRATION-001 (RESOLVED) |
| **Position acquisition (S3A)** | `driving-intelligence/position-acquisition/` — **dormant library only** (C1D.7, **PR #1800 merged**): DIMO `signals(interval:"1s")` `currentLocationCoordinates(agg: AVG)` via shared auth + telemetry transport adapter (not Nest-registered); strict `[from, to)` 1 s grid; PRESENT / SIGNAL_NULL / ROW_ABSENT kept distinct; BUCKET_BOUNDED only; coordinate validation (0,0 valid); duplicate fail-safe; source family via canonical `telemetry-source-family.ts` (never `hardwareType`); SHA-256 **DI_NORMALIZED_INPUT_IDENTITY** → S2 `inputEvidenceVersion` (not a raw provider archive); typed redacted failures, no self-retry; **no runtime caller**, **no DB write**, **no customer effect**. C1G: **DI-GAP-S3A-AGG-001 PARTIALLY_CLOSED** — 26,629/26,629 buckets AVG=FIRST=LAST coordinates (0 m); RUPTELA_R1 multi-vehicle; API_SYNTHETIC n=1; AVG unchanged. **Provider historical mutability observed** (C0 re-query: HDOP/altitude changed); **live re-query ≠ replay** — reproducible DI requires pinned normalized snapshot. Future S4 caller must pass org/vehicle/token from one validated vehicle context. Evidence: [EXP021_C1D7_S3A_INPUT_NORMALIZATION_REPORT.md](evidence/EXP021_C1D7_S3A_INPUT_NORMALIZATION_REPORT.md) |
| **R1 OBD → DS4 speed boundary (2026-10-23, draft)** | `di-v0-r1-vehicle-speed-ds4-boundary.ts` — pinned R1 **vehicle speed** remains in evidence and comparison surfaces but is **stripped before** L3 interval compute, speed-QC verdict, and motion-core-shadow FSM sparse input; other OBD fields unchanged. Independent of open PR #2134. Evidence: `research/driving-intelligence/evaluations/ds4-speed-video-reference-20261023/REPORT_PROD_OBD_STRIP.md` |
| **R1 OBD evidence (S3B-A)** | `driving-intelligence/r1-obd-acquisition/` — **dormant library only** (C1D.8, hardened C1D.8B, merged PR #1805; field authority corrected C1D.9A): DIMO HF OBD subset over 1 s grid, query **`DI_V0_R1_OBD_QUERY_V0_3`** — exactly 5 fields, all `agg: AVG`, all **PROVIDER_SCHEMA_VERIFIED** (C1D.9: DIMO telemetry GraphQL introspection + DIMO VSS 4.2 spec + read-only R1 responses): speed km/h, rpm, throttle percent 0..100, engine load percent 0..100, ECT °C (no rescaling, no range thresholds). **`powertrainTransmissionCurrentGear` removed** (signed int8 index — AVG synthesizes non-existent / false-Neutral gears; 0/4 R1 devices expose it) and **`isIgnitionOn` excluded** (boolean exposed as Float). Five-field activation allowlist is architectural authority for future S4 (activates nothing). Provider field authority does **not** upgrade time authority: **INTERVAL_ONLY**; per-signal VALUE_PRESENT / SIGNAL_NULL / ROW_ABSENT / **CONFLICTING_DUPLICATE** (duplicate labels merged per signal — agreement collapses, disagreement withheld with distinct values preserved; no first-row-wins, no averaging); **RUPTELA_R1 only**; no fixed time correction; cannot override S3A→S1 L3 (FULL-R1-002 golden-bound HOLD / RELEASE / post-release tests); SHA-256 R1 snapshot **V0_3** (adapter V0_3; V0_2 identifiers superseded, never aliased). **No runtime caller / DB write.** Evidence: [EXP021_C1D8_S3B_R1_OBD_NATIVE_EVENT_ADAPTERS.md](evidence/EXP021_C1D8_S3B_R1_OBD_NATIVE_EVENT_ADAPTERS.md), [EXP021_C1D8B_S3B_CONTRACT_HARDENING.md](evidence/EXP021_C1D8B_S3B_CONTRACT_HARDENING.md), [EXP021_C1D9_R1_FIELD_AUTHORITY_V03_CORRECTION.md](evidence/EXP021_C1D9_R1_FIELD_AUTHORITY_V03_CORRECTION.md). Gap: DI-GAP-S3B-R1-FIELD-AUTHORITY-001 **PARTIALLY_CLOSED** (residual: gear) |
| **Native event evidence (S3B-B)** | `driving-intelligence/native-event-evidence/` — **dormant library only** (C1D.8, hardened C1D.8B): normalizes `DrivingEvent`-shaped records; **NATIVE_EVENT_OBSERVATION**; calibration fixed **UNCALIBRATED** max claim **L1** — **not caller-suppliable** (no trusted-authority object exists); expected context (org / vehicle / trip / window / family / provider) passed separately and enforced per record → **CONTEXT_MISMATCH** (L0, audited in snapshot; null org/trip/provider = unprovable); eventId dedup → identical collapse / **CONFLICTING_DUPLICATE** (L0, preserved); source envelope → **NO_EVENT** only for a successful empty read, **EVENT_SOURCE_FAILURE** otherwise (`readDiV0NativeEventSource` = future S4 boundary); unknown types → **UNKNOWN_NATIVE_EVENT**; native-event fusion remains **NEEDS_VALIDATION**. Combined input identity **V0_2** pins all three channels with explicit state (PRESENT / NO_EVENT / SOURCE_FAILURE / NOT_AVAILABLE). **No runtime caller / DB write.** |
| **S4 research road-matching V2 worker (PR C)** | `driving-intelligence/s4-research-worker/` — **dormant async research path** (2026-10-17, EXP-021 PR C, stacked on PR B #2065): P2-style **intent-keyed outbox** (`outbox_id`, `research_intent_key`) + scheduler (`di_v0_s4_research_outbox_v1`, `di_v0_s4_research_runs_v1`, optional `di_v0_s4_research_osm_cache_v1`) discovers **COMPLETED PRIMARY** S4 shadow work items with pinned snapshot; reuses **S4D verified snapshot** (positions incl. ROW_ABSENT/SIGNAL_NULL; shadow L3 read-only); runs **V2-only** `runRoadMatchingPipeline` when OSM context resolves; otherwise **`ROAD_CONTEXT_UNAVAILABLE`** neutral status. Control plane flags default **OFF** (`DI_V0_S4_RESEARCH_*`, worker, road-matching V2); research allowlists ⊆ effective S4 permission. **Research failures never set S4 FAILED or roll back COMPLETED.** Idempotency key: org/trip/work-item/bundle/snapshot/OSM context. Default OSM provider = null (no uncontrolled Overpass). `DiV0S4ResearchModule` registered under `VehicleIntelligenceModule`; scheduler `di_v0_s4_research_v2`. Validation: `npm run test:di:s4-research-worker` (+ postgres matrix when `DI_V0_S4A_POSTGRES_INTEGRATION=1`). **No L3/S1/QC/FSM/customer-read changes.** |
| **S4 research road-matching pure library (PR B)** | `driving-intelligence/s4-research/` — **pure library only** (2026-10-17, EXP-021 S4 research extension PR B): deterministic OSM graph parse with **local equirectangular point–segment distance** (`S4_RESEARCH_LOCAL_EQUIRECTANGULAR_V2`; legacy mismatched projection preserved under `legacy/` + `LDI10D_LEGACY_GEOMETRY_V1_REPLAY_PINS.json`); per-bucket **baseline** (`S4_RESEARCH_BASELINE_BUCKET_V2`) and **forward Viterbi** (`S4_RESEARCH_VITERBI_FORWARD_V2`) hypotheses emitted **separately**; typed inputs (ordered GPS buckets + QC/L3/S1 hooks, versioned OSM ways/topology, algorithm config); outputs per window include GPS evidence state, candidate way IDs, distance/heading/topology evidence, ambiguity reasons, graph-transition conflicts, evidence class, and **`independentRoadIdAccuracy: NOT_ASSESSABLE`**. **`ASSOCIATED` = algorithmic association only** (not independent ground-truth confirmation). F4-B promotion audit helpers preserve **STILL_AMBIGUOUS** / impossible-graph cases — no auto-promotion to confirmed roads. Tesla/OSM frozen fixtures live under `architecture/drivingintelligence/evidence/ldi-10d/` (tests/harness only). **No Nest wiring, scheduler, Prisma, DIMO/OSM network, S4A–S4F flow change, or feature activation.** Validation: `npm run test:di:s4-research` (backend). Source lineage audited against research branch PR #2051 @ `6311d8c375dc5652bd64212ca4ed208175dc8148` (reimplemented extract, not ops-script cherry-pick). |
| **Next slice** | **S4 shadow runtime orchestration** — worker/caller wiring to pin position + R1 OBD + native snapshots into combined `inputEvidenceVersion` V0_2 (must supply native expected context + source envelope) — **not started, not authorized**. Gates after C1D.9A: design READY; position-only runtime READY; R1 five-field runtime READY_FOR_SHADOW_ORCHESTRATION_DESIGN (not Production/customer activation); native STRUCTURALLY_READY_UNCALIBRATED. **C1D.10A (2026-09-27): S4A contract FROZEN (design only)** — [design/s4a/S4A_CONTRACT_DESIGN.md](design/s4a/S4A_CONTRACT_DESIGN.md), machine contract `design/s4a/s4a-contract.v1.json` (`scripts/validate-s4a-contract.sh`). **AMENDED BY C1D.10C (2026-09-27):** current machine contract is **`design/s4a/s4a-contract.v2.json` (`DI_V0_S4A_CONTRACT_V2`)**; v1 kept as history and rejected by the v2 validator. C1D.10C closes C1D.10B P1-A..P1-D: S2 execution identity `DI_V0_S4_EXECUTION_IDENTITY_V1` (all execution-defining fields → S2 `inputEvidenceVersion`, collision with different identity fails closed); tenancy authority **TRIP_VEHICLE_ORGANIZATION** (`vehicle_trips` → `vehicles.organization_id`; `vehicle_trips.organization_id` does not exist); control plane [design/s4a/S4A_CONTROL_PLANE.md](design/s4a/S4A_CONTROL_PLANE.md) (6 flags default OFF, EMPTY=NONE intersected allowlists, DB kill row missing=KILLED, pipeline registry + retirement); 13-transition state machine with DB-clock lease expiry on every holder write; red-team validator 47 negative / 21 positive cases, 0 false accepts / 0 false rejects. Evidence: [EXP021_C1D10C_AUTHORITY_CLOSURE.md](evidence/EXP021_C1D10C_AUTHORITY_CLOSURE.md). S4A implementation **not authorized** (separate slice); tiny activation blocked (deserializer, provider backpressure gaps OPEN). Native channel **fails closed** (no readiness authority → `NOT_READY`, never `NO_EVENT`; DI-GAP-S4-NATIVE-READINESS-001); PRIMARY after 24 h boundary quiet period + 10-day drift horizon; replay only from pinned normalized snapshots; combined input identity V0_3 (design). **AMENDED BY S4A (2026-09-28, PR #1816 merged `2c321823a`):** dormant execution foundation on `main` from contract v2 — migration `20260927200000_di_v0_s4a_dormant_foundation` + library `driving-intelligence/s4a-foundation/` (**0 runtime call sites**). 175/175 S4A tests incl. 51 real-Postgres race/kill tests. Evidence: [EXP021_S4A_DORMANT_FOUNDATION_IMPLEMENTATION.md](evidence/EXP021_S4A_DORMANT_FOUNDATION_IMPLEMENTATION.md); decision DI-DEC-V0-S4A-IMPL-001 (PROPOSED). **Deploy gate (2026-09-28):** `S4A_DORMANT_MIGRATION_DEPLOY_GATE=READY_FOR_SEPARATE_OPERATOR_DEPLOY_DECISION` (not deploy-now) — Postgres CI wired [EXP021_S4A_POSTGRES_CI_WIRING.md](evidence/EXP021_S4A_POSTGRES_CI_WIRING.md); prior `DO_NOT_DEPLOY` superseded [EXP021_S4A_POST_MERGE_DEPLOY_GATE.md](evidence/EXP021_S4A_POST_MERGE_DEPLOY_GATE.md). **Next slice:** S4B-1 **discovery + claim orchestration** implemented dormant (`s4b-orchestration/`, `DiV0S4bOrchestrationModule` **not** AppModule-registered; evidence [EXP021_S4B_ENGINEERING_START.md](evidence/EXP021_S4B_ENGINEERING_START.md)); S4C provider acquisition + S4D/E/F **not authorized**; Production S4 execution **not authorized** |

## System boundary (confirmed)

| Inside DI | Outside DI (interface only) |
|-----------|----------------------------|
| Post-trip HF fetch + detectors | Trip FSM / `TripDetectionOrchestrationService` |
| **`DrivingAnalysisInitService` + `driving.intelligence.jobs`** | **`TripDecisionEngine.finalizeTrip()` COMPLETED commit** (TDL owns) |
| `TripBehaviorEvent`, `DrivingEvent` | DIMO segment canonical boundaries |
| `TripDrivingImpact`, load components | Energy Event Detection (REFUEL) |
| V2 stage orchestrator + jobs | Tankstellenerkennung |
| Rental driving analysis | Mapbox route matching (route artifact consumer) |
| Reference capture HF testbed | Raw DIMO auth/token layer |

### RPM HF V1A/V1B and RPM Reference Intelligence (2026-10-30)

| Item | State |
|------|--------|
| **RPM HF V1A trip input** | **IMPLEMENTED** — `rpm-hf-v1a/`; trip-scoped HF `engine_rpm`; no vehicle `idleRpm`/`maxRpm` in admission path |
| **RPM HF V1B shadow** | **IMPLEMENTED** (flag-gated) — temporal engine, outbox/runs, tier-aware processor, Phase 4I `admission.qualityExposure`; control plane `DS4_RPM_HF_V1B_*` |
| **VSI tier evidence** | **IMPLEMENTED** — VSI owns cadence tier classification; V1B consumes snapshot only (no synthetic tiers) |
| **Vehicle spec idle/max** | **IMPLEMENTED** — `vehicles.idle_rpm` / `max_rpm` + provenance; **not** wired into V1B admission today |
| **RPM Reference Intelligence** | **IMPLEMENTED (Phase 5A library + Phase 5B V1B attach)** — `rpm-reference-intelligence-v1/`; optional `rpmReferenceIntelligenceV1` on V1B `summary_json` when `DS4_RPM_REF_INTEL_V1_V1B_ATTACH_ENABLED=true` (default OFF); **no** DS4 consumer; ADR [`design/RPM_REFERENCE_INTELLIGENCE_AND_DI_OWNERSHIP_BOUNDARIES_ADR_2026-10-30.md`](design/RPM_REFERENCE_INTELLIGENCE_AND_DI_OWNERSHIP_BOUNDARIES_ADR_2026-10-30.md) (`DI-DEC-RPM-REF-INTEL-001`) |
| **DS4 consumes RPM reference metrics** | **NOT YET IMPLEMENTED** — future versioned optional interface only |

## Production path today (CONFIRMED)

### 1. Trip completion trigger

```
DIMO segments + Trip FSM
  → VehicleTrip status COMPLETED (persisted)
  → TripEnrichmentOrchestratorService (legacy, always)
  → TripPostFinalizeAnalysisProducer (V2 when master flag on)
```

Sources: `trip-enrichment-orchestrator.service.ts`, `trip-post-finalize-analysis.producer.ts`

### 2. Legacy behavior enrichment (always active)

| Step | Component | Detail |
|------|-----------|--------|
| Queue | `trip.behavior.enrichment` | BullMQ |
| Worker | `trip-behavior-enrichment.processor.ts` | |
| HF fetch | `DimoSegmentsService.fetchHighFrequency()` | DIMO `signals(interval:"1s")` over trip window |
| Preprocess | `hf-preprocessing.ts` | Gap split, clean points |
| Detectors | `hf-acceleration.ts`, `hf-braking.ts`, `hf-abuse.ts` | Point-pair kinematics |
| Native events | `lte-r1-behavior-enrichment.service.ts` | DIMO behavior events for LTE_R1 |
| Persist | `TripBehaviorEvent`, `VehicleTrip` counters | `harshBrakeCount`, `kickdownCount`, etc. |
| Optional mirror | `hf-mirror.service.ts` | ClickHouse when `HF_MIRROR_ENABLED` |

**Skip reasons:** `CAPABILITY`, `INSUFFICIENT_POINTS` (<10 raw / <5 clean), `NO_HF_DATA`

### 3. Legacy impact compute (always active after enrichment)

| Step | Component | Detail |
|------|-----------|--------|
| Queue | `trip.driving-impact.compute` | Also V2 job type `DRIVING_IMPACT_COMPUTE` |
| Service | `DrivingImpactService.computeForTrip()` | Model version `v1.2.0` |
| Scorer | `driving-impact-scorer.ts` | Longitudinal, braking, stop-go, high-speed, thermal, composite |
| Load components | `driving-impact-load-components.ts` | `tireLoad`, `brakingLoad`, etc. — **proxies** |
| Persist | `TripDrivingImpact`, `VehicleDrivingImpactCurrent` | 30-day rolling window |

### 4. V2 pipeline (flag-gated, code default OFF — Production ON)

| Flag | Default |
|------|---------|
| `DRIVING_INTELLIGENCE_V2_ENABLED` | `false` (code default, `driving-intelligence-v2.config.ts`); **Production env: `true`** (C1D.10A read-only) |
| `DRIVING_V2_DIMO_SEGMENT_VALIDATION_ENABLED` | `false` |
| `DRIVING_V2_ENGINE_DETECTOR_SHADOW_ENABLED` | `true` (requires master) |
| `DRIVING_V2_HF_DETECTOR_SHADOW_ENABLED` | `true` (requires master) |

When enabled: `DrivingAnalysisInitService` creates `DrivingAnalysisRun` + stages, enqueues `driving.intelligence.jobs`. Stage DAG documented in `KNOWLEDGE_GRAPH.md`. Reconciliation scheduler runs every 10 minutes (leader-gated).

## Signal cadence reality (CONFIRMED from reference drives)

| Concept | Value | Notes |
|---------|-------|-------|
| DIMO query aggregation | `interval:"1s"` | Requested, not observed 1 Hz |
| Observed HF bucket spacing (RD003) | **~2.00s** median new physical samples | `1s ≠ 1Hz`; RD003 signal quality |
| Observed HF bucket spacing (RD002 sealed) | **P50 13.489s** (P95 84.024s; MAX 249.647s) | Sealed 71-row HF_HISTORICAL export — **not** ~2s |
| RD004 sealed median spacing | **~10.6s** | Capture/watermark gaps, not physics |
| Active-trip live poll | ~30s | `ACTIVE_TICK` |
| Reference capture runner | 5s default | `REFERENCE_CAPTURE_CYCLE_INTERVAL_MS` |
| V2 block poll (testbed) | 30s provisional | `HF_HISTORICAL_POLL_INTERVAL_MS` — **NOT VALIDATED** |

Production detectors still assume ~1 Hz in comments (`hf-window-producer.ts`). **Known semantic debt** — not fixed in production path.

## Driving events (CONFIRMED types)

### HF-derived (`TripBehaviorEvent` / abuse)

From `hf-abuse.ts`: `COLD_ENGINE_HIGH_RPM`, `COLD_ENGINE_FULL_THROTTLE`, `ENGINE_SHUTDOWN_WHILE_DRIVING`, `ENGINE_REV_IN_IDLE`, `HIGH_RPM_CONSTANT`, `KICKDOWN`, `LAUNCH_LIKE_START`, `OVERHEATING_ENGINE`, `LONG_IDLE`, `POSSIBLE_IMPACT`, `FULL_BRAKING`

From `hf-acceleration.ts` / `hf-braking.ts`: hard/extreme acceleration and braking classifications

### Native (`DrivingEvent`)

DIMO LTE_R1 `behavior.*` events via `dimo-native-driving-events/`; dedup `(organizationId, providerFingerprint)`

**LTE_R1 authority split (CONFIRMED):** Whole-trip HF pass is **Trip Signal Summary** — sparse and **variable** on LTE_R1 (see `evidence/signal-inventory/CADENCE_DENSITY.md`: RD002 sealed P50 **13.489s**; RD003 HF **~2.00s**; do not combine). Short-event misuse authority is **native-event-anchored** + event-context enrichment, not HF point-pair alone.

## Driving score / stress model (CONFIRMED V1)

| Output | Semantics |
|--------|-----------|
| `TripDrivingImpact.drivingStressScore` | Composite vehicle load 0–100 |
| `DriverScoreService` | Distance-weighted aggregation of `drivingStressScore` — **misnamed** (vehicle stress, not driver quality) |
| `RentalDrivingAnalysis.drivingScore` | Booking-period aggregate |

Formula: weighted stress dimensions → `capLinear` normalization → composite `computeDrivingStressScore`. Weights in `driving-impact.config.ts`. Rounded to 1 decimal.

**Future V2 episode score (DI-EV-0034F):** NOT IMPLEMENTED in production.

## Tire / brake load (CONFIRMED)

**Operational load proxies — NOT measured wear.**

| Component | Derivation |
|-----------|------------|
| `brakingLoad` | From `brakingStressScore` + braking provenance; may downgrade to `LIMITED` when proxy kinematics dominate |
| `tireLoad` | Composite: `0.35×braking + 0.35×stopGo + 0.30×longitudinal` when assessable |
| `thermalLoad` | From `thermalBrakeStressScore` |

Downstream: `DRIVING_HEALTH_IMPACT_PUBLISH` → `BrakeHealthService.recalculate`, `TireHealthService.recalculate`

## Persistence (CONFIRMED)

| Store | Role |
|-------|------|
| **PostgreSQL** | Canonical: trips, events, impact, V2 runs/jobs/stages, assessability, evidence, rental analysis |
| **ClickHouse** | Optional analytics mirror (`telemetry_hf_*`, waypoints) — not canonical |
| **Redis/BullMQ** | Async orchestration; durable state in `DrivingIntelligenceJob` |

**No raw HF time series in Postgres** (CONFIRMED). Optional CH mirror only.

## API / UI consumers (CONFIRMED)

| Surface | Data |
|---------|------|
| `vehicle-intelligence.controller.ts` | Trips, impact, events, assessability, driver scores |
| `rental-driving-analysis.controller.ts` | Booking analyses |
| `RentalStressAnalysisCard`, `VehicleStressPanel` | Stress display |
| `CustomerDrivingTab`, `BookingUsageMisuseTab` | Rental driving context |
| Grafana `synqdrive-driving-intelligence-v2.json` | Ops metrics |

## HF / reference capture status (DI-EV-0035C → C.1e)

| Item | Status |
|------|--------|
| V2 recovery policy (8s settlement, 6s overlap) | CODE on prod binary; **FEATURE OFF** |
| Block polling 30s (C.1) | CODE on prod binary; **NOT VALIDATED** live |
| Multi-cadence calibration (C.1c–e) | CODE on prod binary; **GATE 2 lifecycle validated** (stationary); scientific live cal **NOT EXECUTED** |
| Production post-trip HF | **LEGACY UNCHANGED** — whole-trip `fetchHighFrequency` |
| Operator-selected calibration | Infrastructure ready; **DI-DEF-019 unblocked** — physical 10/20/30/60 drive authorized as separate experiment |

## Multi-tenancy (CONFIRMED)

- V2 tables: direct `organizationId`
- `DrivingEvent`, `TripDrivingImpact`: nullable `organizationId`; effective scope via `vehicle.organizationId`
- `VehicleTrip`: scoped via vehicle join; repositories assert org
- ClickHouse: `org_id` on all mirror tables

## R1 temporal-safety containment — ACTIVE CONTAINMENT (EXP-021 C0.3, 2026-09-24)

**Status:** C0.3 merged/deployed (`e30de759…`, release `20260924201136_v4994`). C0.5 CG-01 extension in draft PR (not deployed). **Not** the final source-quality architecture.

| Constraint | Current behaviour (branch) |
|------------|----------------------------|
| 1. Integration identity | `resolveTelemetrySourceFamily(DimoVehicle.rawJson)` → `RUPTELA_R1` (serial `R1-`) / `API_SYNTHETIC` / `UNKNOWN` (fail closed). `hardwareType` never consulted (Tesla is `LTE_R1`: DI-CONTRA-HARDWARE-TYPE-INTEGRATION-001) |
| 2. No R1 point-deceleration abuse | Future `FULL_BRAKING` / `POSSIBLE_IMPACT` suppressed; existing rows omitted from event list, excluded from ledger summary FULL count, impact, brake wear, counters |
| 3. No R1 OBD-only engine-shutdown claim | `ENGINE_SHUTDOWN_WHILE_DRIVING` not derived for R1 (fail closed; no 2-record ≥3 s proof path) |
| 4. No exact-time context claims for R1 | Presentation nulls anchor-relative values, caps confidence LOW, adds `temporalContainment` marker; persisted assessment unchanged |
| 5. No R1-only misuse escalation | R1 OBD-derived evidence tagged `temporalProvenance`; uncertain-only ≤ WARNING / MEDIUM + proxy-only lifecycle (REVIEW_REQUIRED preserved); mixed capped by independent support |
| 6. CG-01 — no R1 cold+full-throttle conjunction claim | `COLD_ENGINE_FULL_THROTTLE` in contained HF abuse set (C0.5): future suppression, read-model omission, marker-aware counter adjustment; misuse rule skips R1-only full-throttle rows (`COLD_ENGINE_HIGH_RPM` unchanged) |

No historical row, ledger row, misuse case, score or ClickHouse data is modified. Residual consumers: DI-GAP-R1-CONTAINMENT-RESIDUAL-001. Wording debt (12 sites): DI-GAP-R1-OVERCLAIM-WORDING-001. Record: `evidence/reference-capture/EXP_021_C03_R1_TEMPORAL_CONTAINMENT_2026-09-24.md`.

## Known limitations

1. HF assumed ~1 Hz in production detectors; RD003 ~2s median; RD002 sealed P50 13.489s
2. No Postgres raw HF replay — re-enrichment re-fetches DIMO
3. V2 pipeline not production-validated at fleet scale
4. `DriverScoreService` naming contradicts vehicle-stress semantics
5. `profilesComparable()` rolling aggregate defect (pre-existing, open)
6. Fleet HF request rate / cost: **NOT BENCHMARKED**
7. R1 historical OBD record time is uncertain (EXP-021 C0.1); point-in-time claims are **contained**, not corrected (DI-DEF-020 OPEN)

## Unresolved validation items

- Live 10/20/30/60s HF calibration — **EXP-019 + EXP-020 complete**; **EXP-021 UPPER_BOUND_V2** first physical run **2026-09-11**; **EXP-021 CANDIDATE_BRACKET_V3** first physical run **2026-09-12** (KS MS 661; frozen evidence PR #1618) — **code defects confirmed** (transient plan fallback → mixed UPPER_BOUND_V2/V3 provenance; 8 **EXPECTED_SLOTS_NEVER_CREATED**; 90s/60s settlement 9 vs 19 windows; stale `DEGRADED_LOW_MOVEMENT` on 120s despite 454.7s movement); **correction pass 2026-09-12** (PR #1621, deployed `067af8f`) implements durable `calibrationPlanId`/`calibrationPlanVersion` at arm, plan-aware slot init + settlement + scientific-status recompute; **next physical run** = **CANDIDATE_SHORT_AB_90_60** on **WOB L 7503** (`19fedd4b-…`, token **192922**) per frozen PR #1618 minimum experiment (90→60 only, omit 120s anchor); plan registered as `EXP021_CANDIDATE_SHORT_AB_90_60` — **prospective, not yet deployed**; 180s historical evidence only; 90s epistemic **UNKNOWN/PROSPECTIVE** (KS MS 661 UPPER_BOUND_V2 run `d633da9d-…`; corrected forensic evidence `EXP_021_KS_MS_661_UPPER_BOUND_V2_FULL_POST_RUN_FORENSIC_2026-09-11.md` + audit JSON; freeze `EXP_021_KS_MS_661_UPPER_BOUND_V2_EVIDENCE_FREEZE_2026-09-11.md`; **READY_TO_CHOOSE_PRODUCTION_CADENCE=NO**; false physical-end root cause fixed in merged PR #1606); 180/120 **DEGRADED_INSUFFICIENT_REQUESTS** (~4/3 HF polls vs 5 slots); 60/30 invalid (operator stopped ~26.2 min); settlement FIXED_INTERVAL 48/48; gap join 4/44 assessable under legacy A/B geometry (**historical only**); post-run hardening PR #1604 correction pass: **strict deterministic slot-only HF gating** (ISSUED reserved before provider I/O), physical-end-early terminalization preserving completed phases, final-phase wall-clock seal without fresh telemetry, `validMovementDurationMs` persistence, **full-phase overlapping 60s settlement tiles** (62 tiles × 6 ages = **372 queries**; synthetic gap assessability **100%** at ≥10s); legacy 120s-stabilized tiling retained for evidence parse only (25 tiles / 75.76% nominal minutes); WHOLE_TRIP **BLOCKED_BY_EXTERNAL_TRIP_FSM_WORKSTREAM**
- **EXP-021 autonomous orchestrator (PR #1649):** canonical `Exp021AutonomousLifecycleDriver` shared by production orchestrator + controlled-time regression; parallel in-memory harness **removed**; gate **PASS** (55 unit tests); Postgres integration opt-in with compile fix; PR **#1645 merged** (KS MX forensic frozen); **READY_FOR_NEXT_PHYSICAL_90_60_RUN=NO** until human sign-off — authority `EXP_021_AUTONOMOUS_ORCHESTRATOR_SHORT_AB_REGRESSION_2026-09-14.md`
- `HF_RECOVERY_POLICY_V2_ENABLED` production canary
- V2 full stage DAG under production load
- Natural fleet-scale block polling density proof

## 2026-09-19 — EXP-021 multi-vehicle enrollment authority gap (WOB live drive)

Post PR #1694 three-vehicle cohort activation, WOB L 7503 trip `c0889036-db0b-4e95-a1f0-11ecb722ce17` failed at `armOngoingTrip` with `enrollment_not_found` (only KS MX 2024 had `exp021_study_enrollments`). Live activation disabled pending idempotent cohort study-enrollment bootstrap (`EXP_021_COHORT_STUDY_ENROLLMENT_AUTHORITY_CLOSURE_2026-09-19.md`). Failed ledger immutable; no backfill.

### DI V0 S4F observability (EXP-021 S4F-1 — 2026-09-30)

| Item | State |
|------|-------|
| **Path** | `backend/src/modules/vehicle-intelligence/driving-intelligence/s4f-observability/` |
| **Runtime** | **Dormant** — read-only reconciliation + `DI_V0_S4_OBSERVABILITY_SNAPSHOT_V1`; no AppModule, scheduler, or provider calls |
| **Beyond 10d drift** | Report-only boundary mismatch count (no T11) |
| **Diagnostic pagination** | Keyset authority `SCAN_WATERMARK_CREATED_AT_THEN_SETTLEMENT_ANCHOR_AT_THEN_WORK_ITEM_ID` (frozen scan population) |
| **Read DB surface** | `DiV0S4fReadDb` = `$queryRaw` only; F32 READ ONLY on tx client |
| **Provider backpressure** | **DI-GAP-S4-PROVIDER-BACKPRESSURE-001 CLOSED** (S4F-2 remote Redis certification run 36735099353); global cooldown blocks all priorities per P1.3 |
| **Runtime (repo main post S4F-7A)** | `DiV0S4RuntimeModule` via `VehicleIntelligenceModule` — S4B/S4E/S4F wired; one S4C executor registered at bootstrap. **Control-plane dormant** when all S4 env flags OFF + missing/invalid `DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE` + Production kill row missing/KILLED. **Production** @ `8fa531b27…` still **without** this wiring until a future deploy. |
| **Tiny activation** | Evaluator fail-closed; frozen gates: five non-operator gates **SATISFIED**; **explicit operator authorization NOT_SATISFIED** → **NOT_READY** (5/6). Production env S4 flags off; `di_v0_s4_control` **GLOBAL row KILLED** (explicit fail-closed authority since S4F-7H). NO_BACKFILL: `DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE` required for PRIMARY discovery. |
| **Dormant deploy preflight (S4F-7B)** | Read-only VPS/DB audit **2026-10-02**: Production @ `8fa531b27…` → target `ee958854…` (**15** commits, **0** new migrations); **DORMANT_DEPLOY_READINESS=PASS** — separate authorization required for exact-SHA deploy ([EXP021_S4F7B_DORMANT_PRODUCTION_DEPLOY_PREFLIGHT.md](evidence/EXP021_S4F7B_DORMANT_PRODUCTION_DEPLOY_PREFLIGHT.md)). |
| **Exact-SHA authorization gate (S4F-7C)** | Read-only gate **2026-10-02**: frozen target `ee958854…` (not `main` `b7d77643…`); Production stayed `8fa531b27…`; **PASS**; deploy **not** authorized in gate ([EXP021_S4F7C_EXACT_SHA_DORMANT_DEPLOY_AUTHORIZATION_GATE.md](evidence/EXP021_S4F7C_EXACT_SHA_DORMANT_DEPLOY_AUTHORIZATION_GATE.md)). |
| **Dormant exact-SHA Production deploy (S4F-7D)** | **2026-10-02**: Human-authorized deploy to **`ee958854…`** only; release **`20261002014651_v4994`**; S4 runtime **registered**, env unchanged, GLOBAL row **missing**, S4 counts **0** — **PASS** ([EXP021_S4F7D_DORMANT_PRODUCTION_DEPLOY_RESULT.md](evidence/EXP021_S4F7D_DORMANT_PRODUCTION_DEPLOY_RESULT.md)). |
| **DB GLOBAL kill init preflight (S4F-7E)** | **2026-10-02** read-only: Production still `ee958854…`; GLOBAL **missing** → **KILLED_FAIL_CLOSED**; initializer semantics **safe**; wrapper missing → **`DB_KILL_INITIALIZATION_READINESS=BLOCKED`** ([EXP021_S4F7E_DB_KILL_INITIALIZATION_PREFLIGHT.md](evidence/EXP021_S4F7E_DB_KILL_INITIALIZATION_PREFLIGHT.md)). |
| **Attestation deploy isolation (S4F-7N)** | 2026-10-03: read-only Production prestate confirmed @ `ee958854…`; main is **not** attestation-only deploy target (Battery migration + unrelated runtime). **Recommend** minimal release = Production SHA + S4F-7M four-file runtime only — separate human authorization required ([EXP021_S4F7N_PRODUCTION_ATTESTATION_DEPLOY_ISOLATION_AUDIT.md](evidence/EXP021_S4F7N_PRODUCTION_ATTESTATION_DEPLOY_ISOLATION_AUDIT.md)). |
| **Minimal attestation RC (S4F-7O)** | 2026-10-03: sealed deploy candidate **`9d286e58ac7a4b5b6900b48c64b92fdb21afa6f4`** (`release/exp021-s4f7o-minimal-attestation-rc1`, parent `ee958854…`, **4 files only**). **Not** merged to main; future dormant attestation deploy must pin this SHA ([EXP021_S4F7O_MINIMAL_ATTESTATION_RELEASE_CANDIDATE_SEAL.md](evidence/EXP021_S4F7O_MINIMAL_ATTESTATION_RELEASE_CANDIDATE_SEAL.md)). |
| **Exact-RC deploy preflight (S4F-7P)** | 2026-10-03: read-only Production preflight merged **#1898** — observations **PASS** for RC `9d286e58a…` @ Production `ee958854…` / `20261002014651_v4994`; attestation metric absent (expected); historical readiness **corrected**: `REPLICA_A_ATTESTATION_GATE_BEFORE_B=NO`, `DEPLOY_WRAPPER_REMEDIATION_REQUIRED=YES`, `EXACT_RC_PRODUCTION_DEPLOY_PREFLIGHT_READY=NO`, `FINAL_RESULT=BLOCKED_PENDING_DEPLOY_GUARD_AND_MIGRATION_COMPATIBILITY_PROOF`; **no** deploy authorization ([EXP021_S4F7P_EXACT_RC_PRODUCTION_DEPLOY_PREFLIGHT.md](evidence/EXP021_S4F7P_EXACT_RC_PRODUCTION_DEPLOY_PREFLIGHT.md)). |
| **Exact-RC deploy guard (S4F-7Q)** | 2026-10-03: merged main @ `7895bdf0…`; opt-in PRESTATE gate + disposable migration rehearsal **PASS** ([EXP021_S4F7Q_EXACT_RC_DEPLOY_GUARD_ENGINEERING.md](evidence/EXP021_S4F7Q_EXACT_RC_DEPLOY_GUARD_ENGINEERING.md)). Post-merge: target-release sourcing left gate unreachable for real RC deploy — **S4F-7R** controller bridge required before Production authorization. |
| **Deploy controller bridge (S4F-7R)** | 2026-10-03: separate immutable **deploy-controller** SHA (`release/exp021-s4f7r-deploy-controller-rc1` @ `8a18bb6e…`); guarded deploy sources orchestration/attestation from `SYNQDRIVE_DEPLOY_CONTROLLER_ROOT` + `EXPECTED_DEPLOY_CONTROLLER_SHA`; runtime RC `9d286e58…` unchanged ([EXP021_S4F7R_IMMUTABLE_DEPLOY_CONTROLLER_AUTHORITY_BRIDGE.md](evidence/EXP021_S4F7R_IMMUTABLE_DEPLOY_CONTROLLER_AUTHORITY_BRIDGE.md)). |
| **Final exact-controller preflight (S4F-7S)** | 2026-10-06: read-only Production preflight — **BLOCKED** (`CURRENT_PRODUCTION_SHA=0c19eb62…`, not frozen `ee958854…`); disposable RC migrate rehearsal **PASS** on 404-row DB; controller CLI preflight **PASS**; **no** deploy authorization ([EXP021_S4F7S_FINAL_EXACT_CONTROLLER_PRODUCTION_DEPLOY_PREFLIGHT.md](evidence/EXP021_S4F7S_FINAL_EXACT_CONTROLLER_PRODUCTION_DEPLOY_PREFLIGHT.md)). S4F-7S frozen contract **not** retroactively passed. |
| **Attestation supersession closure (S4F-7T)** | 2026-10-06: read-only reverify @ `0c19eb62…` / `20261006064327_v4994` — both replicas **PRESTATE** fingerprint `b648908a…`; attestation files byte-identical to S4F-7M + historical RC; runtime RC **`SUPERSEDED_DO_NOT_DEPLOY`**; controller `8a18bb6e…` **not** authorized for execution; `S4F7S_BLOCKER_RESOLUTION=DEPLOY_NO_LONGER_REQUIRED`; **`FINAL_RESULT=PASS_SUPERSEDED_NO_DEPLOY_REQUIRED`** ([EXP021_S4F7T_CURRENT_PRODUCTION_ATTESTATION_SUPERSESSION_CLOSURE.md](evidence/EXP021_S4F7T_CURRENT_PRODUCTION_ATTESTATION_SUPERSESSION_CLOSURE.md)). |
| **Fresh Tiny staging authority (S4F-7U)** | 2026-10-06: read-only Production preflight — PRESTATE attestation **PASS**; fresh `FRESH_TINY_NOT_BEFORE=2026-10-06T18:33:26.610Z` + fingerprint `9abb1a57…` (**v1 `OTHER`**, **expired** — evidence only); old cutoff would expose **14** completed trips; current S4F-7J tooling frozen to S4F-7I cutoff → **`S4F7V_REQUIRED=YES`**; **no** env write ([EXP021_S4F7U_FRESH_TINY_STAGING_AUTHORITY_PREFLIGHT.md](evidence/EXP021_S4F7U_FRESH_TINY_STAGING_AUTHORITY_PREFLIGHT.md)). |
| **Fresh fingerprint Tiny staging tooling (S4F-7V)** | 2026-10-07: engineering-only fresh path `di-v0-s4-stage-tiny-fresh-production.sh` + `di-v0-s4-fresh-tiny-staging-production/*` — pinned fresh authority (≤900 s DB clock), internal nine-key fingerprint, v1 **`OTHER`** primary proof, exact-three-key mutation contract; historical S4F-7J wrapper **unchanged**; **no** Production execution ([EXP021_S4F7V_FRESH_FINGERPRINT_TINY_STAGING_TOOLING_ENGINEERING.md](evidence/EXP021_S4F7V_FRESH_FINGERPRINT_TINY_STAGING_TOOLING_ENGINEERING.md)). |
| **Fresh Tiny dry-run wiring (S4F-7W)** | 2026-10-07: closes post–S4F-7V wrapper gap — `s4f7w_live_preflight_readonly` + full `DRY_RUN=1` guard path (`GUARDS_OK=YES` required); fatal mutation simulation / intended delta; live staging shell **still fail-closed**; Gate 6 **NOT_SATISFIED** ([EXP021_S4F7W_FRESH_TINY_DRY_RUN_EXECUTION_WIRING_CLOSURE.md](evidence/EXP021_S4F7W_FRESH_TINY_DRY_RUN_EXECUTION_WIRING_CLOSURE.md)). Sealed tool SHA **`11b4a80ccb88d1d6f747399f84667b06c9a71050`** (#1911). |
| **Exact tool JIT Production dry-run (S4F-7X)** | 2026-10-07: **PASS** — original `DRY_RUN=1` @ `3c12875d…` + JIT `14:54:57.152Z`/`fc8df190…` (**`S4F7X_ORIGINAL_RUN_EVIDENCE_COMPLETE=NO`** — no PRE/POST forensics); evidence-completion rerun @ `a376c965…` with full PRE/POST PID + PRESTATE attestation (**`S4F7X_COMBINED_EVIDENCE_COMPLETE=YES`**); tool SHA `11b4a80cc…`; Gate 6 **NOT_SATISFIED** ([EXP021_S4F7X_EXACT_TOOL_JIT_PRODUCTION_DRY_RUN.md](evidence/EXP021_S4F7X_EXACT_TOOL_JIT_PRODUCTION_DRY_RUN.md)). |
| **Fresh Tiny live staging transaction closure (S4F-7Y)** | 2026-10-07: engineering closure — live transaction shell **execution-ready** with `DI_S4F7Y_LIVE_STAGING_AUTHORIZED=YES` + exact `AUTHORIZED_*` packet, final JIT age + NO_BACKFILL gate, backup/recovery, exact 3-key mutation, A→B fresh attestation barrier, rollback; **S4F-7Y.1** safety seal + **S4F-7Y.2** monotonic forensic terminal outcomes (PR **#1915** merged @ squash `123ec54e7…`); **S4F-7AF.1C** (2026-10-08): one authorized live call **fail-closed before mutation** (missing live-path DB clock for `validate-fresh-authority`); **S4F-7AG** fix merged **#1930** @ `f1e6b9221…`; **S4F-7AH** post-merge tool seal @ `ed78748bc…` (six-file parity); Gate 6 **NOT_SATISFIED** ([EXP021_S4F7Y_FRESH_TINY_LIVE_STAGING_EXECUTION_CLOSURE.md](evidence/EXP021_S4F7Y_FRESH_TINY_LIVE_STAGING_EXECUTION_CLOSURE.md), [EXP021_S4F7AG_LIVE_AUTHORITY_DB_CLOCK_ROOT_CAUSE.md](evidence/EXP021_S4F7AG_LIVE_AUTHORITY_DB_CLOCK_ROOT_CAUSE.md), [EXP021_S4F7AH_POST_MERGE_TOOL_AUTHORITY_SEAL.md](evidence/EXP021_S4F7AH_POST_MERGE_TOOL_AUTHORITY_SEAL.md)). |
| **Exact-head CI + tool authority seal (S4F-7Z.2)** | 2026-10-08: exact PR head `715dea5648ebb862eeedfc30e7dc3d3cd57bb02c` **CI certified** (Vehicle + Legal reruns `37668090093` / `37668090226` attempt **2**); five-file operator blob parity on squash merge + `main`; **`EXPECTED_FRESH_TINY_STAGING_TOOL_SHA` sealed** @ `715dea564…` (supersedes S4F-7W/`11b4a80cc…` pin for checkout authority; S4F-7X dry-run evidence preserved); **superseded for post–S4F-7AG operator** by **S4F-7AH** @ `ed78748bc…`; **no** new JIT; Gate 6 **NOT_SATISFIED** ([EXP021_S4F7Z2_EXACT_HEAD_CI_TOOL_AUTHORITY_SEAL.md](evidence/EXP021_S4F7Z2_EXACT_HEAD_CI_TOOL_AUTHORITY_SEAL.md)). |
| **Post-merge tool authority seal (S4F-7AH)** | 2026-10-08: after **#1930** merge @ `f1e6b9221…` — six-file operator blob parity (PR exact head `ed78748bc…` = merge = `main`); exact-head CI certified on `ed78748bc…`; **`EXPECTED_FRESH_TINY_STAGING_TOOL_SHA` sealed** @ `ed78748bc9493cdc8da56000e333e4940114f9f1` (not interchangeable with merge SHA); historical Z2 `715dea564…` preserved; seal proof via **blob parity + CI** (squash merge — `ed78748…` **not** git-ancestor of merge SHA); Gate 6 **NOT_SATISFIED** ([EXP021_S4F7AH_POST_MERGE_TOOL_AUTHORITY_SEAL.md](evidence/EXP021_S4F7AH_POST_MERGE_TOOL_AUTHORITY_SEAL.md)). |
| **S4F-7AH bootstrap authority migration (S4F-7AI)** | 2026-10-08: new bootstrap `.cursor/scripts/cloud-agent-s4f7ai-fresh-jit-production-dry-run.sh` + `cloud-agent-s4f7ai-tool-pin.lib.sh` reads **S4F-7AH** `NEW_EXPECTED_FRESH_TINY_STAGING_TOOL_SHA` only; six-file blob verification; stale-pin guards; AA.1 bootstrap **unchanged** (Z2); merged **#1934**; **S4F-7AJ** (2026-10-08): one Production `DRY_RUN=1` **PASS** @ tool `ed78748bc…`, Production @ `3b557e208…` / `20261008182454_v4994`, zero env mutation; Gate 6 **NOT_SATISFIED** ([EXP021_S4F7AI_NEW_TOOL_BOOTSTRAP_AUTHORITY.md](evidence/EXP021_S4F7AI_NEW_TOOL_BOOTSTRAP_AUTHORITY.md), [EXP021_S4F7AJ_CORRECTED_TOOL_PRODUCTION_DRY_RUN.md](evidence/EXP021_S4F7AJ_CORRECTED_TOOL_PRODUCTION_DRY_RUN.md)). |
| **Final live staging readiness (S4F-7AK)** | 2026-10-08: read-only Production observation @ `3b557e208…` — S4 prestate **PASS**; `READINESS=TECHNICALLY_READY_PENDING_HUMAN_AUTHORIZATION`; env/PID drift **explained** (APDS shadow enable `20261008T201328Z`, not S4F-7AJ); release-tree **3/6** bash operator blob drift vs `ed78748bc…` (**S4F-7AI bootstrap** for **`DRY_RUN=1` only**; **live** = detached `ed78748bc…` S4F-7Y operator, not S4F-7AI); `HUMAN_FREEZE_CONFIRMATION=PENDING`; `LIVE_EXECUTION_AUTHORIZED=NO`; Gate 6 **NOT_SATISFIED** ([EXP021_S4F7AK_FINAL_LIVE_STAGING_READINESS.md](evidence/EXP021_S4F7AK_FINAL_LIVE_STAGING_READINESS.md), [EXP021_S4F7AK1_FINAL_AUTHORITY_BOUNDARY.md](evidence/EXP021_S4F7AK1_FINAL_AUTHORITY_BOUNDARY.md)). |
| **S4P9B historical backlog quarantine + reopen contract** | 2026-10-12: engineering-only — manifest-pinned quarantine of 18 historical `PENDING` rows (`OPERATOR` supersede, evidence preserved); S4P9B-R1: transactional rollback on late failure, claim-aligned safety proof, fresh DB-backed reopen proof at LIVE_OPEN (rejects forged env proof), TOCTOU-safe reopen transaction, root-wrapper allowlist for `REOPEN_WITH_HISTORY`; explicit Gate-6 intent (`INITIAL_OPEN` unchanged); **no** Production execution ([EXP021_S4P9B_SAFE_HISTORICAL_BACKLOG_QUARANTINE.md](evidence/EXP021_S4P9B_SAFE_HISTORICAL_BACKLOG_QUARANTINE.md)). |
| **Gate-6 OPEN / EMERGENCY_REKILL operator (S4F-7AS)** | 2026-10-09: engineering operator `di-v0-s4-gate6-open-rekill-production.sh` — OPEN via `live-open-authorized` + human-approval file + HMAC v2 dispatch (key sidecar, no payload secret) + exact Production `backend.env` `realpath`; unknown OPEN commit recovery; compensating REKILL; **S4F-7AS.3** authority seal; EMERGENCY_REKILL independent; operator tests + S4A Postgres CI; **no** Production execution; Gate 6 **NOT_GRANTED** ([EXP021_S4F7AS_GATE6_OPEN_REKILL_OPERATOR.md](evidence/EXP021_S4F7AS_GATE6_OPEN_REKILL_OPERATOR.md), [EXP021_S4F7AS3_GATE6_AUTHORITY_SEAL.md](evidence/EXP021_S4F7AS3_GATE6_AUTHORITY_SEAL.md)). **S4F-7AX** (2026-10-09): Ed25519 v2 verify-only + approvalId single-use register on `issue-dispatch-token`; canonical Production forbids HMAC v1 approval; **S4F-7AX.1** pinned trust anchor + O_EXCL consumption; **S4F-7AX.2** live-open fixture bypass closure; **S4F-7AX.3** trusted dispatch issuance register + live-open Ed25519 re-verify (**71** tests) ([EXP021_S4F7AX_INDEPENDENT_APPROVAL_BOUNDARY.md](evidence/EXP021_S4F7AX_INDEPENDENT_APPROVAL_BOUNDARY.md), [EXP021_S4F7AX1_APPROVAL_TRUST_ANCHOR_ATOMIC_CONSUMPTION.md](evidence/EXP021_S4F7AX1_APPROVAL_TRUST_ANCHOR_ATOMIC_CONSUMPTION.md), [EXP021_S4F7AX3_TRUSTED_DISPATCH_PROVENANCE.md](evidence/EXP021_S4F7AX3_TRUSTED_DISPATCH_PROVENANCE.md)). |
| **Minimal five-flag operator (S4F-7AO)** | 2026-10-09: engineering operator `di-v0-s4-enable-tiny-five-flags-production.sh` — five S4 enable flags ON, `NATIVE` OFF, three staged Tiny keys preserved, GLOBAL **KILLED** enforced (no DB kill mutation); S4F-7AO.1 safety + S4F-7AO.2 replica recovery boundary (`RUNTIME_DIRTY` before restart, scoped A/B rollback, `FULL_A_B_PRESTATE_PROOF`); **36** harness tests; **no** Production execution; Gate 6 **NOT_GRANTED** ([EXP021_S4F7AO_MINIMAL_FLAG_OPERATOR.md](evidence/EXP021_S4F7AO_MINIMAL_FLAG_OPERATOR.md), [EXP021_S4F7AO1_SAFETY_CLOSURE.md](evidence/EXP021_S4F7AO1_SAFETY_CLOSURE.md), [EXP021_S4F7AO2_RECOVERY_BOUNDARY.md](evidence/EXP021_S4F7AO2_RECOVERY_BOUNDARY.md)). |
| **Fresh JIT Production dry-run (S4F-7AA)** | 2026-10-08: **PASS** (historical @ bootstrap `99fa1ee34…`) — sealed tool `715dea564…` + JIT `2026-10-08T09:00:32.909Z` / fingerprint `c39fb3af…`; Production `DRY_RUN=1` @ `54fc704f…` / `20261008001031_v4994`; `GUARDS_OK=YES`; Gate 6 **NOT_SATISFIED** ([EXP021_S4F7AA_FRESH_JIT_PRODUCTION_DRY_RUN.md](evidence/EXP021_S4F7AA_FRESH_JIT_PRODUCTION_DRY_RUN.md)). **S4F-7AA.1** hardened bootstrap @ `007eb885…` ([EXP021_S4F7AA1_OPERATOR_EVIDENCE_HARDENING.md](evidence/EXP021_S4F7AA1_OPERATOR_EVIDENCE_HARDENING.md)). **S4F-7AB** certifies AA.1 bootstrap on Production (`9e40c969d` merge) with JIT `2026-10-08T10:01:53.161Z` — evidence on `main` (#1924 @ `17c49854d`) ([EXP021_S4F7AB_HARDENED_PRODUCTION_DRY_RUN_CERTIFICATION.md](evidence/EXP021_S4F7AB_HARDENED_PRODUCTION_DRY_RUN_CERTIFICATION.md)). |
| **Live-staging authorization readiness (S4F-7AC)** | 2026-10-08: read-only **No-Go** for `DRY_RUN=0` at original audit time; **AKTUELL:** S4F-7AB dry-run evidence on `main` (#1924); live path still **NOT_READY** — `EXPLICIT_HUMAN_AUTHORIZATION_PRESENT=NO`; `NEW_JIT_REQUIRED=YES`; S4F-7AB **≠** live-staging proof; Gate 6 **NOT_SATISFIED** ([EXP021_S4F7AC_LIVE_STAGING_READINESS_REVIEW.md](evidence/EXP021_S4F7AC_LIVE_STAGING_READINESS_REVIEW.md), post-merge addendum in [EXP021_S4F7AC1_PR1924_CI_CLOSURE.md](evidence/EXP021_S4F7AC1_PR1924_CI_CLOSURE.md)). |
| **Final Production live-staging readiness (S4F-7AD)** | 2026-10-08: read-only Production observation @ `54fc704f…` — `READONLY_PRODUCTION_PREFLIGHT_PASS=YES`; sealed tool blobs on deploy **match** Z2; `READY_FOR_HUMAN_AUTHORIZATION_DECISION=YES` (**not** live authorization); `LIVE_STAGING_AUTHORIZED=NO`; JIT **not** minted; temp cleanup **NOT_VERIFIED**; Gate 6 **NOT_SATISFIED** ([EXP021_S4F7AD_FINAL_LIVE_STAGING_READINESS.md](evidence/EXP021_S4F7AD_FINAL_LIVE_STAGING_READINESS.md)). |
| **Post-merge authority live-staging gate (S4F-7AE)** | 2026-10-08: after #1926 @ `9075780b…` + APDS `3b557e208…` on `main` — Production **unchanged** @ `54fc704f…`; `CROSS_WORKSTREAM_DRIFT_SAFE=YES` for current pins; APDS = deploy/migration dependency on **next** deploy only; `READY_FOR_EXPLICIT_HUMAN_AUTHORIZATION_DECISION=YES`; **no** live auth; Gate 6 **NOT_SATISFIED** ([EXP021_S4F7AE_POST_MERGE_AUTHORITY_LIVE_STAGING_GATE.md](evidence/EXP021_S4F7AE_POST_MERGE_AUTHORITY_LIVE_STAGING_GATE.md)). |
| **Production kill init wrapper (S4F-7F)** | Merged **#1882** @ `0b0eac19…`. **S4F-7G** dry-run **PASS**; **S4F-7H**: GLOBAL **KILLED** @ `ee958854…`. **S4F-7I** (2026-10-02): read-only Tiny staging preflight — proposed NOT_BEFORE `2026-10-02T05:55:28.839Z` + Tiny allowlists; **no** Production env mutation ([EXP021_S4F7I_NO_BACKFILL_TINY_STAGING_PREFLIGHT.md](evidence/EXP021_S4F7I_NO_BACKFILL_TINY_STAGING_PREFLIGHT.md)). **S4F-7J** (2026-10-02): engineering wrapper `di-v0-s4-stage-tiny-production.sh` + cloud bootstrap — **no** Production execution ([EXP021_S4F7J_TINY_CONFIG_STAGING_WRAPPER_ENGINEERING.md](evidence/EXP021_S4F7J_TINY_CONFIG_STAGING_WRAPPER_ENGINEERING.md)). **S4F-7J.1** (2026-10-02): safety closure on PR **#1888** @ `040170104…` — Ops→S4B import removed, live pre-mutation topology/budget/Redis gates, exact three-key diff, recovery prestate proofs, expanded tests (**47**); still **no** Production execution. **S4F-7K** (2026-10-02): read-only Production **dry-run** `DRY_RUN=1` — guards **PASS** on remediation tool SHA `947a70540…` (frozen merge `04017010` blocked on text `vehicle_id` SQL); **no** env/restart/DB write ([EXP021_S4F7K_PRODUCTION_TINY_STAGING_DRY_RUN.md](evidence/EXP021_S4F7K_PRODUCTION_TINY_STAGING_DRY_RUN.md)). **S4F-7L** (2026-10-02): human-authorized **3-key staging attempt** `DRY_RUN=0` @ `947a70540…` — file mutation + backup **PASS**, Replica A **PRIMARY_STAGING** runtime proof **FAIL** → **full rollback COMPLETE**; Production `backend.env` restored to pre-pin SHA256; **no** Tiny activation ([EXP021_S4F7L_PRODUCTION_TINY_CONFIG_STAGING.md](evidence/EXP021_S4F7L_PRODUCTION_TINY_CONFIG_STAGING.md)). **S4F-7M** (2026-10-02): in-process **nine-key** runtime attestation via authenticated `/api/v1/metrics`; S4F-7J wrapper migrated to metrics proof (proc env removed); **no** Production deploy ([EXP021_S4F7M_IN_PROCESS_RUNTIME_CONFIG_ATTESTATION_ENGINEERING.md](evidence/EXP021_S4F7M_IN_PROCESS_RUNTIME_CONFIG_ATTESTATION_ENGINEERING.md)). |
| **S4P1 production readiness & safety simplification** | 2026-10-11: read-only audit @ `main` `7266dbef…` — S4 runtime = shadow `di_v0_s4_*` + DIMO budget; Wave-3 human 24h gate was **operational triage**, not Gate-6 code; **no** automatic EMERGENCY_REKILL; simplified ops model documented; Production **KILLED** after Wave-3 containment (external) ([EXP021_S4P1_PRODUCTION_READINESS_SAFETY_SIMPLIFICATION.md](evidence/EXP021_S4P1_PRODUCTION_READINESS_SAFETY_SIMPLIFICATION.md)). |
| **S4P2 unattended ops & alert integration** | 2026-10-11: Prometheus `alerts-di-s4.yml` + S4 operational gauges (`DiV0S4OperationalMetricsService`); Alertmanager route = existing `synqdrive-critical` / escalation; **alert delivery UNVERIFIED** this slice; **no** automatic rekill ([EXP021_S4P2_UNATTENDED_OPS_ALERT_INTEGRATION.md](evidence/EXP021_S4P2_UNATTENDED_OPS_ALERT_INTEGRATION.md)). |
| **S4P2-R1 alert reliability** | 2026-10-11: metric freshness + leader reset; promtool rule tests; VPS validate-before-copy; merge notes for #1987→#1988 ([EXP021_S4P2_R1_ALERT_RELIABILITY.md](evidence/EXP021_S4P2_R1_ALERT_RELIABILITY.md)). |
| **S4P2-R2 monitoring correctness** | 2026-10-11: `shadow_plane_engaged` retention on refresh failure; in-flight-only activity; `DiV0S4GlobalKillSuspectOrphan`; candidate-only promtool + reload rollback ([EXP021_S4P2_R2_MONITORING_CORRECTNESS.md](evidence/EXP021_S4P2_R2_MONITORING_CORRECTNESS.md)). |
| **P1 speed QC policy + P2 trip projection** | 2026-10-13: `DI_V0_SPEED_QC_POLICY_V1` merged (#2010); P2 `DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1` + `di_v0_trip_speed_quality_projections_v1` — **runtime wiring OFF**, ops-only ([EXP021_P2_TRIP_SPEED_QUALITY_PROJECTION_V1.md](evidence/EXP021_P2_TRIP_SPEED_QUALITY_PROJECTION_V1.md)). |
| **P2.1 real-trip QC preview** | 2026-10-14: read-only in-memory preview + ops CLI (`previewDiV0TripSpeedQualityForWorkItem`); production R2 on one trip; R3 forensic explains 763 `NO_NUMERIC` / 26 conflicts ([EXP021_P2_1_REAL_TRIP_QC_PREVIEW.md](evidence/EXP021_P2_1_REAL_TRIP_QC_PREVIEW.md), [EXP021_P21_R3_GPS_QC_SEMANTICS_FORENSIC.md](evidence/EXP021_P21_R3_GPS_QC_SEMANTICS_FORENSIC.md)). |
| **P1 V2 runtime integration readiness** | 2026-10-14: main @ `72eaaf3d5e` includes #2020/#2021/#2025; Production @ `a4c3b1fc1d` **pre-V2**; V2 opt-in on engine/preview/compare; persist + preview CLI policy passthrough; **no** customer API/UI, **CUSTOMER_RESULT_USES_V2=NO** ([EXP021_P1_V2_RUNTIME_INTEGRATION_READINESS.md](evidence/EXP021_P1_V2_RUNTIME_INTEGRATION_READINESS.md)). |
| **P2 auto V2 projection after S4** | 2026-10-15 (draft): durable outbox + leader scheduler in `DiV0TripSpeedQualityModule`; explicit `DI_V0_SPEED_QC_POLICY_V2`; env-gated **OFF** by default + `ENABLED_SINCE` forward scope; S4C completion path unchanged ([EXP021_P2_AUTO_PROJECTION_V2.md](evidence/EXP021_P2_AUTO_PROJECTION_V2.md)). |
| **Evidence** | [EXP021_S4F1_OBSERVABILITY_RECONCILIATION.md](evidence/EXP021_S4F1_OBSERVABILITY_RECONCILIATION.md); [EXP021_S4F3_TINY_ACTIVATION_EVIDENCE_AUDIT.md](evidence/EXP021_S4F3_TINY_ACTIVATION_EVIDENCE_AUDIT.md); [EXP021_S4F4_DIMO_GLOBAL_BUDGET_CONFIG_ONLY_OPS.md](evidence/EXP021_S4F4_DIMO_GLOBAL_BUDGET_CONFIG_ONLY_OPS.md); [EXP021_S4F5_PRODUCTION_PREFLIGHT.md](evidence/EXP021_S4F5_PRODUCTION_PREFLIGHT.md); [EXP021_S4F5_1_RELEASE_DELTA_PREFLIGHT.md](evidence/EXP021_S4F5_1_RELEASE_DELTA_PREFLIGHT.md); [EXP021_S4F5_2_PRODUCTION_DEPLOY_RESULT.md](evidence/EXP021_S4F5_2_PRODUCTION_DEPLOY_RESULT.md); [EXP021_S4F6_GLOBAL_BUDGET_PRODUCTION_ROLLOUT_RESULT.md](evidence/EXP021_S4F6_GLOBAL_BUDGET_PRODUCTION_ROLLOUT_RESULT.md); [EXP021_S4F7_TINY_OPERATOR_AUTHORIZATION_PREFLIGHT.md](evidence/EXP021_S4F7_TINY_OPERATOR_AUTHORIZATION_PREFLIGHT.md) (+ S4F-7A addendum); [EXP021_S4F7A_TINY_EXECUTION_PREREQUISITES_ENGINEERING.md](evidence/EXP021_S4F7A_TINY_EXECUTION_PREREQUISITES_ENGINEERING.md) (**2026-10-01**) |

## Coverage classification

| Area | Status |
|------|--------|
| Legacy enrichment + impact | CONFIRMED |
| V2 code paths | CONFIRMED (flag off) |
| HF recovery runtime | PARTIALLY RECONSTRUCTED |
| Episode V2 scoring | NOT IMPLEMENTED |
| Fleet scalability numbers | UNKNOWN |
| Production V2 E2E | NOT YET PRODUCTION-VALIDATED |
