# Driving Intelligence — Evidence Index

Canonical catalog of Driving Intelligence evidence for the 2026-08-30 → 2026-09-06 workstream.  
**Governance:** `docs/audits/driving-intelligence-evidence-governance-2026-09-01.md`  
**DI-EV registry:** `docs/audits/driving-intelligence-evidence-registry.md` (53 rows) + C.1d/C.1e in block-polling audit

Each item records what conclusions it **supports** and what it **does not** support.

---

## Type legend

| Type | Meaning |
|------|---------|
| CODE | Runtime implementation |
| TEST | Automated test suite |
| REFERENCE_DRIVE | Controlled capture session (RD001–004) |
| VIDEO_GROUND_TRUTH | External tachometer/dashboard observations |
| TELEMETRY_EXPORT | Machine-readable session exports |
| AUDIT | Forensic audit / phase report |
| DESIGN | Architecture proposal (not production) |
| PRODUCTION_RUNTIME | Production deployment observation |
| PR_COMMIT | Merge / deploy artifact |
| UI/API | Consumer surface semantics |

---

## DS4 authority migration (2026-10-28)

| ID | Type | Description | Location | Supports | Does NOT support |
|----|------|-------------|----------|----------|------------------|
| DI-EVID-CONSUMER-AUDIT-V1-001 | AUDIT | Driver Score & Rental Driving Analysis Consumer Audit V1 (read-only @ `51adb234…`) | `evidence/CONSUMER_AUDIT_V1_FINDINGS_REGISTER.md` | P1/P2 remediation acceptance criteria | DS4 cutover execution |
| DI-EVID-RPM-REF-INTEL-ADR-001 | DESIGN | RPM Reference Intelligence + DI/VSI/Vehicle Spec ownership boundaries ADR (Phase 5 docs) | `design/RPM_REFERENCE_INTELLIGENCE_AND_DI_OWNERSHIP_BOUNDARIES_ADR_2026-10-30.md` | Registered decision DI-DEC-RPM-REF-INTEL-001; distinguishes CURRENT vs APPROVED FUTURE vs NOT IMPLEMENTED | RPM Reference Intelligence module; DS4 consumer interface; any RPM load/wear/scoring |
| DI-EVID-DS4-MIGRATION-DESIGN-001 | DESIGN | DS4 authoritative assessment migration plan + fail-closed contract | `design/DS4_AUTHORITATIVE_ASSESSMENT_MIGRATION.md` | PR-0..PR-10 sequencing; owner decision trace | Production DS4 authority active |
| DI-EVID-DS4-INTENSITY-PERSISTENCE-PR2-001 | CODE+TEST | PR-2 event-row contract V2 (`DI_V0_MOTION_CORE_EVENT_ROW_V2_INTENSITY_ORDINAL_V1`): root-cause trace, backward-compat matrix, unit 21/21 + motion-core suite 72/72 + local PostgreSQL round-trip 2/2, Fable review request | `evidence/DS4_EVENT_INTENSITY_PERSISTENCE_PR2.md` | Intensity fields persisted for new shadow runs; legacy rows resolve V1/`null`; no bundle/intent-key change; no Trip UI change | Physical validity of `meanAccelMps2` (B3 attenuation); any consumer binding before Fable review; Production effect (not deployed) |

---

## Program & forensic baseline

| ID | Type | Era | Description | Location | DI-EV | Strength | Supports | Does NOT support |
|----|------|-----|-------------|----------|-------|----------|----------|------------------|
| DI-EVID-PHASE1-001 | AUDIT | 2026-08-30 | Phase 1 forensic current-state | `docs/audits/driving-intelligence-phase-1-current-state-forensic-audit-2026-08-30.md` | 0002 | CONFIRMED | Post-trip HF chain; no raw HF in PG; stress=vehicle load | Fleet-scale perf |
| DI-EVID-CODE-BOUNDARY-001 | CODE | — | DI module boundary | `vehicle-intelligence.module.ts` | 0002 | CONFIRMED | Scope separation from trip FSM | DIMO auth internals |
| DI-EVID-CODE-ENRICH-001 | CODE | — | Enrichment orchestrator | `trip-enrichment-orchestrator.service.ts` | 0002 | CONFIRMED | Legacy queue chain | V2 stage DAG when flag off |
| DI-EVID-CODE-SCORE-001 | CODE | — | Impact scorer v1.2.0 | `driving-impact-scorer.ts` | 0002 | CONFIRMED | Formula structure | Ground-truth score accuracy |
| DI-EVID-CODE-LOAD-001 | CODE | — | Load component proxies | `driving-impact-load-components.ts` | 0002 | CONFIRMED | Proxy semantics + assessability | Measured wear |
| DI-EVID-CODE-V2-FLAG-001 | CODE | — | V2 master flag default false | `driving-intelligence-v2.config.ts` | — | CONFIRMED | Safe default | V2 production validation |

---

## DIMO signal surface (Phase 2)

| ID | Type | Era | Description | Location | DI-EV | Strength | Supports | Does NOT support |
|----|------|-----|-------------|----------|-------|----------|----------|------------------|
| DI-EVID-2A-001 | AUDIT | 2026-08-31 | Query surface Q001–Q027 | `dimo-phase-2a-current-query-surface-audit-2026-08-31.md` | 0003 | CONFIRMED | 41 signal fields in queries | Per-vehicle availability |
| DI-EVID-2B-001 | AUDIT | 2026-08-31 | Four-vehicle capability matrix | `dimo-phase-2b-four-vehicle-capability-gap-matrix-2026-08-31.md` | 0004 | CONFIRMED | Union 33 signals; 15 unused | Observed update frequency |
| DI-EVID-2C-001 | AUDIT | 2026-08-31 | Schema 117 fields | `dimo-phase-2c-current-schema-signal-expansion-audit-2026-08-31.md` | 0005 | CONFIRMED | Schema vs query separation | Vehicle-specific cadence |
| DI-EVID-2D-001 | AUDIT | 2026-08-31 | Physics/value matrix | `dimo-phase-2d-signal-value-physics-matrix-2026-08-31.md` | 0006 | CONFIRMED | Tier A cadence-critical set | Production detector thresholds |
| DI-EVID-2E-001 | AUDIT | 2026-08-31 | Redundancy canonicalization | `dimo-phase-2e-redundancy-canonicalization-2026-08-31.md` | 0007 | PROPOSAL | Episode identity taxonomy | Deployed episode V2 |
| DI-EVID-2F-001 | AUDIT | 2026-08-31 | Capability-first acquisition | `dimo-phase-2f-capability-first-acquisition-strategy-2026-08-31.md` | 0008 | PROPOSAL | VCM / query planner design | Live planner implementation |
| DI-EVID-LTE-MANIFEST-001 | DESIGN | 2026-08-31 | LTE_R1 manifest v1.1.0 | `docs/audits/manifests/dimo-lte-r1-reference-manifest-v1.json` | 0009/0010 | PROPOSAL | Broad-capture field set | Runtime manifest enforcement |

**Vehicle inventory audits (support 2B):** `dimo-wob-l-7503-…`, `dimo-ks-mx-2024-…`, `dimo-ks-ms-661-…`, `dimo-hmue-c-215-…` (2026-08-30)

---

## Flight Recorder & reference capture

| ID | Type | Era | Description | Location | DI-EV | Strength | Supports | Does NOT support |
|----|------|-----|-------------|----------|-------|----------|----------|------------------|
| DI-EVID-RC-FOUNDATION-001 | AUDIT+CODE | 2026-08-31 | Flight Recorder foundation | `dimo-phase-3a1-flight-recorder-foundation-2026-08-31.md` | 0011/0012 | CONFIRMED | RC module; envelope v1.0.0 | Production HF path change |
| DI-EVID-RC-CANARY-001 | PRODUCTION_RUNTIME | 2026-08-31 | Stationary canary 52 obs | `dimo-phase-3a2-production-preflight-canary-2026-08-31.md` | 0013/0014 | CONFIRMED | REFERENCE_DRIVE_READY | Motion HF density |
| DI-EVID-0035C-RECOVERY-001 | AUDIT+CODE | 2026-09-04 | HF Recovery V2 policy | `driving-intelligence-hf-recovery-runtime-implementation-2026-09.md` | 0035C | CONFIRMED | Settlement/overlap/watermarks | Optimal 8s/6s; prod cutover |
| DI-EVID-0035C1-BLOCK-001 | AUDIT+CODE | 2026-09-04–05 | Block polling + C.1a–e | `driving-intelligence-hf-block-polling-scalability-2026-09.md` | 0035C.1–C.1e | CONFIRMED | Testbed implementation | 30s density proof; live canary |
| DI-TEST-HF-RECOVERY-001 | TEST | — | Recovery V2 unit tests | `reference-capture-hf-recovery-v2.policy.spec.ts` | 0035C | CONFIRMED | Policy semantics | Multi-replica prod |
| DI-TEST-BLOCK-POLL-001 | TEST | — | Block poll + calibration tests | `reference-capture-hf-block-polling.policy.spec.ts` | C.1 | CONFIRMED | Phase lifecycle | Live 10/20/30/60 run |
| DI-EVID-RC-EXP021-CANARY-CLI-001 | CODE+TEST | 2026-09-17 | KS MX 2024 canary operator CLI + safety micro-closure | `reference-capture/exp021-maturation-shadow-canary-operator-cli-2026-09-17.md` | EXP-021 | CONFIRMED | Manual single-family enrollment path; fail-closed guards | Production execution; automatic enrollment |

---

## Reference drives

| ID | Type | Era | Description | Location | DI-EV | Strength | Supports | Does NOT support |
|----|------|-----|-------------|----------|-------|----------|----------|------------------|
| DI-EVID-RD001-001 | REFERENCE_DRIVE | 2026-09-01 | RD001 Tiguan STOP; no video | `dimo-lte-r1-reference-drive-001-capture-report-2026-09-01.md` | 0016–0019 | CONFIRMED | Late-arrival differential; 151s gap | Video GT alignment |
| DI-EVID-RD002-001 | REFERENCE_DRIVE | 2026-09-02 | RD002 C63 motion | `dimo-lte-r1-reference-drive-002-capture-report-2026-09-02.md` | 0023–0026 | CONFIRMED | Sealed HF Δt P50 **13.489s**; 1s≠1Hz; AGGREGATE_BUCKET_V2 | ~2s median (that is RD003) |
| DI-EVID-RD002-SEALED-CADENCE-001 | REFERENCE_DRIVE | 2026-09-02 | RD002 sealed spacing metrics | Same + signal-quality-metrics.json | 0025 | CONFIRMED | P50 13.489 / P95 84.024 / MAX 249.647 | Physical 1 Hz |
| DI-EVID-RD003-CADENCE-001 | REFERENCE_DRIVE | 2026-09-02–03 | RD003 Tiguan + video GT | `driving-intelligence-rd003-signal-quality-interpretation-2026-09.md` | 0027–0034E | CONFIRMED | 1s request ≠ **~2.00s** RD003 HF median; providerTimestamp authority | RD002 sealed P50; validated global GT |
| DI-EVID-RD003-ALIGN-001 | VIDEO_GROUND_TRUTH | 2026-09-03 | Sparse video GT 9 clips | `docs/audits/data/rd003-video-ground-truth-observations.json` | 0034B–D | INFERRED | Speed fingerprint presence | GROUND_TRUTH_VALIDATED=NO |
| DI-EVID-RD004-A-001 | REFERENCE_DRIVE | 2026-09-04 | RD004 Segment A alignment | `architecture/RD004_A_SEGMENT_A_VIDEO_TELEMETRY_ALIGNMENT_2026-09-04.md` | 0035A.2 | CONFIRMED | H≠provider offset; 38 HF samples | Global clock fit |
| DI-EVID-RD004-B-001 | REFERENCE_DRIVE | 2026-09-04 | RD004-B late buckets | `docs/audits/data/rd004-segment-b/rd004-b-findings.md` | 0035B.4–B.6 | CONFIRMED | 53 late-arrival; 26 watermark-excluded | 8/6 optimality |
| DI-EVID-RD004-B-REPLAY-001 | TELEMETRY_EXPORT | 2026-09-04 | 75 exact-window replays | `rd004-b-hf-exact-window-replay.json` | 0035B.4 | CONFIRMED | Capture watermark gap root cause | Provider physics cadence |

Detail: [reference-capture/REFERENCE_DRIVES.md](./reference-capture/REFERENCE_DRIVES.md), [RD003_RETROSPECTIVE.md](./reference-capture/RD003_RETROSPECTIVE.md), [RD004_RETROSPECTIVE.md](./reference-capture/RD004_RETROSPECTIVE.md)

---

## Signal inventory & cadence

| ID | Type | Era | Description | Location | DI-EV | Strength | Supports | Does NOT support |
|----|------|-----|-------------|----------|-------|----------|----------|------------------|
| DI-EVID-SIGNAL-SURFACE-001 | AUDIT | 2026-09-06 | Canonical surface audit | `evidence/signal-inventory/SIGNAL_SURFACE_AUDIT.md` | 0003+ | CONFIRMED | SNAPSHOT/LIVE/HF/Native roles | All vehicles identical |
| DI-EVID-CADENCE-FOUR-WAY-001 | AUDIT | 2026-09-06 | Four-way cadence invariant | `evidence/signal-inventory/CADENCE_DENSITY.md` | 0034E | CONFIRMED | Query≠poll≠density≠physics | Single-number cadence claims |

---

## Scoring, detectors, episode design

| ID | Type | Era | Description | Location | DI-EV | Strength | Supports | Does NOT support |
|----|------|-----|-------------|----------|-------|----------|----------|------------------|
| DI-EVID-0034F-DESIGN-001 | DESIGN | 2026-09-03 | Episode V2 canonical design | `driving-intelligence-v2-canonical-design-2026-09.md` | 0034F | PROPOSAL | Episode taxonomy + confidence | Production behavior |
| DI-EVID-DETECTOR-AUDIT-001 | CODE+AUDIT | 2026-09-06 | Production HF detectors | `evidence/driving-events/DETECTOR_AUDIT.md` | 0002+0034E | CONFIRMED | Point-pair algorithms + thresholds | GT-validated detector accuracy |
| DI-EVID-NATIVE-EVENTS-001 | CODE+AUDIT | 2026-09-06 | Native DIMO event authority | `evidence/driving-events/NATIVE_DIMO_EVENTS.md` | 0026+0034F | CONFIRMED | LTE_R1 misuse path | HF short-event authority |
| DI-EVID-SCORING-001 | CODE+AUDIT | 2026-09-06 | Impact V1 + naming audit | `research/scoring-models/SCORING_RETROSPECTIVE.md` | 0002 | CONFIRMED | Current formulas | Driver quality inference |
| DI-EVID-LOAD-FORMULAS-001 | CODE | — | Tire/brake load derivation | `evidence/tire-brake-load/LOAD_FORMULAS.md` | P43 | CONFIRMED | Proxy formulas | Measured wear |
| DI-TEST-IMPACT-SCORER-001 | TEST | — | Impact scorer regression | `driving-impact.service.spec.ts` | — | CONFIRMED | Formula stability | Real-world calibration |

---

## Production deployment

| ID | Type | Era | Description | Location | DI-EV | Strength | Supports | Does NOT support |
|----|------|-----|-------------|----------|-------|----------|----------|------------------|
| DI-EVID-PR-1533-001 | PR_COMMIT | 2026-09-05 | C.1e merge + safe deploy | PR #1533 `3d5040b67` | 0035C–C.1e | CONFIRMED | CODE_DEPLOYED=YES | FEATURE_ENABLED=YES |
| DI-EVID-DEPLOY-STATE-001 | PRODUCTION_RUNTIME | 2026-09-05 | Post-merge flag state | `evidence/production/DEPLOYMENT_STATE.md` | C.1e | CONFIRMED | V2 OFF; empty canary; LEGACY authority | Live calibration executed |
| DI-EVID-DEF019-GATE2-001 | PRODUCTION_RUNTIME | 2026-09-06 | DI-DEF-019 GATE 2 dress rehearsal | `evidence/reference-capture/DI_DEF_019_GATE2_PRODUCTION_DRESS_REHEARSAL_2026-09-06.md` | 0035C.1e | CONFIRMED | Prod phase lifecycle STOP/ABORT; lockSessionRow fix | Scientific 10/20/30/60 cadence proof |
| DI-EVID-EXP019-LIVE-CAL-001 | REFERENCE_DRIVE | 2026-09-07 | EXP-019 live 10/20/30/60 + settlement closeout | `evidence/reference-capture/LIVE_HF_CALIBRATION_KS_MX_2024_10_20_30_60_2026-09-07.md` | 0035C.1c | INFERRED | Rate reduction 55–84%; max gaps persist post-settlement | Cadence winner; 30s validated; prod cutover |
| DI-EVID-EXP019-VIDEO-GT-001 | REFERENCE_DRIVE | 2026-09-07 | EXP-019 video GT alignment windows (TRUE T+30 settled gaps) | `evidence/reference-capture/EXP_019_VIDEO_GT_ALIGNMENT_WINDOWS_2026-09-07.md` | 0035C.1c | INFERRED | Absolute UTC gap timeline; 7 merged review windows; P0 max gaps | Human video GT verified; vehicle behavior interpretation |
| DI-EVID-EXP019-VIDEO-GT-002 | REFERENCE_DRIVE | 2026-09-07 | EXP-019 video GT vs telemetry/detector correlation | `evidence/reference-capture/EXP_019_VIDEO_GT_VS_TELEMETRY_CORRELATION_2026-09-07.md` | 0035C.1c | INFERRED | 5/5 GT gaps: 0 HF interior samples; native fallback absent at windows | Cadence winner; sole HF authority sufficient |
| DI-EVID-EXP019-VIDEO-GT-003 | REFERENCE_DRIVE | 2026-09-07 | EXP-019 video GT event register + multi-authority correlation | `evidence/reference-capture/EXP_019_VIDEO_GT_EVENT_REGISTER_2026-09-07.md` | 0035C.1c | INFERRED | Revised human GT; boundary-only HF; HF sole authority insufficient (gap windows) | Production policy change; cadence-wide CRITICAL |
| DI-EVID-EXP019-VIDEO-GT-004 | REFERENCE_DRIVE | 2026-09-07 | EXP-019 bias-control + decision readiness (8 control windows) | `evidence/reference-capture/EXP_019_BIAS_CONTROL_AND_DECISION_READINESS_2026-09-07.md` | 0035C.1c | INFERRED | Gap vs control CLEAR_DIFFERENCE; phase gap fractions; claim scope corrected | Cadence winner; production architecture decision |
| DI-EVID-EXP020-WINDOW-001 | REFERENCE_DRIVE | 2026-09-07 | EXP-020 retrospective window geometry + post-trip matrix | `evidence/reference-capture/EXP_020_RETROSPECTIVE_WINDOW_POST_TRIP_MATRIX_2026-09-07.md` | 0035C.1c | INFERRED | W060–W300 same union; P1 optimal; P50 first-obs ~27s; gaps sparse at video GT | Settlement delay proven; production HF change |
| DI-EVID-EXP021-DESIGN-001 | REFERENCE_DRIVE | 2026-09-07 | EXP-021 settlement shadow experiment design + production timing audit | `evidence/reference-capture/EXP_021_SETTLEMENT_SHADOW_EXPERIMENT_DESIGN_2026-09-07.md` | 0035C.1c | INFERRED | Dual isolated channels; 8×60s probes × 6 ages; post-trip shadow ages; ~113 req budget; shadow tooling NOT built | Production HF policy change; drive executed |
| DI-EVID-EXP021-PREFLIGHT-001 | REFERENCE_DRIVE | 2026-09-07 | EXP-021 preflight — 446 union semantics + provider idempotence | `evidence/reference-capture/EXP_021_PROVIDER_IDEMPOTENCE_PREFLIGHT_2026-09-07.md` | 0035C.1c | CONFIRMED | 446 union PARTIAL (ms-key artifact); Q1/Q2/Q3 Jaccard 1.0 on settled interval | Settlement age distribution; production delay selection |
| DI-EVID-EXP021-TOOLING-001 | REFERENCE_DRIVE | 2026-09-07 | EXP-021A settlement shadow tooling + dry-run gate | `evidence/reference-capture/EXP_021_SETTLEMENT_SHADOW_EXPERIMENT_DESIGN_2026-09-07.md` | 0035C.1c | CONFIRMED | Persisted BullMQ scheduler; immutable observations; VehicleTrip end authority; default OFF | Physical drive settlement results |
| DI-EVID-EXP021-C03-001 | AUDIT+CODE | 2026-09-24 | EXP-021 C0.3 R1 temporal-safety containment record (restates C0–C0.2 findings; consumer map; static bypass search) | `evidence/reference-capture/EXP_021_C03_R1_TEMPORAL_CONTAINMENT_2026-09-24.md` | EXP-021 C0.3 | CONFIRMED | R1 point-in-time claims unsupported; containment design + deferred paths | Root cause of R1 misdating; production effect of containment (not deployed) |
| DI-TEST-R1-CONTAINMENT-001 | TEST | 2026-09-24 | R1 containment unit/regression suites (resolver, enrichment, ledger, brake wear, impact, event context, read model, counters, misuse) | `backend/src/modules/vehicle-intelligence/**/*r1-*containment*.spec.ts` | EXP-021 C0.3 | CONFIRMED | Code-level containment; Tesla/UNKNOWN unaffected | Production validation |
| DI-EVID-EXP021-C05-CG01-001 | AUDIT+CODE | 2026-09-24 | CG-01 `COLD_ENGINE_FULL_THROTTLE` R1 temporal conjunction containment | `evidence/reference-capture/EXP_021_C05_CG01_COLD_ENGINE_FULL_THROTTLE_2026-09-24.md` | EXP-021 C0.5 | CONFIRMED | 326 prod rows HF_DERIVED; read + future gate | Deploy validation pending |
| DI-EVID-EXP021-C1D7-001 | AUDIT+CODE | 2026-09-26 | DI V0 S3A dormant position acquisition + normalization (1 s grid, availability tri-state, snapshot identity, error model) | `evidence/EXP021_C1D7_S3A_INPUT_NORMALIZATION_REPORT.md` | EXP-021 C1D.7 | CONFIRMED | Code/test semantics; S1 golden parity; no runtime caller | Live provider multi-sample behaviour; production effect (not wired) |
| DI-TEST-V0-POSITION-ACQ-001 | TEST | 2026-09-26 | S3A Jest suites (normalization, errors, identity/S2, S1 integration, scale, static boundary) | `backend/src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/__tests__/` | EXP-021 C1D.7 | CONFIRMED | 110 tests, no network | Production validation |
| DI-EVID-EXP021-C1D8-001 | AUDIT+CODE | 2026-09-27 | DI V0 S3B dormant R1 OBD (INTERVAL_ONLY) + native event evidence adapters (C1D.8 contract; historical, amended by C1D.8B) | `evidence/EXP021_C1D8_S3B_R1_OBD_NATIVE_EVENT_ADAPTERS.md` | EXP-021 C1D.8 | CONFIRMED | Separate channels; no L3 override; no runtime caller | Native accuracy; production effect (not wired) |
| DI-EVID-EXP021-C1D8B-001 | AUDIT+CODE | 2026-09-27 | S3B contract hardening: native fail-closed calibration, context binding, eventId dedup, NO_EVENT ≠ source failure, explicit channel state, R1 per-signal duplicate policy, ignition excluded, field authority matrix | `evidence/EXP021_C1D8B_S3B_CONTRACT_HARDENING.md` | EXP-021 C1D.8B | CONFIRMED | Code/test semantics; FULL-R1-002 golden-bound R1 non-override | Provider-schema field semantics (REPO_CONTRACT_ONLY); captured R1 OBD rows for golden; native accuracy |
| DI-EVID-EXP021-C1D9-001 | AUDIT+CODE | 2026-09-27 | S3B R1 field authority (DIMO GraphQL introspection + VSS 4.2 spec + read-only R1 responses, 4 vehicles) and V0_3 correction (gear removed; 5 fields provider-verified; AVG kept) | `evidence/EXP021_C1D9_R1_FIELD_AUTHORITY_V03_CORRECTION.md` | EXP-021 C1D.9 / C1D.9A | CONFIRMED | Field existence, type, unit, aggregation syntax/semantics for 5 fields; gear AVG unsafe + unavailable on R1 | Multi-sample 1 s AVG behaviour; gear categorical strategy; production effect (not wired) |
| DI-EVID-EXP021-C1D10A-001 | AUDIT+DESIGN | 2026-09-27 | C1D.10A read-only Production re-anchor (S2 migration applied 2026-09-26 23:46 UTC, 0 rows ever; native ingest failures swallowed; 60 d late-mutation distribution), P2 triage, frozen S4A machine contract + validator | `evidence/EXP021_C1D10A_AUTHORITY_CORRECTION.md`, `evidence/EXP021_C1D10A_P2_TRIAGE.md`, `design/s4a/` | EXP-021 C1D.10A | CONFIRMED | S2 authority correction; native NO_EVENT unprovable today; 24 h / 10 d settlement; contract-level identity, fencing and migration safety | Any S4 runtime behavior (none exists); Postgres race behavior (S4A tests); snapshot size (INFERRED); legal retention |
| DI-EVID-EXP021-C1D10C-001 | AUDIT+DESIGN | 2026-09-27 | C1D.10C closure of C1D.10B P1-A..P1-D: S4A contract v2 (S2 execution identity, TRIP_VEHICLE_ORGANIZATION tenancy, control plane, 13 transitions), enforcing validator + red-team suite (47 negative / 21 positive, 0 false accepts / rejects), read-only re-read (S2 empty, DB TimeZone Etc/UTC, ID formats), P2 reconciliation | `evidence/EXP021_C1D10C_AUTHORITY_CLOSURE.md`, `design/s4a/s4a-contract.v2.json`, `design/s4a/S4A_CONTROL_PLANE.md` | EXP-021 C1D.10C | CONFIRMED | Contract-level closure of all four C1D.10B P1; settlement time authority UTC; S2 still empty | Any S4 runtime behavior (none exists); Postgres race behavior (S4A tests); provider backpressure (open gap); replay deserializer (open gap) |
| DI-EVID-EXP021-C1D10E-001 | AUDIT+DESIGN | 2026-09-27 | C1D.10E P1-E closure: exhaustive DB kill write-set (T07 only while KILLED), authoritativeWrites (19), killPolicy serialization, K01–K18 races, validator exhaustiveness (65 negative / 24 positive) | `evidence/EXP021_C1D10E_KILL_WRITESET_CLOSURE.md`, `design/s4a/s4a-contract.v2.json` | EXP-021 C1D.10E | CONFIRMED | P1-E closed; race IDs pinned; S4A authority validators in GitHub CI | Runtime unchanged |
| DI-EVID-EXP021-S4A-POSTGRES-CI-001 | CI+TEST | 2026-09-28 | S4A Postgres CI wiring: workflow `s4a-postgres-integration.yml`, `test:di:s4a:postgres:ci`, 61/61 fail-closed; dormant deploy readiness READY; deploy gate → READY_FOR_SEPARATE_OPERATOR_DEPLOY_DECISION | `evidence/EXP021_S4A_POSTGRES_CI_WIRING.md`, `.github/workflows/s4a-postgres-integration.yml` | EXP-021 S4A | CONFIRMED | Same suite as premerge seal (R01–R25, K01–K18, M01–M08) | Branch protection must list job required (operator) |
| DI-EVID-EXP021-S4A-POST-MERGE-GATE-001 | OPERATIONAL | 2026-09-28 | Post-merge gate `DO_NOT_DEPLOY_S4A_MIGRATION_TO_PRODUCTION` ACTIVE until `test:di:s4a:postgres` in required CI + deploy-readiness seal; preserves six P2 deadlines | `evidence/EXP021_S4A_POST_MERGE_DEPLOY_GATE.md` | EXP-021 S4A merge | CONFIRMED | Merge alone does not authorize Production migration apply | Production deploy without CI gate |
| DI-EVID-EXP021-S4A-IMPL-001 | CODE+TEST | 2026-09-27 | S4A dormant foundation: migration (4 tables + S2 scope guards, empty-S2 precondition), fenced work-item repository T01–T13, identities, control plane, fenced S2 persistence; 175 tests incl. real multi-connection Postgres R01–R25 / K01–K18 / KS1–KS3 and migration M01–M08; dormant audit 0 call sites; read-only Production baseline (S2 empty, S4A unapplied, release = `5bcecc6c6`) | `evidence/EXP021_S4A_DORMANT_FOUNDATION_IMPLEMENTATION.md`, `backend/src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/` | EXP-021 S4A | CONFIRMED | Contract v2 implemented and enforced in Postgres; kill serialization both orders; no stale write; ≤1 active PRIMARY; migration refuses non-empty S2, yields on locks, no canonical rewrite, reversible | Any S4 runtime (none wired); Production migration effect (not applied); throughput at scale; replay deserializer |
| DI-EVID-DEF019-GATE1-001 | TEST | 2026-09-06 | DI-DEF-019 GATE 1 postgres integration | `evidence/reference-capture/DI_DEF_019_GATE1_POSTGRES_INTEGRATION_2026-09-06.md` | 0035C.1e | CONFIRMED | Real PG lock + phase paths | Production runtime |
| DI-EVID-API-UI-001 | UI/API | 2026-09-06 | Semantic mismatch audit | `evidence/production/API_UI_SEMANTICS.md` | 0002 | CONFIRMED | Naming risks | Backend formula errors |

---

## High-timeframe / temporal analytics

| ID | Type | Era | Description | Location | DI-EV | Strength | Supports | Does NOT support |
|----|------|-----|-------------|----------|-------|----------|----------|------------------|
| DI-EVID-HTF-001 | AUDIT | 2026-09-06 | High-timeframe work status | `evidence/temporal-analytics/HIGH_TIMEFRAME_WORK.md` | — | CONFIRMED | Partial rolling aggregates exist | Dedicated time-series intelligence module |

| DI-EVID-EXP021-P21-R3-001 | REFERENCE_DRIVE | 2026-10-14 | P2.1 R3 one-trip GPS/L3/P1 QC forensic (763 NO_NUMERIC + 26 conflicts) | `evidence/EXP021_P21_R3_GPS_QC_SEMANTICS_FORENSIC.md` | P2.1 R3 | CONFIRMED | Read-only DB + in-memory replay; disjoint taxonomy | Production behavior change; fleet-wide accuracy |
| DI-EVID-EXP021-P21-R3A-001 | REFERENCE_DRIVE | 2026-10-14 | P2.1 R3A V2 gap taxonomy, 628 hold breakdown, 293 s segment, loader/POST_GAP closure | `evidence/EXP021_P21_R3A_FORENSIC_CLOSURE.md` | P2.1 R3A | CONFIRMED | V1→V2 reconciliation; composed S1→P1→P2 tests | Production behavior change |
| DI-EVID-EXP021-P21-R3B-001 | REFERENCE_DRIVE | 2026-10-14 | P2.1 R3B acquisition `[start,end)`, WI snapshot bind, RR read, live RO replay artifact `exp021-p21-r3b-forensic.json` | `evidence/EXP021_P21_R3B_DIAGNOSTIC_CORRECTNESS_FINAL.md` | P2.1 R3B | CONFIRMED | Live `synqdrive_exp021_p21_ro` replay; gap reclassification 1 false internal → edge | Production behavior change; P1 implementation |
| DI-EVID-EXP021-P1-V2-001 | REFERENCE_DRIVE | 2026-10-14 | P1 `DI_V0_SPEED_QC_POLICY_V2` stationary null-speed; 118/144 accepted on pinned trip | `evidence/EXP021_P1_V2_STATIONARY_SEMANTICS.md` | P2.1 P1 V2 | CONFIRMED | Live V1/V2 compare; trusted numeric unchanged | Production activation; default policy switch |
| DI-TEST-P21-R3-COMPOSED-001 | TEST | 2026-10-14 | S1 output composed through P1 speed QC | `backend/.../di-v0-speed-qc-s1-p1-composed.spec.ts` | P2.1 R3 | CONFIRMED | Stationary null → NO_NUMERIC contract documented | Full S1 integration matrix |
| DI-EVID-DS4-OBD-SPEED-STRIP-PROD-001 | TEST+REFERENCE_DRIVE | 2026-10-23 | Prod boundary module + four-drive replay parity vs offline strip | `research/driving-intelligence/evaluations/ds4-speed-video-reference-20261023/REPORT_PROD_OBD_STRIP.md`, `outputs/prod_code_vs_no_obd_speed_parity.json` | DS4-OBD-strip | CONFIRMED | Bit-identical harness parity on sealed fixtures (TIG22/TES21/TES16) | Fleet coverage; #2134 protections; video re-watch |
| DI-TEST-DS4-R1-SPEED-BOUNDARY-001 | TEST | 2026-10-23 | R1 speed DS4 product boundary unit tests | `backend/.../di-v0-r1-vehicle-speed-ds4-boundary.spec.ts` | DS4-OBD-strip | CONFIRMED | L3/QC/FSM wiring contracts | Production deploy attestation |

---

## Cross-links

| Register | Path |
|----------|------|
| DI-EV chronology | `research/DI_EV_CHRONOLOGY.md` |
| Experiments | `research/EXPERIMENT_REGISTER.md` |
| Hypotheses | `research/HYPOTHESIS_REGISTER.md` |
| Defects | `research/DEFECT_LEDGER.md` |
| PR timeline | `research/PR_TIMELINE.md` |
| Workstream narrative | `WORKSTREAM_HISTORY.md` |

**Total indexed evidence items (this authority):** 40+ primary IDs; 53 DI-EV registry rows; 100+ repository artifact paths.
