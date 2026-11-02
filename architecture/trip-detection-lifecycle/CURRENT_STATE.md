# Trip Detection & Lifecycle — Current State (`AUTHORITY_ACTIVE`)

**Promoted 2026-09-26** via Gate A — [TDL_PHASE_5_AUTHORITY_PROMOTION_AUDIT_2026-09-26.md](evidence/TDL_PHASE_5_AUTHORITY_PROMOTION_AUDIT_2026-09-26.md) (TDL-DEC-PHASE5-001).

| Field | Value |
|-------|-------|
| **REPO_CURRENT** | `0b44b146f…` — `origin/main` at Phase 5 promotion audit (post #1793) |
| **PRODUCTION_CURRENT (verified release)** | `2b54a357…` @ `/opt/synqdrive/releases/20260926094359_v4994` — **VERIFIED_READ_ONLY** 2026-09-26 (TDL-EVID-PHASE5-PROD-BASELINE-001) |
| **REPO_CURRENT_AT_OQ004_AUDIT (historical)** | `55fcbe7a229db9858cecc1538b9ec1919ff30fbc` — `origin/main` at TDL-OQ-004 read-only audit (PR #1783 base; **not** a claim that PR head equals live `origin/main` after further merges) |
| **REPO_CURRENT (legacy table row — stale)** | `567a5766f…` — pre-OQ-004 axis; superseded for route coverage claims by **REPO_CURRENT_AT_OQ004_AUDIT** |
| **Production baseline (historical — OQ-004 audit)** | `8a1d9c6586cbddc41bb6c94870f9d51226d71aa2` @ `/opt/synqdrive/releases/20260925182907_v4994` (`LIVE_RELEASE_ID=20260925182907_v4994`) |
| **origin/main baseline (historical @ R9 rebase)** | `a4725514866a03099e7a1e485ccf0b7ea37d6fec` — **does not contain R9** |
| **origin/main (historical @ R12 hardening #1594 merged)** | `f4109e34c24f1eb497e2023f4b4bb997abfc159f` — superseded on main by later merges |
| **Production baseline (historical — PRE_HARDENING_R12)** | `157b3c72226869e4e35d1a9398b78cab50d3fa54` @ `20260909190912_v4994` — **HISTORICAL** |
| **Production baseline (historical — QS-active)** | `e30de7591d97868e24d6e1f379a71b52ada8a3eb` @ `20260924201136_v4994` — **HISTORICAL** (superseded by `99d722b4…`) |
| **Last verified Production evidence** | `2026-09-26` — TDL-EVID-PHASE5-PROD-BASELINE-001 @ `2b54a357…`; QS acceptance TDL-EVID-QS-V1-PROD-ACCEPT-001 @ `99d722b4…` (`2026-09-25`, carried forward); deploy audit TDL-EV-R12-PROD-DEPLOY-001 @ `157b3c722…` remains **HISTORICAL** |
| **Qualified stop duration (Production @ `99d722b4…`)** | **300_000 ms** threshold; `durationMs <= max` → SAME_TRIP; `durationMs > max` → SPLIT; config **`CANONICAL_DEFAULT`**; orchestration + mid-gap + merge/reopen + reconciliation + `TripQualityDetector` **aligned** |
| **Epistemic policy** | Claims separated below — do not merge axes |

## Authority axes (mandatory separation — do not conflate)

| Axis | SHA / status | Classification |
|------|--------------|----------------|
| **REPO_CURRENT** | `0b44b146f…` | Phase 5 code trace baseline (TDL-EVID-PHASE5-FSM-CODE-001) |
| **FSM_GRAPH** | 5 live states · 14 transitions (11 state-changing + 3 self) · `ENDED` SCHEMA_COMPAT_ONLY | **COMPLETE** — machine-validated (`scripts/validate-graph.sh`) |
| **REPO_CURRENT_AT_OQ004_AUDIT** | `55fcbe7a…` | **Historical** — OQ-004 code trace baseline |
| **REPO_CURRENT (legacy)** | `567a5766f…` @ post #1779 | **Stale** — do not use for OQ-004 |
| **OQ007_R1_R8_PROD_COVERAGE** | TDL-EVID-OQ007-R1R8-COV-001 + TDL-EVID-OQ007-1-PASSIVE-CLOSURE-001 | **`RESOLVED_BY_SCOPE_REDUCTION`** — 0 active PP_NOT_VALIDATED after OQ-007.1 |
| **OQ003_DETECTION_STATE_CARDINALITY** | TDL-EVID-OQ003-CARDINALITY-001 | **`RESOLVED_EXPECTED_CARDINALITY`** — 6 FSM rows = 6 scheduler-eligible; tracking runs are execution multiplicity |
| **OQ004_ROUTE_ARTIFACT_COVERAGE** | TDL-EVID-OQ004-ROUTE-COV-001 | **`RESOLVED_WITH_BOUNDED_GAPS`** — **7d 100%**; materialization-era **374/374**; exact Route-V2 30d policy **NOT_EXACTLY_COMPUTABLE** (deploy **UNKNOWN**) |
| **OQ006_DIMO_FSM_BOUNDARY** | TDL-EVID-OQ006-BOUNDARY-001 | **`RESOLVED_WITH_BOUNDED_GAPS`** — live FSM canonical; DIMO segments repair evidence only |
| **PRODUCTION_CURRENT** | `2b54a357…` @ `20260926094359_v4994` | **VERIFIED_READ_ONLY** 2026-09-26 (TDL-EVID-PHASE5-PROD-BASELINE-001) |
| **PRODUCTION (historical — OQ-004)** | `8a1d9c658…` @ `20260925182907_v4994` | **HISTORICAL** VERIFIED_READ_ONLY |
| **QS_V1_PRODUCTION_ACCEPTANCE** | TDL-EVID-QS-V1-PROD-ACCEPT-001 | **`PASS_WITH_EVIDENCE_GAPS`** — 3/3 natural SAME_TRIP; no natural >300s SPLIT / POST_SPLIT_TRIP2 in window |
| **OQ001_COMPLETED_TO_DI_HANDOFF** | TDL-EVID-OQ001-HANDOFF-001 + TDL-EVID-OQ001-1-ORG-001 | **`RESOLVED`** — handoff contract + org invariant; non-atomic enqueue accepted |
| **PRE_HARDENING_R12_PRODUCTION (historical)** | `157b3c722…` | **HISTORICAL** deploy — TDL-EV-R12-PROD-DEPLOY-001 |
| **SHADOW_RUNTIME (Production)** | **LAST_VERIFIED @ `99d722b4…`** (`20260924235024_v4994`) | **CARRIED_FORWARD_FROM_RECENT_VERIFIED_EVIDENCE** — see [PRODUCTION_BASELINE.md](evidence/PRODUCTION_BASELINE.md) current-section class column |

## Phase status (this document)

**Phases 0–5 complete** (Standard 1.0) — Gate A passed 2026-09-26. Phase **1** consolidated baseline is extended by the closures below; remaining items are **explicit non-blocking limitations** (see [contradictions/KNOWLEDGE_GAPS.md](contradictions/KNOWLEDGE_GAPS.md)). **Dead/legacy path inventory closed** via TDL-OQ-010 (TDL-EVID-OQ010-LEGACY-INV-001). **Feature-flag / runtime-control matrix closed** via TDL-OQ-008 (TDL-EVID-OQ008-FLAG-MATRIX-001). **Tiered snapshot polling + R9 provider-wake ingress closed** via TDL-OQ-009 (TDL-EVID-OQ009-R9-INGRESS-001). **Route V2 Mapbox/FMM failure taxonomy closed** via TDL-OQ-004 (TDL-EVID-OQ004-ROUTE-COV-001); handler artifact contract remains optional follow-up.

---

## CONFIRMED — origin/main baseline @ `a47255148…`

### Module entry points

| Surface | Path / symbol |
|---------|----------------|
| Live orchestration | `backend/src/modules/vehicle-intelligence/trips/trip-detection-orchestration.service.ts` |
| Lifecycle authority | `backend/src/modules/vehicle-intelligence/trips/decision/trip-decision.engine.ts` |
| Ownership invariants (P1) | `backend/src/modules/vehicle-intelligence/trips/TRIP_OWNERSHIP.ts` |
| Types / triggers | `backend/src/modules/vehicle-intelligence/trips/trip-detection.types.ts` |
| Nest wiring | `backend/src/modules/vehicle-intelligence/vehicle-intelligence.module.ts` |
| Worker wiring | `backend/src/workers/workers.module.ts` |
| Snapshot ingress | `backend/src/workers/processors/dimo-snapshot.processor.ts` |
| Trip execution loop | `backend/src/workers/processors/trip-tracking.processor.ts` |
| Snapshot scheduler | `backend/src/workers/schedulers/dimo-snapshot.scheduler.ts` |
| Tracking recovery | `backend/src/workers/schedulers/trip-tracking-recovery.scheduler.ts` |
| Reconciliation scheduler | `backend/src/workers/schedulers/trip-reconciliation.scheduler.ts` |
| Reconciliation/repair | `backend/src/modules/vehicle-intelligence/trips/reconciliation/` |
| Route artifacts | `backend/src/modules/vehicle-intelligence/trips/route-artifact/` (Route V2) |
| Trip API | `backend/src/modules/vehicle-intelligence/vehicle-intelligence.controller.ts` (`GET trips*`) |
| Rental UI | `frontend/src/rental/components/trips/`, `frontend/src/rental/components/TripsView.tsx` |
| Metrics | `backend/src/modules/observability/trip-metrics.service.ts` (+ R8 forensic utils on `main`) |

~249 TypeScript files under `backend/src/modules/vehicle-intelligence/trips/`.

### Persistent FSM model (`VehicleTripDetectionState`)

**Cardinality (TDL-DEC-OQ003-001):** **≤1 row per vehicle** (`vehicleId` unique); lazy `getOrCreateDetectionState`; **not** comparable to `vehicle_trip_tracking_runs` volume. See TDL-EVID-OQ003-CARDINALITY-001.

Prisma enum `TripDetectionState`:

| State | Role on `main` |
|-------|----------------|
| `RESTING` | Default terminal; post-finalize reset |
| `POSSIBLE_START` | Start candidate (no trip row yet) |
| `ACTIVE_TRIP` | Confirmed movement trip |
| `IDLE_WITHIN_TRIP` | Stopped but trip still open |
| `POSSIBLE_END` | End candidate (trip still ONGOING) |
| `ENDED` | **Schema-only — deprecated compat label** (TDL-OQ-005); **zero** runtime read/write; Production **0** rows @ 2026-09-26 |

Successful finalize → **`RESTING`**, not `ENDED` (TDL-EV-P2-001 + code reconfirmation).

### Live FSM transitions (TDL-TR-001…014)

Sole state writer: `TripDetectionOrchestrationService.transitionState` (34 call sites). Full per-transition trigger / guard / decision authority / persistence writer / queue job / failure-recovery / source paths / evidence in [graph/edges.yaml](graph/edges.yaml) (`transitions_to`) and [KNOWLEDGE_GRAPH.md](KNOWLEDGE_GRAPH.md). `ENDED` has **zero** transitions (SCHEMA_COMPAT_ONLY / NOT_RUNTIME_REACHABLE).

| Class | Count |
|-------|-------|
| Live runtime states | 5 (`RESTING`, `POSSIBLE_START`, `ACTIVE_TRIP`, `IDLE_WITHIN_TRIP`, `POSSIBLE_END`) |
| State-changing transitions | 11 |
| Self transitions (`ACTIVE_TRIP`, `IDLE_WITHIN_TRIP`, `POSSIBLE_END`) | 3 |

### BullMQ execution phases (not persisted as FSM state)

From `TRIP_TRACKING_TRIGGERS` in `trip-detection.types.ts`:

| Trigger | Processor phase |
|---------|-----------------|
| `POSSIBLE_START` | Start validation window |
| `ACTIVE_TICK` | In-trip metric + route sampling |
| `POSSIBLE_END_CHECK` | End candidacy |
| `END_VALIDATION` | CUSUM / classifier validation |
| `FINALIZE` | Terminal lifecycle commit |

### Queues & workers

| Queue | Name | Role |
|-------|------|------|
| Snapshot poll | `dimo.snapshot.poll` | DIMO snapshot fetch → start evaluation |
| Trip tracking | `dimo.trip-tracking` | Self-scheduling FSM execution loop |

Related downstream (not owned): `trip.behavior.enrichment`, `trip.driving-impact.compute`, `driving.intelligence.jobs`.

### Decision engine & lifecycle

- **`TripDecisionEngine`** sole writer of `vehicleTrip.tripStatus` (TDL-EV-P1-001)
- Repair layer routes lifecycle mutations through decision engine

### Persistence (Prisma)

| Model | Purpose |
|-------|---------|
| `VehicleTrip` | Canonical trip row + enrichment/analysis status fields |
| `VehicleTripDetectionState` | Live FSM row (1:1 vehicle) |
| `VehicleTripTrackingRun` | Execution forensics |
| `TripRepair` | Repair audit trail |
| `VehicleTripWaypoint` | Raw route observations |
| `VehicleTripRouteArtifact` | Canonical route artifact (Route V2) |

### Remediation on `main`

R1–R8 merged through #1549 on `origin/main`. R9 merged via #1553 @ `4bef60463…` (see R9 section below).

---

## CONFIRMED — R9 runtime on main (@ `4bef60463…`)

**Epistemic note:** R9 code merged to `origin/main` via #1553. **PRODUCTION_CURRENT** is @ `2b54a357…` — see authority axes above. Historical R9 Production snapshot @ `0ba96e03…` preserved below.

### R9 wake subsystem entry points

| Surface | Path / symbol |
|---------|----------------|
| Wake intake | `backend/src/workers/snapshot-wake/snapshot-wake-intake.service.ts` (`SnapshotWakeIntakeService`) |
| Wake coordinator | `backend/src/workers/snapshot-wake/snapshot-wake-coordinator.service.ts` (`SnapshotWakeCoordinatorService`) |
| Nest wiring | `backend/src/workers/snapshot-wake/snapshot-wake.module.ts` |
| Handoff processor | `backend/src/workers/processors/snapshot-wake-handoff.processor.ts` |
| Redis scripts | `backend/src/workers/snapshot-wake/snapshot-wake-redis.scripts.ts` |
| DIMO webhook wiring | `backend/src/modules/dimo/dimo-webhook.controller.ts` (delegates eligible wakes to intake; provider gateway owned by [DIMO Integration](../dimo-integration/)) |

**R9 architecture (confirmed on main @ `4bef60463…`; historical Production deploy @ `0ba96e03…` — superseded):**

- Durable **pending** and **successor** Redis mailboxes with monotonic version merge
- Coalesce while canonical `snapshot-{vehicleId}` job is **QUEUED** or **ACTIVE**
- **Handoff never provider-fetches** — `snapshot.wake.handoff` dispatches canonical `dimo.snapshot.poll` enqueue only
- **Continuation** when FSM is **RESTING** and vehicle is wake-eligible (AVAILABLE/RENTED, DIMO CONNECTED)
- **UNKNOWN** wake classification → bounded retry before retirement
- **Coalesce delivery contract:** ACTIVE/UNKNOWN coalesce returns `PERSIST_FAILED` / `QUEUE_FAILED` when successor/handoff consumer cannot be scheduled — never false `COALESCED`
- **scheduleDurableSuccessor:** persist failures → `PERSIST_FAILED`; enqueue failures → `QUEUE_FAILED`
- **Successor handoff orphan recovery (R9H):** `SnapshotWakeHandoffRecoveryScheduler` leader-gated `@Interval(60s)` — at most one Redis SCAN/tick; `scanCursor` assigned to Redis `nextCursor` on fetch; `pendingBatchKeys` carries unprocessed SCAN tail across ticks; max 50 keys/tick, per-key error isolation, idempotent `enqueueHandoffJob()`; no provider fetch; no LONG_IDLE dependency
- **Generation-0 bounded consumer:** after R9H, accepted generation-0 wakes with successful successor persist eventually gain a runnable handoff consumer via initial enqueue or recovery re-arm (latency bounded by recovery tick + SCAN cursor, not instantaneous on `QUEUE_FAILED`)
- Cross-module contract: DIMO webhook → Trip wake intake; DIMO does **not** own Trip FSM (see TDL-DEC-R9-CX-001, [DIMO Integration](../dimo-integration/decisions/DECISION_REGISTER.md) DIM-DEC-R9-001)

See [evidence/EVIDENCE_INDEX.md](evidence/EVIDENCE_INDEX.md) TDL-EV-R9-*.

---

## CONFIRMED — Current verified Production @ `2b54a357…` (read-only, 2026-09-26)

**PRODUCTION_CURRENT authority:** `2b54a357…` @ `/opt/synqdrive/releases/20260926094359_v4994` — **VERIFIED_READ_ONLY** (TDL-EVID-PHASE5-PROD-BASELINE-001). Per-fact classes (**CURRENTLY_REOBSERVED** vs **CARRIED_FORWARD_FROM_RECENT_VERIFIED_EVIDENCE**) in [evidence/PRODUCTION_BASELINE.md](evidence/PRODUCTION_BASELINE.md).

---

## HISTORICAL — QS acceptance Production @ `99d722b4…`

**Not current Production.** Superseded by `8a1d9c658…` → `2b54a357…`. QS acceptance facts below are **carried forward** where `PRODUCTION_BASELINE.md` marks them so.

**Historical PRODUCTION_CURRENT authority (2026-09-25):** `99d722b4cac865e59e30ad23c82cec11fd9fc9b1` @ `/opt/synqdrive/releases/20260924235024_v4994`.

Canonical acceptance evidence: [QUALIFIED_STOP_V1_PRODUCTION_ACCEPTANCE_2026-09-25.md](evidence/QUALIFIED_STOP_V1_PRODUCTION_ACCEPTANCE_2026-09-25.md) (**TDL-EVID-QS-V1-PROD-ACCEPT-001** @ `2026-09-25`).

Chronological baseline index: [evidence/PRODUCTION_BASELINE.md](evidence/PRODUCTION_BASELINE.md).

| Observation | Value | Evidence ID |
|-------------|-------|-------------|
| Deployed SHA / path | `99d722b4…` @ `20260924235024_v4994` | TDL-EVID-QS-V1-PROD-ACCEPT-001 |
| #1750 / #1753 on Production | **YES** (ancestor / present) | TDL-EVID-QS-V1-PROD-ACCEPT-001 |
| Qualified Stop V1 acceptance | **PASS_WITH_EVIDENCE_GAPS** (3/3 natural SAME_TRIP) | TDL-EVID-QS-V1-PROD-ACCEPT-001 |
| Shadow runtime | **PRESENT** + **ENABLED** | TDL-EVID-QS-V1-PROD-ACCEPT-001; [SHADOW_END_PAUSE_OBSERVABILITY_2026-09-14.md](evidence/SHADOW_END_PAUSE_OBSERVABILITY_2026-09-14.md) |
| Regression signatures (audit window) | **NOT_OBSERVED_IN_AUDIT_WINDOW** (see acceptance doc) | TDL-EVID-QS-V1-PROD-ACCEPT-001 |

**Do not claim** Production @ `99d722b4…` equals `REPO_CURRENT` @ `d6ff7e19…`.

---

## HISTORICAL — PRE_HARDENING_R12 Production @ `157b3c722…`

**Not current Production.** Superseded by later releases ending at `99d722b4…`.

Canonical deploy evidence: [R12_PRODUCTION_DEPLOY_2026-09-09.md](evidence/R12_PRODUCTION_DEPLOY_2026-09-09.md) (**TDL-EV-R12-PROD-DEPLOY-001** @ `2026-09-09T19:26:03Z`).

| Observation | Value | Evidence ID |
|-------------|-------|-------------|
| Deployed SHA / path | `157b3c722…` @ `20260909190912_v4994` | TDL-EV-R12-PROD-DEPLOY-001 |
| Classification | DEPLOYED / CI_VALIDATED / POST_DEPLOY_HEALTH_CONFIRMED | TDL-EV-R12-PROD-DEPLOY-001 |
| Behavior validation | **NOT PRODUCTION_BEHAVIOR_VALIDATED** | TDL-EV-R12-PROD-DEPLOY-001 |
| KS MS 661 post-deploy T0 | ACTIVE_TRIP — **PHYSICAL_TEST_READY=NO** | TDL-EV-R12-PROD-DEPLOY-001 Gate 9 |

---

## HISTORICAL — R9 Production / canary @ `0ba96e03…`

**Not current Production.** Superseded by R10 → R11 → R12 → `99d722b4…`.

| Observation | Value | Evidence ID |
|-------------|-------|-------------|
| Deployed SHA / path (historical @ R9) | `0ba96e03…` @ `20260907204434_v4994` | TDL-EV-R9-CANARY-001; [PRODUCTION_BASELINE.md](evidence/PRODUCTION_BASELINE.md) |
| R9 runtime | **Was deployed** on this historical release | DIMO cross-ref; TDL-EV-R9-CODE-001 |
| Provider trigger wiring (canary) | **PASS** — 5/5 speed+ignition; tokenId **190497** excluded | TDL-EV-R9-CANARY-001 @ `2026-09-07T22:35:00Z` |
| Natural R9 wake delivery | **Not validated** | TDL-EV-R9-CANARY-001; NEXT_GATE `NATURAL_R9_WAKE_OBSERVATION` |

**Do not attribute** the frozen `2026-09-06T23:47:41Z` aggregate counts (FSM, trips, PM2, Redis, route artifacts, tracking runs) to this SHA — those belong to the pre-R9 release @ `01541c2ab…` below.

---

## HISTORICAL — Pre-R9 read-only Production snapshot @ `01541c2ab…`

**Not current Production.** Frozen read-only session @ **`2026-09-06T23:47:41Z`** on release `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac` @ `/opt/synqdrive/releases/20260906213654_v4994`. At this session R8/R9 were **NOT_ON_PRODUCTION**.

See [evidence/PRODUCTION_BASELINE.md](evidence/PRODUCTION_BASELINE.md) § Historical Production session.

| Observation | Value | Evidence ID |
|-------------|-------|-------------|
| Deployed SHA / path (historical) | `01541c2ab…` @ `20260906213654_v4994` | TDL-EV-PROD-001 @ `2026-09-06T23:47:41Z` |
| Health | HTTP 200 | TDL-EV-PROD-002 @ `2026-09-06T23:47:41Z` |
| PM2 / Node processes | Two Node PIDs (`3789590`, `3789796`); apps `synqdrive` + `synqdrive-b`, each `instances=1` | TDL-EV-PROD-003 @ `2026-09-06T23:47:41Z` |
| FSM states | 6 × RESTING | TDL-EV-PROD-005 @ `2026-09-06T23:47:41Z` |
| Trips | 1994 COMPLETED, 18 CANCELLED, 0 ONGOING | TDL-EV-PROD-006 @ `2026-09-06T23:47:41Z` |
| Route artifacts | 94 | TDL-EV-PROD-007 @ `2026-09-06T23:47:41Z` |
| Tracking runs (7d) | 6964 PS validation, 3753 PEC, 1842 active, 53 finalize, 2 end validation | TDL-EV-PROD-009 @ `2026-09-06T23:47:41Z` |
| Redis key prefixes | snapshot 5, trip-tracking 7 | TDL-EV-PROD-004 @ `2026-09-06T23:47:41Z` |

**Topology wording (historical @ `2026-09-06T23:47:41Z`):** two distinct PM2 application names, each `instances=1`. **Not** described as replicas of a single PM2 application; trip-worker role split was **not** verified beyond PID correlation.

---

## INFERRED behavior

| Inference | Basis |
|-----------|-------|
| Small telematics cohort drives live FSM rows (historical @ `01541c2ab…` session) | TDL-EV-PROD-005 vs PROD-009 @ `2026-09-06T23:47:41Z` |
| Reconciliation scans broader history than live FSM (historical session) | TDL-EV-PROD-008 vs PROD-006 @ `2026-09-06T23:47:41Z` |
| Production trip FSM deploy (historical chain) | R8/R9 **were deployed** on historical releases; **PRODUCTION_CURRENT** @ `2b54a357…` includes R12 fixes through #1753 (ancestor chain via `99d722b4…`) |
| Natural trip processing active (historical session inference) | TDL-EV-PROD-009 @ `2026-09-06T23:47:41Z` — not current fleet state |

---

## HISTORICAL evidence

- P2–P5 audit Production SSH/SQL failure notes (superseded by 2026-09-06 Production baseline)
- Pre-R1 gap inventories in P4/P5/P6 (closed on `main` via R1–R8)

---

## UNKNOWN facts

- ~~Exact COMPLETED → Driving Intelligence durable handoff (TDL-OQ-001)~~ → **RESOLVED** — TDL-EVID-OQ001-HANDOFF-001 + TDL-EVID-OQ001-1-ORG-001
- ~~`drive-profile/` ownership (TDL-OQ-002)~~ → **RESOLVED** — Battery V2 owns; TDL-EVID-OQ002-DRIVE-PROFILE-001
- ~~ClickHouse trip-assist runtime on Production~~ → **documented** @ `8a1d9c658…`: `CLICKHOUSE_TRIP_ASSIST_ENABLED=true` (TDL-EVID-OQ008-FLAG-MATRIX-001)
- ~~Complete trip feature-flag matrix~~ → **RESOLVED** — TDL-OQ-008 / TDL-EVID-OQ008-FLAG-MATRIX-001
- ~~Full dead/legacy/competing path inventory~~ → **RESOLVED** — TDL-OQ-010 (41 productive paths; graph-mapped 14 / boundary-mapped 27 / unmapped 0)
- ~~Mapbox/FMM failure taxonomy~~ → **RESOLVED** — TDL-OQ-004 (TDL-EVID-OQ004-ROUTE-COV-001)
- Exact Route-V2 30d policy coverage — **NOT_EXACTLY_COMPUTABLE** (TDL-GAP-005; explicit non-blocking limitation)

---

## CONTRADICTED claims

| Claim | Conflict |
|-------|----------|
| "Two backend replicas" without role proof | Contradicts TDL-EV-PROD-003 precision | **RESOLVED** — wording corrected; not called replicas |

See [contradictions/OPEN_CONTRADICTIONS.md](contradictions/OPEN_CONTRADICTIONS.md).

---

## Explicit non-claims

- Production validation of R1–R8 on current Production — **TDL-OQ-007 RESOLVED** (OQ-007.1 passive closure); QS acceptance **`PASS_WITH_EVIDENCE_GAPS`** (TDL-EVID-QS-V1-PROD-ACCEPT-001)
- **`FULLY_PRODUCTION_VALIDATED`** for all Qualified Stop paths — acceptance is **`PASS_WITH_EVIDENCE_GAPS`**
- Production validation of R9 adaptive polling wake — **runtime deployed** @ `684950419…` (R10 release); **provider trigger wiring validated** (5/5 canary); **natural start wake partially observed** on KS MS 661 tokenId 187361 (TDL-EVID-KS-MS-661-001); efficiency vs polling-only **not proven**
- Natural R9 wake delivery — **PARTIAL** (start wake observed KS MS 661 @ `684950419…`); in-trip/end-path wake and archived webhook payloads remain **OPEN** (DIM-GAP-006 / TDL-GAP-013)
- R10 motor-off pause / finalize guards — **deployed** @ `684950419…` (TDL-EV-R10-PROD-DEPLOY-001); **NOT exercised** on KS MS 661 (0× `POSSIBLE_END`); TDL-DEC-R10-001/002 remain **not** `PRODUCTION_VALIDATED`
- TDL-DEC-R11-001 — **deployed** @ `f7eb94cb…` (`20260909024150_v4994`, TDL-EV-R11-PROD-DEPLOY-001); **CI_VALIDATED**; **POST_DEPLOY_HEALTH_CONFIRMED**; natural end-path **NOT validated** on KS MS 661 (TDL-EVID-KS-MS-661-R11-NATURAL-001: Axis E **FAIL**, `stopBoundaryAt` null, 0× POSSIBLE_END); post-audit STALE_ONGOING @ 06:51:54Z
- TDL-DEC-R12-001 — **PRE_HARDENING_R12_PRODUCTION_DEPLOYED** @ `157b3c722…` (`20260909190912_v4994`, TDL-EV-R12-PROD-DEPLOY-001); **CI_VALIDATED** (run 34387586390); **POST_DEPLOY_HEALTH_CONFIRMED**; **NOT PRODUCTION_BEHAVIOR_VALIDATED**; KS MS 661 post-deploy T0 **PHYSICAL_TEST_READY=NO**
- TDL-DEC-R12 pre-drive hardening (#1594) — **R12_HARDENED_CODE_ON_MAIN** @ `f4109e34…` **MERGED**; **CI_VALIDATED** (main push run 34424546044); closes AUD-002/003/004/007; **R12_HARDENED_PRODUCTION_DEPLOYED = NOT YET CONFIRMED**; **R12_HARDENED_PRODUCTION_BEHAVIOR_VALIDATED = NOT YET CONFIRMED**
- PR #1600 end-cycle hardening — **MERGED**; PE clock durability **PRODUCTION_PROVEN** on drive `fc93f98f…`; POST-#1600 defect class documented (TDL-EVID-R12-KS661-DISPATCH-GAP-001); trip `fc93f98f…` **NOT repaired**
- PR #1603 PEC→EV lock-order fix — **MERGED**; **PRODUCTION_PRESENT** @ `99d722b4…` ancestor chain; **#1617** CUSUM boundary preservation **PRODUCTION_PRESENT**; #1627 retry-budget fix — **MERGED / PRODUCTION_PRESENT**; #1635 provider-silence continuity — **MERGED / PRODUCTION_PRESENT**; #1634/#1634-class silence dead-zone fix — **MERGED** (#1634 lineage on main); WOB L 7503 historical POST-#1617 **FAIL** remains forensic — **not reproduced** in QS acceptance audit window
- PR #1648 shadow observability — **MERGED / PRODUCTION_PRESENT**; shadow **ENABLED** on `99d722b4…`; divergences **NOT_EVALUATED_SHORT_WINDOW**
- PR #1674 FETCH_UNCERTAIN bounded CUSUM handoff — **MERGED / PRODUCTION_PRESENT**; KS MX 2024 CH skip resume revalidation — **MERGED** (#1674); historical false-terminal trips **not repaired**
- PR #1750 post-split finalize quality — **MERGED / PRODUCTION_PRESENT**; natural post-split Trip2 acceptance **evidence-gapped** (TDL-EVID-QS-V1-PROD-ACCEPT-001)
- PR #1753 Qualified Stop Contract V1 — **MERGED / PRODUCTION_PRESENT**; 3/3 natural SAME_TRIP controls **PASS**; natural >300s SPLIT acceptance **evidence-gapped**
- PR #1757 accidental squash merge @ `301e4a32…` — **NO_RUNTIME_DELTA_INTRODUCED** (test harness + provenance only); isolated candidate `9f346230…` **DEPLOY_REQUIRED=NO**
- KS MS 661 **2026-09-09** natural drive (`3b26019d…`) — **ONGOING** @ audit; end path blocked (empty-core + stale VLS); historical 2026-09-08 trip (`e324ee8c…`) completed via **`STALE_ONGOING` repair** — separate incident (TDL-EVID-KS-MS-661-001)
- R10/R11/R12 decisions are **VALIDATED** (code + CI + deploy evidence), **not** `PRODUCTION_VALIDATED` for every natural end-path branch
- _Removed 2026-09-26 (Phase 5):_ "Promotion to `AUTHORITY_ACTIVE`" and "Complete machine-readable FSM graph" non-claims — both now satisfied (TDL-DEC-PHASE5-001)
- Resolved DIMO Integration vs trip reconciliation ownership — **TDL-OQ-006 / DIM-GAP-001 RESOLVED** (TDL-EVID-OQ006-BOUNDARY-001); TDL-CX-006 DI registry wording remains open
- **P1A** start boundary admission offline resolver — evidence [TDL_START_BOUNDARY_ADMISSION_P1A_2026-10-16.md](evidence/TDL_START_BOUNDARY_ADMISSION_P1A_2026-10-16.md) (PR #2055 merged)
- **P1B** runtime shadow wiring at start confirmation — legacy canonical writer preserved; gate `TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED` default OFF — [TDL_START_BOUNDARY_ADMISSION_P1B_2026-10-16.md](evidence/TDL_START_BOUNDARY_ADMISSION_P1B_2026-10-16.md)
- **P0 (draft)** durable DI boundary admission recovery — bounded reconciliation sweeper + shadow/writer activation policy; extends PR #2293; **production activation OFF** — [TDL_DURABLE_DI_BOUNDARY_ADMISSION_RECOVERY_P0_2026-11-01.md](evidence/TDL_DURABLE_DI_BOUNDARY_ADMISSION_RECOVERY_P0_2026-11-01.md)

---

## Ownership boundaries

| Owner | Scope |
|-------|-------|
| **Trip Detection & Lifecycle** | Live FSM, start/end detection, tracking queue, boundary persistence, recovery/reconciliation, route artifacts |
| **Driving Intelligence** | Post-trip behavior — consumes boundaries |
| **KG-ATE** | Post-finalize enrichment (legacy HF analysis consumers — OQ-010 boundary-mapped) |
| **KG-EED** | REFUEL/RECHARGE |
| **Scaling Process** | Leader election, DIMO budget, generic mutex |
| **Battery V2** | Downstream trip hooks |
| **DIMO Integration** | Provider transport/auth/webhook gateway ([`architecture/dimo-integration/`](../dimo-integration/), `AUDIT_IN_PROGRESS`) — R9 webhook wiring documented on both authorities |

**Open OQs:** **none** — TDL-OQ-001…010 **CLOSED** (OQ-005 @ 2026-09-26).

**OQ-005 (2026-09-26):** `TripDetectionState.ENDED` — [TDL_OQ_005_ENDED_STATE_LIFECYCLE_AUDIT_2026-09-26.md](evidence/TDL_OQ_005_ENDED_STATE_LIFECYCLE_AUDIT_2026-09-26.md). **Historical compat only**; optional enum-removal follow-up.

**OQ-010 (2026-09-26):** Legacy/duplicate path inventory — see [TDL_OQ_010_LEGACY_DUPLICATE_PATH_INVENTORY_2026-09-26.md](evidence/TDL_OQ_010_LEGACY_DUPLICATE_PATH_INVENTORY_2026-09-26.md). DI V2 + legacy HF parallel; segment detectors **repair**, not dead.
