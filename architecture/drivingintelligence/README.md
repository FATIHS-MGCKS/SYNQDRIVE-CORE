# Driving Intelligence — Living Architecture Authority

**Status:** Retrospective expansion V2 (2026-09-06)  
**Maturity:** SUBSTANTIAL reconstruction — full workstream 2026-08-30 → present  
**Runtime impact:** None (documentation and knowledge graph only)

## What this is

`architecture/drivingintelligence/` is the **canonical architectural memory** for SynqDrive **Driving Intelligence** — the subsystem that transforms vehicle telemetry and trip boundaries into driving behavior understanding, operational load estimates, misuse signals, and API/UI projections.

It spans:

- DIMO telemetry acquisition (live + post-trip HF)
- trip-window association (DIMO Segments canonical)
- HF reconstruction and behavior event detection
- native DIMO driving events (LTE_R1)
- driving impact / stress scoring (V1 production)
- tire and brake **operational load proxies** (not measured wear)
- V2 durable post-trip pipeline (stage orchestrator, assessability, evidence)
- reference capture / HF recovery testbed (DI-EV-0035C / C.1x)
- rental and driver-subject aggregation
- health module inputs (brake/tire recalc)
- API and fleet/rental UI projection
- **DS4 Motion Core** (post-trip manoeuvre assessment — shadow today; **target authority** per owner decision 2026-10-28)

## DS4 authoritative assessment migration (PR-0, docs only)

Owner decision: DS4 replaces legacy HF/native driving assessment completely — **no permanent legacy fallback**, **no parallel authoritative scoring**. Recorded, **not activated** in runtime.

- Design: [`design/DS4_AUTHORITATIVE_ASSESSMENT_MIGRATION.md`](design/DS4_AUTHORITATIVE_ASSESSMENT_MIGRATION.md)
- Decision: [`decisions/DECISION_REGISTER.md`](decisions/DECISION_REGISTER.md) → `DI-DEC-DS4-AUTHORITY-001`
- Consumer audit traceability: [`evidence/CONSUMER_AUDIT_V1_FINDINGS_REGISTER.md`](evidence/CONSUMER_AUDIT_V1_FINDINGS_REGISTER.md)

## RPM Reference Intelligence boundaries (Phase 5 ADR, docs only)

Owner-approved architecture for VSI ↔ RPM HF V1A/V1B ↔ Vehicle Specifications reference metadata ↔ future **RPM Reference Intelligence** ↔ DS4 — **documentation only**; no runtime module yet.

- ADR: [`design/RPM_REFERENCE_INTELLIGENCE_AND_DI_OWNERSHIP_BOUNDARIES_ADR_2026-10-30.md`](design/RPM_REFERENCE_INTELLIGENCE_AND_DI_OWNERSHIP_BOUNDARIES_ADR_2026-10-30.md)
- Decision: [`decisions/DECISION_REGISTER.md`](decisions/DECISION_REGISTER.md) → `DI-DEC-RPM-REF-INTEL-001`

## Critical system boundary

**Driving Intelligence does NOT own canonical trip boundaries.**

Trip start/end, segment authority, and live trip FSM belong to **Trip Detection / DIMO Segments**. Driving Intelligence **consumes** completed trips and enriches them.

**Driving Intelligence does NOT own REFUEL/RECHARGE energy events** (Energy Event Detection / EED). It may consume energy context for trip analytics but does not decide fuel/charge events.

**Driving Intelligence does NOT own fuel-station identification** (Tankstellenerkennung). Adjacent via trip timeline only.

Three confidence domains must never be conflated:

| Domain | Field / concept | Meaning |
|--------|-----------------|---------|
| A | `TripAssessability` dimension status | Whether a **data dimension** is assessable for this trip |
| B | `DrivingEvent` / `TripBehaviorEvent` provenance | Whether an event is **native provider-classified** vs **HF-reconstructed** |
| C | `TripDrivingImpact.drivingStressScore` | **Vehicle operational load** 0–100 — **not** driver quality or measured wear |

## One-screen working graph (current production truth)

```
DIMO Segments (canonical trip boundaries)
        ↓
Trip FSM finalize → VehicleTrip COMPLETED
        ↓
┌───────────────────────────────────────────────────────────────┐
│ LEGACY PATH (always active)                                    │
│ trip.behavior.enrichment → dimo-segments.fetchHighFrequency    │
│   → hf-preprocessing → hf-acceleration/braking/abuse           │
│   → TripBehaviorEvent + VehicleTrip counters                   │
│   → trip.driving-impact.compute → DrivingImpactService         │
│   → TripDrivingImpact + VehicleDrivingImpactCurrent            │
└───────────────────────────────────────────────────────────────┘
        ↓ (when DRIVING_INTELLIGENCE_V2_ENABLED=true)
┌───────────────────────────────────────────────────────────────┐
│ V2 DURABLE PIPELINE (default OFF)                            │
│ TripPostFinalizeAnalysisProducer → DrivingAnalysisInit       │
│   → driving.intelligence.jobs (BullMQ + Postgres envelope)   │
│   → stage DAG: SEGMENT_VALIDATE ∥ NATIVE_EVENTS ∥ ROUTE      │
│     ∥ ASSESSABILITY ∥ ATTRIBUTION → EVENT_CONTEXT            │
│     → DRIVING_IMPACT → MISUSE_RECONCILE → DECISION_SUMMARY   │
│     → HEALTH_IMPACT_PUBLISH                                    │
└───────────────────────────────────────────────────────────────┘
        ↓
API projection (vehicle-intelligence, rental-driving-analysis)
        ↓
UI (trip detail, stress panels, rental misuse, fleet analytics)

PARALLEL R&D (REFERENCE_CAPTURE_ENABLED, default OFF):
ReferenceCapture runner (5s) → HF recovery V2 / block polling testbed
  → calibration phases 10/20/30/60s — NOT production HF path
```

## Epistemic states (first-class)

| State | Meaning |
|-------|---------|
| `CONFIRMED` | Supported by current code, tests, schema, or strong production evidence |
| `INFERRED` | Reasonable reconstruction; not yet fully verified |
| `HISTORICAL` | Was true in a past era; may be superseded |
| `UNKNOWN` | Not yet reconstructed — **not a documentation failure** |
| `CONTRADICTED` | Sources disagree; both recorded in `contradictions/` |

## Authoritative scope vs neighbors

| In scope | Out of scope (adjacent) |
|----------|-------------------------|
| Post-trip behavior enrichment | Live trip FSM / segment detection |
| Driving events & impact scoring | Energy event detection (REFUEL) |
| Assessability & misuse cases | Tankstellenerkennung |
| HF reference capture testbed | Map provider routing (Mapbox) — consumed only |
| Rental driving analysis aggregation | Battery SoC health (separate module) |
| Tire/brake **load proxies** from impact | Physical tire tread / pad measurement |

## Entry points

| File | Purpose |
|------|---------|
| [CURRENT_STATE.md](./CURRENT_STATE.md) | How Driving Intelligence works **right now** (incl. deploy semantics) |
| [WORKSTREAM_HISTORY.md](./WORKSTREAM_HISTORY.md) | Chronological technical narrative of the workstream |
| [COVERAGE_MATRIX.md](./COVERAGE_MATRIX.md) | Topic completion matrix |
| [KNOWLEDGE_GRAPH.md](./KNOWLEDGE_GRAPH.md) | Human-readable graph + evolution diagram |
| [AGENT_CONTRACT.md](./AGENT_CONTRACT.md) | **Mandatory rules for future agents** |
| [decisions/DECISION_REGISTER.md](./decisions/DECISION_REGISTER.md) | Decision register (20 decisions) |
| [research/CHANGE_LEDGER.md](./research/CHANGE_LEDGER.md) | Granular evolution ledger |
| [research/DI_EV_CHRONOLOGY.md](./research/DI_EV_CHRONOLOGY.md) | Complete DI-EV sequence |
| [research/HYPOTHESIS_REGISTER.md](./research/HYPOTHESIS_REGISTER.md) | Hypotheses tested/rejected |
| [research/EXPERIMENT_REGISTER.md](./research/EXPERIMENT_REGISTER.md) | Experiments (**16 entries: 15 executed, 1 pending**) |
| [research/DEFECT_LEDGER.md](./research/DEFECT_LEDGER.md) | Proven defects discovered (**20 total: 16 fixed, 4 open**) |
| [research/LESSONS_LEARNED.md](./research/LESSONS_LEARNED.md) | Evidence-backed lessons |
| [research/PR_TIMELINE.md](./research/PR_TIMELINE.md) | Workstream PR timeline (**27 merged**) |
| [research/OPEN_QUESTIONS.md](./research/OPEN_QUESTIONS.md) | Explicit unknowns |
| [contradictions/CONTRADICTION_REGISTER.md](./contradictions/CONTRADICTION_REGISTER.md) | Unresolved disagreements |
| [evidence/EVIDENCE_INDEX.md](./evidence/EVIDENCE_INDEX.md) | Canonical evidence catalog |
| [graph/nodes.yaml](./graph/nodes.yaml) | Machine-readable node catalog |
| [graph/edges.yaml](./graph/edges.yaml) | Machine-readable relationships |
| [graph/invariants.yaml](./graph/invariants.yaml) | Architectural invariants |

## Maintenance

Any substantive Driving Intelligence behavior change — scoring formulas, event thresholds, HF acquisition policy, stage DAG, job idempotency, assessability dimensions, load component semantics, API projection — **must** update this authority in the same workstream/PR when applicable.

See [AGENT_CONTRACT.md](./AGENT_CONTRACT.md).

## Validation

This PR changes **51 files** under `architecture/drivingintelligence/` only (vs merge-base with `main`).

```bash
bash architecture/drivingintelligence/scripts/validate-graph.sh
bash architecture/drivingintelligence/scripts/validate-docs.sh
```

## Related legacy documents (evidence, not unquestionable authority)

| Document | Classification |
|----------|----------------|
| `docs/audits/driving-intelligence-phase-1-current-state-forensic-audit-2026-08-30.md` (DI-EV-0002) | CONFIRMED baseline |
| `docs/audits/driving-intelligence-reconstruction-master-plan-2026-08-30.md` (DI-EV-0001) | Program authority |
| `docs/audits/driving-intelligence-v2-canonical-design-2026-09.md` (DI-EV-0034F) | PROPOSAL — episode model |
| `docs/audits/driving-intelligence-hf-recovery-runtime-implementation-2026-09.md` (DI-EV-0035C) | Reference-capture runtime |
| `docs/audits/driving-intelligence-hf-block-polling-scalability-2026-09.md` (DI-EV-0035C.1–C.1e) | Scalability testbed |
| `architecture/DI_EV_0035C_HF_RECOVERY_RUNTIME_IMPLEMENTATION_2026-09-04.md` | Architecture record |
| `docs/architecture/driving-intelligence-v2.md` | UX/API contract (July 2026) |
| `docs/audits/driving-intelligence-evidence-registry.md` | Evidence index (through C.1c; C.1d/e in block-polling doc) |
| `architecture/knowledge-graphs/automatic-trip-enrichment/` | ATE boundary (adjacent) |

Governance reference (structure only): `architecture/tankstellenerkennung/`.

## Coverage honesty

| Area | Maturity |
|------|----------|
| Legacy post-trip HF + impact V1 | CONFIRMED |
| V2 stage pipeline (code) | CONFIRMED (flag-gated) |
| V2 production validation | NOT PRODUCTION-VALIDATED |
| HF 30s block polling hypothesis | NOT_VALIDATED |
| Episode-based future scoring (0034F) | NOT IMPLEMENTED |
| Fleet-scale HF cost model | UNKNOWN / NOT BENCHMARKED |
