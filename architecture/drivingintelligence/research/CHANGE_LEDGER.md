# Driving Intelligence — Change Ledger

Granular scientific evolution record for the 2026-08-30 → 2026-09-06 workstream.  
**Not a conventional changelog.** Compressed "8 evolution" summary superseded by per-phase entries below.

**Full DI-EV detail:** [DI_EV_CHRONOLOGY.md](./DI_EV_CHRONOLOGY.md)  
**Narrative:** [WORKSTREAM_HISTORY.md](../WORKSTREAM_HISTORY.md)

---

## Phase 0 — Program launch

| DI-EV | Change | Evidence | Decision | Validation |
|-------|--------|----------|----------|------------|
| 0001 | Master reconstruction plan; gates G1–G6 | Master plan doc | Program authority | CONFIRMED |
| 0002 | Phase 1 forensic audit: post-trip HF, stress=vehicle load, DriverScore misname | Phase 1 audit | — | CONFIRMED_FROM_CODE |

---

## Phase 2 — DIMO signal surface (2026-08-31)

| DI-EV | Change | Key finding | Next step |
|-------|--------|-------------|-----------|
| 0003 | Query surface audit 2A | 41 fields; Q001–Q027 | 2B vehicle matrix |
| 0004 | Four-vehicle capability 2B | Union 33 signals; 15 unused | Schema expansion |
| 0005 | Schema expansion 2C | 117 provider fields | Physics matrix |
| 0006 | Signal value/physics 2D | Tier A = 8 cadence-critical | Redundancy |
| 0007 | Redundancy 2E | 33 canonical keys; episode taxonomy proposal | VCM design |
| 0008 | Capability-first acquisition 2F | T0–T7 tiers; query planner proposal | LTE manifest |
| 0009/0010 | LTE_R1 manifest 2F.1 | Frozen v1.1.0 JSON | Flight Recorder |

---

## Phase 3A — Flight Recorder & RD001 (2026-08-31 → 2026-09-01)

| DI-EV | Change | Key finding | Defect / negative |
|-------|--------|-------------|-------------------|
| 0011/0012 | RC foundation | Module + envelope v1.0.0 | — |
| 0013/0014 | Stationary canary | 52 obs; REFERENCE_DRIVE_READY | Motion unproven |
| 0015 | Evidence governance | Normative ID rules | — |
| 0016–0019 | **RD001** | Late-arrival differential; 151s gap | **VIDEO NOT CAPTURED** |
| 0020 | FAST PRE-ARM/GO | 15s cap; SIGNAL_POINT gate | — |
| 0021 | Watermark remediation | Per-field watermarks; RD001 39-exclusion fixed | DI-DEF-003 FIXED |

---

## Phase 3A.3 — RD002 motion canary (2026-09-02)

| DI-EV | Change | Key finding | Production impact |
|-------|--------|-------------|-------------------|
| 0022 | Production cutover smoke | Deploy `f00a49394` PASS | RC on prod |
| 0023–0026 | **RD002** C63 | **1s ≠ 1Hz**; sealed HF Δt P50 **13.489s**; AGGREGATE_BUCKET_V2 | Detectors unchanged |
| 0026 | C63 differential | Native events NOT_OBSERVED | Per-vehicle |

---

## Phase 3A.3 — RD003 + signal quality (2026-09-02 → 03)

| DI-EV | Change | Key finding | Does NOT prove |
|-------|--------|-------------|----------------|
| 0027–0032 | **RD003** Tiguan | Session `0fa040aa-…`; segmented video GT | Continuous video |
| 0033 | Correlation export | 5010 rows for alignment | GT itself |
| 0034A | Alignment workbench v1.2 | Multi-clock model | Validated GT |
| 0034B | Sparse video GT | 9 clips, 198 obs | GROUND_TRUTH_VALIDATED |
| 0034C | Discovery v1 | SUPERSEDED methodology | — |
| 0034D/D.1/D.2 | Discovery v2 | Joint DP; geometry fix | Global chronology |
| 0034E/E.1 | Signal quality | providerTimestamp authority; RD003 HF **~2.00s** median | Physical 1 Hz ECU |
| 0034F | Episode V2 design | Confidence layers; DEPLOYED=NO | Production scoring |

---

## RD004 — Alignment + late buckets (2026-09-04)

| DI-EV | Change | Key finding | Result |
|-------|--------|-------------|--------|
| 0035A→A.2 | **RD004-A** | H≠provider offset; 38 HF samples | Segment A closed |
| 0035B→B.3 | **RD004-B** early | Claims invalidated; launch gap 35.1s | — |
| 0035B.4 | Exact-window replay | 53 late; 26 watermark-excluded | Root cause proven |
| 0035B.5 | Overlap grid | 8/6 claims too strong | Superseded |
| 0035B.6 | Semantic closeout | Provisional 8s/6s; live calibration contract | → 0035C |

---

## HF Recovery V2 (2026-09-04)

| DI-EV | Change | Implementation | Production HF |
|-------|--------|----------------|---------------|
| 0035C | Recovery V2 runtime | Settlement, overlap, triple watermarks | **UNCHANGED** |

---

## Block polling C.1 — individual (2026-09-04 → 05)

| DI-EV | Change | Detail | Status |
|-------|--------|--------|--------|
| 0035C.1 | Block poll testbed | 30s poll hypothesis; 1s aggregation preserved | NOT_VALIDATED live |
| 0035C.1a | Pre-canary hardening | Fail-closed; bucket-age; stagger | FIXED defects 008–010 |
| 0035C.1b | Dynamic canary | Operator vehicle selection | KS MX = example only |
| 0035C.1c | Multi-cadence design | 10/20/30/60 one drive | NOT executed live |
| 0035C.1d | Phase atomicity | FOR UPDATE; REQUESTED vs EFFECTIVE | 103+ tests |
| 0035C.1e | Pre-live closure | Terminal finalization; real bucket IDs | PR #1533 merged |

**Granular C.1 detail:** [hf-request-cadence/C1_INDIVIDUAL_RETROSPECTIVE.md](./hf-request-cadence/C1_INDIVIDUAL_RETROSPECTIVE.md)

---

## Production deploy (2026-09-05)

| Event | State |
|-------|-------|
| PR #1533 merge | CODE_DEPLOYED=YES |
| REFERENCE_CAPTURE_INFRASTRUCTURE_ENABLED=YES; HF_RECOVERY_V2_FEATURE_ENABLED=NO |
| Live calibration | NOT EXECUTED |
| Authority | LEGACY post-trip HF |

---

## Parallel tracks (not compressed)

| Track | Ledger link |
|-------|-------------|
| V2 durable pipeline | DI-DEC-V2-FLAG-001; flag default off |
| Impact Engine V1 | DI-DEC-STRESS-NOT-DRIVER-001; v1.2.0 |
| Native LTE authority | DI-DEC-NATIVE-LTE-001 |
| High-timeframe analytics | PARTIAL — see `evidence/temporal-analytics/HIGH_TIMEFRAME_WORK.md` |

---

## Authority bootstrap (2026-09-06)

| Event | Detail |
|-------|--------|
| PR #1544 | `architecture/drivingintelligence/` canonical authority |
| Scope | Documentation only; runtime unchanged |

## DI-DEF-019 GATE 1 (2026-09-06)

| Event | Detail |
|-------|--------|
| Live cal blocked | KS MX 2024 — `42P01` on first `switchHfCalibrationPhase(10000)` |
| Fix | `lockSessionRow` → `reference_capture_sessions` + `organization_id` (text IDs) |
| GATE 1 | Real PostgreSQL integration suite — 10 tests PASS |
| Status | `FIXED_CODE_TESTED` after GATE 1; promoted to `FIXED_PRODUCTION_VALIDATED` after GATE 2 |
| Evidence | `evidence/reference-capture/DI_DEF_019_GATE1_POSTGRES_INTEGRATION_2026-09-06.md` |

## DI-DEF-019 GATE 2 (2026-09-06)

| Event | Detail |
|-------|--------|
| Deploy | PR #1550 merged; production SHA `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac` |
| Vehicle | KS MX 2024 · token 187336 · stationary |
| Session 1 | `a0498b4a-…` — 10→20→30→60 EFFECTIVE + STOP → COMPLETED |
| Session 2 | `3d388fcd-…` — 10s EFFECTIVE + ABORT → ABORTED |
| SQL (Gate 2 window) | No 42P01/42703/42883/deadlock |
| Baseline | V2 canary disabled; PRODUCTION_HF_AUTHORITY=LEGACY restored |
| Status | `FIXED_PRODUCTION_VALIDATED` — **not** scientific cadence proof |
| Evidence | `evidence/reference-capture/DI_DEF_019_GATE2_PRODUCTION_DRESS_REHEARSAL_2026-09-06.md` |

## EXP-019 — Live HF calibration retry (2026-09-07)

| Event | Detail |
|-------|--------|
| Experiment | EXP-016 RETRY — one drive, one session, 10→20→30→60 on KS MX 2024 |
| sessionId | `2508b697-f101-4155-a0d3-8436e46bb779` |
| Result | All phases SUFFICIENT; SESSION COMPLETED; settlement replay T+25; **NO cadence conclusion** |
| Video GT | **Verified** — event register `EXP_019_VIDEO_GT_EVENT_REGISTER_2026-09-07.md` (5 windows) |
| Video alignment | `EXP_019_VIDEO_GT_ALIGNMENT_WINDOWS_2026-09-07.md` + VPS `/tmp/exp-019-video-alignment/` |
| Video GT correlation | `EXP_019_VIDEO_GT_VS_TELEMETRY_CORRELATION_2026-09-07.md` |
| Video GT event register | `EXP_019_VIDEO_GT_EVENT_REGISTER_2026-09-07.md` + `video-gt-event-register.json` |
| Bias-control pass | `EXP_019_BIAS_CONTROL_AND_DECISION_READINESS_2026-09-07.md` — 8 video-first control windows; cadence CRITICAL labels withdrawn; `ARCHITECTURAL_DECISION_READINESS=READY_FOR_EXPERIMENT_DESIGN_DECISION` |

## EXP-020 — Retrospective window geometry (2026-09-07)

| Event | Detail |
|-------|--------|
| Experiment | Settled HF query-window matrix on EXP-019 drive (read-only DIMO) |
| Reference | `EXP020_SETTLED_REFERENCE_UNION` — 446 speed buckets (obs + full-trip + full-session) |
| Window matrix | W060–W300 non-overlap: **identical 141-bucket union** — larger windows do not help when tiling |
| Post-trip | P1 whole-trip (1 req) ≈ best settled union; chunks add requests without new buckets |
| Gap expansion | EXACT/+300: 0 interior; FULL_PHASE: 0–2 sparse interior buckets per GT gap |
| First-obs age | P50 **~27s** (vs 8s live settlement delay) — settlement-timing co-factor |
| Hypotheses | H1/H2 NOT_SUPPORTED; H3 SUPPORTED; H4 CONTRADICTED (sole cause); H5 SUPPORTED (video fidelity) |
| Policy | PRODUCTION_HF_POLICY_CHANGE_AUTHORIZED=NO |
| Evidence | `EXP_020_RETROSPECTIVE_WINDOW_POST_TRIP_MATRIX_2026-09-07.md` + VPS `/tmp/exp-020/` |

## EXP-021 — Exact-SHA CI closure attempt (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **CI CLOSURE INCOMPLETE** (PR #1593 @ `88b918a73`) |
| i18n | `PRE_EXISTING_MAIN_TOOLING_DEFECT` — P2.3.4 tests bound to live PR; fix in [#1597](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1597) |
| Trip FSM CI | Not auto-triggered; manual dispatch required |
| RC tests | 641 total = 610 passed + 31 skipped (reconciled) |
| Evidence | `EXP_021_POST_1594_1595_REBASE_INTEGRATION_AUDIT_2026-09-10.md` §Exact-SHA CI closure |

## EXP-021 — Post-#1594/#1595 rebase integration audit (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **INTEGRATION AUDIT** (PR #1593 rebased on `7203b5bd6…`) |
| Rebase | Clean (0 conflicts); merge-base = current main; no Trip FSM file overlap |
| Contracts | PDI independent of Trip FSM completion; canonical WHOLE_TRIP requires COMPLETED; R12 AUD-002/003/004 unit green |
| Evidence | `EXP_021_POST_1594_1595_REBASE_INTEGRATION_AUDIT_2026-09-10.md` |

## EXP-021 — Fourth-pass scientific consistency micro-pass (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **MICRO-PASS FIX** (PR #1593 pre-merge) |
| Fixes | Cross-age PDI/WHOLE_TRIP maturation grouping; PDI candidate CONFIRMED overlay lifecycle; pre-deploy distinct speed timestamps with sliding window + sustained-park reset; strong parked evidence before UNKNOWN auto-stop |
| Tests | `PDI_CROSS_AGE_MATURATION_COMPARISON`, `WHOLE_TRIP_CROSS_AGE_MATURATION_COMPARISON`, `FIXED_INTERVAL_MATURATION_REGRESSION` PASS; reference-capture 605 tests |
| Evidence | `EXP_021_FINAL_PRE_PHYSICAL_RED_TEAM_AUDIT_2026-09-10.md` §Fourth-pass |

## EXP-021 — Third-pass micro-correction (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **MICRO-PASS FIX** (PR #1593 pre-merge) |
| Fixes | PDI schedule/execution timestamp separation; immutable observation hash; candidate overlay; start window recalc; deploy reset; wake-and-go recording; physical interval for VehicleTrip; no synthetic phase movement |
| Capability vs runtime | `PDI_30_PROSPECTIVE_CAPABILITY=YES`; `PDI_*_PROSPECTIVE_ACHIEVED=RUNTIME_ONLY` |
| Evidence | `EXP_021_FINAL_PRE_PHYSICAL_RED_TEAM_AUDIT_2026-09-10.md` §Third-pass |

## EXP-021 — Second-pass deterministic logic correction (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **SECOND-PASS FIX** (PR #1593 continuation) |
| Blockers fixed | PDI +30 at boundary not +150s; final phase validity; phase transition at effective boundary; urban start sliding window; ignition-off end; false-candidate provenance; PDI vs WHOLE_TRIP counts; VehicleTrip overlap ranking; full runtime config freeze; fail-closed movement accounting |
| Tests | Full-run simulation PASS; motion/orchestrator/settlement suites green |
| Revision analysis | `VALUE_REVISION_DETECTION` remains **NOT_IMPLEMENTED** |
| Evidence | `EXP_021_FINAL_PRE_PHYSICAL_RED_TEAM_AUDIT_2026-09-10.md` §Second-pass |

## EXP-021 — Final pre-physical red-team hardening (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **RED-TEAM AUDIT + HARDENING** (PR #1593 continuation) |
| Blockers fixed | Stale TARGET_SHA; unreachable deploy-movement gate; gear-as-speed; NULL=parked; lock-loss continue; arbitrary RECORDING attach; wall-clock phases while parked; whole-trip false prospective ages at auto-end; ONGOING trip binding; ERROR observation loss; enqueue/abort race; observation TOCTOU; loose experiment-active guard |
| New channel | `PHYSICAL_DRIVE_INTERVAL_SHADOW` (PDI probes) — true +30…+600 from drive-end candidate |
| Stationary cert | Real phase-60 EFFECTIVE proof + persisted schedule DB proof; optional `--e2e-shadow-smoke` |
| Revision analysis | `VALUE_REVISION_DETECTION` explicitly **NOT_IMPLEMENTED** |
| Evidence | `EXP_021_FINAL_PRE_PHYSICAL_RED_TEAM_AUDIT_2026-09-10.md` |

## EXP-021 — Settlement-shadow abort lifecycle (2026-09-09)

| Event | Detail |
|-------|--------|
| Status | **LIFECYCLE FIX + DURABILITY HARDENING** (PR #1593) |
| Defect | ABORTED RC sessions left `ACTIVE` settlement experiments + pending BullMQ jobs (2 orphans in post-deploy recert) |
| Fix | `cancelExperimentForAbortedSession`: experiment → `CANCELLED`, unobserved schedules → `SKIPPED`, jobs removed, observations preserved |
| Durability | Cleanup not feature-gated; atomic interactive transaction; reconciliation scheduler; cleanup failure surfaced; worker race guards |
| Normal stop | `stopRecording` / COMPLETED path unchanged — post-stop shadow continuation preserved |
| Tests | 11+ focused abort-lifecycle tests + reference-capture suite PASS |
| Evidence | `EXP_021_SETTLEMENT_SHADOW_ABORT_LIFECYCLE_2026-09-09.md` |

## EXP-021 — Audi re-run readiness hardening (2026-09-09)

| Event | Detail |
|-------|--------|
| Status | **STATIONARY CERT PASS** — V2 canary enabled for token 187361; orchestrator hardened in PR #1582 |
| Stuck session | `0aa0dd4f-…` → **ABORTED** (10,671 obs preserved) |
| V2 canary | `HF_RECOVERY_POLICY_V2_ENABLED=true`, canary-only, `CANARY_TOKEN_IDS=187361` (experiment-only) |
| Orchestrator | Pre-recording V2 gate, Redis single-instance lock, fatal session cleanup |
| Stationary cert | Phase 60 REQUESTED; calibration series created; prospective probes schedulable |
| Blocker | Hardened orchestrator **not deployed** — physical run awaits merge+deploy |
| Evidence | `EXP_021_AUDI_RERUN_READINESS_HARDENING_2026-09-09.md` |

## EXP-021 — Audi autonomous post-run forensic closeout (2026-09-09 evening)

| Event | Detail |
|-------|--------|
| Status | **DEGRADED** — settlement shadow **not executed**; cadence phases **blocked** |
| Session | `0aa0dd4f-6436-43d1-ae51-e23eaf947927` — RECORDING (stuck; no stop/complete) |
| Autonomous orchestrator | Deploy converged before RC; auto-start YES; phase activation FATAL @ 19:44:08 |
| Root cause | `HF_RECOVERY_POLICY_V2_ENABLED=false` + canary-only + Audi token **187361** not allowlisted → LEGACY blocks cadence |
| Fixed settlement | **0/48** observations; **0/8** probes; no maturation curves |
| Live RC capture | **PARTIAL** — 5,606 obs default LEGACY polling; 649 speed rows; max gap 125.76s |
| R12 natural run | Gap split `e62c964d`→`bd55f98d`; POSSIBLE_END not terminalized |
| Whole-trip confound | **YES** — pre-RC wake trip overlaps activity window |
| Mercedes comparison | **PARTIAL** — live gap sparsity similar; settlement maturation not replicated |
| Policy | PRODUCTION_POLICY_CHANGE_AUTHORIZED=NO |
| Evidence | `EXP_021_AUDI_AUTONOMOUS_POST_RUN_FORENSIC_2026-09-09.md` |

## EXP-021 — Audi cross-vehicle supplemental re-arm (2026-09-09)

| Event | Detail |
|-------|--------|
| Status | **PRE-ARMED — NOT DRIVING** (telemetry stale) |
| Vehicle | **KS MS 661** Audi A4 2016 (`c10351f8-…`, token **187361**) |
| New session | `3cc8465a-6977-4912-981c-63052398514c` READY; old `619284b3-…` ABORTED (not reused) |
| Fresh-trip gate | **PASS** — prior trip `e324ee8c-…` COMPLETED; FSM RESTING |
| Blocker | `LIVE_TELEMETRY_READY=NO` — provider age ~30516s; `VEHICLE_WAKE_REQUIRED=YES` |
| Settlement integrity | PR #1570 hardened runtime PASS; policy tests 9/9 on prod |
| Evidence | `EXP_021_AUDI_CROSS_VEHICLE_SUPPLEMENTAL_2026-09-08.md` §13 |

## EXP-021 — Audi cross-vehicle supplemental (2026-09-08 evening)

| Event | Detail |
|-------|--------|
| Status | **PHYSICAL DRIVE OUTSIDE RC** — `START EXP-021 NOW` never received |
| Vehicle | **KS MS 661** Audi A4 2016 (`c10351f8-…`, token **187361**) |
| Classification | `EXP021_CROSS_VEHICLE_SUPPLEMENTAL=YES`; `VEHICLE_CONFOUND_PRESENT=YES` |
| Cadence (planned) | **60→30→20→10** (not same-vehicle counterbalance vs EXP-019 KS MX) |
| Session | `619284b3-…` pre-armed READY → **ABORTED** `2026-09-08T20:06:12Z`; **startRecording NOT called** |
| Physical run | `EXP021_AUDI_PHYSICAL_RUN_EXECUTED=NO`; `EXP021_AUDI_DRIVE_CAPTURED=NO` |
| Operational trip | `e324ee8c-…` 19:36–19:59 UTC (Trip FSM, not RC-bound) |
| Settlement shadow | **NOT created** — no RECORDING session |
| KS MX session | `fb553442-…` left READY unstarted (different vehicle) |
| Go gate (post-wake) | `READY_TO_DRIVE=YES` at 19:40 UTC; operator did not send start command |
| Settlement integrity | Deployed PR #1570 hardened runtime PASS (unused this run) |
| Evidence | `EXP_021_AUDI_CROSS_VEHICLE_SUPPLEMENTAL_2026-09-08.md` |

## EXP-021 — Pre-drive integrity gate (2026-09-08)

| Event | Detail |
|-------|--------|
| Status | **HARDENED DRAFT** (PR #1570) — prospective probe A **and** B scheduling; whole-trip partial recovery |
| Deployed baseline | Fixed-interval schedules at phase completion only; +30/+60 late for both probes |
| First draft gap | Probe B still at completion — B+30 ~45s late, B+60 ~15s late |
| Final fix | `buildProspectiveProbeBForPhase` using nominal 300s offset at phase EFFECTIVE; runtime hook proven via `ReferenceCaptureProcessor` |
| Whole-trip | Partial schedule recovery (1–5 WHOLE_TRIP rows) now selected; idempotent fill to 6 ages |
| Tests | 21 settlement-shadow focused tests PASS; runtime lifecycle timing PASS |
| Physical drive | **NOT STARTED**; session **NOT CREATED** |
| Evidence | `EXP_021_PRE_DRIVE_INTEGRITY_GATE_2026-09-08.md` |

## EXP-021D — Stale session cleanup + go gate (2026-09-07)

| Event | Detail |
|-------|--------|
| Status | **PRODUCTION_READY** — preflight PASS; **no physical drive** |
| Stale session | `66f09794-…` pre-EXP-019 orphan → canonical **ABORTED**; 4459 obs preserved |
| Telemetry | Live DIMO `signalsLatest` fresh (15s provider age); DB latestState still stale — qualify via DIMO not CONNECTED |
| Shadow flag | `REFERENCE_CAPTURE_SETTLEMENT_SHADOW_ENABLED=true` after clean-state gates; rolling 2-replica restart |
| Preflight | `EXP021_PREFLIGHT_PASS=YES`; sequence **60→30→20→10** |
| Policy | PRODUCTION_HF_POLICY_CHANGE_AUTHORIZED=NO |
| Evidence | `EXP_021D_STALE_SESSION_CLEANUP_AND_PREFLIGHT_2026-09-07.md` |

## EXP-021A — Settlement shadow tooling (2026-09-07)

| Event | Detail |
|-------|--------|
| Status | **IMPLEMENTED_NOT_PHYSICALLY_VALIDATED** |
| Flag | `REFERENCE_CAPTURE_SETTLEMENT_SHADOW_ENABLED` default **false** |
| Scheduler | BullMQ `reference.capture.settlement-shadow` + persisted Prisma schedules + recovery scanner |
| Storage | `reference_capture_settlement_shadow_*` tables (immutable observations) |
| Trip authority | Whole-trip shadow ages from **VehicleTrip.endTime** (not session completion) |
| Bucket identity | `FIELD_PIPE_CANONICAL_ISO_MS` |
| Tests | 11 focused unit tests PASS; dry-run lifecycle PASS |
| Preflight | `backend/scripts/ops/reference-capture-exp-021-preflight.cjs` |
| Policy | PRODUCTION_HF_POLICY_CHANGE_AUTHORIZED=NO |

## EXP-021 — PR #1598 final red-team (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **RED-TEAM DRAFT** on PR #1598 |
| Fixes | Immutable persisted T0; recovery uses DB authority; orchestrator iteration survivability; reanchor validation; postgres T0 recovery integration harness |
| Evidence | `EXP_021_PR1598_FINAL_RED_TEAM_2026-09-10.md` |

## EXP-021 — PR #1598 final exact-SHA closure (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **CI CLOSURE COMPLETE** @ `33e680e5bf429272c7577ae082bfe6c4de1c5091` |
| Trip FSM CI | Run 34504226157 — workflow_dispatch SUCCESS |
| EXP-021 postgres T0 | 4/4 executed PASS (isolated DB) |
| PR CI | 30/30 checks success; 0 failed; 0 pending |
| Merge / deploy / drive | **NOT AUTHORIZED** |
| Evidence | `EXP_021_PR1598_FINAL_CLOSURE_2026-09-10.md` |

## EXP-021 — KS MS 661 deep forensic audit addendum (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **DEEP AUDIT COMPLETE** — bucket-level maturation + Trip FSM follow-up |
| Bucket identity | `FIELD_PIPE_CANONICAL_ISO_MS` — all 6 FIXED probes structurally stable after first success |
| Settlement gap recovery | **NO** late bucket recovery across ages |
| PDI structure | 3218 identities stable +30…+600; **values UNKNOWN** (not persisted) |
| Trip FSM | Still `ONGOING` + provisional `endTime`; detection `POSSIBLE_END`; WHOLE_TRIP unbound |
| Phase 10 | Missing due to insufficient movement in phase 20 (300s rule), not code defect |
| Next action | **LONGER_COMPLETION_RUN** — no new code fix required |
| Evidence | `EXP_021_KS_MS_661_PHYSICAL_RUN_FORENSIC_2026-09-10.md` §15–§19 |

## EXP-021 — KS MS 661 physical run post-drive forensic (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **POST-DRIVE FORENSIC COMPLETE** — read-only production evidence |
| Session | `945edc40-3002-4b87-83f6-a55d8cf66ffb` · settlement `exp-021-945edc40-e7850aa0` |
| Canonical T0 | `2026-09-10T19:41:19.000Z` — **CONFIRMED** durable; no duplicate 60→60 fatal |
| Phases | 60→30→20 completed; **10 NOT reached** |
| FIXED_INTERVAL | **36/48** completed (all +600 terminal); 12 missing (phase 10) |
| PDI | **6/6** through +600 on authoritative candidate `pdi-1789070475000` |
| WHOLE_TRIP | **0/6** — trip `2bdc6e71-…` still `ONGOING` |
| Classification | PARTIAL SUCCESS / DEGRADED |
| Policy | PRODUCTION unchanged — no deploy/merge/cleanup during forensics |
| Evidence | `EXP_021_KS_MS_661_PHYSICAL_RUN_FORENSIC_2026-09-10.md` |

## EXP-021 — Gap→settlement correlation + value revision instrumentation (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **INSTRUMENTATION COMPLETE** — evidence freeze + forward persistence; no physical drive |
| Freeze | `EXP_021_KS_MS_661_EVIDENCE_FREEZE_2026-09-10.json` — run `945edc40-…` immutable |
| Retroactive | Bucket identity maturation **YES**; per-gap timestamp matrix **NO**; value revision **NO** on frozen run |
| Code | `reference-capture-settlement-shadow-value-snapshot.ts`, gap-settlement analyzer, cross-age analyzer |
| Persistence | `bucketValueSnapshots`, `valueContentHash`, `valueRevisedBucketIdentities` on new observations |
| Correction | `responseHash` ≠ value revision evidence — metadata includes age/drift |
| Trip FSM | **UNCHANGED** — WHOLE_TRIP remains `BLOCKED_BY_EXTERNAL_TRIP_FSM_WORKSTREAM` |
| Evidence | `EXP_021_KS_MS_661_GAP_SETTLEMENT_RETROACTIVE_ASSESSMENT_2026-09-10.md`; forensic §20 |

## EXP-021 — Native temporal bucket persistence micro-pass (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **PERSISTENCE COMPLETE** — prospective only; KS MS 661 not backfilled |
| Location | `completedPhaseSummaries[].nativeTemporalEvidence` (`EXP021_NATIVE_TEMPORAL_v1`) |
| Reconstruction | `reference-capture-exp021-native-gap-reconstruction.ts` — post-run gap ledger without live memory |
| Join | `reference-capture-exp021-native-settlement-join.ts` — native gaps ↔ settlement snapshots |
| Readiness | `READY_FOR_EXP021_COMPLETION_RUN=YES` when native list + settlement value snapshots both persist |
| Historical | `HISTORICAL_KS_MS_661_NATIVE_GAP_LEDGER_RECOVERABLE=NO` |

## EXP-021 — PR #1621 authority micro-pass: asymmetric corruption + settlement precedence (2026-09-12)

| Event | Detail |
|-------|--------|
| Status | **AUTHORITY MICRO-PASS** on draft PR #1621 |
| Defect A | Both plan fields present but one unrecognized still resolved via `byId ?? byVersion` — asymmetric corruption silently ignored |
| Fix A | When both fields supplied, both must resolve or `Exp021CalibrationPlanAuthorityInvalidError` |
| Defect B | Settlement could consult env before experiment metadata when series authority absent |
| Fix B | `resolveExp021CalibrationPlanFromSources`: series → metadata → env (each persisted layer fail-closed) |

## EXP-021 — PR #1621 lifecycle precedence closure: single canonical plan per sync (2026-09-12)

| Event | Detail |
|-------|--------|
| Status | **LIFECYCLE PRECEDENCE CLOSURE** on draft PR #1621 |
| Defect | `syncCompletedPhasesFromSession` resolved plan via `resolveExp021CalibrationPlanForSeries(series)` before loading experiment metadata — env could win over persisted metadata V3; `validateCompletedPhaseProbeGeometry` received wrong plan while prospective sync later resolved correctly |
| Fix | Load existing experiment first; resolve ONE canonical `calibrationPlan` via `resolveSettlementCalibrationPlan` (series → metadata → env); pass same plan to `ensureExperiment`, prospective sync, completed-phase validation, and metadata merge |
| Tests | `sync lifecycle precedence: metadata V3 wins over env V2 when series authority absent` in `reference-capture-settlement-shadow-runtime.spec.ts` |
| CI | Vehicle Detail backend `tsc --noEmit` OOM at ~4GB heap (run 34698104670) — infrastructure, not PR TS defect; attempted workflow heap modification reverted; natural rerun on final head passed; Vehicle Detail Typecheck PASS; final required GitHub CI green; no workflow mitigation retained |

## EXP-021 — CANDIDATE_SHORT_AB_90_60 dedicated plan + WOB L 7503 pre-drive audit (2026-09-12)

| Event | Detail |
|-------|--------|
| Status | **PROSPECTIVE DESIGN IMPLEMENTED** — no physical run; no deploy |
| Authority | Frozen PR #1618: minimum next experiment = corrected 90 vs 60 short A/B (two 10 min wall phases); **not** full 120→90→60 rerun |
| Plan | `EXP021_CANDIDATE_SHORT_AB_90_60` — `candidate_short_ab_90_60`; registry `CANDIDATE_SHORT_AB_90_60`; phases **90→60** only; exact V3 90s/60s semantics |
| Geometry | 7/10 slots; 19/19 FIXED_INTERVAL windows; 228 settlement observations; 20 min nominal / 22 min max |
| Target vehicle | **WOB L 7503** (`19fedd4b-c4e8-4de8-a125-dab293326e7e`, token **192922**) — KS MS 661 historical only |
| Blockers | Stale WOB L 7503 telemetry (~23h at audit); 6 pending KS MS 661 WHOLE_TRIP schedules on COMPLETED experiment; plan not deployed |
| Evidence | `EXP_021_CANDIDATE_SHORT_AB_90_60_PROSPECTIVE_DESIGN_2026-09-12.md` |
| Tests | `reference-capture-exp021-candidate-short-ab-90-60.spec.ts` — registry, geometry, durable arm, restart recovery, lifecycle |

## EXP-021 — CANDIDATE_SHORT_AB_60_90 reversed-order plan (PR-A, 2026-09-15)

| Event | Detail |
|-------|--------|
| Status | **PROSPECTIVE PLAN REGISTERED** — no physical run; no deploy; no fleet automation |
| Plan | `EXP021_CANDIDATE_SHORT_AB_60_90` — `candidate_short_ab_60_90`; registry `CANDIDATE_SHORT_AB_60_90`; phases **60→90**; pure order reversal of `CANDIDATE_SHORT_AB_90_60` |
| Geometry | Cadence-value slot geometry unchanged (90s→7, 60s→10); settlement budget order-invariant (38 windows × 6 ages = 228); short-A/B assertions plan-parametric |
| Unchanged | Default plan `UPPER_BOUND_V2`; existing `CANDIDATE_SHORT_AB_90_60` semantics; Run 1 frozen evidence (#1659) |
| Blockers | Legacy `physicalPhase60StartedAt` naming (PR-B); no manual 60→90 physical run until PR-B + explicit arm |
| Tests | `reference-capture-exp021-candidate-short-ab-60-90.spec.ts`; lifecycle driver 60→90 case; autonomous CI gate extended |

## EXP-021 — PR #1621 micro-pass: post-transition late-movement + fail-closed authority (2026-09-12)

| Event | Detail |
|-------|--------|
| Status | **MICRO-PASS** on draft PR #1621 |
| Defect | `recomputePhaseSummaryDerivedFields` used active-phase counters for completed phases — post 120→90 transition, empty 90s counters could yield `DEGRADED_INSUFFICIENT_REQUESTS` |
| Fix | Recompute uses persisted `summary.providerRequestCount` / `summary.providerSuccessCount`; movement patch preserves all non-movement summary evidence |
| Authority | `resolveExp021CalibrationPlanFromAuthority` fail-closed when durable fields present but conflicted/unrecognized — env fallback only when both fields absent |
| Tests | `REALISTIC_POST_TRANSITION_LATE_MOVEMENT` PostgreSQL fixture; authority conflict/corruption unit tests |

## EXP-021 — CANDIDATE_BRACKET_V3 durable plan authority correction (2026-09-12)

| Event | Detail |
|-------|--------|
| Status | **CORRECTION PASS** — code defects confirmed from frozen KS MS 661 V3 run (PR #1618 evidence); frozen artifacts **unchanged** |
| Defect A | **Durable plan authority** — post-arm subsystems fell back to `EXP021_UPPER_BOUND_V2` via transient `process.env`; mixed `calibrationPlanVersion` across phases |
| Defect B | **EXPECTED_SLOTS_NEVER_CREATED** — `buildInitialPhaseCounters` used default 5-min geometry for 90s/60s (expected 7/10, got 4/5); 8 slots never instantiated |
| Defect C | **Settlement geometry** — `syncProspectiveProbesForActivePhase` resolved 9 windows for 90s/60s instead of 19 (V3 10-min phases) |
| Defect D | **Stale scientific status** — `finalizePhaseSummary` coerced unknown movement to 0 → `DEGRADED_LOW_MOVEMENT`; late `persistExp021ActivePhaseMovementAtomic` patched movement but not status (120s: 454.7s movement vs 150s threshold should be **VALID**) |
| Fix | Persist `calibrationPlanId`/`calibrationPlanVersion` on series at arm; `resolveExp021CalibrationPlanFromAuthority`; pass durable plan to slot init, settlement, scientific classification; `recomputePhaseSummaryDerivedFields` on late movement |
| Terminology | **EXPECTED_SLOTS_NEVER_CREATED** ≠ **SILENTLY_LOST_SLOTS** (never instantiated vs issued then lost) |
| Evidence | Frozen run `EXP_021_KS_MS_661_CANDIDATE_BRACKET_V3_*_2026-09-12.md` (PR #1618) — not mutated |
| Tests | `reference-capture-exp021-durable-plan-correction.spec.ts` — 120s false-low-movement regression, full V3 5/7/10 + 19/19/19 + restart recovery |

## EXP-021 — Post-run hardening scientific correction pass (2026-09-11, PR #1604)

| Event | Detail |
|-------|--------|
| Status | **CORRECTION PASS** — runtime + settlement geometry fixes before next physical run |
| HF slots | Strict `resolveExp021HfHistoricalPollDecision` — no legacy interval fallback when slot ledger active; `persistCalibrationCountersDuringCycle` reserves ISSUED before provider I/O |
| Settlement | `buildFullPhaseOverlappingSettlementProbesForPhase` — full phase from t+0, 60s windows, 30s step; 62 tiles × 6 ages = 372 queries; synthetic gap assessability 32/32 (100%) |
| Legacy geometry | 120s stabilization tiling retained as `buildLegacyStabilizedTiledSettlementProbesForPhase` for 2026-09-11 evidence parse only (25 tiles, 75.76% nominal minutes) |
| Terminalization | Realistic early-end (180/120 completed, 60 sealed, 30 NOT_RUN); final 30s CONTROL wall-clock expiry without fresh telemetry |
| Evidence | Frozen 2026-09-11 run artifacts **unchanged**; 4/44 assessable remains historical under old A/B geometry |

## EXP-021 — Upper-bound cadence calibration plan V2 (2026-09-11)

| Event | Detail |
|-------|--------|
| Status | **PROSPECTIVE DESIGN IMPLEMENTED** — no physical run |
| Plan | `EXP021_UPPER_BOUND_V2` — 180→120→60→30 CONTROL, 33 min nominal / 35 min max |
| Advancement | `WALL_CLOCK` per phase (replaces universal 300s MOVING for this plan) |
| Legacy | `EXP021_LOWER_BOUND_V1` preserved (`EXP021_CALIBRATION_PLAN=LOWER_BOUND_V1`) |
| Code | `reference-capture-exp021-calibration-plan.lib.ts` |
| Evidence | `EXP_021_UPPER_BOUND_V2_PROSPECTIVE_DESIGN_2026-09-11.md` |
| Physical run | **NOT STARTED** |

## EXP-021 — PostgreSQL native temporal persistence proof (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **POSTGRES INTEGRATION PASS** — isolated DB, 3/3 tests |
| Proof | Reload after disconnect; 60→30 transition; settlement join with value snapshots |
| Harness | `reference-capture-postgres.integration.harness.ts` helpers |
| Spec | `reference-capture-exp021-native-temporal-evidence.postgres.integration.spec.ts` |
| Result | `INSTRUMENTATION_MERGE_READY=YES` (instrumentation scope only) |

## EXP-021 — KS MS 661 T0 / phase / settlement hardening (2026-09-10)

| Event | Detail |
|-------|--------|
| Status | **HARDENING DRAFT** — forensic root cause from production telemetry-only run |
| Session | `8374c2fc-…` · orchestrator fatal duplicate 60→60 at movement |
| Root cause | PRE_ROLL phase 60 credited as physical; T0 logged after fallible phase switch |
| Fix | Durable T0 before phase activation; `reanchorPhysicalCalibrationPhaseAtT0`; PRE_ROLL settlement gate; orchestration degraded vs integrity fatal |
| Physical drive | **NOT STARTED** post-fix |
| Evidence | `EXP_021_KS_MS_661_T0_PHASE_SETTLEMENT_HARDENING_2026-09-10.md` |

## EXP-021 — Settlement shadow experiment design (2026-09-07)

| Event | Detail |
|-------|--------|
| Status | **DESIGNED** — preflight audit only; **no physical drive** |
| Channels | CADENCE 60→30→20→10 (counterbalanced) + SETTLEMENT_SHADOW (isolated) |
| Probes | 8 fixed 60s intervals × ages +30/+60/+120/+180/+300/+600s |
| Post-trip shadow | TripEnd + {30,60,120,180,300,600}s whole-trip queries |
| 446 union audit | **PARTIAL** — ms-key artifact; 165+140+141 disjoint keys; ~36 floor-second overlap |
| Idempotence | Q1/Q2/Q3 **IDENTICAL** on settled EXP-019 interval |
| Tooling | Shadow scheduler **NOT implemented** — design spec only |
| Load | ~113 total requests (59 cadence + 48 shadow + 6 post-trip) |
| Policy | PRODUCTION_HF_POLICY_CHANGE_AUTHORIZED=NO; shadow tooling NOT deployed |
| Evidence | `EXP_021_SETTLEMENT_SHADOW_EXPERIMENT_DESIGN_2026-09-07.md`; `EXP_021_PROVIDER_IDEMPOTENCE_PREFLIGHT_2026-09-07.md` |

## EXP-021 — False physical-end authority correction (2026-09-11)

| Event | Detail |
|-------|--------|
| Status | **MERGED** — PR #1606 at `e99cf710088732069bc5d448ae5436b893b3440e` |
| Session | `d633da9d-…` · KS MS 661 UPPER_BOUND_V2 |
| Root cause | Orchestrator `physicalEndEarly` terminated on provisional PDI CONFIRMED (120s) bypassing `finalParkedMs` (600s); boundary race sealed phase 60 with negative wall duration |
| Fix | `hardPhysicalEndEligible` / `shouldAutoStop` only for early end; boundary-safe `finalizeCalibrationOnPhysicalEndEarly`; movement metrics to completing phase; durable `exp021RequestSlots` in phase summaries; settlement experiment `COMPLETED` convergence |
| Evidence | Corrected forensic layer in evidence-only PR (supersedes #1605) |

## EXP-021 — Hard-end UNKNOWN fail-safe micro pass (2026-09-11)

| Event | Detail |
|-------|--------|
| Status | **RUNTIME MICRO PASS** on PR #1606 |
| Issue | `hardPhysicalEndEligible` delegated to `shouldAutoStopRecording` UNKNOWN shortcut |
| Fix | Hard-end requires fresh `PARKED_CANDIDATE` sustained `>= finalParkedMs`; UNKNOWN never hard-ends |
| Tests | STRONG_PARKED + long UNKNOWN + movement invalidation regression added |

## EXP-021 — CANDIDATE_BRACKET_V3 prospective refocus (2026-09-11)

| Event | Detail |
|-------|--------|
| Status | **PROSPECTIVE PLAN** on PR #1606 — no physical run |
| New plan | `EXP021_CANDIDATE_BRACKET_V3` — 120→90→60, equal 10 min wall phases, 30 min nominal / 32 min max |
| Historical preserved | `EXP021_UPPER_BOUND_V2` (180→120→60→30) and `EXP021_LOWER_BOUND_V1` unchanged |
| 180s | Historical evidence only — no longer an active production-candidate calibration phase |
| 90s | Added to `HF_POLL_CALIBRATION_CANDIDATES_MS`; epistemic `UNKNOWN` / `PROSPECTIVE` |
| Settlement | 57 windows × 6 ages = 342 observations; full-phase overlapping for all WALL_CLOCK plans |
| Reconstruction | Read-only analyzer scaffold; map-matching adapter documented as follow-up |
| Selection | `EXP021_CALIBRATION_PLAN=CANDIDATE_BRACKET_V3` — default remains `UPPER_BOUND_V2` |
| Evidence | `EXP_021_CANDIDATE_BRACKET_V3_PROSPECTIVE_DESIGN_2026-09-11.md` |

## EXP-021 — KS MS 661 UPPER_BOUND_V2 corrected forensic evidence (2026-09-11)

| Event | Detail |
|-------|--------|
| Status | **EVIDENCE REGISTERED** — evidence-only PR from post-#1606 `main` |
| Session | `d633da9d-e32c-461c-8a27-8c0c6bfff209` · KS MS 661 UPPER_BOUND_V2 |
| Interpretation | PHYSICAL_END_AUTHORITY **CONTRADICTED**; UNSLOTTED/SILENTLY_LOST **UNKNOWN_UNPROVABLE**; bucket structure stable from **+120** |
| Settlement | FIXED_INTERVAL_OBSERVATIONS_COMPLETED **342**; SCHEDULES_COMPLETED **357**; SCHEDULES_SKIPPED **15** |
| Gap assessability | **94.6%** (35/37 assessable); SETTLEMENT_PRESENT_LATER **0**; ABSENT_THROUGH_600 **550** |
| Value maturation | **51** revisions (`bucketValueSnapshots` / `valueContentHash`) |
| Cadence decision | **READY_TO_CHOOSE_PRODUCTION_CADENCE=NO** — 60/30 not executed; runtime defect (fixed #1606) |
| Supersedes | PR **#1605** (obsolete mixed runtime branch — do not merge) |
| Evidence | `EXP_021_KS_MS_661_UPPER_BOUND_V2_FULL_POST_RUN_FORENSIC_2026-09-11.md`; `EXP_021_KS_MS_661_UPPER_BOUND_V2_FULL_POST_RUN_AUDIT_2026-09-11.json` |

## EXP-021 — KS MX 2024 incomplete short A/B deep 90s forensic (2026-09-14)

| Event | Detail |
|-------|--------|
| Status | **EVIDENCE FREEZE** — read-only forensic; no code/deploy; session `ABORTED` |
| Session | `332c1549-622d-4535-afd9-867962003280` · KS MX 2024 · `EXP021_CANDIDATE_SHORT_AB_90_60` |
| Windows | A nominal 10 min (25 native buckets, 5/7 HF success) · B moving overrun (0 HF) · C post-trip tail (integrity PASS) |
| Settlement | **114/114** SUCCESS (19×6); #1621 geometry fix **PASS** |
| Slots | **7/7** issued; #1621 slot fix **PASS** vs KS MS 661 V3 (4/7) |
| Overrun | `OWNERSHIP_GAP` — orchestrator not started; `90_TO_60_BLOCKED_BY_BAD_TELEMETRY=NO` |
| Classification | `VALID_90_STANDALONE=YES`; `VALID_90_VS_60=NO`; `VALID_FOR_CADENCE_SELECTION=NO` |
| Evidence | `EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_2026-09-14.md`; `.json`; `EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_EVIDENCE_FREEZE_2026-09-14.md` |

### EXP-021 — KS MX 2024 deep 90s forensic v2 temporal correction (2026-09-14)

| Event | Detail |
|-------|--------|
| Correction | 90s phase active **~116.6 min** at pre-abort freeze (not ~25.5 min); abort `completedPhaseSummary` (~119.3 min) is artifact only |
| Windows | A nominal 1,423 RC obs / 25 native HF · B overrun 938 / 0 · C post-trip tail **8,792** / 0 · D abort 260 |
| Settlement | 114/114 SUCCESS — 67 in A, 47 in B, **0 in C**; last at `12:03:53Z` |
| Orphaned tail | RC runner ~91 obs/min continued; `validMovementDurationMs` null; Trip FSM RESTING while EXP-021 active |
| Classification | `VALID_90_VS_60=NO` · `VALID_FOR_CADENCE_SELECTION=NO` preserved |
| Evidence | `EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_V2_2026-09-14.json`; updated MD + evidence freeze |

### EXP-021 — KS MX 2024 forensic consistency + recorder repair spec (2026-09-14)

| Event | Detail |
|-------|--------|
| Scope | PR #1645 derived-evidence correction only; no runtime/test/workflow changes |
| Fixes | Provider counts 7/5/2; deduped gap lists; full-window max gap 159,544 ms; ZERO_RESULT unproven transient; VALUE_REVISIONS/GAP_RECONSTRUCTABILITY NOT_ASSESSED/NOT_PROVEN |
| Recorder | `RECORDER_CODE_CHANGE_REQUIRED_FOR_CANONICAL_NEXT_RUN=NO`; `CODE_CHANGE_REQUIRED_TO_SUPPORT_MIXED_MANUAL_ATTACH_PATH=YES`; orchestrator sole-owner runbook; regression spec defined |
| Validation | `scripts/validate-exp021-ks-mx-forensic-invariants.sh` |
| Evidence | `EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_CONSISTENCY_2026-09-14.json` |

### EXP-021 — KS MX 2024 final cross-file closure (2026-09-14)

| Event | Detail |
|-------|--------|
| RC partition fix | PRE_T0=365, A=1058, B=938, C=8792, D=260; total 11413 (was A=1423 conflating PRE_T0+A) |
| Provider | All representations 7/5/2; W1=4/2/2, W2=3/3/0 from slot issuedAt |
| Gaps | Regenerated from 25 unique timestamps; full-window max 159544 ms |
| Movement | POST_TRIP_FALSE_MOVEMENT=NOT_ASSESSED; T0_TO_TRIP_END_WALL_DURATION label |
| Settlement | STRUCTURAL PASS; GAP_RECONSTRUCTABILITY=NOT_PROVEN |
| Recorder | Canonical next run NO code change; mixed manual path YES guardrails needed |
| Validation | Expanded `validate-exp021-ks-mx-forensic-invariants.sh` |

### EXP-021 — KS MX 2024 derived-evidence integrity fix (2026-09-14)

| Event | Detail |
|-------|--------|
| Scope | PR #1645 evidence-only; no runtime/production mutation |
| Gap tuples | Rebuilt adjacent-interval tuples (`durationMs === end − start`); no filtered-index corruption |
| Percentiles | `PERCENTILE_METHOD=NEAREST_RANK` (P50=15000 ms from 24 intervals); cross-file equality enforced |
| Signal completeness | Removed per-signal `availabilityPct=0` placeholders → `NOT_ASSESSED` |
| Movement | Separated `TRIP_STATE_CLASS` vs `PHYSICAL_MOVEMENT_CLASS`; no ACTIVE_TRIP after trip end (W6–W10) |
| Settlement | `SETTLEMENT_DURING_POST_TRIP_TAIL=NO`; `SETTLEMENT_CONTINUED_AFTER_NOMINAL_10MIN_END=YES` |
| Post-10min | `POST_10_MIN_RC_SOURCE=RC_ACQUISITION_RUNNER_CYCLE`; removed HEARTBEAT_ONLY wording |
| full_pre_freeze | Bucket inventory only; `HF_CONTINUITY_AFTER_NOMINAL_WINDOW=NOT_APPLICABLE_NO_HF_SLOTS_SCHEDULED` |
| Consistency | `EXP-021-KS-MX-2024-FORENSIC-CONSISTENCY-v4`; phase renumbering 19–24 |
| Recorder | `RECORDER_CODE_CHANGE_REQUIRED_FOR_CANONICAL_NEXT_RUN=NO`; `CODE_CHANGE_REQUIRED_TO_SUPPORT_MIXED_MANUAL_ATTACH_PATH=YES` |
| Validation | Expanded validator: gap recompute, percentiles, movement, settlement, version refs |

### EXP-021 — PR-C fleet study registry + dry-run coordinator (2026-09-15)

| Event | Detail |
|-------|--------|
| Scope | Durable study/enrollment/run-ledger control plane; leader-gated DRY-RUN coordinator only — no physical execution |
| Schema | `exp021_studies`, `exp021_study_enrollments`, `exp021_study_runs`, order-balance ledgers |
| Enrollment | Explicit allowlist (`enabled=true`); `enrolledTokenId` audit snapshot; runtime identity = `organizationId` + `vehicleId` |
| Coordinator | `EXP021_FLEET_COORDINATOR_ENABLED` default OFF; `EXP021_FLEET_DRY_RUN` default ON; leader-gated `@Interval` scheduler |
| Allocator | `STRATIFIED_BLOCK_RANDOMIZATION_WITH_GLOBAL_BALANCE_LEDGER` (minimal); dry-run read-only |
| Run 1 | `EXPLICIT_FUTURE_IMPORT` — no automatic backfill (`EXP021_FLEET_RUN1_REGISTRY_STRATEGY.md`) |
| Safety | Dry-run never creates `ReferenceCaptureSession`, study runs, or acquires execution locks |
| Next | PR-D required before execution capability; Stage-1 deploy gate separate |

### EXP-021 — PR-C control-plane correctness hardening (2026-09-15)

| Event | Detail |
|-------|--------|
| Minimum matrix | Only `COMPLETED` + `COMPLETE_VALID` + not `INELIGIBLE` counts toward primary gate; `PARTIAL_VALID` preserved but excluded |
| Config | `validateMinimumMatrixConfig()` fail-closed on malformed thresholds; `matrixMet` never true when config invalid |
| Leader guard | Mandatory `SchedulerLeaderGuardService`; no `@Optional` fail-open follower path |
| Interval | `getFleetCoordinatorIntervalMs()` wired via dynamic `setInterval` (5s–300s bounds) |
| Dry-run authority | Requires global `EXP021_FLEET_DRY_RUN=true` AND `study.dryRun=true` (`STUDY_DRY_RUN_REQUIRED`) |
| HF policy | Extracted `reference-capture-exp021-hf-policy-gate.lib.ts`; runtime no longer imports `scripts/ops` |
| Run identity | `reserveStudyRunAssignment()` derives study/org/vehicle/token from enrollment inside Serializable tx |
| Atomic assignment | Advisory lock + balance increment + PLANNED run creation in one transaction (PR-C coordinator does not call) |
| Dry-run preview | Ephemeral per-tick shadow balance; durable ledger unchanged |
| Allocator naming | `DETERMINISTIC_STRATIFIED_GLOBAL_BALANCE` (truthful; not block randomization) |
| Retention | `Exp021StudyRun` FKs `ON DELETE RESTRICT` for study/enrollment/org/vehicle; enum `Exp021StudyRunClassification` |
| CI | Fleet postgres integration, migration deploy test, fleet unit gate, production build in EXP-021 workflow |

### EXP-021 — PR-B forensic slot persistence + first-phase authority (2026-09-15)

| Event | Detail |
|-------|--------|
| Scope | Per-slot forensic persistence; order-neutral first physical phase authority; summary/ledger parity — no fleet coordinator |
| Slots | `Exp021RequestSlotRecord` extended: `requestCompletedAtMs`, `bucketCount` (RAW_PROVIDER_BUCKET_COUNT), `providerCallAttempted`, `providerCallSucceeded`, `outcomeReason`, `effectivePollIntervalMs` |
| Summary | `finalizePhaseSummary` derives `slotSuccessCount` / `slotZeroResultCount` / `slotFailureCount` / `slotSkippedCount` / `slotAccountedCount` from ledger |
| Authority | `physicalFirstPhaseStartedAt` canonical; `physicalPhase60StartedAt` legacy alias with fail-closed conflict detection |
| Logging | `PHYSICAL_FIRST_PHASE_REANCHORED_AT_T0` replaces legacy `PHYSICAL_PHASE_60_REANCHORED_AT_T0` |
| Forensics | `reference-capture-exp021-forensic-extraction.lib.ts`; deep audit exposes `exp021SlotForensics` |
| Settlement linkage | `PHASE_LEVEL_LINK` — no causal 1:1 slot↔settlement window |
| Run 1 | Frozen evidence unchanged; legacy slot shapes parseable via `parseLegacyForensicSlotRecord` |
| Postgres | Terminal slot forensic fields + first-phase authority survive reload |

### EXP-021 — Canary live window activation (PR-D canary slice) (2026-09-18)

| Event | Detail |
|-------|--------|
| Scope | KS MX 2024 token `187336` only — closes missing upstream RC/settlement path without fleet-wide live execution |
| Root cause | Fleet coordinator dry-run only; `EXP021_FLEET_DRY_RUN=false` refuses evaluation; no trip-bound session start |
| Ledger | `exp021_canary_live_window_activation_ledgers` — unique `vehicle_trip_id`, optional `session_id` / `study_run_id` |
| Trigger | Leader scheduler arms on ONGOING trip (post `NOT_BEFORE_ISO`); finalizes on COMPLETED trip (`stopRecording`) |
| Env | `EXP021_CANARY_LIVE_WINDOW_ACTIVATION_ENABLED` default OFF; `EXP021_CANARY_LIVE_WINDOW_ACTIVATION_NOT_BEFORE_ISO` required when enabled |
| Safety | No historical backfill; missed 2026-09-18 drive excluded when `NOT_BEFORE` set after that trip; PDI still from existing settlement/motion authority only |
| Evidence | `architecture/drivingintelligence/evidence/reference-capture/EXP_021_CANARY_LIVE_WINDOW_AUTHORITY_CLOSURE_2026-09-18.md` |
| Production | **NOT ACTIVATED** in this change — code + tests only |

### EXP-021 — Live Maturation Shadow uniqueness closure (2026-09-16, PR #1670)

| Event | Detail |
|-------|--------|
| Scope | Documentation-only micro closure: canonical scientific uniqueness for family, stratum, slot |
| Family uniqueness | `UNIQUE(org, vehicle, token, canonicalWindowTo, shadowScheduleVersion)`; `enrollmentEventId` provenance only |
| Stratum uniqueness | `UNIQUE(windowFamilyId, signalLane, queryGeometryMs)`; `signalSetHash` immutable attribute, not uniqueness component |
| Slot uniqueness | `UNIQUE(windowStratumId, plannedAgeMs)`; transport retry → new attempt, not new slot |
| Job IDs | Deterministic from family/stratum/plannedAge; `JOB_ID_DEPENDS_ON_ENROLLMENT_EVENT_ID=NO` |
| Re-experiment | Intentional re-study via `shadowScheduleVersion` only — not new enrollment event ID |
| Runtime / Prisma | **NO CHANGES** |

### EXP-021 — Live Maturation Shadow design hardening (2026-09-16, PR #1670)

| Event | Detail |
|-------|--------|
| Scope | Design-only hardening: scientific identity, attempt provenance, window-family sampling unit |
| Document | `architecture/drivingintelligence/research/EXP_021_LIVE_MATURATION_SHADOW_DESIGN_2026-09-16.md` |
| Estimands | Primary A: P(non-zero \| actualAgeMs); Primary B: bucket-locus coverage distribution; `P_SUFFICIENTLY_COMPLETE_ESTIMABLE_NOW=NO` |
| Identity | Bucket-locus vs payload-revision separated; coverage uses `UNIQUE_BUCKET_LOCUS_UNION` |
| Signal freeze | `signalSetHash` + query semantics frozen at window-family enrollment; fail closed on drift |
| Sampling unit | `PRIMARY_SAMPLING_UNIT=WINDOW_FAMILY`; pilot 30/60, fleet 200 families; paired geometry analysis |
| Attempt ledger | Four-level hierarchy; immutable `ObservationAttempt`; `FAILED_ATTEMPT_OVERWRITE_ALLOWED=NO` |
| Provider errors | `PROVIDER_ERROR_COUNTS_AS_ZERO=NO`; errors excluded from interval-censored transitions |
| Policy delay | `CODE_DEFAULT_HF_SETTLEMENT_DELAY_MS=8000`; effective delay resolved at activation |
| Production | **NO** — `FUTURE_SHADOW_DEFAULT_ENABLED=NO`, `PRODUCTION_RETRY_AGE_SELECTED=NO` |
| Runtime / Prisma | **NO CHANGES** |

### EXP-021 — Live Maturation Shadow design (2026-09-16)

| Event | Detail |
|-------|--------|
| Scope | Design-only specification for live maturation shadow experiment (pre-TGR retry-age authority) |
| Document | `architecture/drivingintelligence/research/EXP_021_LIVE_MATURATION_SHADOW_DESIGN_2026-09-16.md` |
| Inputs | Frozen gap-replay + TGR audit evidence packages |
| Lanes | HF_FAST_LOOP (preflight-resolved) + SETTLEMENT_SHADOW (manifest 33 fields) — separate curves |
| Ages | Dense pilot: 8s policy + 30/40/45/50/55/60/90/120s |
| Geometry | 60s + 90s query ranges (not cadence authority) |
| Production | **NO** — `FUTURE_SHADOW_DEFAULT_ENABLED=NO`, `PRODUCTION_RETRY_AGE_SELECTED=NO` |
| Runtime / Prisma | **NO CHANGES** (superseded for schema only by PR-M1 below) |

### EXP-021 — Live Maturation Shadow PR-M1 persistence foundation (2026-09-16)

| Event | Detail |
|-------|--------|
| Scope | Schema, domain types, and persistence repository only — **no runtime provider query**, **no scheduler**, **no recovery**, **no production activation**, **no cadence authority** |
| Design authority | Merged #1670 `EXP_021_LIVE_MATURATION_SHADOW_DESIGN_2026-09-16.md` |
| Models | `Exp021MaturationShadowWindowFamily` → `Exp021MaturationShadowWindow` → `Exp021MaturationShadowObservationSlot` → `Exp021MaturationShadowObservationAttempt` |
| Family uniqueness | `(organizationId, vehicleId, tokenId, canonicalWindowTo, shadowScheduleVersion)` — `enrollmentEventId` provenance-only |
| Stratum uniqueness | `(windowFamilyId, signalLane, queryGeometryMs)` — `signalSetHash` immutable attribute, not uniqueness component |
| Slot uniqueness | `(windowStratumId, plannedAgeMs)` |
| Attempt ledger | Immutable create-only rows; `UNIQUE(observationSlotId, attemptOrdinal)`; transport retry → new attempt, same slot |
| Provider semantics | `PROVIDER_ERROR` distinct from `PROVIDER_SUCCESS_ZERO`; `PROVIDER_ERROR_COUNTS_AS_ZERO=NO` |
| Stage-1A | **NO INTERFERENCE** — fleet coordinator / StudyRun paths do not write shadow tables |
| Default | `EXP021_MATURATION_SHADOW_ENABLED=false` (type/config only; no execution wiring) |
| Run 1 / cadence | **UNCHANGED** — 90s 7/7, 60s 9/10; `SUFFICIENT_FOR_CADENCE_RECOMMENDATION=NO` |

### EXP-021 — Live Maturation Shadow PR-M1 scientific integrity hardening (2026-09-16)

| Event | Detail |
|-------|--------|
| Scope | Repository/persistence hardening only on draft PR #1672 — no runtime execution |
| Family freeze | `plannedAgesMsExact` + `policyDelayProbeMs` fail closed on existing/raced family; `enrollmentEventId` remains provenance-only |
| Stratum freeze | `activityClassificationJson` added to immutable semantic comparison (canonical JSON equality) |
| Slot authority | `plannedAgeMs` must be in family `plannedAgesMsExact`; off-schedule slots rejected |
| Attempt authority | Parent slot/stratum/family resolved; `actualAgeMs` + `schedulerDriftMs` derived from `requestStartedAt - windowTo`; hash fields must match stratum |
| Provider outcomes | `PROVIDER_ERROR` / `PROVIDER_SUCCESS_ZERO` / `PROVIDER_SUCCESS_NONZERO` contradiction matrix enforced |
| Post-hoc fields | Analytical derivatives removed from raw insert API; nullable columns remain null in PR-M1 |
| Runtime / prod | **NO CHANGES** |

### EXP-021 — Live Maturation Shadow PR-M2 scheduler and worker foundation (2026-09-17)

| Event | Detail |
|-------|--------|
| Starting main SHA | `06bdba368057d8cfba6a6500768ffd36f783483c` (merged PR #1672) |
| Scope | Dedicated BullMQ queue, deterministic enrollment/scheduling, bounded worker, read-only provider adapter, recovery — **default OFF**, no production activation |
| Queue | `reference.capture.exp021-maturation-shadow` (`REFERENCE_CAPTURE_EXP021_MATURATION_SHADOW`) |
| Job ID contract | `rc-exp021-ms-{familyId}-{stratumId}-{plannedAgeMs}` — **no** `enrollmentEventId` |
| Schedule version | `MATURATION_SHADOW_SCHEDULE_v1` |
| Worker concurrency | `1` |
| Feature defaults | `EXP021_MATURATION_SHADOW_ENABLED=false`, HF lane `false`, settlement lane `false`, empty token allowlist |
| Provider path | `ReferenceCaptureExp021MaturationShadowProviderQueryAdapter` — DIMO GraphQL read-only, no canonical writes |
| Multi-replica proof | PostgreSQL + Redis integration tests (family/stratum/slot idempotency, deterministic enqueue, recovery, duplicate delivery) |
| Automatic production enrollment | **NOT WIRED** — `ReferenceCaptureExp021MaturationShadowEnrollmentService` callable; hook deferred to canary PR |
| M3 boundary | No maturation curves, Wilson CI, cadence recommendation, export/dashboard |
| Runtime / prod | **NO CHANGES** — disabled by default |

### EXP-021 — Live Maturation Shadow PR-M3 scientific micro-closure (2026-09-17)

| Event | Detail |
|-------|--------|
| Previous head | `e6a7da259912ab4fcae2f165d92e8dd6c9800df4` |
| Scope | Interval-censoring ordering fix; cross-family planned-age stratum summaries; eligibility-gated primary stats; content-based M1/M2 fingerprint; canonical bucket-locus round-trip validation |
| Interval censoring | `firstPositiveAgeMs` = earliest success with loci>0; `lastNegativeAgeMs` = latest success zero strictly before first positive; post-positive zeros ignored for transition bounds |
| Population summaries | `plannedAgeStratumSummaries` grouped by lane/geometry/activity/semantic cohort/plannedAgeMs with `nWindowFamilies` + `nLogicalSlots` (retries do not inflate family N) |
| Eligibility | Primary stats exclude ineligible strata; transitions CSV includes `eligible` + `exclusionReasons`; separate exclusions CSV |
| Fingerprint | Deterministic scientific content digest over family/stratum/slot/attempt fields detects in-place UPDATE |
| Bucket locus | `validateCanonicalBucketLocusIdentity` round-trip via `buildExp021BucketIdentity` + canonical ISO ms |
| Runtime / prod | **NO CHANGES** |

### EXP-021 — KS MX 2024 canary single-family operator CLI (2026-09-17)

| Event | Detail |
|-------|--------|
| Starting main SHA | `04bb817de85201a1017516e2e7bc5f5dd19c504d` |
| Scope | Repository-native manual operator CLI for exactly one KS MX 2024 maturation shadow window family — **no automatic enrollment**, **no HTTP API**, **no production execution in PR** |
| CLI | `npm run exp021:maturation-shadow:canary:enroll -- --token-id 187336 --canonical-window-to <ISO> [--execute]` or `--wait-next-window` |
| Modes | Default DRY RUN (zero DB/BullMQ/provider writes); `--execute` required for enrollment |
| Window authority | `REFERENCE_CAPTURE_PHYSICAL_DRIVE_INTERVAL.physicalEndAt` from settlement-shadow experiment metadata (`ORCHESTRATOR_CONFIRMED` / `PDI_CANDIDATE` only for `--wait-next-window`) |
| Freshness guard | Fail closed when `windowAgeAtEnrollmentMs + 5000ms >= earliestPlannedAgeMs` (preserves 30s–60s dense ages) |
| Hard guards | token `187336`, KS MX 2024 org/vehicle binding, both lanes enabled, allowlist exactly `[187336]`, `maxActiveFamilies=1`, zero unfinished families pre-enroll |
| Activity | Independent telemetry via `parseSpeedSampleFromSignalsLatest`; defaults `UNKNOWN_ACTIVITY` when unresolved |
| Provider calls | `PROVIDER_CALLS_DURING_ENROLLMENT=0` — enrollment creates family/strata/slots/delayed BullMQ jobs only |
| Kill switch guidance | Printed: `EXP021_MATURATION_SHADOW_ENABLED=false` + rolling PM2 restart (not executed by CLI) |
| Tests | 28-case canary suite (`canary-enroll.spec.ts` 23 + `canary-activity.lib.spec.ts` 5) |
| Micro-closure (same PR) | Head `2d2a30107` — authoritative token equality enforced; activity resolved after `canonicalWindowTo`; geometry-specific RC observation windows; execute requires persisted physicalEndAt match; strict token parse; wait-mode skips stale windows; freshness lag diagnostics; `EXPECTED_PROVIDER_CALLS_DURING_ENROLLMENT=0` |
| Runtime wiring closure (same PR) | Wait-mode DB refresh each poll (no frozen startup snapshot in poll callback); CLI wiring regression test; removed 90s prefix substitution; coherent geometry CASE 1–4 activity fixtures |
| Runtime / prod | **NO CHANGES** — operator must invoke CLI manually after merge/deploy |

### EXP-021 — Live Maturation Shadow PR-M3 observational analytics and export (2026-09-17)

| Event | Detail |
|-------|--------|
| Starting main SHA | `4b8c555e49d86f33af3e23ca918a3fa1349f85eb` (merged PR #1675) |
| Scope | Read-only observational analytics + deterministic JSON/CSV export over immutable M1/M2 scientific rows — **no provider calls**, **no M1/M2 mutation**, **no production activation** |
| Data contract audit | `M3_DATA_CONTRACT_AUDIT=PASS`; `M3_SCHEMA_CHANGE_REQUIRED=NO`; `M3_ATTEMPT_ROWS_MUTATED=NO` |
| Bucket locus | Reconstruct from `bucketLocusManifestJson` + `bucketLocusIdentityVersion=FIELD_PIPE_CANONICAL_ISO_MS`; dedupe; payload value excluded from coverage identity |
| Maturation order | `actualAgeMs` authority; cumulative union never shrinks; `FINAL_SHADOW_OBSERVED_UNION` observational denominator only (not ground truth) |
| Availability | Provider success + reconstructed locus count; provider errors UNKNOWN; interval censoring `(lastNegative, firstPositive]` with errors excluded from bounds |
| Retry truth | Retry success attributed to real `actualAgeMs`; no backdating to planned age |
| Sampling unit | `PRIMARY_SAMPLING_UNIT=WINDOW_FAMILY`; per-stratum N reported |
| Stratification | Separate HF_FAST_LOOP / SETTLEMENT_SHADOW; separate 60s/90s; activity cohorts; semantic cohort blending blocked for primary combined analysis |
| Paired geometry | Family-level 60s vs 90s paired export — not independent samples |
| Export | `EXP021_MATURATION_SHADOW_M3_EXPORT_v1`; CLI `npm run exp021:maturation-shadow:m3:export` requires explicit `organizationId` + `vehicleId` |
| Read-only proof | PostgreSQL before/after fingerprint — canonical RC state + M1/M2 row counts unchanged |
| CI | `test:exp021:maturation-shadow:m3` + `m3:postgres:ci`; wired into EXP-021 autonomous orchestrator CI |
| Boundaries preserved | M2 scheduler/worker unchanged; no cadence recommendation; no completeness threshold; KS MX 2024 not armed; Stage-1A/Trip FSM/GAP_DEBT/TGR policy unchanged |
| Evidence | `architecture/drivingintelligence/evidence/reference-capture/exp021-maturation-shadow-m3-2026-09-17.md` |
| Runtime / prod | **NO CHANGES** — disabled by default |

### EXP-021 — Live Maturation Shadow PR-M2 scientific hardening + CI closure (2026-09-17)

| Event | Detail |
|-------|--------|
| Starting M2 head | `91ac9662fb65a36ef4ed981c6291745886c06846` |
| Scope | CI script fix, execution-time semantic drift revalidation, provider ingress timing authority, durable retry budget from attempt ledger, DB↔BullMQ reconciliation matrix, atomic active-family cap, geometry-specific activity authority, PostgreSQL canonical fingerprint non-interference, runtime SHA fail-closed when enabled |
| CI | `test:exp021:maturation-shadow:m2` shell pipe fixed; `test:exp021:fleet:postgres:ci` chains `m2:postgres-redis:ci` with `EXP021_MATURATION_SHADOW_POSTGRES_REDIS_INTEGRATION=1` |
| Execution semantics | `assertExecutionSemanticsMatchStratum` recomputes resolver authority before every provider request |
| Timing | Successful GraphQL uses `queryGraphQLWithIngressTiming()` ingress timestamps; JWT preflight excluded from `requestStartedAt` |
| Retry | `deriveTransportRetryOrdinalFromAttempts` — PostgreSQL attempt ledger is durable retry authority across restart/recovery |
| Reconciliation | `reconcileExecutionState` handles missing `bullJobId`, missing Redis job, completed/failed jobs, retry job loss |
| Active families | `countUnfinishedFamilies` + `pg_advisory_xact_lock(90210021)`; `maxActiveFamilies<=0` fails closed when enabled |
| Activity | `activityAuthorityByGeometry` — independent 60s/90s classification shared across lanes per geometry |
| Canonical proof | `captureCanonicalStateFingerprint` PostgreSQL integration — shadow writes do not mutate canonical RC/study/settlement state |
| Runtime SHA | `resolveExp021MaturationShadowRuntimeBuildSha({ required: true })` when enabled — rejects `unknown-runtime-sha` |
| Boundaries preserved | Queue unchanged, concurrency `1`, automatic production enrollment unwired, KS MX 2024 not armed, Stage-1A/Trip FSM unchanged |
| Runtime / prod | **NO CHANGES** — disabled by default |

### EXP-021 — Live Maturation Shadow PR-M1 final scientific geometry + provider input closure (2026-09-17)

| Event | Detail |
|-------|--------|
| Scope | Repository validation hardening only on draft PR #1672 — no runtime execution |
| Provider input | `PROVIDER_ERROR` validates raw `uniqueBucketLocusCount` (null/undefined only); no pre-validation normalization |
| Query geometry | `queryGeometryMs` typed and runtime-validated to `{60000,90000}` only |
| Stratum windows | `windowTo` must equal family `canonicalWindowTo`; `windowFrom = windowTo - queryGeometryMs` (exact) |
| Attempt age | `actualAgeMs < 0` rejected (`requestStartedAt` must not precede `windowTo`) |
| Family schedule | Non-empty, positive integer ages; no duplicates; positive integer `policyDelayProbeMs` |
| Runtime / prod | **NO CHANGES** |

### EXP-021 — TGR architecture audit evidence freeze (2026-09-16)

| Event | Detail |
|-------|--------|
| Scope | Read-only TGR architecture audit + bounded DIMO historical micro-window experiments |
| Evidence | `architecture/drivingintelligence/evidence/reference-capture/exp021-tgr-audit-2026-09-16/` |
| Primary Run 1 | **UNCHANGED** |
| Gap replay package | **UNCHANGED** (`exp021-run1-gap-replay-2026-09-16/`) |
| Micro-window | `MICRO_WINDOW_RECOVERY_EFFECT_OBSERVED=NO` on tested HF60/HF90 controls |
| Transition | `TRANSITION_GAP_MICRO_FRAGMENTATION_RECOVERY=NO`; recoverability not demonstrated for canonical window |
| Maturation | `SETTLEMENT_EARLY_AGE_MATURATION_OBSERVED=YES`; `PRODUCTION_RETRY_AGE_ESTABLISHED=NO` |
| Architecture | `PREFERRED_TGR_ARCHITECTURE=OPTION_C`; lever = maturation-aware targeted requery |
| Gap debt | `SEPARATE_GAP_DEBT_AUTHORITY_REQUIRED=YES` (design only, no schema) |
| Runtime / prod | **NO CHANGES** — `TGR_RUNTIME_IMPLEMENTATION=NO` |

### EXP-021 — Run 1 targeted gap replay evidence freeze (2026-09-16)

| Event | Detail |
|-------|--------|
| Scope | Post-hoc read-only DIMO historical gap replay + positive-control closure for KS MX 2024 Run 1 |
| Evidence | `architecture/drivingintelligence/evidence/reference-capture/exp021-run1-gap-replay-2026-09-16/` |
| Primary Run 1 | **UNCHANGED** — `EXP_021_KS_MX_2024_PHYSICAL_90_60_2026-09-15.json` SHA `99a1aa52…` |
| Gaps replayed | 5 exact windows (1 HF transition + 4 settlement anomalies) |
| Refined counts | `TOTAL_DIAGNOSTIC_ZERO_WINDOWS=5`; transition HF persistent empty=1; settlement early-age zero=2; structural terminal tail=2 |
| Positive controls | HF60 (10/10 count-comparable), HF90 (6/6 count-comparable); settlement query-path non-zero (`SETTLEMENT_CONTROL_COUNT_COMPARABLE=NO`) |
| Validity | `GAP_REPLAY_EXPERIMENT_VALID=YES`; `TRANSITION_HF_PERSISTENT_EMPTY_SUPPORTED=YES` |
| Maturation | Split by class: `TRANSITION_HF_LATE_MATURATION_HYPOTHESIS=WEAKENED`; `SETTLEMENT_EARLY_AGE_MATURATION_OBSERVED=YES` (SP-60-T0, SP-90-T16 @ 60s+) |
| Taxonomy | Distinct classes with recoverability: `TRANSITION_WINDOW_PERSISTENT_EMPTY`, `SETTLEMENT_EARLY_AGE_ZERO`, `STRUCTURAL_TERMINAL_TAIL` |
| Run 1 metrics | **NOT REWRITTEN** — 90s 7/7, 60s 9/10 preserved |
| Cadence authority | **NO** — `SUFFICIENT_FOR_CADENCE_RECOMMENDATION=NO` |
| Runtime / prod | **NO CHANGES** |

### EXP-021 — Stage-1A Path-B remediation: freshness authority + deploy capability guard (2026-09-16)

| Event | Detail |
|-------|--------|
| Scope | Fix two independent Stage-1A blockers proven on KS MX 2024 first real drive (2026-09-16 11:42–12:05Z); **no production deploy**, **no auto-execution** |
| Blocker A | Production redeployed `2c862b69` (PR-C coordinator) → `295635fc` (#1665) at ~07:56Z while `EXP021_FLEET_COORDINATOR_ENABLED=true` remained set — coordinator code absent from running artifact |
| Blocker B | Fleet coordinator used `dimoVehicle.lastSignal ?? latestState.lastSeenAt`; stale non-null `lastSignal` masked fresher `vehicle_latest_states.last_seen_at` |
| Freshness resolver | `resolveExp021FleetTelemetryFreshness()` — newest valid provider-backed timestamp among `LATEST_STATE_LAST_SEEN_AT`, `SIGNALS_LATEST_PROVIDER_TIMESTAMP`, `DIMO_LAST_SIGNAL`; fail-closed future skew via `DIAGNOSTIC_MAX_FUTURE_SKEW_MS` |
| Provenance | Dry-run observations expose `freshnessTimestamp`, `freshnessAuthority`, `freshnessAgeMs` |
| Deploy guard | `vps-exp021-fleet-deploy-guard.lib.sh` (**DEPLOY_EXECUTOR_GUARD_AUTHORITY**) sourced by executing `vps-deploy-release.sh`; validates **TARGET_RELEASE_CAPABILITY** post-build. Target `reference-capture-exp021-fleet-deploy-preflight.sh` is optional supplemental only. |
| Bootstrap | Current production `295635fc` lacks guarded deploy script. **First remediation deploy** must invoke `vps-deploy-release.sh` from exact merged remediation SHA checkout (`BOOTSTRAP_DEPLOY_SOURCE_MUST_EQUAL_TARGET_SHA=YES`), not `/opt/synqdrive/current`. After success, normal deploys use guarded current script. |
| Cross-version | Coordinator disabled → absence of target preflight helper must not block deploy. Coordinator enabled → fail closed if target lacks capability even when helper absent. |
| Shell contract | `backend/scripts/test/exp021-fleet-deploy-guard-contract.sh` — A–F fixture coverage |
| Real-drive fixture | `lastSignal=2026-09-15T20:56:14Z`, `lastSeenAt=2026-09-16T12:05:15Z` → `FRESH` / `eligible=true` in dry-run (non-mutating) |
| Run 1 / cadence | **UNCHANGED** — 90s 7/7, 60s 9/10; `SUFFICIENT_FOR_CADENCE_RECOMMENDATION=NO` |
| PR-D / auto-exec | **NOT IMPLEMENTED** |

### EXP-021 — canonical autonomous lifecycle driver + real-path regression (2026-09-14, PR #1649)

| Event | Detail |
|-------|--------|
| Scope | Behavior-preserving extraction of production lifecycle driver; remove parallel in-memory harness |
| Driver | `reference-capture-exp-021-autonomous-lifecycle.driver.ts` — shared by orchestrator + `driver.spec.ts` |
| Removed | `reference-capture-exp021-autonomous-short-ab-lifecycle.harness.ts` (reimplemented control flow — insufficient) |
| Assertions | `reference-capture-exp021-short-ab-geometry.assertions.ts` (geometry only, no lifecycle simulation) |
| Matrix | Full 90→60 driver path, durable restart B–E, duplicate lock, ZERO_RESULT, Trip FSM read-only audit |
| Postgres | `REAL_DB_DRIVER_RESTART_60_TO_TERMINAL` — mid-60s PG reload → canonical driver `FINAL_PHASE_WALL_CLOCK` terminalization (7/7 CI) |
| Gate | `scripts/validate-exp021-short-ab-autonomous-gate.sh` — unit gate (55 tests) |
| CI | `.github/workflows/exp021-autonomous-orchestrator-ci.yml` — unit + isolated Postgres (`synqdrive_exp021_pr1649_test`) |
| Postgres driver | `testing/reference-capture-exp021-postgres-driver.harness.ts` — repo atomic bridge (not lifecycle duplicate) |
| Authority | `EXP_021_AUTONOMOUS_ORCHESTRATOR_SHORT_AB_REGRESSION_2026-09-14.md` — evidence levels separated |
| PR #1645 | **MERGED** @ `20269b9e7` — KS MX 2024 forensic evidence frozen; no reinterpretation |

### EXP-021 — cohort study enrollment bootstrap (2026-09-19)

| Event | Detail |
|-------|--------|
| Incident | WOB L 7503 live drive `c0889036-…` — ledger `FAILED` `enrollment_not_found`; PR #1692 PDI not reached |
| Root cause | PR #1694 cohort expansion without `exp021_study_enrollments` for KS MS 661 / WOB L 7503 (`OPS_BOOTSTRAP_OMISSION`) |
| Fix (review) | `reference-capture-exp021-cohort-study-enrollment-bootstrap.lib.ts` + ops CLI `exp021:cohort:study-enrollment:bootstrap` |
| Evidence | `evidence/reference-capture/EXP_021_COHORT_STUDY_ENROLLMENT_AUTHORITY_CLOSURE_2026-09-19.md` |
| Production | Activation disabled; enrollments **not** mutated in closure workstream |

### EXP-021 — PDI → M2 maturation integration repair (2026-09-19)

| Event | Detail |
|-------|--------|
| Forensic | Seven post–NOT_BEFORE trips: RC + PDI, zero M2 families; `ZERO_FAMILY_CLASS=9` (not short-drive) |
| Root cause | Operational `freshness.stale` on cohort wait; settlement-baseline cursor skipped unenrolled PDIs after restart |
| Repair | `PROSPECTIVE_PDI_DISCOVERY` + enrolled-window cursor (`maxEnrolledCanonicalWindowToMsForVehicle`) |
| Evidence | `evidence/reference-capture/EXP_021_PDI_TO_M2_INTEGRATION_REPAIR_2026-09-19.md` |
| Production | **No deploy / no backfill** in repository repair workstream |

### EXP-021 C0.3 — minimal R1 temporal-safety containment (2026-09-24)

| Event | Detail |
|-------|--------|
| Trigger | C0.2 `C02_GATE_A` (P1 scoped) — R1 point-in-time HF abuse / context / misuse claims unsupported |
| BEFORE | R1 FULL_BRAKING / POSSIBLE_IMPACT / ENGINE_SHUTDOWN_WHILE_DRIVING derived from grid-labelled OBD records; fed counters, ledger, impact, brake wear, SEVERE misuse; exact anchor-relative context in API |
| CHANGE | `telemetry-source-family.ts` (rawJson resolver); `r1-temporal-containment.ts`; enrichment gate + replace scope + summary marker; ledger read interpretation; impact / brake readers / brake wear / fingerprint; unified read model + DTO marker; trip counters/stats; misuse evidence tag + rating cap + proxy-only lifecycle |
| NON_EFFECTS | Speeding, max speed, trip end/FSM, waypoints, grid anchoring, aggregation, hardwareType, routing, historical data |
| Validation | Focused suites (DI-TEST-R1-CONTAINMENT-001); vehicle-intelligence tree failure set = base + 1 load-dependent pre-existing flake |
| Status | `VALIDATED` (code/tests) — draft PR #1755; not merged, not deployed |
| Evidence | `evidence/reference-capture/EXP_021_C03_R1_TEMPORAL_CONTAINMENT_2026-09-24.md` |

### EXP-021 C0.3B — read-presentation closure (2026-09-24)

| Event | Detail |
|-------|--------|
| Trigger | C0.3A merge-gate — stale customer judgment + unqualified persisted SEVERE misuse presentation |
| CHANGE | `shouldWithholdR1PersistedDrivingStressScore` on canonical trip/vehicle stats; `misuse-case-read-presentation.ts` on misuse list/detail API; provider-native braking documented INDEPENDENT; driving-impact fingerprint test fixture repair |
| NON_EFFECTS | No persistence mutation; admin-only raw aggregates (`trips.service.getStats`, logbook) still deferred |
| Status | `VALIDATED` (code/tests) — draft PR #1755 |
| Evidence | `evidence/reference-capture/EXP_021_C03_R1_TEMPORAL_CONTAINMENT_2026-09-24.md` §5.1 |

### EXP-021 C0.5 — CG-01 `COLD_ENGINE_FULL_THROTTLE` containment (2026-09-24)

| Event | Detail |
|-------|--------|
| Trigger | C0.4 `CG-01` — 326 R1 `HF_DERIVED` rows at full event-list strength |
| CHANGE | Extend `R1_CONTAINED_HF_ABUSE_EVENT_TYPES`; `countContainedAbuseRowsForReadAdjustment` (v1 marker-aware); misuse `ruleColdEngineAbuse` R1 filter; containment marker v2 |
| NON_EFFECTS | CG-02…CG-10, COLD_ENGINE_HIGH_RPM, Tesla/API_SYNTHETIC, no DB mutation |
| Status | `VALIDATED` (code/tests) — draft PR, not deployed |
| Evidence | `evidence/reference-capture/EXP_021_C05_CG01_COLD_ENGINE_FULL_THROTTLE_2026-09-24.md` |

### EXP-021 C1D.6 — DI V0 shadow persistence S2 (2026-09-26)

| Field | Value |
|-------|--------|
| Trigger | C1D.5 S0/S1 merged; C1D.4 storage design |
| Change | `di_v0_shadow_runs` / `di_v0_shadow_intervals` + `shadow-persistence/` adapter (no runtime caller) |
| Versions | Structural / estimator contracts unchanged; storage append-only |

### EXP-021 C1D.6B — shadow persistence hardening closure (2026-09-26)

| Field | Value |
|-------|--------|
| Trigger | C1D.6A pre-merge audit `BLOCKED` (cross-tenant association, tx client, summary authority, DB CHECK gaps) |
| Change | Trip identity guard; tx-scoped repository; DB CHECK constraints; status machine; completion counts from DB; redundant index removed; integration harness bootstrap script |
| NON_EFFECTS | No S3 worker, no canonical trip mutation, no production migration |
| Evidence | `evidence/EXP_021_C1D6_S2_SHADOW_PERSISTENCE_2026-09-26.md` (updated) |

### EXP-021 C1D.5B — pure core pre-merge fail-safe closure (2026-09-26)

| Field | Value |
|-------|--------|
| Trigger | C1D.5A red-team `NEEDS_CLOSURE` (duplicate bucketLabel L3, malformed-input tests) |
| Change | L3 temporal support validation + duplicate label grid flag + closure Jest matrix |
| Versions | `DI_SOURCE_QUALITY_CONTRACT_V0_1` / `DI_KINEMATIC_ESTIMATE_V0_1` unchanged |

### EXP-021 C1D.5 — DI V0 pure shadow core S0/S1 (2026-09-26)

| Event | Detail |
|-------|--------|
| Trigger | C1D.4 implementation readiness gate `C1D4_GATE_SHADOW_IMPLEMENTATION_READY` |
| CHANGE | New `backend/src/modules/vehicle-intelligence/driving-intelligence/core/` pure library: types, hold/release, calendar-second L3 eligibility, motion/claim/confidence, R1 INTERVAL_ONLY relation rules, `computeDiV0TripIntervals`; Jest coverage + side-effect static audit |
| NON_EFFECTS | No Prisma migration, BullMQ, DIMO fetch, feature flags, HTTP, customer DTOs, trip/scoring/event side effects |
| Status | `PROPOSED` — merge review only; no deploy authorization |
| Evidence | `evidence/EXP_021_C1D5_V0_PURE_CORE_2026-09-26.md` |
| Decision | `DI-DEC-V0-SHADOW-PURE-CORE-001` |

### EXP-021 C1D.7 — DI V0 S3A position acquisition + normalization (2026-09-26)

| Event | Detail |
|-------|--------|
| Trigger | C1D.6 S2 merged (`090c9383…`); S1 needs normalized position evidence + snapshot identity |
| BEFORE | S1 core + S2 persistence had no input slice; `inputEvidenceVersion` had no producer |
| CHANGE | New `driving-intelligence/position-acquisition/` dormant library: request/window validation, 1 s location query (`agg: AVG`), grid normalizer, coordinate validation, duplicate fail-safe, canonical source-family consumption, SHA-256 snapshot identity, typed redacted error model, DIMO transport adapter (type-only service imports, full request context) |
| WHY | Keep acquisition semantics explicit (bucket label ≠ source timestamp; availability tri-state) before any worker exists |
| NON_EFFECTS | No runtime caller, Nest registration, BullMQ, Redis, Prisma, migration, DB write, live provider call, customer/UI, trip/score/event/misuse effect; S1 contract unchanged; DIMO Integration code unchanged |
| Validation | 110 new tests; 169-test S1/S2/call-site regression; `tsc`; `nest build` |
| Gaps | DI-GAP-S3A-AGG-001, DI-GAP-S3A-REFTIME-001, DI-GAP-S3A-LIVE-001, DI-GAP-S3A-ARTIFACTS-001 |
| Status | `PROPOSED` — draft PR, merge review only; no deploy authorization |
| Evidence | `evidence/EXP021_C1D7_S3A_INPUT_NORMALIZATION_REPORT.md` (DI-EVID-EXP021-C1D7-001) |
| Decision | `DI-DEC-V0-POSITION-ACQ-001` |

### EXP-021 C1D.7B — PR #1800 S3A documentation closure + full-trip golden (2026-09-27)

| Event | Detail |
|-------|--------|
| Trigger | Pre-merge red-team P1: authority missing C1G aggregation + provider mutability + pinned replay semantics |
| CHANGE | Docs/graph/CURRENT_STATE/DECISION_REGISTER; C1-MOBILE-FULL-R1-002 compact golden fixture + 11 new tests (S3A golden, mutability identity, S3A→S1 structural); SynqDrive Code views |
| NON_EFFECTS | No S3A runtime/query/aggregator/normalization/snapshot algorithm change; no merge/deploy/S3B |
| Validation | position-acquisition 121 tests; S1/S2 regression; graph + registry validators |
| Gaps | DI-GAP-S3A-AGG-001 → **PARTIALLY_CLOSED** (documented); DI-GAP-S3A-ARTIFACTS-001 partially mitigated |
| Status | `PROPOSED` — closes red-team P1 on draft PR #1800 |

### EXP-021 C1D.8 — S3B R1 OBD + native event evidence adapters (2026-09-27)

| Event | Detail |
|-------|--------|
| Trigger | S3A merged; S1 already accepts `NormalizedR1ObdObservation` / `NativeEventObservation` but had no acquisition libraries |
| CHANGE | `r1-obd-acquisition/` (Channel A) + `native-event-evidence/` (Channel B) + `evidence-input/di-v0-combined-input-identity.ts`; governance + SynqDrive Code views |
| WHY | Separate normalized evidence channels with deterministic snapshot identities before S4 shadow orchestration |
| NON_EFFECTS | No worker, queue, scheduler, Nest registration, DB write, fusion, product accel/brake/coasting logic, L3 override, deploy |
| Validation | S3B + S1/S2/S3A regression; typecheck/build/lint; graph + registry validators |
| Status | `PROPOSED` — draft PR, pre-merge review only |
| Evidence | `evidence/EXP021_C1D8_S3B_R1_OBD_NATIVE_EVENT_ADAPTERS.md` (DI-EVID-EXP021-C1D8-001) |
| Decision | `DI-DEC-V0-S3B-R1-NATIVE-EVIDENCE-001` |

### EXP-021 C1D.8B — S3B contract hardening / red-team closure (2026-09-27)

| Event | Detail |
|-------|--------|
| Trigger | C1D.8A read-only red-team of PR #1805: NEEDS_CLOSURE (P1 ×4, P2 ×5) |
| BEFORE | Caller-set native `VALIDATED` → L2; no native context binding; duplicate eventIds double-counted; `[]` ≡ NO_EVENT with no failure concept; combined identity `[channel, version]` with optional channels; R1 duplicate buckets first-row-wins; `isIgnitionOn(agg: AVG)` queried; WOB control synthetic; test R1 identity resolved to UNKNOWN |
| CHANGE | Native: fixed UNCALIBRATED/L1, expected-context binding (`CONTEXT_MISMATCH`), eventId dedup (`CONFLICTING_DUPLICATE`), source envelope + `EVENT_SOURCE_FAILURE`, `readDiV0NativeEventSource`; combined identity V0_2 with explicit channel state; R1 per-signal duplicate merge; ignition removed from query (V0_2); field authority matrix; golden-bound WOB + HOLD/RELEASE/post-release tests |
| WHY | Close P1/P2 fail-closed before any S4 caller |
| ALTERNATIVES | Trusted-authority object (design B), drop-silently, first-row/average/majority, keep ignition labelled — all rejected (see decision) |
| NON_EFFECTS | No S1 core change; no worker/scheduler/queue/DB/migration/API/UI/provider mutation/deploy/S4/fusion weights/accel-brake-coasting logic; legacy HF + trip-detection ignition queries unchanged |
| Validation | S1/S2/S3A/S3B 254 passed (1 pre-existing integration suite skipped); tsc clean; ESLint clean on S3B; graph + registry validators |
| Gaps | DI-GAP-S3B-R1-FIELD-AUTHORITY-001 (no field provider-schema verified; ignition excluded); no captured R1 OBD rows for FULL-R1-002 in repo (structural fixture) |
| Status | `PROPOSED` — draft PR #1805, pre-merge |
| Evidence | `evidence/EXP021_C1D8B_S3B_CONTRACT_HARDENING.md` (DI-EVID-EXP021-C1D8B-001) |
| Decision | `DI-DEC-V0-S3B-CONTRACT-HARDENING-001` |

### EXP-021 C1D.9 / C1D.9A — S3B R1 field authority + V0_3 correction (2026-09-27)

| Event | Detail |
|-------|--------|
| Trigger | C1D.9 read-only provider authority audit: PARTIAL (5/6 fields verified; gear AVG unsafe) |
| BEFORE | Query `DI_V0_R1_OBD_QUERY_V0_2`: speed, rpm, throttle, load, ECT, `powertrainTransmissionCurrentGear`, all `agg: AVG`, all `REPO_CONTRACT_ONLY`; gear normalized to `NormalizedR1ObdObservation.gear` (fractional values passed through); adapter/snapshot V0_2 |
| CHANGE | Query/adapter/R1 snapshot **V0_3**: gear removed from query, normalizer and S1 type; 5 fields `PROVIDER_SCHEMA_VERIFIED` with documented unit + value scale; snapshot serializes authority metadata; `DI_V0_R1_OBD_EXCLUDED_PROVIDER_FIELDS` (gear, isIgnitionOn); `DI_V0_R1_OBD_SUPERSEDED_VERSIONS`; combined input identity unchanged V0_2 |
| WHY | Every queried field must be provider-verified and semantically valid under its aggregation before S4 R1 use |
| ALTERNATIVES | Gear FIRST/LAST + integer guard; keep gear labelled; runtime allowlist over V0_2; combined identity bump — all rejected (see decision) |
| NON_EFFECTS | No worker/scheduler/queue/DB/migration/API/UI/provider mutation/deploy/S4; no native-event change; no L3 tuning; no acceleration/braking/coasting/speeding logic; shared DIMO transport/auth and legacy HF/trip-detection queries unchanged |
| Validation | DI suites green incl. new `di-v0-s3b-r1-v03-authority.spec.ts` (49 tests); tsc clean; ESLint clean; DI/DIMO graph + docs + registry validators |
| Gaps | DI-GAP-S3B-R1-FIELD-AUTHORITY-001 **PARTIALLY_CLOSED** — residual gear (no categorical strategy, no R1 evidence); multi-sample 1 s AVG behaviour unobserved |
| Status | `PROPOSED` — draft PR, pre-merge |
| Evidence | `evidence/EXP021_C1D9_R1_FIELD_AUTHORITY_V03_CORRECTION.md` (DI-EVID-EXP021-C1D9-001) |
| Decision | `DI-DEC-V0-S3B-R1-V03-FIELD-AUTHORITY-001` |

### EXP-021 C1D.10A — Authority correction + S4A contract design review (2026-09-27)

| Event | Detail |
|-------|--------|
| Trigger | C1D.10 read-only S4 design: NEEDS_CLOSURE (P1 ×4, P2 ×11) |
| BEFORE | C1D.6 / C1D.7 authority said the S2 migration was unapplied (it was applied 2026-09-26 23:46:11 UTC via #1801); `CURRENT_STATE` said V2 flag "default OFF" without noting Production ON; S4 design had no frozen identity/fencing/channel/pinning contract; settlement delay 16 h from a 5-row sample; native `NO_EVENT` assumed derivable from legacy markers |
| CHANGE | Authority corrected with AMENDED BY notes (history preserved); DI-CONTRA-S2-PROD-MIGRATION-001 (RESOLVED); `design/s4a/` (contract design, state machine, identity + fencing, channel outcomes, replay + pinning, migration safety, threat model); machine contract `s4a-contract.v1.json` + `validate-s4a-contract.sh` (state machine, hashes, channel pins, tenant scope, race model R01–R14, invariants); P2 triage (P2-5 promoted to P1-5); 5 gaps; SynqDrive Code views |
| WHY | Close P1 at contract level and freeze a machine-testable S4A contract before any S4 code; merge = Production migration, so dormant-deploy safety must be designed first |
| ALTERNATIVES | See DI-DEC-V0-S4A-CONTRACT-001 (BullMQ idempotency, advisory locks, 16 h fixed delay, legacy readiness markers, live re-query replay, object-store pins, enums, RESTRICT FKs — all rejected) |
| NON_EFFECTS | No S4 runtime, worker, sweeper, scheduler, queue, Nest registration, migration, Prisma schema change, provider call, Production write, deploy, flag change, customer path, trip mutation, calibration, threshold or detector change; S1/S2/S3A/S3B code unchanged |
| Validation | `validate-s4a-contract.sh` (+ negative copies), DI graph + docs, DIMO graph, module registry validators; S1/S2/S3A/S3B Jest regression; frontend tsc; `i18n:check` |
| Gaps | DI-GAP-S4-NATIVE-READINESS-001, DI-GAP-S4-REPLAY-DESERIALIZER-001, DI-GAP-S4-SHADOW-DELETION-AUDIT-001, DI-GAP-S4-LOCATION-RETENTION-001, DI-GAP-S2-IN-TX-CREATE-RACE-001 |
| Status | `PROPOSED` — draft PR, design only |
| Evidence | `evidence/EXP021_C1D10A_AUTHORITY_CORRECTION.md`, `evidence/EXP021_C1D10A_P2_TRIAGE.md` (DI-EVID-EXP021-C1D10A-001) |
| Decision | `DI-DEC-V0-S4A-CONTRACT-001` |

### EXP-021 C1D.10C — S4 authority / contract / validator closure (2026-09-27)

| Event | Detail |
|-------|--------|
| Trigger | C1D.10B read-only red-team of C1D.10A: 4 P1 (P1-A S2 execution identity under-bound; P1-B contract/validator non-enforcing, 8/13 false accepts; P1-C tenancy on nonexistent `vehicle_trips.organization_id`; P1-D control plane incomplete) |
| BEFORE | Contract v1: S2 `inputEvidenceVersion` = combined input identity only; 7 states / 11 transitions without DB-clock expiry on T07–T09; replay could reach SKIPPED; no retirement path; tenancy guard on a nonexistent column; no flag/allowlist/kill-switch semantics; validator accepted invalid mutations |
| CHANGE | Contract **v2** `s4a-contract.v2.json` (`DI_V0_S4A_CONTRACT_V2`; v1 kept): `DI_V0_S4_EXECUTION_IDENTITY_V1` as S2 `inputEvidenceVersion`; tenancy TRIP_VEHICLE_ORGANIZATION; `S4A_CONTROL_PLANE.md` (6 flags default OFF, EMPTY=NONE intersected allowlists, DB kill row missing=KILLED, pipeline registry + retirement); 13 transitions; lease 240/300/60/900 semantics; UTC time authority; recorded-only quiet re-arm + fingerprint for unrecorded mutations; enforcing validator + red-team suite (`validate-s4a-contract-negative.mjs`); design docs amended with AMENDED BY log; DI-CONTRA-S4A-TENANCY-SCHEMA-001 (RESOLVED); DI-GAP-S4-PROVIDER-BACKPRESSURE-001 (OPEN); P2 reconciliation; SynqDrive Code views |
| WHY | Every C1D.10B P1 must be closed by construction and proven by a validator that rejects each invalid mutation before any S4A code exists |
| ALTERNATIVES | See DI-DEC-V0-S4A-CONTRACT-V2-001 (change S2 key fn, denormalize org onto trips, env-only kill switch, EMPTY=ALL allowlist, ceiling-less lease — all rejected) |
| NON_EFFECTS | No backend/prisma change, migration, table, flag, seed, worker, scheduler, BullMQ wiring, provider call, Production write, deploy or customer path; S1/S2/S3A/S3B unchanged; DIMO Integration + Trips consulted only |
| Validation | `validate-s4a-contract.sh`: 47 negative (0 false accepts) / 21 positive (0 false rejects); DI graph + docs, DIMO graph, module registry validators; frontend tsc + `i18n:check`; backend typecheck |
| Gaps | DI-GAP-S4-PROVIDER-BACKPRESSURE-001 (new, OPEN); DI-GAP-S4-REPLAY-DESERIALIZER-001, DI-GAP-S4-NATIVE-READINESS-001, DI-GAP-S4-LOCATION-RETENTION-001, DI-GAP-S4-SHADOW-DELETION-AUDIT-001 unchanged (OPEN) |
| Status | `PROPOSED` — draft PR #1810, design only |
| Evidence | `evidence/EXP021_C1D10C_AUTHORITY_CLOSURE.md` (DI-EVID-EXP021-C1D10C-001) |
| Decision | `DI-DEC-V0-S4A-CONTRACT-V2-001` (amends `DI-DEC-V0-S4A-CONTRACT-001`) |

### EXP-021 C1D.10E — DB kill write-set closure (2026-09-27)

| Event | Detail |
|-------|--------|
| Trigger | C1D.10D re-seal P1-E: T03/T08/T09 writable while DB killed despite writesAllowedWhileDisabled=[T07] |
| CHANGE | Contract v2 amendment (no version bump): `CONTROL_PLANE_DB_NOT_KILLED` on T01–T06,T08–T13; `killPolicy` + `authoritativeWrites` (19); K01–K18 kill races; validator exhaustiveness; 18 new negative cases; CI workflow `s4a-authority-governance.yml` |
| NON_EFFECTS | No runtime, migration, worker, provider, Production write |
| Evidence | `evidence/EXP021_C1D10E_KILL_WRITESET_CLOSURE.md` (DI-EVID-EXP021-C1D10E-001) |

### EXP-021 S4A — Dormant execution foundation implementation (2026-09-27)

| Event | Detail |
|-------|--------|
| Trigger | S4A CONTROLLED_IMPLEMENTATION from merged authority `DI_V0_S4A_CONTRACT_V2` (PR #1810) |
| BEFORE | S4 existed as design + machine contract only; no schema, no repository, no S4 tables in repo or Production |
| CHANGE | Migration `20260927200000_di_v0_s4a_dormant_foundation` (work items, evidence snapshots, pipeline-version registry, DB kill row, tenancy + immutability + S2 scope triggers); library `driving-intelligence/s4a-foundation/` (exact 13-transition fenced repository, no generic setStatus; identities incl. `DI_V0_S4_EXECUTION_IDENTITY_V1`; `clock_timestamp()` lease/fencing/takeover; fail-closed control plane; supersession; atomic fenced S2 persistence); channel-policy V1 family applicability; test-only Postgres bootstrap + npm scripts `test:di:s4a`, `test:di:s4a:postgres` |
| WHY | Contract v2 requires a DB-enforced, provably race-safe foundation before any S4B/S4C runtime |
| ALTERNATIVES | Application-only tenancy (rejected: contract requires DB enforcement); advisory-lock kill (rejected: control row `FOR UPDATE` makes kill serialization provable); generic status update (forbidden by contract) |
| NON_EFFECTS | No discovery, scheduler, cron, BullMQ queue/producer/consumer, worker, Nest provider, endpoint, DIMO call, R1/native acquisition, S1/S2 runtime invocation, flag activation, allowlisting, threshold or calibration; no Production write, migration or deploy. `DI_S4A_RUNTIME_CALL_SITE_COUNT=0` |
| Validation | 175/175 S4A tests (parity 9, fixtures 98, dormant audit 7, Postgres races R01–R25 + K01–K18 = 51, migration M01–M08 = 10); races stable over 3 reruns; backend tsc/build 0; all architecture validators pass |
| Gaps | OPEN: DI-GAP-S4A-BOUNDARY-REVERT-SUCCESSOR-001, DI-GAP-S4A-POSTGRES-CI-WIRING-001, DI-GAP-S4A-CONTROL-ROW-SERIALIZATION-001 (P2); contradictions DI-CONTRA-S4A-T13-SUCCESSOR-WRITE-BINDING-001, DI-CONTRA-S4A-CONTAINER-VERSION-NAMING-001, DI-CONTRA-S4A-ON-UPDATE-CASCADE-IMMUTABILITY-001 (P2). All prior P2 gaps preserved |
| Incident | Running `npm run i18n:check` regenerated the untracked-in-scope working-tree file `frontend/src/i18n/hardcoded-copy-inventory.json` (md5 e68ad5b6… → 4a8de450…); the prior local content was not recoverable. It was never staged or committed. Future runs use `node scripts/i18n-check.mjs --read-only` |
| Status | MERGED — PR #1816 → `main` @ `2c321823a` (2026-09-28); Production migration apply gated — see post-merge deploy gate |
| Evidence | `evidence/EXP021_S4A_DORMANT_FOUNDATION_IMPLEMENTATION.md` (DI-EVID-EXP021-S4A-IMPL-001) |
| Decision | DI-DEC-V0-S4A-IMPL-001 |

### EXP-021 S4A — Merge to main + post-merge deploy gate (2026-09-28)

| Event | Detail |
|-------|--------|
| Trigger | `EXP021_S4A_FINAL_PREMERGE_SEAL_RESULT=PASS`; authorized controlled merge of PR #1816 |
| CHANGE | Merged PR #1816 (`77d112dba`) via merge commit `2c321823a`; activated operational gate `DO_NOT_DEPLOY_S4A_MIGRATION_TO_PRODUCTION` until Postgres CI wiring + deploy-readiness seal |
| NON_EFFECTS | No deploy, no Production migration, no S4 runtime, no shadow activation, no flags, no allowlisting |
| Evidence | `evidence/EXP021_S4A_POST_MERGE_DEPLOY_GATE.md` (DI-EVID-EXP021-S4A-POST-MERGE-GATE-001) |
| Next slice | `S4A_POSTGRES_CI_WIRING_AND_DORMANT_DEPLOY_READINESS` |

### EXP-021 S4A — PostgreSQL CI wiring + dormant deploy readiness (2026-09-28)

| Event | Detail |
|-------|--------|
| Trigger | Post-merge gate; `S4A_POSTGRES_CI_WIRING_AND_DORMANT_DEPLOY_READINESS` |
| CHANGE | `.github/workflows/s4a-postgres-integration.yml`; `test:di:s4a:postgres:ci` with `DI_V0_S4A_POSTGRES_REQUIRED=1`; fail-closed harness; deploy gate → `READY_FOR_SEPARATE_OPERATOR_DEPLOY_DECISION` |
| NON_EFFECTS | No deploy, no Production migration, no S4 runtime |
| Gaps | DI-GAP-S4A-POSTGRES-CI-WIRING-001 **CLOSED**; all other P2 gaps preserved |
| Evidence | `evidence/EXP021_S4A_POSTGRES_CI_WIRING.md` (DI-EVID-EXP021-S4A-POSTGRES-CI-001) |
| Next slice | `S4A_DORMANT_DEPLOY_PRECHECK` (operator + branch protection required check) |

### EXP-021 S4B — Boundary revert + T13 precondition closure (2026-09-28)

| Event | Detail |
|-------|--------|
| Trigger | `S4B_PRECONDITION_CLOSURE` (authority only; no S4 runtime) |
| CHANGE | `S4A_BOUNDARY_REVERT_AUTHORITY.md`, `S4A_T13_HOLDER_SUPERSEDE_AUTHORITY.md`; contract v2 C1D.10F (`boundaryOccurrence`, `EXECUTION_IDENTITY_V2`, T13 guard + R24 fixture); validator + TS mirror |
| Gaps | DI-GAP-S4A-BOUNDARY-REVERT-SUCCESSOR-001 **CLOSED** (authority); implementation follow-up |
| Contradictions | DI-CONTRA-S4A-T13-SUCCESSOR-WRITE-BINDING-001 **RESOLVED** |
| NON_EFFECTS | No Production write/migration/deploy; no S4B runtime |
| Evidence | `evidence/EXP021_S4B_PRECONDITION_CLOSURE.md` (DI-EVID-EXP021-S4B-PRECOND-001) |
| Next slice | `S4B_PRECONDITION_IMPLEMENTATION` (schema + repository + BR/T13 Postgres tests) |

### EXP-021 S4B — Discovery + claim orchestration engineering start (2026-09-28)

| Event | Detail |
|-------|--------|
| Trigger | `EXP021_S4B_ENGINEERING_START` (implementation; dormant / default-OFF) |
| CHANGE | `s4b-orchestration/` — discovery service (T01 only), leader-guarded `di_v0_s4_discovery`, replica-local claim loop, executor port, canonical pipeline manifest builder; scheduler registry entries; `npm run test:di:s4b*` |
| NON_EFFECTS | No AppModule registration, no deploy, no Production env/control row, no provider acquisition (S4C), no BullMQ, no schema migration |
| Evidence | `evidence/EXP021_S4B_ENGINEERING_START.md` |
| Next slice | `S4B_IMPLEMENTATION_PREMERGE_AUDIT` (draft PR; no merge/deploy/activation) |

### EXP-021 S4B — P1 pre-merge closure (2026-09-28)

| Event | Detail |
|-------|--------|
| Trigger | Independent pre-merge audit P1-A (attempt-start boundary recheck) + P1-B (SETTLED durable terminal postcondition) |
| CHANGE | `evaluateAttemptStartBoundary` + `readExecutionPostcondition` (S4A repository read helpers); claim loop invokes T13 on mismatch; `EXECUTOR_POSTCONDITION_FAILED` T07 reason; tests `S4B-P1A-*` / `S4B-P1B-*` |
| NON_EFFECTS | No new transitions/schema; no S4C; no deploy/Production write |
| Evidence | `evidence/EXP021_S4B_ENGINEERING_START.md` §P1 pre-merge closure |
| Next slice | `S4B_FINAL_RESEAL` (re-audit PR #1833; still draft, no merge) |

### EXP-021 S4C — Live same-attempt shadow executor (2026-09-29)

| Event | Detail |
|-------|--------|
| Trigger | `EXP021_S4C_ENGINEERING_START` (dormant; no AppModule / no Production activation) |
| CHANGE | `s4c-executor/` — DB read-only acquisition context, DIMO `POST_TRIP_ENRICHMENT`/`BACKGROUND` ports, S3A position + optional S3B R1, T05 pin + same-attempt S1 + T06; `npm run test:di:s4c*`; dormant audits updated for S4C consumer |
| NON_EFFECTS | No deploy, no control row, no S4D replay, no schema migration, no customer paths |
| Evidence | `evidence/EXP021_S4C_ENGINEERING_START.md` |
| Next slice | `S4C_IMPLEMENTATION_PREMERGE_AUDIT` |

### EXP-021 S4D — Verified pin replay (2026-09-29)

| Event | Detail |
|-------|--------|
| Trigger | `EXP021_S4D_ENGINEERING_START` after S4C merge @ `78ee9909` |
| CHANGE | `s4d-replay/` verified gunzip+rehash+parse; position/R1/container strict parsers; `readVerifiedPinnedEvidence`; S4C executor routes pinned work to S4D (single registry executor); contract gap `DI-GAP-S4-REPLAY-DESERIALIZER-001` CLOSED |
| NON_EFFECTS | No deploy, no AppModule, no S4E/S4F, no schema migration |
| Evidence | `evidence/EXP021_S4D_ENGINEERING_START.md` |
| Next slice | Complete S4D postgres matrix D-02–D-16 + R1/container equivalence tests; then `S4D_IMPLEMENTATION_PREMERGE_AUDIT` |

### EXP-021 S4D — P1 independent-audit closure (2026-09-29)

| Event | Detail |
|-------|--------|
| Trigger | `EXP021_S4D_P1_CLOSURE` on PR #1841 @ `b9761a55` |
| CHANGE | Provider-independent replay routing (`readReplayRoutingContext`); DB manifest exact parity; inner POSITION/R1 scope cross-bind; S4D abort guards; strict POSITION/R1 semantic parsers; postgres D-17–D-19 + adversarial unit matrix |
| NON_EFFECTS | No deploy, no schema/migration, no AppModule, no S4E/S4F |
| Evidence | `evidence/EXP021_S4D_P1_CLOSURE.md` |
| Gap | `DI-GAP-S4-REPLAY-DESERIALIZER-001` CLOSED after P1-A..P1-E gates |

### EXP-021 S4E-1 — Dormant boundary drift watcher (2026-09-29)

| Event | Detail |
|-------|--------|
| Trigger | `EXP021_S4E_ENGINEERING_START` after S4D merge @ `06955ea65` |
| CHANGE | `s4e-drift-watcher/` bounded candidate scan, canonical boundary re-hash, `DiV0S4DriftWatcherService` → `supersedeOnDrift` (T11 only); leader scheduler `di_v0_s4_drift_watcher`; CI `test:di:s4e` + postgres matrix S4E-D01..D15 |
| NON_EFFECTS | No deploy, no AppModule, no schema migration, no T10/T12 schedulers, no S4F |
| Evidence | `evidence/EXP021_S4E_ENGINEERING_START.md` |
| Inventory | T10 `reapExhausted` + T12 `retirePipelineItems` repository-ready; scheduling deferred |

### EXP-021 S4E-2 — Dormant T10/T12 maintenance reapers (2026-09-29)

| Event | Detail |
|-------|--------|
| Trigger | `EXP021_S4E2_MAINTENANCE_REAPERS` after S4E-1 merge @ `11adaf76` |
| CHANGE | `DiV0S4MaintenanceService` + `di_v0_s4_maintenance_reaper` scheduler; bounded RETIRED pipeline enumeration; T10/T12 delegate only to repository; postgres S4E2-M01..M21 |
| NON_EFFECTS | No deploy, no AppModule, no schema migration, no S4F, no contract change to T11 successor rules |
| Evidence | `evidence/EXP021_S4E2_MAINTENANCE_REAPERS.md` |
| Race | T11↔T12 TOCTOU documented; claim blocked + T12 cleanup; S4E2-M19/M20 |

### EXP-021 S4E-2 — CLASS A retirement hardening (2026-09-29)

| Event | Detail |
|-------|--------|
| Trigger | Adversarial audit PR #1845; gap `DI-GAP-S4A-T11-RETIRED-SUCCESSOR-TOCTOU-001` |
| BEFORE | CLASS B: `retireRegistry` test DML + T11 `FOR SHARE`; durable PENDING successor under RETIRED possible |
| CHANGE | `retirePipelineVersion` authoritative retirement; T11 registry `FOR UPDATE` before work item; harness `retireRegistry` → repository; tests S4E2-A01..A10 |
| WHY | Strong serialized invariant required before S4E complete; refinement within BR07 / pipeline retirement authority (no `s4a-contract.v2.json` amendment) |
| NON_EFFECTS | S4 dormant; bounded T12 scheduler unchanged for RETIRED stragglers; no schema migration |
| Evidence | `evidence/EXP021_S4E2_MAINTENANCE_REAPERS.md` (invariant class table) |

### EXP-021 S4F-1 — Observability + reconciliation + activation-readiness foundation (2026-09-30)

| Event | Detail |
|-------|--------|
| Trigger | S4A–S4E engineering-complete; next dormant slice S4F-1 |
| CHANGE | `s4f-observability/` read-only reconciliation, `DI_V0_S4_OBSERVABILITY_SNAPSHOT_V1`, beyond-horizon boundary report (no T11), activation-readiness evaluator, provider backpressure audit (OPEN), location retention governance note, executor liveness (local-only) |
| NON_EFFECTS | No deploy, no AppModule, no purge scheduler, no provider calls, no tiny activation, no contract v2 amendment |
| Evidence | `evidence/EXP021_S4F1_OBSERVABILITY_RECONCILIATION.md` |
| Gap | `DI-GAP-S4F-GLOBAL-EXECUTOR-LIVENESS-001` documented (no global executor presence authority) |

### EXP-021 S4F-1 — independent pre-merge audit remediation (2026-09-30)

| Event | Detail |
|-------|--------|
| Trigger | Pre-merge audit of PR #1853 @ `e4d8fe26f` |
| CHANGE | Fail-closed activation evidence; truthful aggregate boundedness; T10 metric parity; S4E canonical scope on beyond-horizon; single-connection READ ONLY proof; retired-pipeline classification; control-plane kill evaluation |
| NON_EFFECTS | No provider gap closure; no activation; no contract v2 amendment |
| Evidence | `EXP021_S4F1_OBSERVABILITY_RECONCILIATION.md` remediation section |

### EXP-021 S4F-1 — final evidence hardening H1–H4 (2026-09-30)

| Event | Detail |
|-------|--------|
| Trigger | Pre-merge proof gaps on PR #1853 @ `479035a45` |
| CHANGE | H1 full S3A→S4C→T07 unit proofs; H2 scan watermark cursor; H3 query-only read DB + audit; H4 operational index audit (no migration) |
| NON_EFFECTS | No activation, no provider gap closure, no retry semantic change |
| Evidence | `EXP021_S4F1_OBSERVABILITY_RECONCILIATION.md` H1–H4 section |

### EXP-021 S4F-2 — provider backpressure certification (2026-09-30)

| Event | Detail |
|-------|--------|
| Trigger | Tiny activation gate `DI-GAP-S4-PROVIDER-BACKPRESSURE-001:CLOSED` on main @ `60f925b2c` |
| CHANGE | Real Redis two-replica budget certification; S4C frozen DIMO context (no bypass inheritance); `providerGlobalBudgetEnabled` activation evidence |
| NON_EFFECTS | No S4 activation, no deploy, no production provider calls, no AppModule registration |
| Evidence | `EXP021_S4F2_PROVIDER_BACKPRESSURE_CLOSURE.md` |

### EXP-021 S4F-2 remediation — certification defects (2026-09-30, PR #1855)

| Event | Detail |
|-------|--------|
| Trigger | Independent review: invalid lease test config, PB01/PB11 saturation composition, cooldown vs reserved-slot authority |
| CHANGE | `globalLeaseMs≥5000` + real wait; 3 BACKGROUND + 1 HIGH global cap tests; PB27–29 cooldown priority behavior; contract `globalCircuitBreaker.status=CLOSURE_CANDIDATE`; `globalProviderCooldown` block |
| AUTHORITY | P1.3 acquire step 2 — global cooldown before priority; no separate cooldown-priority activation gap opened |
| Gap | `DI-GAP-S4-PROVIDER-BACKPRESSURE-001` → **CLOSURE_CANDIDATE** (Tiny Activation requires **CLOSED**) |

### EXP-021 S4F-2 final closure seal (2026-09-30, PR #1855)

| Event | Detail |
|-------|--------|
| Trigger | Remote Redis certification PASS on pre-seal head `e5902f89a` (S4A run 36735099353; 10/10 Redis); deterministic S4E2-A1; i18n authority approval run 36740380917 |
| CHANGE | Promote `DI-GAP-S4-PROVIDER-BACKPRESSURE-001` to **CLOSED** in certification marker, `s4a-contract.v2.json`, graph, `CURRENT_STATE.md`, evidence |
| NON_EFFECTS | No S4 runtime activation; no deploy; `productionLoadCertification` remains NOT_CLAIMED; Tiny Activation NOT_READY without global budget + operator auth |
| Main sync | Merge `7744e3983` into PR branch; `package.json` preserves main + provider-budget scripts |
| Gap | **CLOSED** |

### EXP-021 S4F-3 Tiny Activation evidence audit (2026-09-30)

| Event | Detail |
|-------|--------|
| Trigger | Post–S4F-2 merge; read-only Production env audit for explicit `DIMO_GLOBAL_BUDGET_ENABLED` |
| CHANGE | Evidence `EXP021_S4F3_TINY_ACTIVATION_EVIDENCE_AUDIT.md`; strict Tiny budget env classifier + read-only ops audit script; graph/CURRENT_STATE metadata for governance note + replay CLOSED |
| FINDING | Production `/opt/synqdrive/shared/backend.env` lacks explicit `DIMO_GLOBAL_BUDGET_ENABLED` → Tiny budget gate NOT_SATISFIED; operator auth remains UNKNOWN |
| NON_EFFECTS | No deploy, no env mutation, no S4 activation, no operator grant |
| Gap | Location retention: GOVERNANCE_NOTE for Tiny satisfied; purge/scale-up privacy still open |

### EXP-021 S4F-3 runtime evidence hardening (2026-09-30, PR #1861)

| Event | Detail |
|-------|--------|
| CHANGE | Split config-file vs runtime global-budget evidence; CONFIG_FILE_ONLY audit; resolver for ENABLED; ops authority = reusable `vps-production-replica.lib.sh` primitives (no dedicated DIMO config-only wrapper; RFRF stage script pattern-only, not executable authority for DIMO) |
| FINDING | File audit alone cannot satisfy Tiny global-budget gate; Production config currently MISSING explicit var |
| NON_EFFECTS | No Production mutation/restart/deploy |

### EXP-021 S4F-4 DIMO global-budget config-only ops wrapper (2026-09-30)

| Event | Detail |
|-------|--------|
| Trigger | S4F-3 gap `NEW_DIMO_CONFIG_ONLY_OPS_WRAPPER_REQUIRED=YES` |
| CHANGE | `di-v0-s4f-enable-global-budget-production.sh` + rollout lib/CLI/tests; evidence `EXP021_S4F4_DIMO_GLOBAL_BUDGET_CONFIG_ONLY_OPS.md`; S4F ops S4 control preflight helper |
| NON_EFFECTS | **No Production execution** (no env mutation, restart, deploy, S4 activation, operator grant, DIMO provider calls) |
| NEXT | Operator ACK + approved SHA + run wrapper on Production when authorized |

### EXP-021 S4F-4 runtime proof hardening (2026-09-30, PR #1863)

| Event | Detail |
|-------|--------|
| CHANGE | Live per-replica Prometheus gauge `synqdrive_dimo_global_budget_enabled`; remove PM2 log as authority; canonical Redis PING; env UID/GID preservation; recovery + rollback post-verify; explicit PRODUCTION_ENV_MUTATED derivation |
| NON_EFFECTS | No Production execution |

### EXP-021 S4F-5 Production preflight — global budget rollout readiness (2026-10-01)

| Event | Detail |
|-------|--------|
| CHANGE | Read-only VPS audit; `di-v0-s4f5-production-preflight.sh`; evidence `EXP021_S4F5_PRODUCTION_PREFLIGHT.md` |
| FINDING | Production `1dd42240…` healthy dual-replica; **behind** main `8fa531b27…`; S4F-4 assets absent; config `MISSING`; `PRODUCTION_ROLLOUT_PREREQUISITE=DEPLOY_REQUIRED` |
| NON_EFFECTS | No deploy, env mutation, restart, S4 activation, DIMO provider calls, or S4F-4 mutation mode |

### EXP-021 S4F-5.1 Production release delta preflight (2026-10-01)

| Event | Detail |
|-------|--------|
| CHANGE | Evidence `EXP021_S4F5_1_RELEASE_DELTA_PREFLIGHT.md` — VO2 migrations NOT_APPLIED; data/FK/duplicate/collision checks pass; `DEPLOY_READINESS=PASS` for SHA `8fa531b27…` via `vps-deploy-release.sh` |
| FINDING | 16 historical rolled-back `_prisma_migrations` tombstones; 0 active incomplete migrations; Production link index differs from Prisma name `uq_data_source_link_active` (VO2.1 uses DROP IF EXISTS) |
| NON_EFFECTS | No deploy, migrate, env mutation, or restart |

### EXP-021 S4F-7C exact-SHA dormant deploy authorization gate (2026-10-02)

| Event | Detail |
|-------|--------|
| CHANGE | Read-only re-validation vs S4F-7B; evidence `EXP021_S4F7C_EXACT_SHA_DORMANT_DEPLOY_AUTHORIZATION_GATE.md`; frozen deploy command for SHA `ee958854…` only |
| FINDING | Production `8fa531b27…` unchanged; **PASS**; `HUMAN_DORMANT_DEPLOY_AUTHORIZATION=NOT_GRANTED_IN_THIS_TASK` |
| NON_EFFECTS | No deploy execution in S4F-7C; human deploy followed in S4F-7D |

### EXP-021 S4F-7D exact-SHA dormant Production deploy (2026-10-02)

| Event | Detail |
|-------|--------|
| CHANGE | Executed canonical `cloud-agent-deploy.sh` with `SYNQDRIVE_REQUESTED_DEPLOY_SHA=ee958854…`; evidence `EXP021_S4F7D_DORMANT_PRODUCTION_DEPLOY_RESULT.md` |
| FINDING | Production now `ee958854…` release `20261002014651_v4994`; `DiV0S4RuntimeModule` boot-registered; S4 dormant/fail-closed preserved; **0** migration applied |
| NON_EFFECTS | No kill initializer, no S4 env activation, no operator grant, no Tiny |

### EXP-021 S4F-7F Production kill initializer wrapper engineering (2026-10-02)

| Event | Detail |
|-------|--------|
| CHANGE | Guarded Production wrapper `di-v0-s4-initialize-global-kill-row-production.sh` + TS guard lib/CLI + tests (`test:di:s4f7f:kill-init-wrapper`); evidence `EXP021_S4F7F_PRODUCTION_KILL_INITIALIZER_WRAPPER_ENGINEERING.md` |
| FINDING | Wrapper can run from newer `main` while invoking initializer under verified release `ee958854…` / `20261002014651_v4994`; **`WRAPPER_REQUIRES_NEW_CODE_DEPLOY_BEFORE_USE=NO`** |
| NON_EFFECTS | No Production GLOBAL row write, no env/PM2/deploy, no Tiny/operator grant |

### EXP-021 S4F-7J Tiny config staging wrapper engineering (2026-10-02)

| Event | Detail |
|-------|--------|
| CHANGE | Dedicated Production wrapper `di-v0-s4-stage-tiny-production.sh` (exactly three frozen env keys), TS guard/mutation lib + CLI, bash helpers, cloud bootstrap `.cursor/scripts/cloud-agent-s4-tiny-staging.sh`, tests `test:di:s4f7j:tiny-staging-wrapper` (32 cases); evidence `EXP021_S4F7J_TINY_CONFIG_STAGING_WRAPPER_ENGINEERING.md` |
| FINDING | **`SUPPORTED_ENV_MUTATION_KEY_COUNT=3`**; S4F-4 global-budget wrapper unchanged; recovery + rolling restart A→B + filtered `/proc` runtime proof |
| NON_EFFECTS | No Production env/DB/restart/deploy; Tiny gate **NOT_SATISFIED**; GLOBAL remains **KILLED** |

### EXP-021 S4F-7J.1 Tiny staging wrapper safety closure (2026-10-02)

| Event | Detail |
|-------|--------|
| CHANGE | PR #1888 closure: remove Ops→S4B import (`di-v0-s4-tiny-staging-frozen-not-before.ts`); live topology/budget/Redis pre-mutation gates; exact three-key diff + independent post-write verify; fatal config audit; `PRIMARY_STAGING` / `RECOVERY_PRESTATE` runtime proofs; full rollback verification; DIMO R1 vehicle SQL authority; safe `/proc` sudo read; durable backup dir |
| FINDING | **`S4B_DORMANT_AUDIT=PASS`**; **`OPS_DIRECT_S4B_IMPORT_COUNT=0`**; wrapper tests **47** |
| NON_EFFECTS | No Production mutation/deploy/restart/DB write |

### EXP-021 S4F-7K Production Tiny staging dry run (2026-10-02)

| Event | Detail |
|-------|--------|
| CHANGE | Read-only Production `DRY_RUN=1` via `cloud-agent-s4-tiny-staging.sh`; remediation commits on evidence branch (text `vehicle_id` SQL, sudo bootstrap env, `dry-run-intent`); evidence `EXP021_S4F7K_PRODUCTION_TINY_STAGING_DRY_RUN.md` |
| FINDING | **`PRODUCTION_TINY_STAGING_DRY_RUN_READINESS=PASS`** on tool SHA `947a70540…`; frozen merge `040170104…` **`VEHICLE_DB_PROOF=FAIL`** (`::uuid` on text ids); **`GUARDS_OK=YES`**; intended **3** env keys; **`ENV_MUTATION_COUNT=0`**; post `backend.env` SHA256 unchanged; replica PIDs unchanged |
| NON_EFFECTS | No Production env/DB/restart/deploy/migration/provider call; **`TINY_ACTIVATION_READY=NO`** |

### EXP-021 S4F-7P Exact-RC Production deploy preflight (2026-10-03)

| Event | Detail |
|-------|--------|
| CHANGE | Read-only Production reverify + RC `9d286e58a…` seal recheck; deploy mechanism audit; migration preflight `RC_PENDING_MIGRATION_COUNT=0`; evidence `EXP021_S4F7P_EXACT_RC_PRODUCTION_DEPLOY_PREFLIGHT.md` |
| FINDING | Production matches `ee958854…`; attestation metric **absent** (expected); future deploy SHA **`9d286e58ac7a4b5b6900b48c64b92fdb21afa6f4`** only |
| NON_EFFECTS | No Production mutation; `PRODUCTION_DEPLOY_AUTHORIZATION_PRESENT=NO` |

### EXP-021 S4F-7O Minimal attestation release candidate seal (2026-10-03)

| Event | Detail |
|-------|--------|
| CHANGE | Branch `release/exp021-s4f7o-minimal-attestation-rc1` @ **`9d286e58ac7a4b5b6900b48c64b92fdb21afa6f4`** (parent `ee958854…` + 4 S4F-7M runtime files from `c29179366…`); evidence `EXP021_S4F7O_MINIMAL_ATTESTATION_RELEASE_CANDIDATE_SEAL.md` |
| FINDING | **4-file seal**; build + attestation integration + S4A/S4F PASS on candidate; **no Production action** |
| NON_EFFECTS | RC not merged to main; deploy requires **new human authorization** |

### EXP-021 S4F-7P exact-RC deploy preflight + S4F-7Q readiness correction (2026-10-03)

| Event | Detail |
|-------|--------|
| CHANGE | Evidence PR **#1898** `EXP021_S4F7P_EXACT_RC_PRODUCTION_DEPLOY_PREFLIGHT.md`; S4F-7Q corrects §9 readiness (no technical A→PRESTATE gate in `vps_replica_rolling_deploy`) |
| FINDING | **`REPLICA_A_ATTESTATION_GATE_BEFORE_B=NO`**; **`DEPLOY_WRAPPER_REMEDIATION_REQUIRED=YES`**; **`EXACT_RC_PRODUCTION_DEPLOY_PREFLIGHT_READY=NO`** |
| NON_EFFECTS | No Production deploy |

### EXP-021 S4F-7Q exact-RC deploy guard + migration rehearsal (2026-10-03)

| Event | Detail |
|-------|--------|
| CHANGE | Opt-in `SYNQDRIVE_DI_S4F7Q_EXACT_RC_ATTESTATION_GATE`; `di-v0-s4f7q-*` lib/CLI/bash; disposable VPS migration rehearsal; evidence `EXP021_S4F7Q_EXACT_RC_DEPLOY_GUARD_ENGINEERING.md` |
| FINDING | **`DISPOSABLE_MIGRATE_DEPLOY=PASS`** (0 applied); **`EXACT_RC_MIGRATION_DEPLOY_COMPATIBLE_WITH_CURRENT_DB_AHEAD_BASELINE=YES`**; **26** guard tests |
| NON_EFFECTS | RC commit unchanged; no Production mutation |

### EXP-021 S4F-7R immutable deploy controller authority bridge (2026-10-03)

| Event | Detail |
|-------|--------|
| CHANGE | `SYNQDRIVE_DEPLOY_CONTROLLER_ROOT` + `EXPECTED_DEPLOY_CONTROLLER_SHA`; guarded deploy sources replica/S4F-7Q from controller checkout; rollback disables forward gate; branch `release/exp021-s4f7r-deploy-controller-rc1`; evidence `EXP021_S4F7R_IMMUTABLE_DEPLOY_CONTROLLER_AUTHORITY_BRIDGE.md` |
| FINDING | Post-merge integration defect confirmed: RC deploy could not reach S4F-7Q tooling; **13** controller tests + S4F-7Q regression |
| NON_EFFECTS | Runtime RC `9d286e58…` unchanged; Production still blocked pending controller seal |

### EXP-021 S4F-7S final exact-controller Production deploy preflight (2026-10-06)

| Event | Detail |
|-------|--------|
| CHANGE | Read-only Production + controller checkout preflight; fresh disposable migration rehearsal @ RC `9d286e58…`; evidence `EXP021_S4F7S_FINAL_EXACT_CONTROLLER_PRODUCTION_DEPLOY_PREFLIGHT.md` |
| FINDING | **`FINAL_RESULT=BLOCKED_PRODUCTION_RUNTIME_DRIFT`** — live `0c19eb62…` / `20261006064327_v4994` vs frozen `ee958854…`; attestation metric present on current runtime; disposable `prisma migrate deploy` **PASS** (0 applied) on 404-row clone |
| NON_EFFECTS | No Production mutation; no deploy authorization |

### EXP-021 S4F-7U fresh Tiny staging authority / NO_BACKFILL preflight (2026-10-06)

| Event | Detail |
|-------|--------|
| CHANGE | Read-only Production + DB seal for fresh `NOT_BEFORE` / nine-key fingerprint; evidence `EXP021_S4F7U_FRESH_TINY_STAGING_AUTHORITY_PREFLIGHT.md` |
| FINDING | **`FINAL_RESULT=PASS`** — `FRESH_TINY_NOT_BEFORE=2026-10-06T18:33:26.610Z`, fingerprint `9abb1a57…`, v1 state **OTHER**; old `2026-10-02` cutoff would expose **14** trips; S4F-7J tooling incompatible → **`S4F7V_REQUIRED=YES`** |
| NON_EFFECTS | No Production mutation; Gate 6 **NOT_SATISFIED**; Tiny activation **NO** |

### EXP-021 S4F-7V fresh fingerprint Tiny staging tooling (2026-10-07)

| Event | Detail |
|-------|--------|
| CHANGE | Fresh-operator path `di-v0-s4-stage-tiny-fresh-production.sh` + TS lib/CLI/tests; `test:di:s4f7v:fresh-tiny-staging-wrapper`; S4A dormant-audit allowlist for ops import; evidence `EXP021_S4F7V_FRESH_FINGERPRINT_TINY_STAGING_TOOLING_ENGINEERING.md` |
| FINDING | **`FINAL_RESULT=PASS`** (engineering) — separate path from S4F-7J; fresh authority ≤900 s (PostgreSQL clock); primary attestation **v1 OTHER** + exact fingerprint; S4F-7U sample authority **non-executable** |
| NON_EFFECTS | No Production mutation/deploy/restart/DB write; no runtime attestation classification change; Gate 6 **NOT_SATISFIED** |

### EXP-021 S4F-7W fresh Tiny dry-run execution wiring closure (2026-10-07)

| Event | Detail |
|-------|--------|
| CHANGE | `s4f7w_live_preflight_readonly` + full dry-run orchestration in fresh wrapper; fatal apply-mutation-dry/intended-delta; **80** wrapper tests; evidence `EXP021_S4F7W_FRESH_TINY_DRY_RUN_EXECUTION_WIRING_CLOSURE.md` |
| FINDING | S4F-7V pure guards were correct; wrapper dry-run was incomplete (no full live evidence, swallowed CLI failures); **`DRY_RUN_FULL_GUARD_PATH_EXECUTED=YES`** after fix; live shell staging **still fail-closed** |
| NON_EFFECTS | No Production mutation; no tool SHA seal; Gate 6 **NOT_SATISFIED** |

### EXP-021 S4F-7X exact tool JIT Production dry-run (2026-10-07)

| Event | Detail |
|-------|--------|
| CHANGE | Evidence `EXP021_S4F7X_EXACT_TOOL_JIT_PRODUCTION_DRY_RUN.md` (**PASS**); bootstrap `.cursor/scripts/cloud-agent-s4f7x-fresh-tiny-dry-run.sh`; JIT authority `2026-10-07T14:54:57.152Z` + `fc8df190…`; tool SHA `11b4a80ccb88d1d6f747399f84667b06c9a71050` |
| FINDING | Access recovery + original `DRY_RUN=1` **PASS** @ `3c12875d…`; deterministic evidence-completion rerun with PRE/POST PID + PRESTATE attestation **PASS** @ `a376c965…`; **`S4F7X_COMBINED_EVIDENCE_COMPLETE=YES`** (PR **#1912**); **`S4F7X_ORIGINAL_RUN_EVIDENCE_COMPLETE=NO`** preserved |
| NON_EFFECTS | No live staging; no Gate 6; no provider calls; S4F-7U cutoff **not** reused |

### EXP-021 S4F-7Y fresh Tiny live-staging transaction execution closure (2026-10-07)

| Event | Detail |
|-------|--------|
| CHANGE | Live transaction lib `di-v0-s4-fresh-tiny-staging-live-transaction.lib.sh`; live authority packet `di-v0-s4-fresh-tiny-staging-live-authority.lib.ts`; fresh wrapper live branch; CLI `validate-live-authorization` / `validate-no-backfill-final` / `apply-mutation-live`; evidence `EXP021_S4F7Y_FRESH_TINY_LIVE_STAGING_EXECUTION_CLOSURE.md` |
| FINDING | **`LIVE_STAGING_SHELL_EXECUTION_READY=YES`** with **`DI_S4F7Y_LIVE_STAGING_AUTHORIZED=YES`** + exact `AUTHORIZED_*` packet; S4F-7W/S4F-7X dry-run preserved; test harness covers rollback + A-before-B barrier |
| NON_EFFECTS | No Production staging executed in engineering slice; Gate 6 **NOT_SATISFIED**; no provider calls; no GLOBAL / six-flag mutation |

### EXP-021 S4F-7Y.1 fresh Tiny live-staging transaction safety seal (2026-10-07)

| Event | Detail |
|-------|--------|
| CHANGE | Safety seal on PR **#1915** — remove internal live-auth synthesis; dedicated `DI_S4F7Y_ENGINEERING_TEST_HARNESS`; terminal outcome emitter; rollback restart accounting + convergence proofs; `verify-live-poststate` + final A/B attestation reverify |
| FINDING | Reproduced wrapper false-negative staging outcomes, legacy `CAN_AUTHORIZE=YES` wording, rollback `\|\| true` swallowing, and weak test isolation on PR head `bbf5b392da…` |
| NON_EFFECTS | No Production execution; engineering harness still reports `PRODUCTION_*=NO` |

### EXP-021 S4F-7Y.2 terminal outcome + forensic truth seal (2026-10-07)

| Event | Detail |
|-------|--------|
| CHANGE | Monotonic `S4F7Y_*` production historical facts; fact-derived single terminal emitter; `LIVE_STAGING_OPERATOR_AUTHORIZATION_VALIDATED` pre-terminal; `DI_S4F7Y_FORENSIC_PRODUCTION_SIMULATION` fixture harness for Y.2 regression semantics; evidence addendum |
| FINDING | **`S4F7Y_2_TERMINAL_FORENSIC_SEMANTICS=PASS`** — rollback does not erase mutation/restart history; failure paths preserve authorization facts; engineering harness production terminal history remains `NO` |
| NON_EFFECTS | No Production execution; DRY_RUN=1 unchanged; Gate 6 **NOT_SATISFIED** |

### EXP-021 S4F-7Z.2 exact-head CI certification + tool authority seal (2026-10-08)

| Event | Detail |
|-------|--------|
| CHANGE | Evidence `EXP021_S4F7Z2_EXACT_HEAD_CI_TOOL_AUTHORITY_SEAL.md`; `CURRENT_STATE` S4F-7Z.2 row — documentation only (draft PR) |
| FINDING | **`EXACT_HEAD_CI_CERTIFIED=YES`** @ `715dea5648ebb862eeedfc30e7dc3d3cd57bb02c` — Vehicle/Legal CI reruns **success** (attempt 2); **`TOOL_BLOB_PARITY=PASS`** vs squash `123ec54e7…` + `main`; **`EXPECTED_FRESH_TINY_STAGING_TOOL_SHA` sealed** @ `715dea564…`; superseded S4F-7W checkout pin `11b4a80cc…` for post–S4F-7Y tooling |
| NON_EFFECTS | No Production access/mutation; no new JIT authority; S4F-7X dry-run evidence unchanged; Gate 6 **NOT_SATISFIED** |

### EXP-021 S4F-7AA fresh JIT Production dry-run (2026-10-08)

| Event | Detail |
|-------|--------|
| CHANGE | Bootstrap `.cursor/scripts/cloud-agent-s4f7aa-fresh-jit-production-dry-run.sh`; evidence `EXP021_S4F7AA_FRESH_JIT_PRODUCTION_DRY_RUN.md` |
| FINDING | **`FINAL_RESULT=PASS`** — tool `715dea564…`; Production `DRY_RUN=1` full guard path; JIT `2026-10-08T09:00:32.909Z` age **20.296s**; PRE/POST SHA/env/PID/attestation parity; **`NO_BACKFILL_GATE=PASS`** |
| NON_EFFECTS | No `DI_S4F7Y_LIVE_STAGING_AUTHORIZED`; no env write/restart/DB write/provider calls; Gate 6 **NOT_SATISFIED** |

### EXP-021 S4F-7AA.1 operator & evidence hardening (2026-10-08)

| Event | Detail |
|-------|--------|
| CHANGE | `lib/cloud-agent-s4f7aa-tool-pin.lib.sh`; bootstrap hardening; `cloud-agent-s4f7aa-tool-pin.test.sh`; evidence `EXP021_S4F7AA1_OPERATOR_EVIDENCE_HARDENING.md` |
| FINDING | Reproduced dead stale-pin guard (D1), runtime `chmod` (D2), declared-only side-effect lines (D3–D4); historical S4F-7AA PASS preserved; AA.1 bootstrap **not** Production re-validated |
| NON_EFFECTS | No Production rerun; no sealed operator file edits; Gate 6 **NOT_SATISFIED** |

### EXP-021 S4F-7AC live-staging readiness review (2026-10-08)

| Event | Detail |
|-------|--------|
| CHANGE | Evidence `EXP021_S4F7AC_LIVE_STAGING_READINESS_REVIEW.md` (read-only) |
| FINDING | **No-Go** for live `DRY_RUN=0` — `PR1924_MERGED=NO` **at audit time**; `EXPLICIT_HUMAN_AUTHORIZATION_PRESENT=NO`; S4F-7L proc-env class addressed in S4F-7Y metrics path (engineering); no Production S4F-7Y live run yet |
| NON_EFFECTS | No JIT packet; no live authorization; Gate 6 **NOT_SATISFIED** |

### EXP-021 S4F-7AC.1 PR #1924 CI closure (2026-10-08)

| Event | Detail |
|-------|--------|
| CHANGE | Evidence `EXP021_S4F7AC1_PR1924_CI_CLOSURE.md` (read-only) |
| FINDING | **`MERGE_READINESS=READY_FOR_HUMAN_MERGE`** @ head `b506f3904…` **at review time**; run `37760943334` **success**; `PR_MERGED=NO` **at review time** |
| NON_EFFECTS | No auto-merge; Gate 6 **NOT_SATISFIED** |

### EXP-021 S4F-7AE post-merge authority live-staging gate (2026-10-08)

| Event | Detail |
|-------|--------|
| CHANGE | Evidence `EXP021_S4F7AE_POST_MERGE_AUTHORITY_LIVE_STAGING_GATE.md` |
| FINDING | Post–#1926 `main` reconciled vs Production; APDS **no** direct S4 operator overlap; `READY_FOR_EXPLICIT_HUMAN_AUTHORIZATION_DECISION=YES`; Production pins unchanged vs S4F-7AD |
| NON_EFFECTS | No live authorization; no JIT; Gate 6 **NOT_SATISFIED** |

### EXP-021 S4F-7AD final Production live-staging readiness (2026-10-08)

| Event | Detail |
|-------|--------|
| CHANGE | Evidence `EXP021_S4F7AD_FINAL_LIVE_STAGING_READINESS.md`; read-only VPS observation log (agent artifact) |
| FINDING | `ENGINEERING_READY=YES`; `READONLY_PRODUCTION_PREFLIGHT_PASS=YES`; `READY_FOR_HUMAN_AUTHORIZATION_DECISION=YES`; **no** JIT packet; **no** `DRY_RUN=0` |
| NON_EFFECTS | No live authorization; Gate 6 **NOT_SATISFIED** |

### EXP-021 S4F-7AC.2 PR #1925 rebase & post-merge authority (2026-10-08)

| Event | Detail |
|-------|--------|
| CHANGE | Rebase PR **#1925** onto `main` @ `17c49854d`; AKTUELL addenda in S4F-7AC / S4F-7AC.1 evidence (historical blocks preserved) |
| FINDING | PR **#1924** merged; S4F-7AB evidence on `main`; live staging **still NOT_READY**; no new JIT; temp cleanup **NOT_VERIFIED** |
| NON_EFFECTS | No Production access; no live authorization; Gate 6 **NOT_SATISFIED** |

### EXP-021 S4F-7AB hardened bootstrap Production dry-run certification (2026-10-08)

| Event | Detail |
|-------|--------|
| CHANGE | Evidence `EXP021_S4F7AB_HARDENED_PRODUCTION_DRY_RUN_CERTIFICATION.md`; AA.1 canonical `BOOTSTRAP_SCRIPT_SHA256` row |
| FINDING | **`FINAL_RESULT=PASS`** — first Production run of AA.1 bootstrap @ merge `9e40c969d` / SHA `007eb885…`; JIT `2026-10-08T10:01:53.161Z`; POST S4 SQL parity + wrapper-measured mutation/restart/delta |
| NON_EFFECTS | No live authorization; no env write/restart/S4 activation; Gate 6 **NOT_SATISFIED** |

### EXP-021 S4F-7T current Production attestation supersession closure (2026-10-06)

| Event | Detail |
|-------|--------|
| CHANGE | Read-only Production attestation + file-equivalence proof; S4F-7S supersession addendum on PR **#1904**; evidence `EXP021_S4F7T_CURRENT_PRODUCTION_ATTESTATION_SUPERSESSION_CLOSURE.md` |
| FINDING | **`FINAL_RESULT=PASS_SUPERSEDED_NO_DEPLOY_REQUIRED`** — live PRESTATE on A/B; attestation arrived via release `20261006064327_v4994`; historical RC `9d286e58…` **superseded**; `S4F7S_BLOCKER_RESOLUTION=DEPLOY_NO_LONGER_REQUIRED` (S4F-7S drift block **unchanged** historically) |
| NON_EFFECTS | No Production mutation; no runtime RC deploy; deploy controller not executed |

### EXP-021 S4F-7N Production attestation deploy isolation audit (2026-10-03)

| Event | Detail |
|-------|--------|
| CHANGE | Read-only Production prestate reverify @ `ee958854…` / `20261002014651_v4994`; 16-commit / 114-file delta to main `c29179366…`; migration + unrelated runtime inventory; minimal 4-file S4F-7M worktree build proof; evidence `EXP021_S4F7N_PRODUCTION_ATTESTATION_DEPLOY_ISOLATION_AUDIT.md` |
| FINDING | **`CURRENT_MAIN_STRATEGY_ATTESTATION_ONLY=NO`**; **`RECOMMENDED_DEPLOY_STRATEGY=MINIMAL_ATTESTATION_RELEASE`**; canonical deploy runs **`prisma migrate deploy`** |
| NON_EFFECTS | No Production mutation/deploy; no new staging authorization |

### EXP-021 S4F-7M in-process S4 runtime config attestation (2026-10-02)

| Event | Detail |
|-------|--------|
| CHANGE | `DiV0S4RuntimeConfigAttestationService` + pure fingerprint/state lib; Prometheus `synqdrive_di_v0_s4_runtime_config_attestation_info`; S4F-7J wrapper metrics runtime proof; tests `test:di:s4f7m:runtime-attestation`; evidence `EXP021_S4F7M_IN_PROCESS_RUNTIME_CONFIG_ATTESTATION_ENGINEERING.md` |
| FINDING | **`PROC_ENV_IS_AUTHORITATIVE_FOR_DOTENV_LOADED_KEYS=NO`**; PRESTATE/STAGED deterministic SHA-256 fingerprints; **`PRIMARY_RUNTIME_PROOF_AUTHORITY=AUTHENTICATED_IN_PROCESS_METRIC`** |
| NON_EFFECTS | No Production mutation/deploy/env change; Tiny gate count remains **6**; attestation requires **separate deploy** before Production use |

### EXP-021 S4F-7L Production Tiny 3-key config staging attempt (2026-10-02)

| Event | Detail |
|-------|--------|
| CHANGE | Human-authorized `DRY_RUN=0` via `cloud-agent-s4-tiny-staging.sh` @ `947a70540…`; evidence `EXP021_S4F7L_PRODUCTION_TINY_CONFIG_STAGING.md` |
| FINDING | Pre-guards **PASS**; exact **3-key** file write + backup **PASS**; Replica A **`PRIMARY_STAGING` runtime proof FAIL** (`REPLICA_A_RUNTIME_*_EXACT=NO`); **`ROLLBACK_RESULT=COMPLETE`**; final `backend.env` SHA256 restored to pre-pin; **staging keys MISSING**; GLOBAL **KILLED**; S4 counts **0** |
| NON_EFFECTS | No Tiny activation; no GLOBAL DB write; no deploy/migration; no provider calls; **authorization consumed** — no in-task retry |

### EXP-021 S4F-7I NO_BACKFILL Tiny staging preflight (2026-10-02)

| Event | Detail |
|-------|--------|
| CHANGE | Read-only Production preflight for KS MS 661 Tiny; proposed NOT_BEFORE + allowlists; evidence `EXP021_S4F7I_NO_BACKFILL_TINY_STAGING_PREFLIGHT.md` |
| FINDING | **`NO_BACKFILL_TINY_STAGING_READINESS=PASS`**; 510 historical trips; 499 hypothetical discovery-eligible without NOT_BEFORE; cutoff excludes all at capture |
| NON_EFFECTS | No env/DB/deploy/restart; Tiny gate still **NOT_SATISFIED** |

### EXP-021 S4F-7H Production GLOBAL=KILLED initialization (2026-10-02)

| Event | Detail |
|-------|--------|
| CHANGE | Human-authorized `DRY_RUN=0` wrapper execution; `DI_V0_S4_GLOBAL_KILL_INIT_RESULT=INSERTED_KILLED`; evidence `EXP021_S4F7H_PRODUCTION_GLOBAL_KILLED_INITIALIZATION.md` |
| FINDING | **`PRODUCTION_GLOBAL_KILLED_INITIALIZATION_READINESS=PASS`**; post-read GLOBAL **KILLED** reason/actor match pins; S4 persistence unchanged; replica PIDs unchanged |
| NON_EFFECTS | No Tiny grant, no S4 enablement, no env/deploy/restart/migration, no provider calls |

### EXP-021 S4F-7G Production kill initializer dry-run (2026-10-02)

| Event | Detail |
|-------|--------|
| CHANGE | Authorized Production `DRY_RUN=1` via tool SHA `0b0eac19…` temp checkout + wrapper guards; evidence `EXP021_S4F7G_PRODUCTION_KILL_INITIALIZER_DRY_RUN.md` |
| FINDING | **`PRODUCTION_KILL_INITIALIZER_DRY_RUN_READINESS=PASS`**; independent post-read GLOBAL count **0**, S4 counts **0**, env SHA unchanged |
| NON_EFFECTS | No initializer invoke, no GLOBAL row write, no deploy/restart/migration, Tiny gate still **NOT_SATISFIED** |
| OPERATIONAL | Hostinger path A: `backend.env` root-only — dry-run required `sudo -n` wrapper exec; bootstrap follow-up to pass `SYNQDRIVE_BACKEND_ENV` + sudo |

### EXP-021 S4F-7F-1 Production kill wrapper safety closure (PR #1882, 2026-10-02)

| Event | Detail |
|-------|--------|
| CHANGE | Fail-closed Production DB reads; steady-state replica release identity; S4F-4 authenticated metrics; DB-backed post-write actor/reason; initializer path pin + deployed worktree clean; `.cursor/scripts/cloud-agent-s4-global-kill-init.sh`; expanded `test:di:s4f7f:kill-init-wrapper` (48 cases) |
| FINDING | **`NEWER_MAIN_INITIALIZER_SUBSTITUTION_POSSIBLE=NO`** when path pinned; remote bootstrap pins wrapper SHA separately from Production runtime SHA |
| NON_EFFECTS | No Production dry-run/mutation; GLOBAL row remains **MISSING** |

### EXP-021 S4F-7E DB GLOBAL kill initialization preflight (2026-10-02)

| Event | Detail |
|-------|--------|
| CHANGE | Read-only Production VPS/Postgres + initializer/schema audit; evidence `EXP021_S4F7E_DB_KILL_INITIALIZATION_PREFLIGHT.md` |
| FINDING | Production `ee958854…` unchanged; GLOBAL row **missing**; S4 counts **0**; initializer @ deployed SHA **safe**; postgres concurrency tests **PASS**; **`DB_KILL_INITIALIZATION_READINESS=BLOCKED`** — `PRODUCTION_EXECUTION_WRAPPER_REQUIRED` |
| NON_EFFECTS | No initializer execution, no Production DB/env/deploy/restart, no Tiny/operator grant |

### EXP-021 S4F-7AI S4F-7AH bootstrap authority migration (2026-10-08)

| Event | Detail |
|-------|--------|
| CHANGE | `cloud-agent-s4f7ai-fresh-jit-production-dry-run.sh` + `lib/cloud-agent-s4f7ai-tool-pin.lib.sh` + `cloud-agent-s4f7ai-tool-pin.test.sh`; evidence `EXP021_S4F7AI_NEW_TOOL_BOOTSTRAP_AUTHORITY.md` |
| AUTHORITY | Reads `NEW_EXPECTED_FRESH_TINY_STAGING_TOOL_SHA` from S4F-7AH evidence only @ `ed78748bc…`; six-file blob + stale-pin fail-closed; AA.1 Z2 bootstrap **unchanged** |
| NON_EFFECTS | No Production SSH/env/deploy/restart; no `DRY_RUN=0`; no live auth reuse; Production dry-run **not** executed in slice |

### EXP-021 S4F-7AJ corrected-tool Production dry-run (2026-10-08)

| Event | Detail |
|-------|--------|
| CHANGE | One Production `DRY_RUN=1` via S4F-7AI bootstrap @ tool `ed78748bc…`; fresh JIT `2026-10-08T20:11:22.464Z`; evidence `EXP021_S4F7AJ_CORRECTED_TOOL_PRODUCTION_DRY_RUN.md` |
| FINDING | `DRY_RUN_CERTIFIED=YES`; `GUARDS_OK=YES`; initial/final DB clock + fresh authority **PASS**; `DRY_RUN_ENV_MUTATION_COUNT=0`; POSTSTATE parity **YES** |
| NON_EFFECTS | No `DRY_RUN=0`; no live auth reuse; no S4 activation; Gate 6 unchanged |

### EXP-021 S4F-7AK final live staging readiness (2026-10-08)

| Event | Detail |
|-------|--------|
| CHANGE | Read-only Production observation + authority reconciliation after #1937; evidence `EXP021_S4F7AK_FINAL_LIVE_STAGING_READINESS.md` |
| FINDING | `READINESS=TECHNICALLY_READY_PENDING_HUMAN_AUTHORIZATION`; S4 prestate **PASS**; `PRODUCTION_DRIFT_FROM_AJ=YES` (env SHA + PIDs); partial release-tree operator blob drift — **S4F-7AI bootstrap mandatory for Production `DRY_RUN=1` only** (not live); live path = detached `ed78748bc…` S4F-7Y operator |
| NON_EFFECTS | No JIT/live auth; no `DRY_RUN=0`; no env/restart/deploy; `HUMAN_FREEZE_CONFIRMATION=PENDING`; Gate 6 unchanged |

### EXP-021 S4F-7AK.1 authority boundary & drift closure (2026-10-08)

| Event | Detail |
|-------|--------|
| CHANGE | PR #1939 scope trim (remove non-required `ChangesView.tsx`); evidence `EXP021_S4F7AK1_FINAL_AUTHORITY_BOUNDARY.md` |
| FINDING | `PRODUCTION_DRIFT_CAUSE=APDS_P25_SHADOW_ENABLE_20261008T201328Z` — pre-backup SHA matches S4F-7AJ POST; `WORKER_APD_SHADOW_ENABLED` value change; PM2 recreate @ 20:13:28Z |
| NON_EFFECTS | No live dispatch execution; S4F-7AI bootstrap remains DRY_RUN=1-only |

### EXP-021 S4F-7AK.2 dispatch documentation consistency (2026-10-08)

| Event | Detail |
|-------|--------|
| CHANGE | PR #1939 — align S4F-7AK / CURRENT_STATE / CHANGE_LEDGER: S4F-7AI = Production **`DRY_RUN=1` only**; live = detached `ed78748bc…` S4F-7Y operator (not S4F-7AI) |
| NON_EFFECTS | No operator code change; no Production execution |

### EXP-021 Simple Gate-6 + fleet rollout (2026-10-10)

| Event | Detail |
|-------|--------|
| CHANGE | Remove custom Gate-6 crypto chain; OS wrapper auth; fleet waves 1–3; evidence `EXP021_SIMPLE_GATE6_FLEET_ROLLOUT.md` |
| TESTS | `test:di:s4f7as:gate6-open-rekill-operator` **37** PASS |
| NON_EFFECTS | No Production mutation; GLOBAL **KILLED**; legacy HMAC root key not removed on VPS |

### EXP-021 PR #1962 final live execution closure (2026-10-10)

| Event | Detail |
|-------|--------|
| CHANGE | Guard proof bundle channel; pinned root re-exec; explicit wave/pilot confirm; wave promotion verify path; scoped monitoring queries — §E in `EXP021_SIMPLE_GATE6_FLEET_ROLLOUT.md` |
| TESTS | `test:di:s4f7as:gate6-open-rekill-operator` **43** PASS |
| NON_EFFECTS | No Production mutation; no deploy; `LIVE_OPEN` not executed |

### EXP-021 PR #1962 operator runtime fix (2026-10-10)

| Event | Detail |
|-------|--------|
| CHANGE | Absolute root/helper pins; intent dir hardening; guard-proof bundle reuse + pre-mutation refresh; remove root `npx` false positive — §F in `EXP021_SIMPLE_GATE6_FLEET_ROLLOUT.md` |
| TESTS | Gate-6 operator suite + bash lifecycle test |
| NON_EFFECTS | No Production mutation; no deploy |

### EXP-021 PR #1962 OS permission contract (2026-10-10)

| Event | Detail |
|-------|--------|
| CHANGE | Admin-private intent under `~/.synqdrive/gate6-live-open-intent`; root `SUDO_UID` validation; release execution integrity (no g+w) — §G in `EXP021_SIMPLE_GATE6_FLEET_ROLLOUT.md` |
| TESTS | `di-v0-s4-gate6-os-contract-e2e.selftest.sh` + operator Jest |
| NON_EFFECTS | No Production mutation; no deploy |

### EXP-021 S4F-7AZ Privileged writer model closure (2026-10-10)

| Event | Detail |
|-------|--------|
| CHANGE | Production shared-root `755` compatibility in `verifyParentDirectoryChain` (`0o022` write mask); privileged writer matrix + one-shot provisioning contract P1–P7; evidence `EXP021_S4F7AZ_PRIVILEGED_WRITER_CLOSURE.md` |
| TESTS | `test:di:s4f7as:gate6-open-rekill-operator` **72** PASS |
| NON_EFFECTS | No Production mutation; no keys/registers; no sudoers install; Gate-6 **NOT_GRANTED** |

### EXP-021 S4F-7AY Post-merge Gate-6 infra readiness (2026-10-10)

| Event | Detail |
|-------|--------|
| CHANGE | Read-only Production attestation + Gate-6 trust path inventory after merge #1955; provisioning plan A–G (not executed); evidence `EXP021_S4F7AY_POSTMERGE_INFRA_READINESS.md` |
| NON_EFFECTS | No deploy, no keys, no approval/dispatch artifacts, no Gate-6 grant |

### EXP-021 S4F-7AX.3 Trusted dispatch provenance (2026-10-09)

| Event | Detail |
|-------|--------|
| CHANGE | PR #1955 — privileged issuance register + MAC key; `recordTrustedDispatchIssuance` on `issue-dispatch-token`; `verifyTrustedDispatchProvenanceForLiveOpen` before DB on `live-open-authorized`; blocks self-issued HMAC-only bypass; evidence `EXP021_S4F7AX3_TRUSTED_DISPATCH_PROVENANCE.md` |
| TESTS | `test:di:s4f7as:gate6-open-rekill-operator` **71** PASS |
| NON_EFFECTS | No Production mutation; no issuance MAC key provisioning; Gate 6 **NOT_GRANTED** |

### EXP-021 S4F-7AX.2 Final live authority boundary (2026-10-09)

| Event | Detail |
|-------|--------|
| CHANGE | PR #1955 — `evaluateProductionGate6LiveOpenBoundary`; fixture flags cannot waive Production backend/trust anchors; simulated guard env proofs banned on live OPEN; trust-anchor permission checks; consumption register unlink policy helper |
| TESTS | `test:di:s4f7as:gate6-open-rekill-operator` **60** PASS |
| NON_EFFECTS | No Production mutation; Gate 6 **NOT_GRANTED** |

### EXP-021 S4F-7AX.1 Approval trust anchor & atomic consumption (2026-10-09)

| Event | Detail |
|-------|--------|
| CHANGE | PR #1955 — pinned Production Ed25519 trust anchor (no env/symlink override); `issue-dispatch-token` trust gate; O_EXCL-only consumption marker; 20-process concurrency proof |
| TESTS | `test:di:s4f7as:gate6-open-rekill-operator` **57** PASS |
| NON_EFFECTS | No Production mutation; Gate 6 **NOT_GRANTED** |

### EXP-021 S4F-7AX Gate-6 independent approval boundary (2026-10-09)

| Event | Detail |
|-------|--------|
| CHANGE | Ed25519 v2 human approval verify-only on Production canonical path; HMAC v1 approval forbidden when `SYNQDRIVE_BACKEND_ENV_CANONICAL` is Production shared env; approvalId single-use consumption register before dispatch token issuance; evidence `EXP021_S4F7AX_INDEPENDENT_APPROVAL_BOUNDARY.md` |
| TESTS | `test:di:s4f7as:gate6-open-rekill-operator` **52** PASS (Ed25519 + consumption + CLI replay) |
| NON_EFFECTS | EMERGENCY_REKILL unchanged; no Production mutation; HMAC root key from S4F-7AW not deleted; Gate 6 **NOT_GRANTED** |

### EXP-021 S4F-7AS.3 Gate-6 authority seal (2026-10-09)

| Event | Detail |
|-------|--------|
| CHANGE | PR #1949 — HMAC v2 dispatch (key sidecar); human approval file + root key issuance gate; atomic one-shot + replay marker; exact Production backend.env enforcement; evidence `EXP021_S4F7AS3_GATE6_AUTHORITY_SEAL.md` |
| TESTS | `test:di:s4f7as:gate6-open-rekill-operator` 44 PASS |
| NON_EFFECTS | Unknown-commit recovery unchanged; no Production execution; Gate 6 **NOT_GRANTED** |

### EXP-021 S4F-7AS.2 Final OPEN authority + unknown-commit closure (2026-10-09)

| Event | Detail |
|-------|--------|
| CHANGE | PR #1949 — OPEN/REKILL transaction `COMMIT_OUTCOME_UNKNOWN` recovery without OPEN retry; HMAC one-shot dispatch token + trusted env `realpath`/hash + GLOBAL prestate re-verify (env digest bypass removed); evidence `EXP021_S4F7AS2_FINAL_AUTHORITY_CLOSURE.md` |
| TESTS | `test:di:s4f7as:gate6-open-rekill-operator` expanded (orchestration + dispatch token) |
| NON_EFFECTS | No Production execution; Gate 6 **NOT_GRANTED** |

### EXP-021 S4F-7AS.1 Gate-6 safety closure (2026-10-09)

| Event | Detail |
|-------|--------|
| CHANGE | PR #1949 — post-commit OPEN orchestration + compensating REKILL; `live-open-authorized` + dispatch digest; direct `live-open` forbidden; canonical Production backend.env fixture isolation; evidence `EXP021_S4F7AS1_GATE6_SAFETY_CLOSURE.md` |
| TESTS | `test:di:s4f7as:gate6-open-rekill-operator` 22 PASS |
| NON_EFFECTS | No Production execution; Gate 6 **NOT_GRANTED** |

### EXP-021 S4F-7AS Gate-6 OPEN / EMERGENCY_REKILL operator (2026-10-09)

| Event | Detail |
|-------|--------|
| CHANGE | Minimal Gate-6 operator `di-v0-s4-gate6-open-rekill-production.sh` — OPEN (`KILLED`→`NOT_KILLED`) with full preflight + `DRY_RUN`; EMERGENCY_REKILL (`NOT_KILLED`→`KILLED`) without OPEN guards; transactional `di-v0-s4-global-kill-transition.ts` (no missing-row insert); monitoring query/abort constants; evidence `EXP021_S4F7AS_GATE6_OPEN_REKILL_OPERATOR.md` |
| TESTS | `test:di:s4f7as:gate6-open-rekill-operator` (11); S4A Postgres CI includes kill-transition integration (+9) |
| NON_EFFECTS | No Production DB/env/restart/deploy; Gate 6 **NOT_GRANTED**; GLOBAL remains **KILLED** on Production; kill initializer unchanged |

### EXP-021 S4F-7AO minimal five-flag activation operator (2026-10-09)

| Event | Detail |
|-------|--------|
| CHANGE | Engineering operator `di-v0-s4-enable-tiny-five-flags-production.sh` + TS libs — exactly five S4 enable flags ON, `NATIVE` OFF, staged Tiny keys preserved, GLOBAL **KILLED** only (no DB kill mutation); evidence `EXP021_S4F7AO_MINIMAL_FLAG_OPERATOR.md` |
| TESTS | `npm run test:di:s4f7ao:five-flag-operator` (24); S4F-7J regression 47 PASS; shared `s4f7j_resolve_deployed_sha` / `s4f7j_resolve_release_dir` in `di-v0-s4-tiny-staging-production.lib.sh` for sourced wrappers |
| NON_EFFECTS | No Production env write/restart/deploy; Gate 6 **NOT_GRANTED**; S4 not activated; certified S4F-7Y operator unchanged |

### EXP-021 S4F-7AO.2 replica recovery boundary (2026-10-09)

| Event | Detail |
|-------|--------|
| CHANGE | PR #1943 — mark replica runtime dirty before restart; rollback scope A vs A+B from `FIVE_FLAG_PROVEN`/dirty flags; `FULL_A_B_PRESTATE_PROOF` on both replicas; evidence `EXP021_S4F7AO2_RECOVERY_BOUNDARY.md` |
| TESTS | `test:di:s4f7ao:five-flag-operator` 36 PASS |
| NON_EFFECTS | No Production execution |

### EXP-021 S4F-7AO.1 five-flag operator safety closure (2026-10-09)

| Event | Detail |
|-------|--------|
| CHANGE | PR #1943 — full runtime rollback (atomic env restore + selective replica `RECOVERY_PRESTATE`), production test/fixture/harness isolation on shared `backend.env`, explicit `DRY_RUN` required, durable backup dir via `s4f7j_require_durable_backup_dir`; evidence `EXP021_S4F7AO1_SAFETY_CLOSURE.md` |
| TESTS | `test:di:s4f7ao:five-flag-operator` 31 PASS; S4F-7J 47; S4F-7Y wrapper 131 |
| NON_EFFECTS | No Production execution; S4F-7Y operator contract unchanged |

### EXP-021 S4F-7AI.1 bootstrap safety closure (2026-10-08)

| Event | Detail |
|-------|--------|
| CHANGE | Reject legacy `DI_S4F7V_LIVE_STAGING_AUTHORIZED=YES`; remote unset both live flags; `S4F7AI_SKIP_DETACHED_FETCH` only with `S4F7AI_SKIP_PRODUCTION_DISPATCH=1` |
| NON_EFFECTS | Certified tool SHA unchanged; AA.1 bootstrap unchanged; no Production dispatch |

### EXP-021 S4F-7AH post-merge tool authority seal (2026-10-08)

| Event | Detail |
|-------|--------|
| CHANGE | Evidence `EXP021_S4F7AH_POST_MERGE_TOOL_AUTHORITY_SEAL.md` — six-file operator blob parity PR head `ed78748bc…` / merge `f1e6b9221…` / `main`; exact-head CI certified on `ed78748bc…` |
| SEAL | **`EXPECTED_FRESH_TINY_STAGING_TOOL_SHA=ed78748bc9493cdc8da56000e333e4940114f9f1`** supersedes Z2 `715dea5648…` for post–S4F-7AG S4F-7Y tool checkout |
| BOOTSTRAP | S4F-7AA.1 still reads Z2 evidence → **`NEW_BOOTSTRAP_REQUIRED=YES`** before next Production `DRY_RUN=1` |
| NON_EFFECTS | No Production mutation/deploy/restart; no `DRY_RUN=0`; no new live authorization; Gate 6 unchanged |

### EXP-021 S4F-7AG live DB clock authority fix (2026-10-08)

| Event | Detail |
|-------|--------|
| CHANGE | Fail-closed `DI_S4F7V_DB_CLOCK_CANONICAL_UTC` export before live `validate-fresh-authority`; final re-query + CLI exit propagation; `di-v0-s4-fresh-tiny-staging-live-db-clock-7ag.spec.ts`; evidence `EXP021_S4F7AG_LIVE_AUTHORITY_DB_CLOCK_ROOT_CAUSE.md`; merged **#1930** @ `f1e6b9221…` |
| ROOT_CAUSE | AF1C live path validated fresh authority without DB clock (`FRESH_NOT_BEFORE_INVALID`); final JIT age pipeline could mask CLI failure |
| NON_EFFECTS | No Production mutation/deploy/restart; prior human live authorization not reused; sealed `715dea5648…` valid only for pre-fix blobs until S4F-7AH seal |

### EXP-021 S4F-7B dormant Production deploy preflight (2026-10-02)

| Event | Detail |
|-------|--------|
| CHANGE | Read-only VPS + Postgres audit; evidence `EXP021_S4F7B_DORMANT_PRODUCTION_DEPLOY_PREFLIGHT.md`; ops helper `di-v0-s4f7b-dormant-production-deploy-preflight.sh` |
| FINDING | Production `8fa531b27…` healthy; S4 env dormant; GLOBAL kill row missing; **0** S4 rows; target `ee958854…` adds S4 runtime registration with **0** pending migrations → **DORMANT_DEPLOY_READINESS=PASS** |
| NON_EFFECTS | No deploy, env/DB mutation, restart, operator grant, Tiny activation |

### EXP-021 S4F-7A Tiny execution prerequisites engineering (2026-10-01)

| Event | Detail |
|-------|--------|
| CHANGE | `DiV0S4RuntimeModule` + S4C bootstrap; `DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE` S4B containment; `initializeDiV0S4GlobalKillRow` + ops CLI; tests (dormant bootstrap, containment, kill init); S4F-7 deploy-prerequisite addendum |
| AUTHORITY | NO_BACKFILL on S4B overlay; frozen S4A contract v2 **unchanged** |
| NON_EFFECTS | No Production deploy/migrate/env/restart; no operator `GRANTED`; no Tiny activation; no GLOBAL `NOT_KILLED` seed |
| NEXT | Review/merge S4F-7A → separate **dormant** Production deploy preflight |

### EXP-021 S4P1 production readiness & safety simplification (2026-10-11)

| Event | Detail |
|-------|--------|
| CHANGE | Read-only runtime/safety audit; evidence `EXP021_S4P1_PRODUCTION_READINESS_SAFETY_SIMPLIFICATION.md`; regression `di-v0-s4p1-safety-gate-contract.spec.ts` |
| FINDING | S4 active path = shadow `di_v0_s4_*` + DIMO budget only; Wave-3 human 24h gate was **operational triage**, not Gate-6 code; **no** automatic EMERGENCY_REKILL in app; post–Wave-3 Production **KILLED** after containment |
| AUTHORITY | Proposed regular ops: owner auth + technical preflight/DRY_RUN/LIVE_OPEN + automated monitoring + manual rekill |
| NON_EFFECTS | No Production mutation; no deploy; no env/kill/APDS/Battery changes in this slice |

### EXP-021 S4P2 unattended operations & alert integration (2026-10-11)

| Event | Detail |
|-------|--------|
| CHANGE | `alerts-di-s4.yml`; `DiV0S4OperationalMetricsService` + operational Prometheus gauges; VPS Prometheus refresh copies; contract `di-v0-s4p2-alert-rules.contract.ts` + tests; evidence `EXP021_S4P2_UNATTENDED_OPS_ALERT_INTEGRATION.md` |
| FINDING | Repo has Prometheus/Alertmanager stack; S4 had no dedicated rules/metrics; production alert **delivery not re-tested** in this slice |
| AUTHORITY | CRITICAL → existing Alertmanager receivers; containment remains manual EMERGENCY_REKILL |
| NON_EFFECTS | No Production mutation; GLOBAL_KILL=KILLED; five-vehicle scope unchanged |

### EXP-021 S4P2-R1 alert reliability (2026-10-11)

| Event | Detail |
|-------|--------|
| CHANGE | Operational metric freshness gauges + leader/follower reset; alert semantics (min DIMO budget, discovery missing/stale, dormant activity_signal); promtool tests; VPS monitoring validate-before-copy + AM restart skip; evidence `EXP021_S4P2_R1_ALERT_RELIABILITY.md` |
| NON_EFFECTS | No merge/deploy; delivery still UNVERIFIED |

### EXP-021 S4P2-R2 monitoring correctness (2026-10-11)

| Event | Detail |
|-------|--------|
| CHANGE | `shadow_plane_engaged` gauge + failure retention; in-flight work sum; `DiV0S4GlobalKillSuspectOrphan`; VPS candidate promtool + reload rollback; promtool/Jest contracts; evidence `EXP021_S4P2_R2_MONITORING_CORRECTNESS.md` |
| NON_EFFECTS | No Production mutation; GLOBAL_KILL=KILLED; PR #1988 remains draft pending #1987 merge |

### EXP-021 near-real-time trip processing contract correction (2026-10-13)

| Event | Detail |
|-------|--------|
| CHANGE | `quietPeriodSeconds` / `settlementQuietPeriodSeconds` **86400 → 600**; repository T01/successor use `make_interval(secs => quiet)`; migration relaxes `di_v0_s4_wi_eligible_ck`; evidence `EXP021_NEAR_REALTIME_TRIP_PROCESSING_CORRECTION.md` |
| WHY | Owner product decision: DI must run soon after trip completion; 24h quiet was safety/settlement-shadow heritage, not desired latency |
| NON_EFFECTS | No Production deploy/backfill/kill/allowlist change; existing work items not reset; T24 cutoff remains retrospective QA — segment metrics on policy deploy |
| VALIDATION | `validate-s4a-contract.mjs`; `di-v0-s4a-settlement-policy.spec.ts`; S4B D05 updated |

### EXP-021 PR #2001 final hardening (2026-10-13)

| Event | Detail |
|-------|--------|
| CHANGE | Frozen quiet-period floor/ceiling in validator (N09B/N09C); `di-v0-s4-settlement-policy-segment.ts`; NR01–NR09 Postgres proofs; bootstrap strip re-applies near-realtime migration; CI Postgres image `mirror.gcr.io/library/postgres:16-alpine` |
| EVIDENCE | Read-only prod audit: 0 active PENDING; 12 trips held only by 24h discovery gate (all 600s-eligible by anchor) |
| NON_EFFECTS | No merge/deploy/kill/allowlist mutation |

### VO5C D2-B registry lifecycle guard (2026-10-13)

| Event | Detail |
|-------|--------|
| CHANGE | S4B discovery `registry_lifecycle=ACTIVE`; S4A T01 PRIMARY `vehicles` `FOR UPDATE` admission lock (serializes with VO5C offboarding); EXP021 maturation `resolveAuthoritativeTokenId` ACTIVE-only; concurrent Postgres race tests (barrier sync); evidence [EXP021_VO5C_D2B_REGISTRY_LIFECYCLE_GUARD.md](../evidence/EXP021_VO5C_D2B_REGISTRY_LIFECYCLE_GUARD.md) |
| WHY | Post D2 cohort cleanup: fail-closed so OFFBOARDED/ARCHIVED vehicles cannot receive new regular PRIMARY work items (discovery race + enrollment) |
| REPLAY | `RECALIBRATION_REPLAY` / `REACQUISITION` semantics explicitly unchanged |
| NON_EFFECTS | No migrations; no Production env/kill/allowlist changes in this PR; frozen S4A transition/rejection contract unchanged |

### EXP-021 P2.1 R3 GPS/QC semantics forensic (2026-10-14)

| Event | Detail |
|-------|--------|
| CHANGE | Read-only production replay for trip `d0af9cc7-ce0d-4e40-9854-2c1341e83bed`; disjoint 763 `NO_NUMERIC` taxonomy; 26 vs 38 conflict alignment; composed S1→P1 tests; ops script `exp021-p21-r3-forensic.ts`; evidence `EXP021_P21_R3_GPS_QC_SEMANTICS_FORENSIC.md` |
| FINDING | Dominant NO_NUMERIC on first real trip is hold/frozen transition (`FROZEN_UNRESOLVED` center, incl. 293 s opening block); stationary band (144 s) is material but not the largest bucket; V1 lumped 8 position-gap s with hold — V2 splits; `missingEvidenceCount=0` does not imply gap-free GPS |
| NON_EFFECTS | No S1/P1/P2 behavior change; no deploy; no provider calls; no other trips |

### EXP-021 P2.1 R3B diagnostic correctness final (2026-10-14)

| Event | Detail |
|-------|--------|
| CHANGE | End-exclusive acquisition window via `di-v0-position-window.ts`; S4D snapshot scope bound to work item; forensic transaction `RepeatableRead` + exposed `transaction_read_only` / `transaction_isolation`; reference groups A/B/C with sum assertions; evidence `EXP021_P21_R3B_DIAGNOSTIC_CORRECTNESS_FINAL.md` |
| FINDING | R3A 1481 expected labels / 1 missing bucket was end-inclusive artifact; substantive 763 NO_NUMERIC / 501 s frozen / 26 conflicts unchanged on shadow replay |
| NON_EFFECTS | No S1/P1/P2 product change; no deploy; scoped P1 stationary correction documented only |

### EXP-021 P2.1 R3B final replay (2026-10-14)

| Event | Detail |
|-------|--------|
| CHANGE | Live Production-VPS replay via `synqdrive_exp021_p21_ro` + `exp021-p21-r3-forensic.ts`; artifact `exp021-p21-r3b-forensic.json`; evidence tables aligned to executed JSON |
| FINDING | `transaction_read_only=on`, `transaction_isolation=repeatable read`; expected labels 1480; false missing label `2026-10-14T06:01:40Z`; internal gap intervals 6, edge 2; baseline 1480/691/763/26 reproduced |
| NON_EFFECTS | No mutations; no provider calls |

### EXP-021 P2.1 P1 V2 stationary semantics (2026-10-14)

| Event | Detail |
|-------|--------|
| CHANGE | Opt-in `DI_V0_SPEED_QC_POLICY_V2`; null stationary band → `TRUSTED_LIMITED` / `OK_STATIONARY_NULL_SPEED`; projection policy provenance; compare ops script; evidence `EXP021_P1_V2_STATIONARY_SEMANTICS.md` |
| FINDING | Pinned trip: 118/144 stationary candidates accepted; 691 trusted numeric unchanged; 0 intervals changed outside stationary candidates |
| NON_EFFECTS | Default V1; no S2/calibration change; no deploy or runtime activation |

### EXP-021 P1 V2 runtime integration readiness (2026-10-14)

| Event | Detail |
|-------|--------|
| CHANGE | Trace customer vs ops data path; Production read-only SHA; `projectForWorkItem` / `readCurrentOpsProjection` + preview CLI `qcPolicyVersion`; unit tests; evidence `EXP021_P1_V2_RUNTIME_INTEGRATION_READINESS.md` |
| FINDING | V2 on main, not on Production `a4c3b1fc1d`; idempotency keys allow V1/V2 rows side by side; no product UI/API for trip speed QC |
| NON_EFFECTS | No deploy, backfill, provider calls, or customer default policy flip |

### EXP-021 P2 auto V2 projection after S4 completion (2026-10-15)

| Event | Detail |
|-------|--------|
| CHANGE | `di_v0_trip_speed_quality_auto_projection_outbox_v1`; `DiV0P2AutoProjectionV2Service` + leader scheduler; reuses `DiV0TripSpeedQualityProjectionService`; env `DI_V0_P2_AUTO_PROJECTION_V2_*` (default OFF); Postgres + unit tests; evidence `EXP021_P2_AUTO_PROJECTION_V2.md` |
| WHY | Close gap between durable S4 PRIMARY completion and persisted V2 QC projection without coupling S4C T06 or enabling customer defaults |
| NON_EFFECTS | No S4C import; no provider calls; no production flag flip; no unbounded enable backfill; V1 CURRENT rows preserved |

### EXP-021 V2 GPS speed evaluation product read + trip detail UI (2026-10-15)

| Event | Detail |
|-------|--------|
| CHANGE | `GET …/trips/:tripId/gps-speed-evaluation-v2`; `DiV0TripSpeedQualityProductReadService` + product DTO; `TripGpsSpeedEvaluationPanel`; gates `DI_V0_TRIP_SPEED_QUALITY_V2_PRODUCT_READ_ENABLED` + `VITE_DI_V0_TRIP_SPEED_QUALITY_V2_PRODUCT_UI_ENABLED` (default OFF); evidence `EXP021_V2_PRODUCT_READ_PATH.md` |
| WHY | Expose persisted V2 CURRENT projection on authorized trip detail read path without V1 aliasing or write side effects |
| NON_EFFECTS | No P2 auto-write enablement; no production config flip; no provider calls; no speed curve invention |

### EXP-021 P2 auto V2 projection — claim lease + discovery fix (2026-10-15)

| Event | Detail |
|-------|--------|
| CHANGE | Outbox `claim_token`/`claim_expires_at`; fenced acks; expired PROCESSING reclaim; discovery excludes existing outbox rows; Nest bootstrap `resolveDiV0P2AutoProjectionV2Bootstrap`; scheduler registry `di_v0_p2_auto_projection_v2`; expanded Postgres/module tests |
| WHY | PR #2028 review: PROCESSING crash recovery, discovery starvation, invalid env must not block backend boot |
| NON_EFFECTS | QC V2 semantics unchanged; no production activation |

### EXP-021 S4 research extension — PR C final correctness gate (2026-10-17)

| Event | Detail |
|-------|--------|
| CHANGE | Migration `20261017203000_di_v0_s4_research_runs_idempotency_fix` (partial unique SUCCEEDED per intent + exact retry key); `acknowledgePersistedRun` verifies stored status on duplicate; neutral outbox release enables OSM-HIT follow-up; worker-thread pipeline deadline; postgres CI script + S4 workflow hook; matrix EXECUTED/NOT_EXECUTED inventory |
| WHY | Neutral `ROAD_CONTEXT_UNAVAILABLE` must not block later `SUCCEEDED`; never report success on unique conflict alone |
| VALIDATION | `test:di:s4-research-worker` (isolated timeout + bbox); `test:di:s4-research-worker:postgres:ci` on ephemeral PG |
| NON_EFFECTS | No S4/L3/S1/QC/FSM mutation; flags OFF; no deploy |

### EXP-021 S4 research extension — PR C hardening (2026-10-17)

| Event | Detail |
|-------|--------|
| CHANGE | Cached OSM provider + bounded Overpass config; intent-key outbox (`outbox_id`, `research_intent_key`); run insert SQL error handling; shadow S1/QC evidence; 120s processing budget; matrix postgres spec |
| WHY | Enable real OSM-HIT research artifacts, versioned reprocessing, and fail-closed persistence without S4 coupling |
| NON_EFFECTS | Flags default OFF; no S4/L3/QC/FSM mutation |

### EXP-021 S4 research extension — PR C async road-matching V2 worker (2026-10-17)

| Event | Detail |
|-------|--------|
| CHANGE | `s4-research-worker/`: control plane (`DI_V0_S4_RESEARCH_*`), outbox discovery on COMPLETED PRIMARY S4 rows, run persistence, snapshot adapter, OSM corridor helpers + null default provider; migration `20261017183000_di_v0_s4_research_v1`; `DiV0S4ResearchModule` in `VehicleIntelligenceModule`; scheduler registry `di_v0_s4_research_v2` |
| WHY | Post-shadow research isolation: road-matching V2 artifacts without coupling to S4C completion or customer surfaces |
| VALIDATION | `test:di:s4-research-worker` unit + dormant audit; postgres matrix spec (S4 stays COMPLETED, idempotency, allowlist, parallel claim); performance budget spec (1136-bucket Tesla, 180s cap) |
| NON_EFFECTS | No S4A–S4F decision changes; no L3/S1/QC/FSM mutation; flags default OFF; no production deploy in this PR |

### EXP-021 S4 research extension — PR B geometry hardening (2026-10-17)

| Event | Detail |
|-------|--------|
| CHANGE | Correct `pointToSegmentDistanceM` to local equirectangular meters; bump algorithm bundle to V2; legacy V1 geometry + replay pins archived; Tesla bucket diff export `LDI10D_GEOMETRY_V1_V2_BUCKET_DIFF.json` (488/1136 buckets changed labels/ways); geometry + graph-conflict unit tests |
| FINDING | V1 pins (264/512/360 baseline, 300/357/479 Viterbi, 36 promotions) were geometry-artifact — V2 pins 483/384/269, 510/244/382, 27 promotions; **independentRoadIdAccuracy NOT_ASSESSABLE** unchanged |
| NON_EFFECTS | No S4 runtime/L3/S1/QC/HV product changes; no deploy |

### EXP-021 S4 research extension — PR B pure road-matching library (2026-10-17)

| Event | Detail |
|-------|--------|
| CHANGE | `backend/src/modules/vehicle-intelligence/driving-intelligence/s4-research/*` — contracts, OSM parse/topology, baseline + Viterbi matchers, pipeline, GPS bucket evidence, F4-B promotion audit helpers; frozen LDI-10D Tesla/OSM fixtures under `architecture/drivingintelligence/evidence/ldi-10d/`; `npm run test:di:s4-research`; transpile-only Tesla replay harness `backend/scripts/test/di-s4-research-tesla-replay.harness.ts` |
| WHY | Isolate reusable deterministic road-matching/context algorithms from offline PR #2051 research for future S4 shadow evaluation without enabling live execution |
| SOURCE | PR #2051 audit reference `6311d8c375dc5652bd64212ca4ed208175dc8148` — logic re-extracted; fixture-bound IDs/time/OSM pins remain in evidence/tests only |
| VALIDATION | Tesla replay parity: baseline `{ASSOCIATED:264, AMBIGUOUS:512, UNKNOWN:360}`, Viterbi `{ASSOCIATED:300, AMBIGUOUS:357, UNKNOWN:479}`; F4-B promotions=36, impossible transitions ≥5, STILL_AMBIGUOUS preserved |
| NON_EFFECTS | No Nest/scheduler/BullMQ/Prisma/DIMO/OSM network; no S4A–S4F/L3/S1/QC/score/UI changes; no deploy; `ROAD_ID_GROUND_TRUTH=NOT_ASSESSABLE` unchanged |

### EXP-021 motion core — TypeScript step 1 (baseline L3 replay + leg consistency) (2026-10-21)

| Event | Detail |
|-------|--------|
| CHANGE | `core/kinematics/{motion-core-grid,leg-consistency,frozen-l3-replay}.ts` + `motion-core-step1.spec.ts`; offline harness `backend/scripts/test/motion-core-ts-step1.harness.ts`; artifacts `/opt/cursor/artifacts/exp021-motion-core-ts-step1/` |
| WHY | Port EXP021 Python prototype step 0+1: reproducible frozen L3 on Tesla grids and timing-jitter leg signature diagnostics before C4 adaptive speed (step 2) |
| VALIDATION | Jest `motion-core-step1` 11/11; Tesla trips `14c41c06…` / `7a9d6a28…` shadow mismatch 0 @ 0.05 km/h; jitter legs 5+3 match Python `jitter_suspect_legs` |
| NON_EFFECTS | `evaluateL3AtCenter` and `compute-trip-intervals` runtime unchanged; no C4/FSM/events in production path; FSM/event synthetic scenarios S2/S3/S5/S10 not ported yet |

### EXP-021 motion core — TypeScript step 2 (C4 adaptive L3) (2026-10-21)

| Event | Detail |
|-------|--------|
| CHANGE | `c4-adaptive-l3.ts`, `robust-path-slope.ts`, `motion-evaluation.ts`, `motion-core-step2.spec.ts`, harness `motion-core-ts-step2.harness.ts`; artifacts `/opt/cursor/artifacts/exp021-motion-core-ts-step2/` |
| WHY | Port C4 (L3-direct via replayed `evaluateL3AtCenter`, else C1 fallback) for reproducible Tesla comparison before FSM/events |
| VALIDATION | Jest 18/18 motion-core-step; Python C4 parity TRIP_1 + S8; common support TRIP_1 MAE 1.963 n=62 vs published shadow; coverage 27.1%→65.5% display denominator |
| NON_EFFECTS | No `compute-trip-intervals` wiring; offline/delayed-capable candidate only |

### EXP-021 motion core — TypeScript FSM V0.2 (Fable port) (2026-10-21)

| Event | Detail |
|-------|--------|
| CHANGE | `motion-fsm.ts`, `shadow-gating-reconciliation.ts`, `motion-fsm-zero-run-eval.ts`, `motion-core-step3-fsm.spec.ts`, harness `motion-core-ts-fsm.harness.ts`; C4 TRIP_2 parity + shadow gating tests in step2; artifacts `/opt/cursor/artifacts/exp021-motion-core-ts-fsm/` |
| WHY | Close C4 Python parity on both Tesla trips; port Fable `motion_fsm.py` V0.2 (CAUSAL/RETROSPECTIVE) without threshold tuning; reproduce 10/10 evaluable zero-display stop matching with DIMO sparse speed evidence |
| VALIDATION | Jest `motion-core-step` 32/32; FSM Python parity TRIP_1+2 with sparse DIMO; `FSM_STEP_REPORT.json` causal/retro matched 10/10 |
| NON_EFFECTS | No manoeuvre/event detector; no production FSM wiring; `compute-trip-intervals` unchanged |

### EXP-021 motion core — TypeScript event detector (Fable port) (2026-10-21)

| Event | Detail |
|-------|--------|
| CHANGE | `motion-event-detector.ts`, `motion-event.types.ts`, `motion-core-step4-events.spec.ts`, harness `motion-core-ts-events.harness.ts`; artifacts `/opt/cursor/artifacts/exp021-motion-core-ts-events/` |
| WHY | Port neutral ACCELERATION/DECELERATION detector on C4 speed series; close offline chain C4→events without FSM coupling |
| VALIDATION | Jest `motion-core-step` 38/38; Python parity TRIP_1+TRIP_2 C4 events; harness 8 C4 events, 7 display-manoeuvre overlaps (±3 s), B0 baseline 5 combined |
| NON_EFFECTS | No production shadow export; no wear/braking semantics; `compute-trip-intervals` unchanged |

### EXP-021 motion core — Fable review round (bug review + candidate evaluation) (2026-10-21)

| Event | Detail |
|-------|--------|
| BASELINE | PR #2109 head `5f51ff70ed6e0a515af766649a6e68752314e752` (frozen; hashes in `/opt/cursor/artifacts/exp021-motion-core-fable-review/REVIEW_BASE.md`); review branch `cursor/motion-core-fable-review-192d` |
| BUG-1 (a, fixed) | C4 jitter-coupled finalization horizon documented as t+3 was wrong — outgoing-leg jitter needs t+4, C1-window jitter flag t+5, chord-outlier coupling t+6 (`c4-time-semantics.ts` constants `MOTION_CORE_C4_JITTER_COUPLED_HORIZON_FORWARD_S=4`, `MOTION_CORE_C4_FULL_FINALIZATION_HORIZON_FORWARD_S=6`); real-data counterexamples TRIP_1 12:04:06 / TRIP_2 12:20:23; regression `motion-core-review-horizon.spec.ts`; no numeric C4 change |
| BUG-3 (a, fixed) | Baseline harnesses `scripts/test/motion-core-ts-{step2,fsm}.harness.ts` had 4 TS2345 errors that fail CI Typecheck / Production build on #2109 (scripts/ is in the build tsconfig); type-only fix `22f3e6ca0` |
| BUG-2 (a/b, fixed as candidate K-A) | Fable FSM (Python and TS, parity-identical) re-enters the stop path from a stale pre-stop `last_speed` after displacement-implied motion → bogus 1-s STATIONARY runs during a sparse-position drive-off (synthetic; 0 Tesla labels affected); regression `motion-core-review-robustness.spec.ts` case 9 |
| CHANGE | `motion-fsm.ts`: `runMotionFsm(…, options)` with `MotionFsmCandidateOptions` {staleSpeedContextFix, startingTimeout, evidencePropagation}; all-false == Fable V0.2 (`runMotionFsmV02` wrapper, parity tests unchanged); additive label fields (`sparseSpeedKmh`, `speedQuality`) and episode evidence breakdown (`observedMinDurationS`, `gapLabels`, `lastEvidenceLabel`, `firstStationarySource`, …). `motion-event-detector.ts`: `MotionEventCandidateOptions.spikeReversionCheck` → quality `ARTEFACT_SUSPECT` + flag; Fable V0.1 unchanged when off |
| REJECTED | K5 / K5b (C1 jitter-aware Theil–Sen pair exclusion): TRIP_1 MAE better at offsets 0..+2 / all, TRIP_2 worse at −2/−1, loses real DEGRADED deceleration 12:05:20–23, K5b alters a non-jitter label — committed `02f72dee3` and reverted `fd9ad699e` for reproducibility |
| VALIDATION | Jest `motion-core` 61/61 (38 baseline + 3 horizon + 20 robustness); harness `backend/scripts/test/motion-core-fable-review.harness.ts` → `BEFORE_AFTER.md`: stop matching identical for all FSM variants (cS 10/10, c0 7/10 + 3 NOT_ASSESSABLE sparse-only) at offsets −2..+2; K-C downgrades 76/78 (TRIP_1) and 6/8 (TRIP_2) DIRECT labels from degraded C4 to INFERRED, episode-level quality unchanged; K3 effective EXTRA_ARTEFACT 1→0, MATCHED 7→7 at all offsets; tsc errors only in pre-existing unrelated files |
| NON_EFFECTS | No production wiring, deploy, flag or data mutation; no change to speeding, road matching, wear modules; C4 numeric values unchanged in the recommended set; Python prototype untouched |
| MODEL_WEAKNESSES (open) | Sustained equal stamp shift (two late labels, no adjacent short leg/absence) escapes the jitter signature → C4 OK at +20 km/h (synthetic); symmetric spike pairs are exempt from K3 (opposite event follows); slow roll 1–5 km/h in a STATIONARY band is not separable from standstill — flagged `HYSTERESIS_BAND_CREEP_POSSIBLE`, not resolved; stop episodes spanned through gaps carry large interior gaps (`gapLabels`; TRIP_1 first stop 12 of 46 labels observed, 34 gap labels; TRIP_2 12:19:55 stop 5 of 20) — `minDurationS` is a propagation claim, not an observation |

### EXP-021 frozen M7A — S4 road-assignment shadow step 1 (2026-10-22)

| Event | Detail |
|-------|--------|
| CHANGE | `m7a-road-assignment-shadow-worker/` + `exp021-frozen-m7a/`; migration `20261022130000_di_v0_m7a_road_assignment_shadow_v1`; GET `trips/:tripId/m7a-road-assignment-shadow`; freeze evidence `exp021-phase5a-baseline-freeze/` |
| WHY | Post-S4 batch frozen M7A street assignment for evaluation without Mapbox/UI changes; independent of motion shadow |
| VALIDATION | Jest Tiguan per-bucket hash parity vs Phase 5A manifest; control-plane + schema specs |
| NON_EFFECTS | Flags default OFF; no production backfill; no algorithm retuning |

### DS4 integration — OBD speed boundary + GPS leg hardening (2026-10-23)

| Event | Detail |
|-------|--------|
| BASELINE | Open PR #2134 `f95420593` + PR #2137 `84c155c1e` on `main` `dea2555bb` |
| CHANGE | Branch `cursor/ds4-obd-gps-integrate-192d` = merge #2137 into #2134; adapter limitations union; test expectations for combined behavior |
| VALIDATION | Four-drive replay `integrate_obd_gps`; vs main/pr2134/prod_code compares; Jest motion-core + speed-qc + boundary 108/108 |
| NON_EFFECTS | Does not replace #2134 or #2137 branches; no deploy |

### DS4 product — R1 OBD vehicle speed excluded from kinematics / QC / FSM (2026-10-23)

| Event | Detail |
|-------|--------|
| BASELINE | `origin/main` `dea2555bb` — R1 speed in pinned evidence could affect L3 `sourceRelation`, speed-QC `CROSS_SOURCE_CONFLICT`, motion-core-shadow FSM sparse input |
| CHANGE | `di-v0-r1-vehicle-speed-ds4-boundary.ts`; wired in `compute-trip-intervals`, `evaluate-di-v0-speed-qc-interval`, motion-core-shadow processor/adapter; comparison series retained |
| WHY | Video-reference eval (#2136) + offline strip candidate: OBD speed mis-sync drives QC veto and false FSM motion without improving L3 numerics on TIG22 |
| VALIDATION | Jest boundary + speed-qc + motion-core-shadow specs; four-drive replay parity `prod_code` vs `no_obd_speed` (`identical: true`) — evidence under `research/driving-intelligence/evaluations/ds4-speed-video-reference-20261023/` |
| NON_EFFECTS | R1 acquisition/pinning; non-speed OBD; trip lifecycle; C4 GPS path; **not** PR #2134 leg-gate/C4-V0.5; no deploy in workstream |
| OPEN | Fleet-wide R1 speed prevalence; independent EVAL beyond TIG22+TES16 |

### EXP-021 motion core — shadow integration (post-S4 comparison wiring) (2026-10-21)

| Event | Detail |
|-------|--------|
| CHANGE | `motion-core-shadow-worker/`: control plane (default OFF, empty allowlist fails closed), outbox + `di_v0_motion_core_shadow_{outbox,runs}_v1`, post-trip processor (FSM V0.3 + K3, RETROSPECTIVE, pinned POSITION/R1_OBD only); scheduler `di_v0_motion_core_shadow_v1`; Nest module wired in `vehicle-intelligence.module.ts` |
| WHY | Parallel comparison vs existing S4 shadow without mutating published intervals, scores, or customer surfaces |
| VALIDATION | Jest `motion-core` 68/68 incl. shadow control/processor/schema; offline harness `scripts/test/motion-core-shadow-replay.harness.ts`; artifacts `/opt/cursor/artifacts/exp021-motion-core-shadow-integration/` |
| NON_EFFECTS | S4C completion unchanged; no production flag ON; no DIMO polling; migration not applied on Production in this workstream |

### DS4 motion — Tiguan GPS leg gate + OBD point authority (2026-10-22)

| Event | Detail |
|-------|--------|
| BASELINE | Audit package `research/driving-intelligence/audits/ds4-motion-tiguan-20261022-compact/` (code SHA `dea2555bb`, research export PR #2133 `36cbd982`); trip `98d2a8e0-8b7d-4529-bf76-acee44d61fbe` |
| CHANGE | `leg-consistency.ts`: tiered 1 s leg gate (spike teleport + median-trust ceiling + backstop); stale-hold landing-only quarantine; C4 on raw buckets, FSM on quarantined view; `r1-obd-fsm-point-authority.ts` + `DiV0SpeedQcR1Sample.temporalConfidence`; bundle `DI_V0_MOTION_CORE_SHADOW_BUNDLE_V1_LEG_GATE_OBD_POINT_AUTH_V2` |
| WHY | Extreme GPS teleports produced OK C4 ~1930 km/h and false ACCELERATION; 560/560 sparse OBD samples lacked point time authority but drove DIRECT FSM (e.g. 84 km/h STARTING at tacho 0) |
| VALIDATION | Jest `motion-core-tiguan-gps-obd-hardening.spec.ts`, `motion-core-review-robustness.spec.ts`, `di-v0-motion-core-shadow-processor.unit.spec.ts`; hardening summary `research/driving-intelligence/hardening/ds4-motion-tiguan-20261022/` |
| OPEN | Full sparse ablation B not adopted (creep vs tacho-zero tradeoff); stop episodes 11 vs audit 12 on replay; audit `run_audit.sh` needs Node 24 |
| NON_EFFECTS | No deploy, reprocessing, flag ON, M7A/Mapbox/scoring changes; raw snapshots unchanged |

### DS4 motion — R1 Z/.000Z authority without string equality (2026-10-23, PR #2134 closeout)

| Event | Detail |
|-------|--------|
| CHANGE | `resolveR1ObdFsmPointAuthority`: drop `instant === bucketLabel` rejection; alignment + `R1_DEVICE_MEASUREMENT` only; BEFORE_AFTER_SUMMARY current report |
| WHY | Same proven instant must accept `Z` and `.000Z`; bucket synthesis blocked via provenance not string compare |
| VALIDATION | `r1-obd-fsm-point-authority.spec.ts` |

### DS4 motion — hard-quarantine vs jitter + C1 path block + OBD provenance (2026-10-22, PR #2134 correction)

| Event | Detail |
|-------|--------|
| CHANGE | Leg gate V0_5: hard quarantine = absolute 400 + spike 1000 only; jitter ratio not quarantine; C1 restores all window slopes, skips pairs crossing blocked 1 s legs; FSM `frozenLegacySparsePointAuthority` for frozen baseline replay; R1 requires `R1_DEVICE_MEASUREMENT` provenance; bundle V4; restored `tiguan-20261019-c4-baseline.json` |
| WHY | V0_4 relative jitter quarantine rejected plausible low-speed accel; global C1 adjacent-only broke leg-gate-off baseline; OBD authority needed explicit provenance |
| VALIDATION | Jest leg-gate, tiguan hardening, r1 authority; `TRUE_BASELINE_COMPARISON.json` |
| NON_EFFECTS | No deploy/flags/M7A |

### DS4 motion — GPS C1 quarantine + leg backstop + OBD stop metadata (2026-10-22, PR #2134 gap fix)

| Event | Detail |
|-------|--------|
| CHANGE | `leg-consistency` V0_4: absolute 400 km/h 1 s leg backstop always; `detectImplausibleOneSecondLegStartLabels` blocks C1 chords; `robust-path-slope` adjacent-only slopes + `BLOCKED_LEG_CHAIN_IN_WINDOW`; C4 V0_4; FSM stop episodes ignore sparse without `sparseFsmPointAuthority`; R1 authority aligns measurement via `Date.parse` bucket window, rejects bucket label as instant; bundle `DI_V0_MOTION_CORE_SHADOW_BUNDLE_V1_LEG_GATE_OBD_POINT_AUTH_V3`; Tiguan integration tests moved to `motion-core-shadow-worker/__tests__` |
| WHY | C1 bridged over quarantined teleports (481–2281 km/h); corrupted neighbour median waived 900 km/h; INTERVAL_ONLY OBD still counted as stop evidence; S4 dormant audit broken by core test importing `s4a-foundation` |
| VALIDATION | Jest `motion-core-leg-gate`, `motion-core-tiguan-gps-obd-hardening` (shadow-worker), `r1-obd-fsm-point-authority`, `di-v0-s4a-dormant-audit`; `npm run build`; summary `research/driving-intelligence/hardening/ds4-motion-tiguan-20261022/BEFORE_AFTER_SUMMARY.json` |
| NON_EFFECTS | No deploy/reprocessing/flags; M7A paused; frozen audit package unchanged |

### DS4 motion FSM — retrospective gap bridge V1 (2026-10-23, research + isolated impl)

| Event | Detail |
|-------|--------|
| CHANGE | `motion-fsm-gap-bridge-v1.ts`; `MotionFsmCandidateOptions.retrospectiveGapBridgeV1` (default false), `MOTION_FSM_V0_4_GAP_BRIDGE_OPTIONS`, optional `MotionFsmGapBridgeAuxiliary`; research eval `ds4-fsm-retrospective-gap-bridge-research-20261023` |
| WHY | PR #2148 / Fable review: UNKNOWN during GPS quarantine (TIG22 18:49) and delayed stop at frozen position (18:41) without inventing speed |
| VALIDATION | Jest `motion-fsm-gap-bridge-v1.spec.ts`; offline replay `run_v2_native_fsm` on TIG22/TES16/TES21-1/2 — false-claim Δ=0, events parity; long-gap guard blocks 19:03:33–55 unscored bridge |
| NON_EFFECTS | Shadow processor still V0_3 (flag OFF); no C4/C5.1 change; no deploy/backfill/DB |

### DS4 motion FSM — gap bridge V1.1 safety hardening (2026-10-23)

| Event | Detail |
|-------|--------|
| CHANGE | `MOTION_FSM_GAP_BRIDGE_V1_V1_1`: stop-feasibility from independent DIRECT anchor speeds; `FROZEN_POSITION` in-gap vetoes bridge without aux; `retrospectiveGapBridgeV1` optional (default OFF); harness TS2741 fix; `motion-fsm-gap-bridge-v1.safety.spec.ts` |
| WHY | Fable independent safety review PR #2150 — B1 build, B2 hidden embedded stops, B3 frozen veto without aux |
| VALIDATION | `tsc --noEmit`, `nest build`, `test:nest:boot-check:ci`, Jest gap-bridge + safety specs; 4-drive replay false-claim Δ=0 |
| NON_EFFECTS | Shadow processor still V0_3; no deploy/flag ON |

### DS4 motion FSM — gap bridge V1.2 stop-feasibility physics (2026-10-23)

| Event | Detail |
|-------|--------|
| CHANGE | `gapBridgeV1MaxDistanceWithEmbeddedStopM` (time-aware D_max with mandatory stop); `MOTION_FSM_GAP_BRIDGE_V1_V1_2`; CI job `DS4 motion FSM gap-bridge safety gate`; `SHADOW_INTEGRATION_READINESS.md` |
| WHY | Fable B2 re-review: fixed min-stop-distance fail-open on gentle decel / lead-cruise hidden stops |
| VALIDATION | `npm run test:di:motion-fsm-gap-bridge-safety`; four-drive replay unchanged |
| NON_EFFECTS | No C4/C5.1/events; no shadow flag ON |

### DS4 motion FSM — gap bridge V1.3 analytic stop-feasibility bound (2026-10-24)

| Event | Detail |
|-------|--------|
| CHANGE | Replace discrete profile search with bang-bang segment optima `gapBridgeV1MaxDistanceToStopInTimeM` / `FromStopInTimeM`; `MOTION_FSM_GAP_BRIDGE_V1_V1_3`; adversarial post-stop cruise safety tests; production DB guard manifest refresh |
| WHY | Fable final re-review B2: V1.2 D_max under-estimated post-stop cruise and cap travel (fail-open on hidden stops) |
| VALIDATION | `npm run test:di:motion-fsm-gap-bridge-safety`; four-drive replay gate PASS; `production-database-guard-bootstrap-dry-run` PASS |
| NON_EFFECTS | No shadow flag ON; no deploy |

### DS4 motion FSM — gap bridge V1.3.1 narrow T1-band fix (2026-10-24)

| Event | Detail |
|-------|--------|
| CHANGE | `gapBridgeV1FeasibleT1SplitCandidatesS` evaluates analytic interval endpoints when feasible T1 band &lt; grid step; `MOTION_FSM_GAP_BRIDGE_V1_V1_3_1` |
| WHY | Fable re-review: empty grid inside non-empty feasible interval under-estimated D_max at envelope corner |
| VALIDATION | 17/17 gap-bridge safety tests; four-drive replay PASS; 204-cell + 4082-cell adversarial scans 0 fail-open |
| NON_EFFECTS | No C4/C5.1/events; no flag ON |

### DS4 motion FSM — gap bridge V1.3.1 shadow worker integration (2026-10-24)

| Event | Detail |
|-------|--------|
| CHANGE | `DI_V0_MOTION_CORE_FSM_GAP_BRIDGE_V1_*` control plane; bundle V3/V4; processor aux from work-item `pipeline_version_manifest`; contract `gapBridgeV1` + `fsmAuxBinding`; `FSM_GAP_BRIDGE_V1_PRODUCTION_ROLLOUT.md` |
| WHY | Controlled post-trip activation after Fable algorithm signoff without historical reprocess |
| VALIDATION | Gap-bridge safety 17/17; integration + sealed four-drive summary specs; `nest build` |
| NON_EFFECTS | Flag default OFF; no deploy/activation; trip-FSM/C5.1/events unchanged |

### DS4 motion FSM — gap bridge V1.3.1 shadow worker integration (2026-10-24)

| Event | Detail |
|-------|--------|
| CHANGE | `DI_V0_MOTION_CORE_FSM_GAP_BRIDGE_V1_*` control plane; bundle V3/V4; processor aux from work-item `pipeline_version_manifest`; contract `gapBridgeV1` + `fsmAuxBinding`; rollout doc |
| WHY | Direct product readiness after Fable B2 signoff — controlled activation without historical reprocess |
| VALIDATION | Gap-bridge safety 17/17; integration + sealed four-drive summary specs; `nest build` |
| NON_EFFECTS | Flag default OFF; no deploy/activation; trip-FSM/C5.1/events unchanged |

### DS4 acceleration & braking — Fable independent read-only algorithm review (2026-10-24)

| Event | Detail |
|-------|--------|
| CHANGE | Research evidence only: `research/driving-intelligence/evaluations/ds4-accel-brake-fable-review-20261024/` (REPORT, A/B harness `candidates_ab.cjs` with production-parity check, probes, baseline replay `fable_base_7340637` identical to PR #2139 `match2s`) |
| WHY | Adversarial review of `motion-event-detector.ts` on production SHA `7340637` across TIG22/TES16 (EVAL) and TES21-1/TES21-2 (DEV); assess real C5.1 V1.2 and FSM Gap Bridge V1.3.1 benefit for events; evaluate alternatives without threshold shifts |
| FINDINGS | B1 K3 spike check blind when start sample is the artefact (TES16 03:50:20 FA); B2 no physics envelope — TIG22 19:04:34 (5.5→100.1 km/h/4 s) and 19:04:49 (52.3→142.1 km/h/3 s) accepted unmarked; B3 systematic intensity attenuation −0.13…−0.55 m/s² (implicit 3-s kernel of C4 differences); B4/B5 hard miss 18:44:16 and four borderline misses are kernel-bound, post-gap guard not causal; 18:49 GPS outlier quarantine correct. C5.1 removes only the TES16 FA (dev-set, not independent); FSM is C4-fed → no independent event evidence |
| RECOMMENDATION | Option A: two additive marking guards (spike-bracket/K-B → `ARTEFACT_SUSPECT`; physics envelope on event mean, class via C5.1 resolver, permissive fallback) — in-sample exactly 3 events change, 0 TREFFER loss, DEV unchanged. No new detector, no ML, no FSM coupling, no speed from gap bridge. LEG/REG3 alternatives rejected (new hard FAs / EVAL regression) |
| VALIDATION | `node scripts/candidates_ab.cjs --code-root <7340637> --tag fable_base_7340637` → parity OK on 4 drives; outputs byte-identical across runs except timestamp |
| NON_EFFECTS | No code, flag, DB, deploy or activation change; detector/C4/C5.1/FSM untouched; proposals P1–P3 are PROPOSED, not implemented |

### DS4 motion events — P1 spike bracket + P2 universal plausibility (2026-10-24)

| Event | Detail |
|-------|--------|
| CHANGE | `MOTION_EVENT_V0_3_CANDIDATE_OPTIONS[spikeBracketCheck]`; `motion-event-physics-envelope.ts` exports `MOTION_EVENT_PLAUSIBILITY_UNIVERSAL_V0_2` + `applyMotionEventUniversalPlausibility` (kinematic/sign consistency only, no vehicle nameplates); shadow processor applies after detection; bundle suffix `_EVENT_V0_3_PLAUS_V0_2`; C5.1 class resolution unchanged (only when C5.1 preferred speed effective) |
| WHY | Fleet-universal shadow hardening: P1 closes K3 blind spot (TES16 03:50:20); P2 marks only internally contradictory event fields — high acceleration without contradiction is not flagged (TIG22 19:04:34/49 may remain LIMITED/DEGRADED vs Fable nameplate proposal) |
| VALIDATION | `motion-event-p1-p2-hardening.spec.ts`; `di-v0-motion-core-shadow-event-hardening.unit.spec.ts`; `scripts/test/motion-event-p1-p2-four-drive-regression.harness.ts` (P1-only quality delta vs `fable_base_7340637` baseline, TREFFER parity) |
| NON_EFFECTS | No DB migration, no UI/i18n, no FSM/C4/C5.1 threshold or admission changes; events retained; `ARTEFACT_SUSPECT` excluded from accepted counts via existing semantics |

### Vehicle Physics Phase 2 — binding implementation plan (2026-10-24, design; Fable-remediated on `main`)

| Event | Detail |
|-------|--------|
| CHANGE | `research/driving-intelligence/VEHICLE_PHYSICS_PHASE2_IMPLEMENTATION_PLAN.md` (remediated); VO pointer `architecture/vehicle-onboarding/research/VEHICLE_PHYSICS_PHASE2_ENRICHMENT_BINDING.md`; VO-GAP-016 |
| WHY | Single-path motion reference via Mistral AI-Spec + `VehicleMotionPhysicsReference` (HV pattern); informative DI shadow only; Universal P2 V0.2 fallback; supersedes doc-only PR #2158 on `cursor/exp021-ev-ground-truth-7d78` |
| NON_EFFECTS | No runtime/DI detector/C4/C5.1/FSM changes; no mandatory external VIN decoder; Phase 2 does not mark events `ARTEFACT_SUSPECT` from derived vehicle physics |

### Vehicle Physics Phase A — VO/Master implementation (2026-10-24)

| Event | Detail |
|-------|--------|
| CHANGE | Prisma `VehicleMotionPhysicsReference` + change log; motion-physics-reference module; Mistral `systemMotorPowerKw` / `accel0To100S` / `variantAssumption` + plausibility; AI-Spec MASTER_ADMIN auth; VO baseline V2 materialization; Master modal merge-safe `applySpecs` + legacy reference API |
| WHY | Phase A of Fable-remediated plan (#2159): one stammdaten path without DI behavior changes |
| NON_EFFECTS | No DI shadow/resolver/bundle changes; no production deploy; VERIFIED requires document validation endpoint |

### Vehicle Physics Phase A — Fable BLOCK remediation (2026-10-24, PR #2161)

| Event | Detail |
|-------|--------|
| CHANGE | VO capture allowlist `motionPhysicsReference`; partial unique index one-active-per-vehicle; atomic supersede+audit repository tx; `verify()` fail-closed (`VERIFY_EVIDENCE_PIPELINE_NOT_READY`); AI-Spec org-scoped DIMO resolution; merge-safe Master `applySpecs`; legacy backfill error surfacing; PostgreSQL integration tests (VO master DIMO, concurrency, audit) |
| WHY | Close Fable pre-merge BLOCK findings without Phase B/C scope expansion |
| VALIDATION | `vo2-vehicle-onboarding-postgres-ci.sh`; `motion-physics-reference.postgres.integration.spec.ts`; policy/plausibility/security unit specs; `npm run i18n:check` |
| NON_EFFECTS | No DI/C4/C5.1/FSM/detector changes; no production migration apply |

### Vehicle Physics Phase A.1 — evidence tier / implicit confirm fix (2026-10-24)

| Event | Detail |
|-------|--------|
| CHANGE | Reject `OPERATOR_CONFIRMED` on reference `create`; `MISTRAL_AI`/`MANUAL_ENTRY` → `ESTIMATED`; Master save sync only after in-session Mistral `applySpecs` (`MISTRAL_AI`); manual Master Mistral live audit doc |
| WHY | Production audit: routine vehicle edit must not create CONFIRMED references; explicit confirm endpoint only |
| VALIDATION | `motion-physics-reference.{domain,policy}.spec.ts`; `motion-physics-reference-sync.util.test.ts`; updated postgres integration spec |
| NON_EFFECTS | No deploy/backfill; no DI/DS4/tire changes; Tiguan VIN correction remains owner-gated |

### Vehicle Physics Phase A.1 — manual specs + confirm (2026-10-24, follow-up)

| Event | Detail |
|-------|--------|
| CHANGE | Master modal: `systemPowerDefinition` select + power-type hints; **Manuelle Werte bestätigen** → `MANUAL_ENTRY` + `manualOperatorConfirm` → CONFIRMED (versioned create); VERIFIED read-only; 9-locale i18n |
| WHY | Bind manual Master entry to explicit CONFIRMED without implicit save; distinguish motor vs system kW |
| VALIDATION | Extended sync util + policy/domain specs; postgres manual confirm case |
| NON_EFFECTS | No new modules; no deploy |

### Vehicle Physics Phase A.1 — Mistral provenance guard (2026-10-24)

| Event | Detail |
|-------|--------|
| CHANGE | `mistral_live` vs `local_fallback` apply provenance; no `MISTRAL_AI` auto-reference on fallback/mixed/manual-edit; regression tests |
| WHY | PR #2163 merge gate — prevent misleading reference source attribution |
| NON_EFFECTS | No deploy; no DS4/tire changes |

### Cross-module — Tires Health declares DS4 Motion Events as future shadow consumer (2026-10-24)

| Event | Detail |
|-------|--------|
| CHANGE | Documentation only. New Tires Health authority (`architecture/tires/`, `AUDIT_IN_PROGRESS`) records `TIRE-DEC-DS4-FUTURE-LOAD-BASIS-SHADOW-ONLY-001`: DS4 ACCELERATION/DECELERATION events (shadow payloads in `di_v0_motion_core_shadow_runs_v1`, read via `DiV0MotionCoreShadowTripMapReadService.readForTrip`) are the intended future driving-load basis for tire wear — shadow only. Comparison V2 ↔ DS4: `architecture/tires/integration/DS4_MOTION_INTEGRATION_AUDIT.md` |
| WHY | Owner decision; DS4 per-manoeuvre events with quality labels replace HF-derived per-100 km stress aggregates as the tire load basis in a future model; no double counting with existing Driving-Impact consumers (`getVehicleImpactForTire`) |
| CONSUMER CONSTRAINTS (proposed, not implemented) | Read-only on DI; org-scoped `readForTrip`; conservative admission (OK admissible; DEGRADED counts only / intensity UNRATED; LIMITED coverage only; ARTEFACT_SUSPECT excluded); never `peakAccel1sMps2`; intensity ordinal from Δv/label-derived duration (Fable B3); versioned by `bundle` + `speedAuthority`; neutral fallback |
| GAPS RAISED TO DI | Persisted event rows lack `meanAccelMps2`/`durationS`/`coverageRatio` (B7) — extension requires DI decision + Fable sign-off; DI graph has no motion-core/DS4 node to attach the tire consumer edge (`TIRE-GAP-DI-GRAPH-NO-DS4-NODE-001`) |
| VALIDATION | `bash architecture/tires/scripts/validate-graph.sh`; `bash architecture/scripts/validate-module-registry.sh`; Production read-only 2026-10-24: 85 SUCCEEDED runs, 34 trips, 4 vehicles, latest-per-trip 449 events (OK 394 / DEGRADED 21 / LIMITED 32 / ARTEFACT_SUSPECT 2) |
| NON_EFFECTS | No DI code, flag, allowlist, persistence, graph node or deploy change; detector/C4/C5.1/FSM/P1/P2 untouched; no tire runtime change |

### Trip UI PR B — vehicle trip API read provenance + quality hints (2026-10-27, PR #2192 Fable remediation)

| Event | Detail |
|-------|--------|
| CHANGE | **Read contract only:** canonical trip hydration selects `TripDrivingImpact.analysisStatus` + `sourceCompleteness`; vehicle trip API adds `drivingImpactAnalysisStatus`, `drivingImpactScoreSource`, `drivingImpactSourceCompleteness`. Rental `VehicleStressPanel` shows localized quality hints (PARTIAL/STALE/PENDING/FAILED/UNSUPPORTED, legacy `vehicle_trip_compat`, R1 containment) without changing `buildSummary` score math. Turkish locale registry promoted `fallback-only` → `partial` for owned Driving Impact quality keys. |
| WHY | Fable audit: nonterminal TDI statuses and legacy mirror provenance were invisible; i18n gate failed on Turkish owned keys vs fallback-only registry |
| VALIDATION | `trip-analytics-canonical.service.spec.ts`, `trip-api.mapper.spec.ts`, `scoreFormat.test.ts`, `VehicleStressPanel.ui.test.tsx`, `translation-registry.test.ts`; `bash architecture/drivingintelligence/scripts/validate-docs.sh` |
| NON_EFFECTS | No Driving Impact compute/persist formulas; no DriverScore/RentalDrivingAnalysis/Tire/Brake/FSM/schema changes |

### DS4 authoritative assessment migration — PR-0 governance (2026-10-28)

| Event | Detail |
|-------|--------|
| CHANGE | Owner decision **DI-DEC-DS4-AUTHORITY-001** (`OWNER_APPROVED`, not runtime-activated). Design doc `design/DS4_AUTHORITATIVE_ASSESSMENT_MIGRATION.md` (dependency graph, fail-closed FC-1..FC-7, blockers B1–B9, PR-0..PR-10 sequence, OBD misuse separation). Consumer Audit V1 findings register `evidence/CONSUMER_AUDIT_V1_FINDINGS_REGISTER.md` (4×P1, 4×P2, 2×ADDENDUM). Registry: Brakes Health / Rental Driving Analysis / Rental Health → `AUDIT_IN_PROGRESS` bootstrap authorities. Tires `TIRE-GAP-DI-GRAPH-NO-DS4-NODE-001` → PARTIALLY_CLOSED (design node; YAML deferred). |
| WHY | Owner-approved migration plan from legacy HF/Impact V1 to DS4 as single driving-behaviour authority; permanent record before implementation PRs |
| VALIDATION | `bash architecture/scripts/validate-module-registry.sh`; `bash architecture/drivingintelligence/scripts/validate-graph.sh`; `bash architecture/drivingintelligence/scripts/validate-docs.sh` |
| NON_EFFECTS | **No** runtime code, migrations, flags, deploy, DS4 authority activation, or scoring changes |

### DS4 event intensity persistence — PR-2 (2026-10-28, isolated Draft PR, not deployed)

| Event | Detail |
|-------|--------|
| BEFORE | `mapMotionManoeuvreEventToPersisted` dropped detector-computed `meanAccelMps2`, `durationS`, `steps`, `coverageRatio`, `startUncertaintyS`, `endUncertaintyS` (and peaks); shadow rows in `di_v0_motion_core_shadow_runs_v1` carried kind/boundaries/speeds/Δv/quality/flags only (blocker B2) |
| CHANGE | New `di-v0-motion-core-shadow-event-row.contract.ts`: event-row contract `DI_V0_MOTION_CORE_EVENT_ROW_V2_INTENSITY_ORDINAL_V1` declared in `payload.contract.persistence` + `summary_json.eventRowContract`; optional per-row `intensity` block (six fields) populated only when all constituents are finite/valid, otherwise omitted; `peakAccel1sMps2`/`peakAccel2sMps2` excluded by contract; `intensityUsagePolicy = ORDINAL_ONLY_NOT_PHYSICALLY_VALIDATED`; readers `resolveMotionCoreShadowEventRowContract` (legacy → V1) and `readPersistedMotionEventIntensity` (→ block or `null`) |
| WHY | Persist already-computed intensity for later DS4 assessment/Impact V2 PRs without replay, backfill or reprocessing; decision `DI-DEC-DS4-INTENSITY-PERSIST-001` |
| ALTERNATIVES | Bundle bump to V5 (rejected: intent-key change ⇒ mass re-enqueue); persisting peaks (rejected: B3 artefact amplifiers); zero/null-fill (rejected: fabrication); DTO exposure now (deferred to post-review) |
| VALIDATION | `di-v0-motion-core-shadow-event-intensity-persistence.unit.spec.ts` 21/21; motion-core-shadow suite 14 suites / 72 tests; `di-v0-motion-core-shadow-event-intensity.postgres.integration.spec.ts` 2/2 on local ephemeral PostgreSQL 16 (`DI_V0_S4A_POSTGRES_INTEGRATION=1`); `npx tsc --noEmit` exit 0; `nest build` exit 0; `validate-graph.sh`, `validate-docs.sh`, `validate-module-registry.sh` |
| NON_EFFECTS | Bundle versions V1–V4, intent keys, C4/C5.1/FSM/gap bridge/plausibility, event counts/classifications/boundaries, trip-map DTO (`peakAccel1sMps2` stays `null`), Trip UI, Tire/Brake/Rental/DriverScore calculations, flags, allowlists — all unchanged; no migration, no deploy, no production data mutation; DS4 authority not activated |
| REMAINING | Fable review (`FABLE_REVIEW=REQUESTED`); motion-core Postgres specs not wired into CI; uncertainty labels persisted as free text |

### DS4 event intensity persistence — Fable follow-up contract hardening (2026-10-28, PR #2209)

| Event | Detail |
|-------|--------|
| CHANGE | Fable PASS_WITH_CONDITIONS remediation on same PR: document `meanAccelMps2` as positive secant magnitude (direction in `kind` only) + B3 ordinal policy; `coverageRatio` semantics and reject outside (0,1]; `resolveMotionCoreShadowEventRowContract` returns explicit `UNKNOWN` for unrecognised/future contracts; `readPersistedMotionEventIntensityForPayload` fail-closed for V1/UNKNOWN; `eventFlagsSemantics`/`eventFlagsConsumptionPolicy` (opaque flags, no accel/peak parsing in PR-3); unit tests for UNKNOWN, invalid coverageRatio, legacy V1 fail-closed |
| WHY | Independent Fable review of persistence contract before merge |
| NON_EFFECTS | Bundle versions, detection, event counts, trip-map DTO, Trip UI unchanged; no deploy |

### DS4 Assessment L2 + Driving Impact V2 PR-A (2026-10-28)

| Event | Detail |
|-------|--------|
| CHANGE | New `ds4-assessment/` module: fleet admission (four canonical UUIDs), `computeDs4TripAssessmentV1`, `computeDs4DrivingImpactV2` (score publication disabled), tables `di_v0_ds4_trip_assessment_v1`, `di_v0_ds4_trip_driving_impact_v2`, outbox + leader scheduler (`di_v0_ds4_assessment_v1`, flags OFF); internal read `GET .../ds4-assessment` |
| WHY | Owner decision DS4 single authority — implement productive-capable assessment infrastructure without consumer cutover or calibrated scoring |
| VALIDATION | `npm run test:di:ds4-assessment`; optional postgres integration when `S4A_POSTGRES_LIVE`; `nest build`; architecture validators |
| NON_EFFECTS | Motion detection, legacy HF/Impact V1, Trip UI/DriverScore/Rental/Brake/Tire customer paths unchanged; motion-core env allowlists untouched; no deploy |
| REMAINING | Fable review quality policy + reference distribution calibration; PR-B consumer cutover |

### DS4 Assessment L2 PR-A2 — intensity eligibility + driving exposure (2026-10-28)

| Event | Detail |
|-------|--------|
| CHANGE | `ds4-assessment-event-intensity-eligibility.v1.ts` + `ds4-assessment-driving-exposure.v1.ts`; L2 engine wires admissible ordinals, exposure provenance, `NO_VALID_DRIVING_EXPOSURE`; quality policy V2 default; extended `eventSummariesJson` (no schema migration) |
| WHY | Fable 2026-10-28: gate ordinal bins on validated V2 intensity + duration metadata; canonical Es/D_km for future calibrated impact without publishing numeric score |
| VALIDATION | `npm run test:di:ds4-assessment` (unit + optional postgres) |
| NON_EFFECTS | C4/C5.1 algorithms unchanged; `operationalLoadIndex` remains null; worker OFF; no consumer cutover |
| REMAINING | Reference population calibration; Fable re-review of eligibility thresholds |

### DS4 RPM High Frequency V1A — data integration & admission (2026-10-28, Draft PR, not deployed)

| Event | Detail |
|-------|--------|
| BEFORE | VSI cadence loader read RPM HF via vehicle time-band only (12k cap); no trip-scoped DS4 reader; no DS4 admission/DQ contract for RPM HF shadow path |
| CHANGE | `ClickHouseHfService.getTripRpmHfPoints` (org + vehicle + trip_id + signal + trip window; pagination; tenant violation detection; fail-soft). New isolated module `driving-intelligence/rpm-hf-v1a/` (`Ds4RpmHfV1aTripInputService`: per-trip VSI admission, descriptive DQ, read-only contract). VSI consumer registry entry `ds4_rpm_hf_v1a` (APPROVED_DESIGN_CONTRACT). **Production activation forbidden** — no scheduler/outbox/shadow persist |
| WHY | Phase 2A controlled integration after read-only audit 2026-10-28; trip-scoped HF read without retroactive RPM_1HZ on unclassified historical trips |
| VALIDATION | Jest: `ds4-rpm-hf-v1a/*`, `clickhouse-hf.trip-rpm.spec.ts`; `nest build`; replay fixture `rpm-production-interval-replay.json` |
| NON_EFFECTS | Motion C5.1, Trip FSM, Driving Impact, DriverScore, Tire/Brake, DIMO fetch pipeline, HF mirror ingest unchanged; no DB migration; no deploy |
| REMAINING | Live ClickHouse preflight gate before activation; V1B shadow engine + Fable before production allowlist |

### DS4 RPM High Frequency V1B — post-trip temporal quality shadow (2026-10-28, Draft PR, not deployed)

| Event | Detail |
|-------|--------|
| BEFORE | V1A read-only trip input only; no versioned post-trip RPM HF shadow persistence or temporal coverage contract |
| CHANGE | `rpm-hf-v1b/`: deterministic temporal engine, versioned shadow result contract, trip outbox + run persistence (`ds4_rpm_hf_v1b_shadow_*`), leader-gated scheduler (`ds4_rpm_hf_v1b_shadow_v1`). Consumes **only** `Ds4RpmHfV1aTripInputService.buildTripInput()` — no alternate RPM pipeline. Flags default OFF |
| WHY | Phase 2B shadow quality validation after prod V1A smoke; bounded post-trip processing with VSI rolling trip classification provenance (no vehicle-level promotion) |
| VALIDATION | Jest `rpm-hf-v1b/*`; Prisma migration `20261028180000_ds4_rpm_hf_v1b_shadow_v1`; scheduler registry entry; `nest build` |
| NON_EFFECTS | V1A contract unchanged; motion-core shadow scheduler untouched; no customer scoring/API/UI; no deploy/backfill |
| REMAINING | Owner allowlist pilot + Fable review before any production flag enable |

### DS4 RPM HF V1B — Phase 4I admission quality exposure (2026-10-30, Draft PR, not deployed)

| Event | Detail |
|-------|--------|
| BEFORE | Tier-aware shadow persisted tier metadata under `tierEvidence` only; flat `admission` could be read as full-trip enablement alongside `HIGH_RESOLUTION` |
| CHANGE | Additive `admission.qualityExposure` (`ds4-rpm-hf-v1b-admission-quality-v1`): cadence tier/confidence, analysisMode, analysisReadiness, tripCoverageBand, observedBucketCoverageRatio, `qualityScope: OBSERVED_HF_TEMPORAL`, `tierAnalyticsReady`, `impliesFullTripCoverage: false` |
| WHY | Phase 4H audit: downstream interpretation gap — separate temporal method from full-trip / TIER_ANALYTICS_OK |
| VALIDATION | Jest `ds4-rpm-hf-v1b-quality-exposure.spec.ts` (Phase 4H Tiguan-shaped fixtures); existing rpm-hf-v1b processor/tier/fingerprint specs |
| NON_EFFECTS | No VSI classifier/threshold changes; no admission routing or temporal/RPM math changes; input fingerprints unchanged; flags default OFF |

### DS4 RPM HF V1B — PR #2224 targeted hardening (2026-10-28, not deployed)

| Event | Detail |
|-------|--------|
| CHANGE | Lease recovery for expired `PROCESSING` claims; claim-token fencing; canonical RPM series input fingerprint; bounded SUCCEEDED outbox reopen for input revision (`succeeded_input_fingerprint`); 72h post-trip readiness window vs defer attempt budget; temporal `observedSequenceDurationSeconds` excludes inter-sequence gaps; V1B-local control-plane env parsing (no `s4a-foundation` import); postgres integration spec `ds4-rpm-hf-v1b-outbox.postgres.integration.spec.ts` |
| WHY | Independent code review on PR #2224 — worker safety, idempotency/revision semantics, VSI defer correctness, S4 dormant audit boundary |
| VALIDATION | Jest `rpm-hf-v1b/*`; optional `DI_V0_S4A_POSTGRES_INTEGRATION=1` outbox postgres spec; `nest build`; S4 unit dormant audit |
| NON_EFFECTS | V1A unchanged; flags default OFF; no deploy |
| REMAINING | Merge review; owner pilot allowlist when ready |

### DS4 RPM HF V1B — runtime integrity hardening (2026-10-28, PR #2224)

| Event | Detail |
|-------|--------|
| CHANGE | Trip-scoped VSI fingerprint; revision reopen gated on RPM_1HZ authoritative inputs; fair revision probe cursor (`revision_last_probed_at`); trip-end defer schedule vs 72h deadline; run insert bound to live outbox claim; dedicated postgres CI workflow |
| WHY | Code review runtime risks: rolling VSI window churn, unsafe revision reopen, defer timeline vs budget, stale worker persist |
| VALIDATION | Jest rpm-hf-v1b + v1a; `ds4-rpm-hf-v1b-postgres-ci.sh` (PR-path hook in `di-v0-s4a-postgres-ci.sh`) |
| NON_EFFECTS | V1A contract unchanged; flags default OFF; no deploy |

### DS4 RPM HF V1B — SUCCEEDED run insert idempotency (2026-10-28, PR #2224)

| Event | Detail |
|-------|--------|
| CHANGE | `insertRun` / `insertRunWithActiveClaim` use partial unique index `ON CONFLICT … WHERE shadow_status = 'SUCCEEDED' DO NOTHING RETURNING id`; claim path verifies live lease before insert |
| WHY | CI postgres test expected `idempotent_duplicate`; Prisma catch path missed partial-index violation metadata |
| VALIDATION | `ds4-rpm-hf-v1b-postgres-ci.sh` (9/9) |
| NON_EFFECTS | Schema unchanged; V1A/VSI/temporal/scheduler untouched |

### DS4 Assessment L2 PR-A2 hardening — exposure integrity + fingerprint binding (2026-10-28, PR #2218)

| Event | Detail |
|-------|--------|
| CHANGE | Fail-closed duplicate label handling; C5_1_PREFERRED no c4Speeds fallback; 1s exposure grid gap; L2 rule bindings in assessment input fingerprint; zero-exposure fail-closed independent of manoeuvre count |
| WHY | Independent Fable review PASS_WITH_CONDITIONS remediation on PR #2218 |
| VALIDATION | `npm run test:di:ds4-assessment`; `test:di:ds4-assessment:postgres:ci`; merge with main (#2217) |
| NON_EFFECTS | No score publication; workers OFF; no consumer cutover |
| REMAINING | Impact V2 percentile gate on `assessmentStatus===RATED` before future activation |

### DS4 pre-activation readiness — exposure perf + postgres persistence assertions (2026-10-28)

| Event | Detail |
|-------|--------|
| CHANGE | O(n) Map-based FSM duplicate-label counting in `ds4-assessment-driving-exposure.v1.ts`; postgres integration asserts persisted `eventSummariesJson` exposure provenance + intensity quality + zero-exposure path |
| WHY | Close PR-A2 technical prerequisites before assessment worker data collection; production read-only audit baseline |
| VALIDATION | `npm run test:di:ds4-assessment`; `test:di:ds4-assessment:postgres:ci`; evidence `evidence/DS4_PRE_ACTIVATION_READINESS_2026-10-28.md` |
| NON_EFFECTS | No deploy; assessment/impact workers OFF; no numeric score; no consumer cutover |
| REMAINING | Production deploy of #2212/#2215/#2218 stack; V2 intensity backfill on legacy motion payloads; owner activation record |

### DS4 assessment collection safety — V2-only discovery + cutoff fail-closed (2026-10-28)

| Event | Detail |
|-------|--------|
| CHANGE | `discoverFromSucceededMotionRuns` filters V2 contract + `DI_V0_DS4_ASSESSMENT_MIN_MOTION_RUN_CREATED_AT`; summary/payload contract validation; Impact V2 percentile resolver gated on `assessmentStatus===RATED` only |
| WHY | Safe shadow collection for post-L2 Motion V2 without V1 starvation or numeric score leakage under unapproved policy |
| VALIDATION | `npm run test:di:ds4-assessment`; postgres integration when `DI_V0_DS4_ASSESSMENT_POSTGRES_INTEGRATION=1` |
| NON_EFFECTS | No deploy; no production env activation; workers remain OFF without explicit cutoff |
| REMAINING | Owner sets cutoff + enables worker for collection; ordinal rating still unapproved |

### DS4 Layer 2 AP2 — longitudinal load observables read projection (2026-10-29)

| Event | Detail |
|-------|--------|
| CHANGE | Extend internal `GET …/trips/:tripId/ds4-assessment` response with optional `longitudinalLoadObservablesV1`; deterministic AP1 kernel projection from persisted `eventSummariesJson` (no motion recompute, no schema migration) |
| WHY | Expose Layer-2 load observables on existing authorized internal read path after AP1 kernel merge (#2239) |
| VALIDATION | `jest ds4-longitudinal-load-observables.v1.spec.ts`; `jest ds4-assessment-read.service.v1.unit.spec.ts`; backend `tsc --noEmit` |
| NON_EFFECTS | No worker/scheduler change; no customer score; no Driving Impact mutation; exposureGate remains UNCALIBRATED |
| REMAINING | Layer-3 fleet calibration and operational load index remain out of scope |

### DS4 R1 shadow speed safety P1 — intensity endpoint evidence gates (2026-10-29)

| Event | Detail |
|-------|--------|
| CHANGE | `motion-event-intensity-endpoint-evidence.v1.ts`; shadow processor applies `applyMotionEventIntensityEvidenceGatesV1` after universal plausibility; marks `ARTEFACT_SUSPECT` + `INTENSITY_ENDPOINT_EVIDENCE` / `SHARED_CONFLICT_KNOT` when speed samples carry abstained/conflict QC flags or opposite secants share an isolated spike knot |
| WHY | Production Arteon trip `630dc631…`: ABSTAINED/CONFLICT 220 km/h knot produced admissible BIN_ONLY ACCEL/BRAKE secants (~26–27 m/s²) because spike-bracket skipped `oppositeFollows` pairs; fail closed before DS4 intensity eligibility without caps or zeroing kinematics |
| VALIDATION | `motion-event-intensity-endpoint-evidence.v1.spec.ts`; `npm run test:di:ds4-assessment`; `npm run test:di:s4a`; motion P1/P2 + shadow processor unit regressions |
| NON_EFFECTS | No C4/C5.1 speed rewrite; no Tesla API_SYNTHETIC L2 resolver change; no persisted row mutation/backfill; no deploy/flags |
| REMAINING | Owner review; optional processor integration fixture against full S4 evidence adaptation |

### DS4 Layer-2 historical export P1 — persisted assessment read-only CLI (2026-10-30)

| Event | Detail |
|-------|--------|
| CHANGE | `ds4-layer2-historical-export.v1.*` + research CLI; artifacts `manifest.json`, `assessments.csv`, `longitudinal_events.csv`, `exclusions.csv`, `coverage_summary.json`; design `design/DS4_LAYER2_HISTORICAL_EXPORT_V1.md` |
| WHY | Reproducible research export for persisted L2 assessments (P1 scope: assessment rows only) without new persistence, backfill, or motion-only recomputation |
| VALIDATION | `npm run test:di:ds4-layer2-export` |
| NON_EFFECTS | No deploy/flags/migrations/worker changes; no production data in git; no motion-only annex |
| REMAINING | Optional production read-only smoke to local artifacts; batch automation outside P1 PR |

### DS4 Layer-2 historical export P1 hardening — S4A SQL, attestation, JSON integrity (2026-10-30)

| Event | Detail |
|-------|--------|
| CHANGE | Export loader → explicit SQL repository (no `diV0S4*` delegates); `evaluationCodeSha` from git HEAD; fail-closed `eventSummariesJson` integrity gate; guard bundle manifest SHA regen for `test:di:ds4-layer2-export` npm script |
| WHY | Close PR #2256 review blockers without expanding export architecture |
| VALIDATION | `npm run test:di:ds4-layer2-export` (23); `npm run test:di:s4a` (125/125); `di-v0-s4a-dormant-audit`; `production-database-guard-bootstrap-dry-run.sh` |
| NON_EFFECTS | No S4A guard edits; no deploy/production writes; no second L2 engine |

### 2026-10-30 — DS4 Layer-2 P2 offline reconstruction pilot (draft PR)

| Field | Detail |
|-------|--------|
| CHANGE | Isolated P2 research adapter: pinned 8-trip cohort, revision selector, read-only motion loader, `p2_*` artifacts, CLI gated by `DS4_LAYER2_P2_PRODUCTION_RECONSTRUCTION_AUTHORIZED=1`; reuses canonical DS4 assessment + L2 projector |
| WHY | Implement feasibility-audit pilot without P1 persistence or bulk backfill |
| VALIDATION | `npm run test:di:ds4-layer2-p2-offline` (12); production-database-guard manifest regen |
| NON_EFFECTS | No production assessment writes; no worker replay; no merge into P1 export |
| EVIDENCE | `architecture/drivingintelligence/research/DS4_LAYER2_P2_OFFLINE_RECONSTRUCTION_PILOT_2026-10-30.md` |

### 2026-10-30 — DS4 Layer-2 P2 pilot hardening (draft PR #2258)

| Field | Detail |
|-------|--------|
| CHANGE | Cohort pins `expectedVehicleId` + `expectedSourceFamily`; runtime scope assert before compute; motion payload `sparse.channelOutcome` threaded into evidence loader; revision tie-break `created_at` desc + `motionRunId` asc; `test:di:ds4-layer2-p2-offline` in S4A unit CI job |
| WHY | Close architecture-audit gaps (identity, Tesla API_SYNTHETIC context, deterministic selection, CI coverage) |
| VALIDATION | `npm run test:di:ds4-layer2-p2-offline` (18); S4A workflow unit job |
| NON_EFFECTS | No production reconstruction; no assessment persistence |

### 2026-10-30 — RPM Reference Intelligence ownership boundaries (Phase 5 ADR, documentation-only)

| Field | Detail |
|-------|--------|
| CHANGE | ADR [`design/RPM_REFERENCE_INTELLIGENCE_AND_DI_OWNERSHIP_BOUNDARIES_ADR_2026-10-30.md`](../design/RPM_REFERENCE_INTELLIGENCE_AND_DI_OWNERSHIP_BOUNDARIES_ADR_2026-10-30.md); decision `DI-DEC-RPM-REF-INTEL-001`; graph evidence `DI-EVID-RPM-REF-INTEL-ADR-001`; cross-refs in DI README/CURRENT_STATE, VSI cross-workstream contracts, VSI change ledger |
| WHY | Owner-approved Phase 5 architecture: register boundaries between VSI, RPM HF V1A/V1B, Vehicle Specifications reference metadata, RPM Reference Intelligence (small RPM-workstream component), and DS4 — without implementation or canary interference |
| VALIDATION | `bash architecture/drivingintelligence/scripts/validate-docs.sh`; `bash architecture/drivingintelligence/scripts/validate-graph.sh`; `bash architecture/scripts/validate-module-registry.sh` |
| NON_EFFECTS | **No** production flag/env changes; **no** runtime code; **no** migrations; **no** V1B admission/VSI tier changes; **no** DS4 Motion/Driving Impact/Tire/Trip FSM/customer behavior; active Audi+Arteon V1B shadow canary unaffected |
| REMAINING | Future P1–P5 implementation PRs; DS4 optional consumer contract; Fable review before any RPM-derived load/wear/scoring |

### 2026-10-31 — DS4 Layer-2 P3C offline physics diagnostics sidecar

| Field | Detail |
|-------|--------|
| CHANGE | P3C sidecar exporter + pinned 11-trip P2 attestation/fixtures; temporal P3B wrapper; architecture [`DS4_LAYER2_P3C_OFFLINE_PHYSICS_DIAGNOSTICS_V1.md`](./DS4_LAYER2_P3C_OFFLINE_PHYSICS_DIAGNOSTICS_V1.md) |
| WHY | Independent Motion Physics diagnostics for pinned P2 cohort without mutating canonical kinematic outputs |
| VALIDATION | `npm run test:di:ds4-layer2-p3c-physics`; `npm run research:ds4-layer2-p3c-physics` |
| NON_EFFECTS | **No** P2 CSV mutation; **no** admission/eligibility/production writes; **no** B/I/Phi/S recompute in P2 path |

### 2026-10-31 — DS4 Layer-2 P3C temporal provenance hardening (PR #2270)

| Field | Detail |
|-------|--------|
| CHANGE | `classifyDs4Layer2P3cTemporalProvenanceV1`; read-only `selectMotionPhysicsReferenceEffectiveAtTripV1` + optional Prisma historical resolver; fixture `effectiveFrom` labeled `RETROSPECTIVE_REFERENCE` / `FIXTURE_SNAPSHOT`; sidecar CSV columns `temporalProvenance`, `historicalEvidenceSupported`, `numericDiagnosticAvailability`; production DB guard manifest regen for P3C npm scripts |
| WHY | Fixture `2025-01-01` effectiveFrom must not read as independently evidenced historical applicability; separate numeric availability from evidence tier and temporal provenance |
| VALIDATION | `npm run test:di:ds4-layer2-p3c-physics`; `ds4-layer2-p3c-historical-motion-physics-resolver.v1.spec`; `bash backend/scripts/test/production-database-guard-bootstrap-dry-run.sh`; `npx tsc -p tsconfig.build.json --noEmit` |
| NON_EFFECTS | **No** P3B production resolver semantic change; **no** P2 checksum/CSV mutation; **no** fabricated historical reference rows; **no** deploy/merge |

### 2026-10-31 — DS4 Layer-2 P3B Motion Physics context resolver (research-only)

| Field | Detail |
|-------|--------|
| CHANGE | `resolveDs4Layer2MotionPhysicsContextV1` + contract under `ds4-assessment/research/`; architecture note [`DS4_LAYER2_P3_MOTION_PHYSICS_CONTEXT_V1.md`](./DS4_LAYER2_P3_MOTION_PHYSICS_CONTEXT_V1.md); unit tests with mocked deps |
| WHY | Minimal read-only reference resolver for future Layer-2 offline vehicle-physics diagnostics without production wiring |
| VALIDATION | `npm test -- --testPathPatterns=ds4-layer2-p3-motion-physics-context.resolver.v1.spec`; `npx tsc -p tsconfig.build.json --noEmit` |
| NON_EFFECTS | **No** motion-core/assessment/admission integration; **no** schema migrations; **no** production writes; **no** B/I/Phi/S changes |

|-------|--------|
| CHANGE | `applyMotionEventSharedKnotSpikePairGate` in `motion-event-intensity-endpoint-evidence.v1.ts`; wired from `applyMotionEventIntensityEvidenceGatesV1` with optional C5.1 Q5/Q6 repair evidence; shadow processor passes `speedRepairs` |
| WHY | Tiguan trip `dbdded5c-ee72-40f3-91bb-62d5a1b7f7ff`: K3 `REVERSION_EXPLAINED_BY_OPPOSITE_EVENT` + non-isolated shared knot let BIN_ONLY 7.898/8.561 m/s² secants stay `OK`; multi-indicator fail-closed gate marks pair `ARTEFACT_SUSPECT` + `SHARED_KNOT_SPIKE_PAIR` flag |
| VALIDATION | `motion-event-intensity-endpoint-evidence.v1.spec.ts` (dbdded5c fixture, hard-braking counterexample, missing-evidence fail-closed); `npm run test:di:ds4-assessment`; P2 differential harness `ds4-shared-knot-spike-pair-p2-differential.harness.ts` (124→122 admissible) |
| NON_EFFECTS | No P2 CLI/reconstruction change; no DB writes/backfill/deploy/flags; no Tire/Brake/Driving Impact/customer scores |
| REMAINING | Existing persisted shadow payloads unchanged until shadow recompute; C4-only paths need two geometry-independent indicators without C5.1 (see assessSharedKnotSpikePairIndicatorsV1) |

### 2026-10-30 — RPM Reference Intelligence V1 library (Phase 5A, shadow-safe)

| Field | Detail |
|-------|--------|
| CHANGE | Pure library `rpm-reference-intelligence-v1/` — contract `ds4-rpm-reference-intelligence-v1`, reference spec + HF admission inputs, normalized position, idle proximity, operating bands, time-weighted exposure on eligible continuous sequences only; DI consumer interface types only |
| WHY | Implement ADR `DI-DEC-RPM-REF-INTEL-001` P2 metrics calculator without V1B admission changes, persistence, flags, or DS4/Tire/Impact integration |
| VALIDATION | `npm run test:di:rpm-ref-intel-v1`; P1 hardening: V1B temporal gap binding + UNKNOWN provenance + production DB guard manifest regen |
| NON_EFFECTS | **No** production deploy; **no** canary/env flag changes; **no** V1B shadow processor or admission edits; **no** migrations/workers; **no** customer-facing surfaces |
| REMAINING | P4 DS4 optional consumer; localization N/A (developer contract only); spec edits do not reopen historical attachments (`REFERENCE_SNAPSHOT_AT_CALCULATION_TIME_NO_SPEC_REPLAY`) |

### 2026-10-30 — RPM Reference Intelligence V1 V1B shadow attach (Phase 5B, flag-gated)

| Field | Detail |
|-------|--------|
| CHANGE | `DS4_RPM_REF_INTEL_V1_V1B_ATTACH_ENABLED` (default OFF); `Ds4RpmHfV1bShadowService` attaches optional `rpmReferenceIntelligenceV1` to `summary_json` on V1B SUCCEEDED runs only; shared vehicle reference mapper + V1B temporal binding from `qualityExposure` / `tierEvidence` |
| WHY | ADR `DI-DEC-RPM-REF-INTEL-001` P3 — persist reference metrics additively without changing V1B admission, canary flags, or customer surfaces |
| VALIDATION | `npm run test:di:rpm-ref-intel-v1`; failure-isolated try/catch; no new DB table |
| NON_EFFECTS | **No** `DS4_RPM_HF_V1B_*` changes; **no** deploy/canary activation; **no** DS4/Tire/Impact; **no** spec-revision replay/backfill |
| REMAINING | P4 DS4 optional consumer; production attach flag remains OFF until owner scope |

### 2026-10-31 — DS4 Layer-2 P4B event kinematics evidence sidecar (research)

| Field | Detail |
|-------|--------|
| CHANGE | Read-only P4B sidecar `DS4_LAYER2_P4B_EVENT_KINEMATICS_EVIDENCE_V1`: pinned payload loader, strict P2 join (`tripId`+`sourceMotionRunId`+`eventIndex`), boundary/window speed evidence, peak explicitly unavailable |
| WHY | Persisted Motion V2 payloads carry boundary speeds; peaks excluded from shadow contract — versioned research artifacts without mutating P2 or motion-core |
| VALIDATION | `npm run test:di:ds4-layer2-p4b-event-speed`; CLI `npm run research:ds4-layer2-p4b-event-speed` (read-only DB) |
| NON_EFFECTS | **No** production writes/deploy; **no** motion-core/admission/P2 CSV changes; **no** peak reconstruction |
| REMAINING | Empirical 129-event sidecar from Production DB requires operator `DATABASE_URL` CLI run; peaks remain unavailable until contract extension |

### 2026-10-31 — Tiguan partial boundary extension → DI admission release (trips reconciliation hook)

| Field | Detail |
|-------|--------|
| CHANGE | Trips module releases `diV0BoundaryAdmissionV1` after committed `PARTIAL_TRIP_BOUNDARY_EXTENSION`; S4 discovery eligibility unchanged (still requires matching admission revision) |
| WHY | Post-repair `boundaryRefresh` PENDING blocked `canRelease`; Tiguan canonical trip never received admission via boundary-scanned release path |
| VALIDATION | `trip-di-boundary-admission.unit.spec.ts`; postgres harness when live |
| NON_EFFECTS | **No** S4 worker/discovery code change; **no** scoring; **no** historical replay |
| REMAINING | Owner-authorized read-only Production eligibility before any Tiguan replay |

### 2026-11-01 — Durable DI boundary admission recovery (Fable P0, extends PR #2293)

| Field | Detail |
|-------|--------|
| CHANGE | `runDurableAdmissionRecoveryPass` on reconciliation tick — bounded COMPLETED/RESTING scan, `tryReleaseForTripTransactional`, shadow/writer activation env gates; Prometheus `synqdrive_trip_di_boundary_admission_recovery_*` |
| WHY | Direct finalize/LIVE_FSM/scanner paths leave eligible trips permanently unadmitted; S4 discovery requires admission revision |
| VALIDATION | `trip-di-boundary-admission-recovery.*.spec.ts`; existing S4 T01 postgres harness unchanged |
| NON_EFFECTS | **No** S4 physics/C5.1; **no** scoring; **no** production env activation; **no** automatic historical backfill |
| REMAINING | Owner sets `TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_ACTIVATED_AT_UTC` + writer flag in controlled rollout; historical trips (e.g. `2245f107…`) require separate approval |

