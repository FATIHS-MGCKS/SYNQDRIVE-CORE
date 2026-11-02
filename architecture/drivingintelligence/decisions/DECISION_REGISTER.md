# Driving Intelligence — Decision Register

Scientific record of major Driving Intelligence architectural decisions.  
Validate graph consistency: `bash architecture/drivingintelligence/scripts/validate-graph.sh`

## DI-DEC-SEGMENTS-CANONICAL-001

| Field | Value |
|-------|-------|
| **TITLE** | DIMO Segments are canonical trip boundaries |
| **ERA** | Core product architecture |
| **STATUS** | VALIDATED |
| **PROBLEM** | Risk of deriving trips from ad-hoc HF segmentation |
| **ALTERNATIVES** | Local signal-based trip detection |
| **DECISION** | VehicleTrip anchored on DIMO Segments; DI consumes COMPLETED trips |
| **RATIONALE** | Consistent trip identity across telematics, energy, and analytics |
| **TRADE-OFFS** | Depends on DIMO segment quality and settlement |
| **CONSEQUENCES** | All DI enrichment scoped to persisted trip windows |
| **IMPLEMENTATION** | `trip-detection-orchestration.service.ts`, DIMO integration |
| **GRAPH NODES** | DI-TRIP-SEGMENTS-001, DI-DEC-SEGMENTS-CANONICAL-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-CODE-BOUNDARY-001 |

## DI-DEC-POST-TRIP-HF-001

| Field | Value |
|-------|-------|
| **TITLE** | Post-trip HF enrichment via BullMQ |
| **ERA** | V1 production |
| **STATUS** | VALIDATED |
| **PROBLEM** | Need behavior events and stress metrics after trip completion |
| **ALTERNATIVES** | Live-trip abuse detection on ACTIVE_TICK only |
| **DECISION** | `trip.behavior.enrichment` → whole-trip `fetchHighFrequency` → detectors |
| **RATIONALE** | Complete trip window available; avoids live FSM complexity |
| **TRADE-OFFS** | Re-fetch DIMO each enrichment; no incremental recovery in production |
| **CONSEQUENCES** | Late-settling buckets may be missed (RD004-B) |
| **IMPLEMENTATION** | `trip-enrichment-orchestrator.service.ts`, `trip-behavior-enrichment.service.ts` |
| **GRAPH NODES** | DI-SVC-ENRICH-ORCH-001, DI-QUEUE-BEHAVIOR-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-CODE-ENRICH-001 |

## DI-DEC-STRESS-NOT-DRIVER-001

| Field | Value |
|-------|-------|
| **TITLE** | drivingStressScore is vehicle operational load |
| **ERA** | Impact Engine V1 |
| **STATUS** | VALIDATED |
| **PROBLEM** | UI/API naming suggests driver quality |
| **ALTERNATIVES** | Rename to vehicleStressScore everywhere |
| **DECISION** | Score semantics documented as vehicle load; `DriverScoreService` misnamed |
| **RATIONALE** | No driver-conduct inference without attribution evidence |
| **TRADE-OFFS** | Naming debt remains in `DriverScoreService` |
| **CONSEQUENCES** | Rental/insurance UI must not imply driver skill ranking |
| **IMPLEMENTATION** | `driving-impact-scorer.ts`, `driver-score.service.ts` |
| **GRAPH NODES** | DI-MET-STRESS-001, DI-SVC-DRIVER-SCORE-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-CODE-SCORE-001 |

## DI-DEC-LOAD-PROXY-001

| Field | Value |
|-------|-------|
| **TITLE** | Tire and brake load are operational proxies |
| **ERA** | P43 load components |
| **STATUS** | VALIDATED |
| **PROBLEM** | Health modules need wear-relevant signals without physical sensors |
| **ALTERNATIVES** | Present as measured wear |
| **DECISION** | `tireLoad`, `brakingLoad` with explicit `sourceQuality` and assessability |
| **RATIONALE** | Honest uncertainty; prevents false precision in health UI |
| **TRADE-OFFS** | Users may misinterpret without UI copy discipline |
| **CONSEQUENCES** | Health recalc gated by `healthEligibility` |
| **IMPLEMENTATION** | `driving-impact-load-components.ts`, `driving-health-impact-publish.handler.ts` |
| **GRAPH NODES** | DI-MET-TIRE-LOAD-001, DI-MET-BRAKE-LOAD-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-CODE-LOAD-001 |

## DI-DEC-V2-FLAG-001

| Field | Value |
|-------|-------|
| **TITLE** | V2 durable pipeline behind master flag default off |
| **ERA** | 2026-07+ V2 development |
| **STATUS** | VALIDATED |
| **PROBLEM** | Legacy enrichment lacks idempotent stage orchestration |
| **ALTERNATIVES** | Big-bang replace legacy path |
| **DECISION** | `DRIVING_INTELLIGENCE_V2_ENABLED` default false; parallel legacy path |
| **RATIONALE** | Safe incremental rollout; trip FSM unaffected |
| **TRADE-OFFS** | Dual-path complexity during transition |
| **CONSEQUENCES** | Reconciliation scheduler repairs V2 gaps |
| **IMPLEMENTATION** | `driving-intelligence-v2.config.ts`, `driving-analysis-init.service.ts` |
| **GRAPH NODES** | DI-FLAG-V2-MASTER-001, DI-SVC-ANALYSIS-INIT-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-CODE-V2-FLAG-001 |

## DI-DEC-RC-SEPARATE-001

| Field | Value |
|-------|-------|
| **TITLE** | Reference capture isolated from production HF |
| **ERA** | DI-EV-0035C |
| **STATUS** | VALIDATED |
| **PROBLEM** | HF recovery experiments could alter production scoring |
| **ALTERNATIVES** | Wire recovery V2 directly into trip-behavior-enrichment |
| **DECISION** | Recovery V2 and block polling only in `reference-capture` module |
| **RATIONALE** | Scientific isolation; evidence before cutover |
| **TRADE-OFFS** | Production path retains known late-bucket gap |
| **CONSEQUENCES** | Explicit cutover decision required for production HF migration |
| **IMPLEMENTATION** | `reference-capture-hf-recovery-v2.policy.ts` |
| **GRAPH NODES** | DI-DEC-RC-SEPARATE-001, DI-POL-HF-RECOVERY-V2-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-0035C-RECOVERY-001 |

## DI-DEC-HF-RECOVERY-V2-001

| Field | Value |
|-------|-------|
| **TITLE** | HF recovery V2 for late-arriving buckets |
| **ERA** | DI-EV-0035C (2026-09-04) |
| **STATUS** | EXPERIMENTAL |
| **PROBLEM** | RD004-B: 2s overlap misses late-settling DIMO buckets permanently |
| **ALTERNATIVES** | Increase overlap only; full raw HF persistence |
| **DECISION** | Settlement delay 8s, recovery overlap 6s, triple watermarks, provenance ring |
| **RATIONALE** | Recover late buckets without unbounded re-query |
| **TRADE-OFFS** | Parameters provisional; not production-validated |
| **CONSEQUENCES** | `HF_RECOVERY_POLICY_V2_ENABLED` default false |
| **IMPLEMENTATION** | `reference-capture-hf-recovery-v2.policy.ts` |
| **GRAPH NODES** | DI-POL-HF-RECOVERY-V2-001 |
| **SUPERSEDES** | Legacy 2s overlap-only watermark |
| **EPISTEMIC** | CONFIRMED (implementation); INFERRED (parameter optimality) |
| **EVIDENCE** | DI-EVID-0035C-RECOVERY-001 |

## DI-DEC-BLOCK-POLL-30S-001

| Field | Value |
|-------|-------|
| **TITLE** | 30s HF block polling scalability hypothesis |
| **ERA** | DI-EV-0035C.1–C.1e |
| **STATUS** | PROPOSED |
| **PROBLEM** | 5s runner polling does not scale to fleet HF acquisition cost |
| **ALTERNATIVES** | Keep 5s; live streaming; persist raw HF in Postgres |
| **DECISION** | Test 30s `HF_HISTORICAL` poll with coverage-driven queryFrom; calibration matrix 10/20/30/60s |
| **RATIONALE** | Provider may return dense historical buckets per request |
| **TRADE-OFFS** | Hypothesis unvalidated; live canary required |
| **CONSEQUENCES** | `HF_30S_BLOCK_POLLING_VALIDATED = NO` |
| **IMPLEMENTATION** | `reference-capture-hf-block-polling.policy.ts`, calibration phase API |
| **GRAPH NODES** | DI-POL-HF-BLOCK-POLL-001, DI-HYP-BLOCK-POLL-30S-001 |
| **EPISTEMIC** | INFERRED |
| **EVIDENCE** | DI-EVID-0035C1-BLOCK-001 |

## DI-DEC-EPISODE-V2-001

| Field | Value |
|-------|-------|
| **TITLE** | Episode-based future driving score (DI-EV-0034F) |
| **ERA** | 2026-09 canonical design |
| **STATUS** | PROPOSED |
| **PROBLEM** | Point-pair HF counting brittle under sparse cadence |
| **ALTERNATIVES** | Tune thresholds only; ignore sparse HF |
| **DECISION** | Driving Episodes with reconstruction vs attribution confidence layers |
| **RATIONALE** | RD003/RD004 evidence supports gap-aware reconstruction |
| **TRADE-OFFS** | Large implementation; not deployed |
| **CONSEQUENCES** | Production still uses Impact V1 scorer |
| **IMPLEMENTATION** | `driving-intelligence-v2-canonical-design.ts` (design artifact only) |
| **GRAPH NODES** | DI-DEC-EPISODE-V2-001 |
| **EPISTEMIC** | INFERRED |
| **EVIDENCE** | DI-EVID-0034F-DESIGN-001 |

## DI-DEC-PROD-DET-UNCHANGED-001

| Field | Value |
|-------|-------|
| **TITLE** | Production HF detectors unchanged after RD003 cadence proof |
| **ERA** | RD003 closeout (2026-09-03) |
| **STATUS** | VALIDATED |
| **PROBLEM** | RD003 proved 1s≠1Hz; production assumes ~1Hz |
| **ALTERNATIVES** | Immediate threshold retune; disable HF detectors |
| **DECISION** | Document semantic debt; defer change until Episode V2 or GT-validated replacement |
| **RATIONALE** | Threshold tweak without GT risks false positives/negatives |
| **CONSEQUENCES** | `DI-CONTRA-HF-1HZ-001` remains active |
| **IMPLEMENTATION** | No production detector code change |
| **GRAPH NODES** | DI-ALGO-HF-ACCEL-001, DI-GAP-HF-CADENCE-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-RD003-CADENCE-001 |

## DI-DEC-PROVIDER-TS-001

| Field | Value |
|-------|-------|
| **TITLE** | providerTimestamp is physical event time authority |
| **ERA** | RD003 signal quality (DI-EV-0034E) |
| **STATUS** | VALIDATED |
| **PROBLEM** | synqReceivedAt proposed as alignment clock |
| **DECISION** | All reconstruction anchors on providerTimestamp with stale-hold awareness |
| **RATIONALE** | Ingress timing unsupported for GT (`INGRESS_TIME_DIAGNOSTIC_SUPPORTED_CLIPS=0`) |
| **CONSEQUENCES** | Alignment workbench multi-clock model |
| **GRAPH NODES** | DI-SIG-HF-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-RD003-CADENCE-001 |

## DI-DEC-CANARY-FAIL-CLOSED-001

| Field | Value |
|-------|-------|
| **TITLE** | HF V2 canary fails closed when allowlist empty |
| **ERA** | C.1a (DI-EV-0035C.1a) |
| **STATUS** | VALIDATED |
| **PROBLEM** | Canary could fail-open without scoped vehicle |
| **DECISION** | Empty allowlist → LEGACY policy; no unscoped V2 activation |
| **RATIONALE** | Prevent accidental fleet-wide experimental HF |
| **CONSEQUENCES** | Production safe with CODE_DEPLOYED + FEATURE_OFF |
| **GRAPH NODES** | DI-POL-HF-RECOVERY-V2-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-0035C1-BLOCK-001 |

## DI-DEC-OPERATOR-CANARY-001

| Field | Value |
|-------|-------|
| **TITLE** | Operator selects canary vehicle at runtime |
| **ERA** | C.1b (DI-EV-0035C.1b) |
| **STATUS** | VALIDATED |
| **PROBLEM** | Hardcoded KS MX 2024 / token 187336 |
| **DECISION** | Any eligible connected vehicle; operator pre-run selection contract |
| **RATIONALE** | Scientific comparability without fixed production vehicle assumption |
| **CONSEQUENCES** | KS MX 2024 is example evidence only |
| **GRAPH NODES** | DI-SVC-RC-RUNNER-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-0035C1-BLOCK-001 |

## DI-DEC-PHASE-BOUNDARY-001

| Field | Value |
|-------|-------|
| **TITLE** | Calibration phase changes at safe cycle boundaries |
| **ERA** | C.1c–d |
| **STATUS** | VALIDATED |
| **PROBLEM** | Mid-cycle phase switch causes race and invalid stats |
| **DECISION** | Phase activation at boundary; REQUESTED vs EFFECTIVE semantics |
| **RATIONALE** | Control-plane must not race data-plane acquisition |
| **CONSEQUENCES** | `requestHfCalibrationPhaseAtomic()` in C.1e |
| **GRAPH NODES** | DI-POL-HF-BLOCK-POLL-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-0035C1-BLOCK-001 |

## DI-DEC-TRANSITION-EXCLUDE-001

| Field | Value |
|-------|-------|
| **TITLE** | Transition windows excluded from primary cadence statistics |
| **ERA** | C.1e |
| **STATUS** | VALIDATED |
| **PROBLEM** | Phase transitions contaminated 10/20/30/60 comparison |
| **DECISION** | Exclude TRANSITION + RECOVERY_SWEEP from primary stats |
| **RATIONALE** | Pure cadence phases require clean measurement windows |
| **CONSEQUENCES** | FAST_LOOP + PHASE_NATIVE primary statistics |
| **GRAPH NODES** | DI-POL-HF-BLOCK-POLL-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-0035C1-BLOCK-001 |

## DI-DEC-DEPLOY-DISABLED-001

| Field | Value |
|-------|-------|
| **TITLE** | Deploy recovery code with features disabled |
| **ERA** | PR #1533 (2026-09-05) |
| **STATUS** | VALIDATED |
| **PROBLEM** | Ship C.1e hardening without altering production HF |
| **DECISION** | Merge to main; keep `HF_RECOVERY_POLICY_V2_ENABLED=false`; empty canary |
| **RATIONALE** | Infrastructure ready; zero production behavior change |
| **CONSEQUENCES** | CODE_DEPLOYED=YES; FEATURE_ENABLED=NO; LEGACY authority |
| **GRAPH NODES** | DI-FLAG-HF-RECOVERY-V2-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-PR-1533-001 |

## DI-DEC-NATIVE-LTE-001

| Field | Value |
|-------|-------|
| **TITLE** | Native DIMO events policy authority for LTE_R1 short misuse |
| **ERA** | Phase 2 + RD002/003 + code reframing |
| **STATUS** | VALIDATED |
| **PROBLEM** | Sparse HF cannot assert short-lived misuse from point-pair |
| **DECISION** | HF pass = Trip Signal Summary; native events = misuse authority **by architecture** |
| **RATIONALE** | Sparse/variable HF on LTE_R1 (separated metrics in `CADENCE_DENSITY.md`); provider-classified short events when available |
| **CONSEQUENCES** | event-context enrichment on native anchors; RD002 C63 had native events NOT_OBSERVED |
| **GRAPH NODES** | DI-SIG-NATIVE-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-NATIVE-EVENTS-001 |

## DI-DEC-ALIGN-HARD-BOUNDS-001

| Field | Value |
|-------|-------|
| **TITLE** | Reject alignments that violate hard temporal/physical bounds |
| **ERA** | RD003/RD004 alignment chain |
| **STATUS** | VALIDATED |
| **PROBLEM** | Low MAE fits that are physically implausible |
| **DECISION** | Hard bounds gate; MAE alone insufficient for GT claims |
| **RATIONALE** | RD004-A.2; RD003 clock-prior falsification |
| **CONSEQUENCES** | GROUND_TRUTH_VALIDATED=NO until independent holdout passes |
| **GRAPH NODES** | DI-CONTRA-HF-1HZ-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-RD004-A-001 |

## DI-DEC-R1-TEMPORAL-CONTAINMENT-001

| Field | Value |
|-------|-------|
| **TITLE** | Minimal reversible R1 temporal-safety containment (EXP-021 C0.3) |
| **ERA** | EXP-021 C0 → C0.2 audits; C0.3 implementation (2026-09-24, draft PR #1755) |
| **STATUS** | VALIDATED |
| **PROBLEM** | R1 historical OBD records (grid-labelled, misdated, absolute offset P50 14 s / P90 45 s) produced unsupported point-in-time claims (FULL_BRAKING 0/5 supported; ENGINE_SHUTDOWN 0/6 sustained) feeding counters, brake wear, impact and SEVERE misuse |
| **DECISION** | Identify R1 from `DimoVehicle.rawJson` (serial `R1-`), never `hardwareType`; suppress future R1 FULL_BRAKING / POSSIBLE_IMPACT / ENGINE_SHUTDOWN_WHILE_DRIVING; contain existing rows at read/consumer boundaries; tag R1 OBD-derived misuse evidence and cap it (cannot establish or upgrade SEVERE+; REVIEW_REQUIRED preserved); withhold anchor-relative context values in presentation |
| **RATIONALE** | Smallest reversible change; no data rewrite; fingerprints/category gates untouched; fail closed (UNKNOWN not contained; no 2-record ≥3 s shutdown proof) |
| **CONSEQUENCES** | ACTIVE CONTAINMENT, not final source-quality architecture; residual consumers DI-GAP-R1-CONTAINMENT-RESIDUAL-001; wording debt DI-GAP-R1-OVERCLAIM-WORDING-001; OBSERVED_EFFECT UNKNOWN until authorized deploy |
| **GRAPH NODES** | DI-POL-R1-TEMPORAL-CONTAINMENT-001, DI-INV-R1-OBD-NO-POINT-CLAIM-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-EXP021-C03-001 |

## DI-DEC-V0-SHADOW-PURE-CORE-001

| Field | Value |
|-------|-------|
| **TITLE** | DI V0 shadow pure core (EXP-021 C1D.5 S0/S1) |
| **ERA** | EXP-021 C1D architecture freeze → implementation |
| **STATUS** | PROPOSED |
| **PROBLEM** | Need deterministic, side-effect-free kinematic evaluation aligned to C1D.3 before shadow worker/persistence |
| **DECISION** | Add isolated `driving-intelligence/core` pure library: normalized evidence in, DI V0 interval results out; no DB/queue/DIMO/runtime flags; L3 centred-path estimator frozen at `DI_KINEMATIC_ESTIMATE_V0_1`; calibration `CALIBRATION_UNSET_V0` injected only |
| **RATIONALE** | Preserves legacy zero-impact until shadow slice; enables replay/golden tests; separates structural contract from calibration |
| **CONSEQUENCES** | No production behavior change; no runtime caller in S1; S2+ may persist/enqueue behind flags |
| **GRAPH NODES** | DI-DEC-V0-SHADOW-PURE-CORE-001, DI-SVC-V0-SHADOW-CORE-001 |
| **EPISTEMIC** | INFERRED → CONFIRMED after unit tests |
| **EVIDENCE** | `evidence/EXP_021_C1D5_V0_PURE_CORE_2026-09-26.md` |
| **BOUNDARY** | Consulted: DIMO (no provider category yet), ATE/TDL/VDC (read-only semantics only) — no cross-module code change |

## DI-DEC-V0-POSITION-ACQ-001

| Field | Value |
|-------|-------|
| **TITLE** | DI V0 S3A primary position acquisition + normalization (EXP-021 C1D.7) |
| **ERA** | EXP-021 C1D implementation (S3A after S1/S2) |
| **STATUS** | PROPOSED |
| **PROBLEM** | S1 consumes normalized position evidence and S2 keys runs by `inputEvidenceVersion`, but no slice acquired or normalized provider positions with explicit availability and temporal semantics |
| **DECISION** | Dormant library over the shared DIMO transport: one `signals(interval:"1s")` location query per `[from, to)` window; row `timestamp` treated as query-bucket label only (BUCKET_BOUNDED, never EXACT_PROVEN); PRESENT / SIGNAL_NULL / ROW_ABSENT distinct with no fill/interpolation/snapping; malformed coordinates stay PRESENT with coordinates withheld; conflicting duplicates withheld; source family from canonical DIMO-identity resolver; deterministic SHA-256 snapshot identity excluding wall-clock/tenant/secrets |
| **ALTERNATIVES** | `agg: RAND` (production route-enrichment precedent) rejected — non-deterministic snapshot identity; `FIRST`/`LAST` deferred to S3B calibration; reusing `DimoSegmentsService.fetchHighFrequency` rejected — no location field, implicit window semantics |
| **RATIONALE** | Makes acquisition semantics testable and replayable before any worker; preserves DIMO Integration ownership of transport/auth/budget |
| **CONSEQUENCES** | No production behavior change; S3B must wire caller + persistence behind flags with validated org/vehicle/token context; `agg: AVG` unchanged (C1G: 26,629/26,629 coordinate identity, 0 m); DI-GAP-S3A-AGG-001 **PARTIALLY_CLOSED**; provider historical mutability documented — live re-query is new acquisition; replay requires pinned `DI_NORMALIZED_INPUT_IDENTITY` |
| **GRAPH NODES** | DI-DEC-V0-POSITION-ACQ-001, DI-SVC-V0-POSITION-ACQ-001 |
| **EPISTEMIC** | CONFIRMED (code/tests/C1G coordinate audit); residual AVG midpoint theory if differing multi-sample coordinates appear |
| **EVIDENCE** | DI-EVID-EXP021-C1D7-001, DI-TEST-V0-POSITION-ACQ-001 |
| **BOUNDARY** | Consulted: DIMO Integration (transport reused, call-site audit), R1 temporal containment resolver (consumed, unchanged) — no cross-module code change |

## DI-DEC-V0-S3B-R1-NATIVE-EVIDENCE-001

| Field | Value |
|-------|-------|
| **TITLE** | DI V0 S3B R1 historical OBD + native event evidence adapters (EXP-021 C1D.8) |
| **ERA** | EXP-021 C1D implementation (S3B after S3A) |
| **STATUS** | PROPOSED |
| **PROBLEM** | S1 can relate R1 OBD and native events but no library acquires/normalizes those channels with explicit temporal semantics, availability, calibration ceilings, and snapshot identity |
| **DECISION** | Two dormant adapters: (A) R1 HF OBD subset on 1 s grid, `INTERVAL_ONLY`, per-signal VALUE_PRESENT/SIGNAL_NULL/ROW_ABSENT, `RUPTELA_R1` only, no fixed timing offsets; (B) native events from ingested `driving_events`-shaped records, `NATIVE_EVENT_OBSERVATION`, default `UNCALIBRATED` max claim `L1`, `NO_EVENT` when empty. Separate provenance types (`R1ObdEvidence` vs `NativeEventEvidence`). Combined input identity helper for future S2 pinning. |
| **ALTERNATIVES** | Merging OBD + native into one normalized union rejected — erases provenance; using R1 OBD as continuous speed authority rejected — contradicts C0.3/C1F findings |
| **RATIONALE** | Evidence-only slice; preserves S3A→S1 L3 authority; enables deterministic replay before any worker |
| **CONSEQUENCES** | No production behavior change; S4 must wire caller + pin snapshots; native fusion remains NEEDS_VALIDATION; accel/braking production detectors remain NOT_SAFE |
| **GRAPH NODES** | DI-DEC-V0-S3B-R1-NATIVE-EVIDENCE-001, DI-SVC-V0-R1-OBD-ACQ-001, DI-SVC-V0-NATIVE-EVENT-EVIDENCE-001 |
| **EPISTEMIC** | CONFIRMED (unit tests); native accuracy on WOB not validated (0 events) |
| **EVIDENCE** | DI-EVID-EXP021-C1D8-001 |
| **BOUNDARY** | Consulted: DIMO Integration (transport), dimo-native-driving-events mapper (event type keys), R1 temporal containment — no production read-path change |
| **AMENDED BY** | DI-DEC-V0-S3B-CONTRACT-HARDENING-001 (C1D.8B, 2026-09-27) — caller-supplied native `calibrationState` default and optional-channel combined identity above are the historical C1D.8 contract, now superseded in part |

## DI-DEC-V0-S3B-CONTRACT-HARDENING-001

| Field | Value |
|-------|-------|
| **TITLE** | DI V0 S3B contract hardening — red-team closure (EXP-021 C1D.8B) |
| **ERA** | EXP-021 C1D implementation (S3B closure, pre-merge) |
| **STATUS** | PROPOSED |
| **PROBLEM** | C1D.8A red-team: caller could set native `VALIDATED` → L2; native records not bound to org/vehicle/trip/window; duplicate eventIds double-counted; `[]` indistinguishable from read failure; combined identity could not distinguish omitted/empty/failed channels; R1 duplicate buckets first-row-wins; `isIgnitionOn` AVG semantics unverified |
| **DECISION** | (1) Native calibration design A: no calibration field on input; adapter constant `UNCALIBRATED`/L1; future trusted authority = separate reviewed contract. (2) Expected context passed separately; per-record org/vehicle/trip/provider/family/window check; mismatches `CONTEXT_MISMATCH` L0 audited in snapshot; nullable relations unprovable → mismatch. (3) eventId dedup: identical collapse, any field difference → `CONFLICTING_DUPLICATE` L0 excluded + preserved; order-independent. (4) Source envelope; `EVENT_SOURCE_FAILURE` ≠ `NO_EVENT`; `readDiV0NativeEventSource` S4 boundary. (5) Combined identity V0_2 with explicit per-channel state, all channels required. (6) R1 per-signal duplicate merge, `CONFLICTING_DUPLICATE` withheld, no averaging/majority. (7) `isIgnitionOn` removed from S3B query (V0_2); field authority matrix all `REPO_CONTRACT_ONLY` |
| **ALTERNATIVES** | Design B (typed trusted-authority object) rejected for now — no runtime authority exists; silently dropping foreign records rejected — loses audit; first-row-wins / averaging / majority for duplicates rejected — invents values; keeping ignition with repo-contract label rejected — S3B would carry an unsupported semantic |
| **RATIONALE** | Fail-closed evidence contracts before any S4 caller; smallest safe design |
| **CONSEQUENCES** | Snapshot versions bumped (native V0_2, R1 V0_2, combined V0_2); S4 must supply expected context + source envelope and pin all three channels with state; native fusion remains NEEDS_VALIDATION; ignition absent from S3B until provider-schema verified |
| **GRAPH NODES** | DI-DEC-V0-S3B-CONTRACT-HARDENING-001, DI-SVC-V0-R1-OBD-ACQ-001, DI-SVC-V0-NATIVE-EVENT-EVIDENCE-001, DI-GAP-S3B-R1-FIELD-AUTHORITY-001 |
| **EPISTEMIC** | CONFIRMED (unit + golden-bound tests); field semantics INFERRED (repo contract only) |
| **EVIDENCE** | DI-EVID-EXP021-C1D8B-001 |
| **BOUNDARY** | Consulted: DIMO Integration (query ownership; legacy HF/trip-detection ignition queries unchanged), `DrivingEvent` persistence schema (read-only inspection) — no cross-module code change |
| **AMENDED BY** | DI-DEC-V0-S3B-R1-V03-FIELD-AUTHORITY-001 (C1D.9A, 2026-09-27) — item (7) R1 query V0_2 / all `REPO_CONTRACT_ONLY` is the historical C1D.8B contract; superseded by query V0_3 (gear removed, five fields provider-verified) |

## DI-DEC-V0-S3B-R1-V03-FIELD-AUTHORITY-001

| Field | Value |
|-------|-------|
| **TITLE** | DI V0 S3B R1 query V0_3 — provider field authority + currentGear removal (EXP-021 C1D.9 / C1D.9A) |
| **ERA** | EXP-021 C1D implementation (post-S3B merge, pre-S4) |
| **STATUS** | PROPOSED |
| **PROBLEM** | V0_2 queried six fields, all `REPO_CONTRACT_ONLY` (DI-GAP-S3B-R1-FIELD-AUTHORITY-001), blocking provider-backed S4 R1 activation. C1D.9 read-only audit found `powertrainTransmissionCurrentGear` is a signed int8 gear index exposed as `Float`; `agg: AVG` can synthesize non-existent (3.5) or false-Neutral (0 from −1/1) gears; the normalizer passed fractional values through; 0/4 R1 devices expose the field |
| **DECISION** | (1) Remove `powertrainTransmissionCurrentGear` from the query and normalizer; drop the unused `gear` field from S1 `NormalizedR1ObdObservation`. (2) Keep `agg: AVG` for speed, rpm, throttle, load, ECT (interval mean of continuous quantities). (3) Mark those five `PROVIDER_SCHEMA_VERIFIED` with documented unit + value scale (km/h, rpm, percent 0..100, percent 0..100, °C); no rescaling; no range thresholds. (4) Bump query/adapter/R1 snapshot to V0_3; list V0_2 as superseded; combined input identity stays V0_2. (5) Five-field allowlist is architectural authority for future S4; gear + isIgnitionOn blocked. (6) Temporal authority unchanged: INTERVAL_ONLY, never overrides L3 |
| **ALTERNATIVES** | Gear with FIRST/LAST + integer guard — rejected now (no R1 device exposes gear; no evidence to validate); keep gear as `REPO_CONTRACT_ONLY` — rejected (unsafe aggregation would enter evidence identity); runtime allowlist over V0_2 query — rejected (query would still request unsafe AVG gear); bump combined identity — rejected (it already hashes each pinned channel version) |
| **RATIONALE** | Smallest correction that makes every queried field provider-verified and semantically valid under its aggregation |
| **CONSEQUENCES** | R1 evidence identities change (V0_3); gear absent from S3B until a categorical acquisition strategy + real R1 evidence exist; S4 R1 five-field gate READY_FOR_SHADOW_ORCHESTRATION_DESIGN (no activation) |
| **GRAPH NODES** | DI-DEC-V0-S3B-R1-V03-FIELD-AUTHORITY-001, DI-SVC-V0-R1-OBD-ACQ-001, DI-GAP-S3B-R1-FIELD-AUTHORITY-001, DI-EVID-EXP021-C1D9-001 |
| **EPISTEMIC** | CONFIRMED (provider schema, official spec, read-only R1 responses, unit tests); multi-sample 1 s AVG behaviour UNKNOWN (not observed) |
| **EVIDENCE** | DI-EVID-EXP021-C1D9-001 |
| **BOUNDARY** | Consulted: DIMO Integration (provider telemetry schema facts recorded cross-module; shared transport/auth untouched; legacy HF/trip-detection queries unchanged) — no DIMO Integration code change |

## DI-DEC-V0-S4A-CONTRACT-001

| Field | Value |
|-------|-------|
| **TITLE** | DI V0 S4A orchestration contract — work items, identity, fencing, channel outcomes, evidence pinning (EXP-021 C1D.10A) |
| **ERA** | EXP-021 C1D design (post-S3B V0_3 merge, pre-S4 implementation) |
| **STATUS** | PROPOSED |
| **PROBLEM** | C1D.10 S4 design review: NEEDS_CLOSURE with 4 P1 (stale S2 migration authority; logical identity/idempotency/fencing under two replicas; native NO_EVENT unprovable; settlement delay based on a 5-row sample) and 11 P2 |
| **DECISION** | (1) DB work-item row with `lease_epoch` fencing is the execution authority; BullMQ only a wake-up hint; S2 idempotency the final guard. (2) Logical key (org, trip, boundary fingerprint, pipeline version key, run purpose, discriminator) + active-PRIMARY partial unique; purposes PRIMARY / RECALIBRATION_REPLAY / REACQUISITION. (3) 7 states / 11 transitions; completion in one fenced transaction (row lock, epoch, DB-clock expiry, fingerprint re-check, S2 `ON CONFLICT DO NOTHING`, rowcount 1). (4) Pipeline version key over 20 keys incl. `calibrationBundleHash` + `channelEnablement`; `PIPELINE_VERSION_MATCH` on claim/takeover/complete. (5) Boundary fingerprint V1 over 9 boundary fields. (6) 24 h settlement quiet anchor `max(endTime, createdAt, latest applied repair)` + 10 d drift horizon with supersession. (7) Per-channel outcomes; POSITION required; R1/NATIVE optional; native fails closed (READY_* requires an ingest attestation; unreachable in channel policy V1); combined input identity V0_3. (8) Content-addressed Postgres evidence pinning; replay only from pins. (9) Dormant-safe migration rules; tenant scope-guard triggers + composite FKs; S2 guards |
| **ALTERNATIVES** | BullMQ jobId as idempotency (rejected: Redis is not durable authority, jobs duplicate); advisory locks (rejected: session-bound, invisible after crash); 16 h fixed delay after endTime (rejected: 1.7 % trips still mutate); legacy `behaviorEnrichedAt` as native readiness (rejected: set after swallowed failures); live DIMO re-query as replay (rejected: non-reproducible); object-store pins (rejected now: `STORAGE_DRIVER=local`, node-local); Postgres enums (rejected: ALTER TYPE); RESTRICT FKs (rejected: would fail canonical deletes) |
| **RATIONALE** | Smallest contract that makes stale writes and double PRIMARY completion impossible by DB construction, fails closed where evidence is unprovable, and can be deployed dormant because merge = Production migration |
| **CONSEQUENCES** | S4A may implement schema + repository + builders + race tests only; tiny activation additionally needs the S4C DIMO priority wrapper, S4D deserializer and a retention governance note; native stays NOT_READY until DI-GAP-S4-NATIVE-READINESS-001 closes |
| **GRAPH NODES** | DI-DEC-V0-S4A-CONTRACT-001, DI-SVC-V0-SHADOW-CORE-001, DI-SVC-V0-NATIVE-EVENT-EVIDENCE-001, DI-CONTRA-S2-PROD-MIGRATION-001, DI-GAP-S4-NATIVE-READINESS-001, DI-GAP-S4-REPLAY-DESERIALIZER-001, DI-GAP-S4-SHADOW-DELETION-AUDIT-001, DI-GAP-S4-LOCATION-RETENTION-001, DI-GAP-S2-IN-TX-CREATE-RACE-001 |
| **EPISTEMIC** | CONFIRMED for Production facts and code paths (read-only); contract properties validated by the machine model (`validate-s4a-contract.sh`), not yet by Postgres; snapshot size INFERRED |
| **EVIDENCE** | DI-EVID-EXP021-C1D10A-001 |
| **BOUNDARY** | Consulted: DIMO Integration (request category/priority ALS context; native ingest failure swallowing recorded, not changed), Trips (mutation paths, `trip_repairs`; read-only) — no code change in either module |
| **AMENDED BY** | DI-DEC-V0-S4A-CONTRACT-V2-001 (C1D.10C, 2026-09-27) — item (3) "7 states / 11 transitions", the S2 guard via `inputEvidenceVersion` = combined identity only, the tenant scope via `vehicle_trips.organization_id` (NONEXISTENT column) and the machine contract `s4a-contract.v1.json` are the historical C1D.10A contract; superseded by contract v2 (13 transitions, S2 execution identity, TRIP_VEHICLE_ORGANIZATION tenancy, control plane) |

## DI-DEC-V0-S4A-CONTRACT-V2-001

| Field | Value |
|-------|-------|
| **TITLE** | DI V0 S4A contract v2 — S2 execution identity, trip→vehicle tenancy, control plane, enforcing validator (EXP-021 C1D.10C) |
| **ERA** | EXP-021 C1D design (post-C1D.10B red-team, pre-S4A implementation) |
| **STATUS** | PROPOSED |
| **PROBLEM** | C1D.10B read-only red-team of C1D.10A: P1-A S2 execution identity under-bound (two different executions could alias one S2 idempotency key); P1-B machine contract + validator did not enforce (8/13 invalid mutations accepted); P1-C tenancy guard referenced nonexistent `vehicle_trips.organization_id`; P1-D control plane (flags, allowlists, kill switch, retirement) incomplete |
| **DECISION** | (1) `DI_V0_S4_EXECUTION_IDENTITY_V1` = sha256 over org, vehicle, trip, boundary fingerprint, pipeline version key, calibration bundle hash, orchestration contract version, run purpose, discriminator, pinned snapshot hash, combined input identity → written as S2 `inputEvidenceVersion`; S2 key function unchanged; collision with different identity → FAIL_CLOSED `S2_EXECUTION_IDENTITY_MISMATCH`, same identity → reuse only. (2) Tenancy TRIP_VEHICLE_ORGANIZATION: scope guard `vehicle_trips JOIN vehicles` on work items, evidence snapshots and shadow runs. (3) Control plane: flags MASTER/DISCOVERY/WORKER/POSITION/R1/NATIVE default OFF, position mandatory; org + vehicle allowlists EMPTY=NONE, malformed=NONE, intersection; DB kill row `di_v0_s4_control` (missing/read error = KILLED, disable-only); pipeline registry `di_v0_s4_pipeline_versions` ACTIVE/RETIRED with retirement reaper. (4) 13 transitions (T12 retire, T13 holder supersede); every holder write requires epoch match + DB-clock lease not expired; lease 300 s, heartbeat 60 s, work budget 240 s, absolute ceiling 900 s from `lease_acquired_at`. (5) Replay never SKIPPED — ineligible replay fails `REPLAY_INELIGIBLE`. (6) Settlement time authority UTC (`AT TIME ZONE 'UTC'`), unrecorded boundary mutations detected via fingerprint difference. (7) Validator enforces every rule; red-team suite 47 negative / 21 positive cases |
| **ALTERNATIVES** | Change S2 key function (rejected: S2 runtime change, merged schema); denormalize `organization_id` onto `vehicle_trips` (rejected: Trips-owned schema change); env-only kill switch (rejected: needs redeploy, not disable-only); allowlist EMPTY=ALL (rejected: fail-open); lease renewal without ceiling (rejected: unbounded holder) |
| **RATIONALE** | Close every C1D.10B P1 by construction in the contract and prove it with an enforcing validator before any S4A code exists |
| **CONSEQUENCES** | Contract version `DI_V0_S4A_CONTRACT_V2`, orchestration `DI_V0_S4_ORCHESTRATION_CONTRACT_V2`, identity field `channelEvidenceHash`; S4A adds 4 dormant tables (work items, evidence snapshots, control, pipeline versions); tiny activation still blocked by DI-GAP-S4-REPLAY-DESERIALIZER-001 and DI-GAP-S4-PROVIDER-BACKPRESSURE-001; native NOT_READY |
| **GRAPH NODES** | DI-DEC-V0-S4A-CONTRACT-V2-001, DI-DEC-V0-S4A-CONTRACT-001, DI-GAP-S4-PROVIDER-BACKPRESSURE-001, DI-GAP-S4-REPLAY-DESERIALIZER-001, DI-GAP-S4-NATIVE-READINESS-001, DI-CONTRA-S4A-TENANCY-SCHEMA-001 |
| **EPISTEMIC** | CONFIRMED for Production facts (read-only: S2 empty, DB TimeZone Etc/UTC, ID formats, `vehicle_trips` columns); contract properties validated by machine model + red-team suite, not yet by Postgres |
| **EVIDENCE** | DI-EVID-EXP021-C1D10C-001 |
| **BOUNDARY** | Consulted: DIMO Integration (provider budget authority `DimoProviderBudgetService` / `DimoRequestExecutor` named for S4C; no change), Trips (`vehicle_trips` / `trip_repairs` schema read-only) — no code change in either module |

## DI-DEC-V0-S4A-IMPL-001

| Field | Value |
|-------|-------|
| **TITLE** | DI V0 S4A dormant execution foundation — implementation of contract v2 (EXP-021 S4A) |
| **ERA** | EXP-021 S4A (CONTROLLED_IMPLEMENTATION, post-C1D.10I merge of PR #1810) |
| **STATUS** | PROPOSED |
| **PROBLEM** | Contract `DI_V0_S4A_CONTRACT_V2` was frozen and machine-validated but had no schema, repository, or Postgres-level proof of fencing, kill serialization, tenancy and migration safety |
| **DECISION** | (1) One migration `20260927200000_di_v0_s4a_dormant_foundation`: explicit `BEGIN/COMMIT`, `lock_timeout 5s` / `statement_timeout 60s`, `SHARE ROW EXCLUSIVE` on S2 tables, then a `DO` block refusing non-empty S2; 4 TEXT+CHECK tables; scope-guard triggers on S4 and S2 tables; composite `(id, organization_id, trip_id)` FKs; immutability triggers; no seed row (missing kill row = KILLED). (2) `DiV0S4WorkItemRepository` — one method per transition T01–T13, raw SQL only, no Prisma delegates, no generic status setter, READ COMMITTED, lock order work item → control row `FOR UPDATE` → registry `FOR SHARE`, all lease arithmetic on `clock_timestamp()`. (3) T06 fenced S2: `INSERT … ON CONFLICT DO NOTHING` then full execution-identity compare (fail closed), S2 key function unchanged. (4) Pure control plane (env snapshot injected, never read). (5) Fail-closed choices stricter than the contract (T01 COMPLETED+end_time, replay fingerprint match, T05 RUNNABLE, T06 re-hash/re-verify, runtime manifest binding, reason/trip consistency). (6) Channel policy V1 source-family rule enforced. (7) Real multi-connection Postgres tests with lock-queue barriers (no sleeps) |
| **ALTERNATIVES** | Prisma model delegates (rejected: cannot express fenced predicates + lock order atomically, invites generic status writes); advisory locks for kill serialization (rejected: contract binds the kill proof to the DB control row); per-transaction `SERIALIZABLE` (rejected: retry storms, contract specifies row locks); seeding a `NOT_KILLED` control row in the migration (rejected: dormant by construction, missing = KILLED); `ON DELETE RESTRICT` to canonical (rejected by `migrationRules`); sleep-based race tests (rejected: nondeterministic) |
| **RATIONALE** | Prove every contract guarantee (no stale write, ≤1 active PRIMARY, kill-before-fence, tenant isolation, empty-S2 precondition, no canonical rewrite) in real PostgreSQL while keeping zero runtime reachability |
| **CONSEQUENCES** | Merge + ordinary deploy applies the migration to Production (S2 empty at 2026-09-27T21:52Z). Tables stay empty and unreachable; S4B/S4C (discovery, acquisition, workers) remain unauthorized. New contradictions DI-CONTRA-S4A-T13-SUCCESSOR-WRITE-BINDING-001, DI-CONTRA-S4A-CONTAINER-VERSION-NAMING-001, DI-CONTRA-S4A-ON-UPDATE-CASCADE-IMMUTABILITY-001; new gaps DI-GAP-S4A-BOUNDARY-REVERT-SUCCESSOR-001, DI-GAP-S4A-POSTGRES-CI-WIRING-001, DI-GAP-S4A-CONTROL-ROW-SERIALIZATION-001 |
| **GRAPH NODES** | DI-DEC-V0-S4A-IMPL-001, DI-DEC-V0-S4A-CONTRACT-V2-001, DI-SVC-V0-S4A-FOUNDATION-001, DI-EVID-EXP021-S4A-IMPL-001 |
| **EPISTEMIC** | CONFIRMED for code/test behavior on local PostgreSQL 16 and the read-only Production baseline; Production migration effect not yet observed |
| **EVIDENCE** | DI-EVID-EXP021-S4A-IMPL-001 |
| **BOUNDARY** | Consulted: Trips (`vehicle_trips` read-only; FKs `ON DELETE CASCADE` only; no trigger/index/constraint on canonical tables), DIMO Integration (no call, no change), S2 shadow persistence (guards added to S2 tables; S2 library unchanged) |

## DI-DEC-DS4-AUTHORITY-001

| Field | Value |
|-------|-------|
| **TITLE** | DS4 Motion Core as single authoritative driving-behaviour assessment (legacy HF/Impact V1 retirement) |
| **ERA** | DS4 authority migration (2026-10-28, PR-0 governance) |
| **STATUS** | PROPOSED (owner approval recorded 2026-10-28 in architecture; not activated in runtime) |
| **PROBLEM** | Legacy HF/native enrichment + Impact V1 is authoritative while DS4 motion core is shadow-only; consumers lack quality gates and mix legacy fallbacks (Consumer Audit V1: 4×P1, 4×P2) |
| **ALTERNATIVES** | (1) Permanent dual authority with legacy fallback — **rejected** (owner). (2) DS4 markers only, legacy scoring forever — **rejected**. (3) Incremental shadow compare indefinitely without cutover — **rejected** as end state |
| **DECISION** | DS4 Motion → DS4 Assessment (L2) → Driving Impact V2 (`scoreAuthority=DS4`) → aggregators (DriverScore, Rental, Trip UI, brakes, tires after gates). **No permanent legacy fallback** after cutover. **No parallel authoritative scoring**. **Fail-closed**: insufficient DS4 evidence ⇒ unavailable assessment, never legacy top-up or fabricated zero. OBD misuse remains a **separate channel** from motion scoring (PR-M). Historical rows retain provenance (`LEGACY_HF_V1` label); non-destructive migration only |
| **RATIONALE** | DS4 manoeuvre detector + FSM temporal quality is the engineered replacement for HF point-pair kinematics; shadow production evidence exists on allowlisted fleet; consumer audit proves legacy path is unsafe for authority promotion |
| **TRADE-OFFS** | B1–B9 blockers must close before decommission; fleet-wide admission and Impact V2 weights require Fable review; assessment latency vs legacy enrichment |
| **CONSEQUENCES** | PR-0..PR-10 sequence; Brakes/Rental Driving Analysis/Rental Health → `AUDIT_IN_PROGRESS`; DI design doc + findings register; **no** flag/migration/deploy in PR-0 |
| **GRAPH NODES** | DI-DEC-DS4-AUTHORITY-001, DI-EVID-CONSUMER-AUDIT-V1-001, DI-EVID-DS4-MIGRATION-DESIGN-001 |
| **EPISTEMIC** | CONFIRMED for owner decision and audit counts @ `51adb234…`; DS4 fleet coverage CONFIRMED read-only for allowlisted vehicles; full-fleet readiness INFERRED pending G1–G9 |
| **EVIDENCE** | [`design/DS4_AUTHORITATIVE_ASSESSMENT_MIGRATION.md`](../design/DS4_AUTHORITATIVE_ASSESSMENT_MIGRATION.md) · [`evidence/CONSUMER_AUDIT_V1_FINDINGS_REGISTER.md`](../evidence/CONSUMER_AUDIT_V1_FINDINGS_REGISTER.md) |
| **BOUNDARY** | Trip boundaries unchanged (Trip Detection). Tires productive DS4 input remains gated (Tires authority). ATE enqueue retirement only at PR-10 after gates |

## DI-DEC-DS4-INTENSITY-PERSIST-001

| Field | Value |
|-------|-------|
| **TITLE** | DS4 event intensity persistence via event-row contract V2 (ordinal-only, no bundle bump) |
| **ERA** | DS4 authority migration PR-2 (2026-10-28, isolated Draft PR; shadow persistence only) |
| **STATUS** | PROPOSED (Fable review requested on persistence contract and ordinal-only restriction; not deployed) |
| **PROBLEM** | Blocker B2: detector-computed `meanAccelMps2`, `durationS`, `steps`, `coverageRatio`, `startUncertaintyS`, `endUncertaintyS` were dropped by `mapMotionManoeuvreEventToPersisted`; shadow rows carried boundaries/Δv/quality only, so no downstream assessment could use intensity without re-deriving under B3 bias |
| **ALTERNATIVES** | (1) Bump algorithm bundle version to V5 — **rejected**: bundle is part of the outbox intent key and would re-enqueue every eligible trip (production reprocessing side effect). (2) Persist peak accelerations too — **rejected**: 1 s/2 s peaks are kernel-sensitive artefact amplifiers (B3). (3) Zero/null-fill missing constituents — **rejected**: fabricates values; readers must distinguish unreliable from zero. (4) Expose intensity on trip-map DTO now — **deferred**: no consumer may bind before Fable review |
| **DECISION** | Add optional `intensity` block to persisted event rows, declared by `contract.persistence.eventRowContract = DI_V0_MOTION_CORE_EVENT_ROW_V2_INTENSITY_ORDINAL_V1` and mirrored in `summary_json.eventRowContract`. Payloads without `contract.persistence` resolve as legacy V1 (`intensity=null`). `intensity` is omitted when any constituent is non-finite/negative/non-integer/empty. `intensityUsagePolicy = ORDINAL_ONLY_NOT_PHYSICALLY_VALIDATED`; `peakAccel1sMps2`/`peakAccel2sMps2` listed as excluded. Bundle versions V1–V4, intent keys, kinematics, FSM, plausibility, counts, trip-map DTO and Trip UI unchanged |
| **RATIONALE** | Persist what the detector already computes, versioned independently of the algorithm stack, so later PRs (assessment L2, Impact V2) can consume intensity from persisted evidence after review — without replay, backfill or reprocessing |
| **TRADE-OFFS** | Historical rows remain V1 until naturally reprocessed by a future bundle change; uncertainty labels persisted as free text pending structured contract; motion-core Postgres specs still not wired into CI |
| **CONSEQUENCES** | New runs after deploy carry V2 rows; `TIRE-GAP-DS4-PERSISTED-INTENSITY-FIELDS-001` data precondition closes for future rows only (tire consumer still forbidden to bind pre-review); PR-3/PR-4 must read `intensity` only via `readPersistedMotionEventIntensityForPayload` (fail closed for V1/UNKNOWN); `events[].flags` opaque — no parsing for accel/peaks |
| **GRAPH NODES** | DI-DEC-DS4-INTENSITY-PERSIST-001, DI-EVID-DS4-INTENSITY-PERSISTENCE-PR2-001, DI-DEC-DS4-AUTHORITY-001 |
| **EPISTEMIC** | CONFIRMED for code/test behaviour (unit 21/21, motion-core suite 72/72, local PostgreSQL 16 round-trip 2/2, tsc + nest build exit 0); Production effect NOT observed (not deployed) |
| **EVIDENCE** | DI-EVID-DS4-INTENSITY-PERSISTENCE-PR2-001 |
| **BOUNDARY** | Consulted: Tires Health (DS4 shadow adapter consumes trip-map DTO only — unaffected; gap pointer updated), Trips (trip-map read service unchanged), Brakes / Rental Driving Analysis / DriverScore (no consumer change) |

## DI-DEC-RPM-REF-INTEL-001

| Field | Value |
|-------|-------|
| **TITLE** | RPM Reference Intelligence and Driving Intelligence ownership boundaries |
| **ERA** | RPM workstream Phase 5 architecture (2026-10-30, documentation-only) |
| **STATUS** | PROPOSED (owner-approved architecture 2026-10-30; documentation-only; **not** runtime activation) |
| **PROBLEM** | Overlapping RPM surfaces (VSI tier evidence, HF V1A/V1B admission, vehicle idle/max specs, DS4 motion) without a registered boundary risk spec substitution, silent admission changes, and unapproved RPM-derived load/wear/scoring |
| **ALTERNATIVES** | (1) New top-level “RPM Intelligence” subsystem — **rejected** (owner: small reusable component within RPM workstream). (2) Vehicle specs in V1B admission gates — **rejected**. (3) DS4 derives engine load from RPM HF directly — **rejected** without validated model |
| **DECISION** | VSI owns RPM profiles + cadence tier evidence; RPM HF V1A/V1B owns HF observation, temporal processing, admission, and `qualityExposure`; Vehicle Specifications supply optional reference metadata (`idleRpm`/`maxRpm` + provenance) that **never substitutes** missing HF; **RPM Reference Intelligence** (future) combines **admitted** observations with reference metadata under versioned optional metrics; reference metadata **must not** modify V1B admission gates; DS4 remains motion/event authority and may consume reference outputs only via a **future versioned optional interface** with temporal alignment and quality gates; **no** RPM engine-load/wear/driving-impact/driver-scoring without separate validation + owner approval |
| **RATIONALE** | Preserves Phase 4L canary semantics; separates epistemic axes (HF temporal vs reference provenance); aligns with DS4 authority migration and fail-closed culture |
| **TRADE-OFFS** | Reference metrics deferred; future implementation requires additional PRs and flags default OFF |
| **CONSEQUENCES** | ADR is canonical boundary doc; implementation phases P1–P5 documented; consumer binding forbidden until contracts exist |
| **GRAPH NODES** | DI-DEC-RPM-REF-INTEL-001, DI-EVID-RPM-REF-INTEL-ADR-001 |
| **EPISTEMIC** | CONFIRMED for owner-approved architecture text; RPM Reference Intelligence runtime NOT observed |
| **EVIDENCE** | [`design/RPM_REFERENCE_INTELLIGENCE_AND_DI_OWNERSHIP_BOUNDARIES_ADR_2026-10-30.md`](../design/RPM_REFERENCE_INTELLIGENCE_AND_DI_OWNERSHIP_BOUNDARIES_ADR_2026-10-30.md) |
| **BOUNDARY** | Consulted: Vehicle Signal Intelligence (tier evidence ownership), Vehicle Onboarding / Master (spec persistence + provenance), Trip Detection (trip boundaries unchanged) — documentation cross-refs only |
