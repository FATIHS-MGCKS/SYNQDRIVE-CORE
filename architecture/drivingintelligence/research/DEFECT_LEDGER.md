# Driving Intelligence — Defect Ledger

Significant defects discovered during the 2026-08-30 → 2026-09-06 workstream.  
**Rejected hypotheses are NOT defects** — see `HYPOTHESIS_REGISTER.md`.

**Summary:** TOTAL=**33** | FIXED=**29** (DI-DEF-003–017, 019 production-validated; DI-DEF-021–033 W1/W2) | OPEN=**4** (DI-DEF-001, 002, 018, 020)

| ID | Phase | Symptom | Cause | Risk | Fix | Tests | Status |
|----|-------|---------|-------|------|-----|-------|--------|
| DI-DEF-001 | Phase 1 audit | `DriverScoreService` implies driver quality | Historical naming | UI/business misinterpretation | Semantic documentation only; rename deferred | — | OPEN |
| DI-DEF-002 | Phase 1 audit | `profilesComparable()` dead in rolling aggregate | Legacy code path | Incorrect rolling comparisons if invoked | Not fixed in DI scope | — | OPEN |
| DI-DEF-003 | RD001 | 39 HF buckets permanently excluded | Single watermark + late arrival | Incomplete HF capture | DI-EV-0021 per-field watermarks | 3A.3.2 tests | FIXED |
| DI-DEF-004 | RD003 alignment v1 | Clock-prior alignment false positives | Methodological defect in 0034C | Invalid GT claims | Superseded by 0034D V2 | Alignment tests | FIXED |
| DI-DEF-005 | RD003 alignment v1 | Static-minute geometry error | Incorrect joint interval geometry (D.1) | Wrong basin selection | DI-EV-0034D.2 correction | V2 discovery tests | FIXED |
| DI-DEF-006 | RD004-A v1 | Circular clock offset + drift | Methodology | Invalid speed alignment | 0035A.1 → 0035A.2 closeout | Segment A tests | FIXED |
| DI-DEF-007 | RD004-B B.5 | 8s/50-50 overlap "protection" overclaimed | Lower-bound semantics error | False confidence in parameters | DI-EV-0035B.6 correction | B.6.1 hygiene tests | FIXED |
| DI-DEF-008 | C.1a audit | Canary fail-open when allowlist empty | Missing fail-closed gate | Unscoped V2 activation | Empty allowlist → LEGACY | C.1a policy tests | FIXED |
| DI-DEF-009 | C.1a audit | Bucket-age semantic error | Wrong age computation for observability | Misleading metrics | Semantic correction | Block poll tests | FIXED |
| DI-DEF-010 | C.1a audit | Stagger deadline primitive missing | Fleet stagger design incomplete | Duplicate poll storms | Deadline primitive added | C.1a tests | FIXED |
| DI-DEF-011 | C.1d audit | Lost-update race on phase switch | Cycle release overwrote calibration state | Wrong poll cadence during live test | FOR UPDATE + boundary activation | 12 concurrency tests | FIXED |
| DI-DEF-012 | C.1d audit | V2 activation gate missing on phase API | Authority verification gap | Phase API without V2 | Fail-closed gate | Calibration tests | FIXED |
| DI-DEF-013 | C.1e audit | Stale precompute race on phase request | Phase computed from pre-lock snapshot | Operator phase reverted | `requestHfCalibrationPhaseAtomic()` | C.1e lifecycle tests | FIXED |
| DI-DEF-014 | C.1e audit | Terminal phase not finalized on stop | Missing finalization path | Lost phase evidence | `finalizeTerminalCalibrationSeries()` | Stop quiescence tests | FIXED |
| DI-DEF-015 | C.1e audit | Synthetic temporal bucket identity | Request count used as time identity | Wrong cadence statistics | Real ISO bucket-start timestamps | Temporal metric tests | FIXED |
| DI-DEF-016 | C.1e audit | Transition windows contaminated primary stats | Inclusion in cadence comparison | Invalid 10/20/30/60 comparison | Exclude TRANSITION + RECOVERY_SWEEP | Phase summary tests | FIXED |
| DI-DEF-017 | C.1e CI | Constructor dependency mismatch | Test-only DI wiring | CI failure | Test-only fix in PR #1533 | 113 RC HF tests | FIXED |
| DI-DEF-018 | Production detectors | ~1 Hz assumption in HF window producer | Code predates RD003/RD002 cadence evidence | Detector timing on sparse HF | **Not fixed** — documented as semantic debt | — | OPEN |
| DI-DEF-019 | Live cal 2026-09-06 | `switchHfCalibrationPhase` fails in production | `lockSessionRow` raw SQL used Prisma model table `"ReferenceCaptureSession"` + camelCase columns; Prisma maps IDs to PostgreSQL `text` (no `::uuid` cast) | **Live HF calibration blocked**; stop/abort finalization also affected | Fix `reference_capture_sessions` + `organization_id`; GATE 1 PG integration + GATE 2 production dress rehearsal | `reference-capture-lock-session.postgres.integration` (10 tests) + gate script; GATE 2 STOP/ABORT on prod | FIXED_PRODUCTION_VALIDATED |
| DI-DEF-020 | EXP-021 C0–C0.2 audits | R1 HF abuse FULL_BRAKING / ENGINE_SHUTDOWN_WHILE_DRIVING (and POSSIBLE_IMPACT) asserted from point-in-time OBD conjunctions; 0/5 FULL_BRAKING supported, 0/6 shutdowns sustained | Detectors treat R1 GraphQL row labels (query-grid bucket starts) as physical time; R1 records misdated (absolute offset P50 14 s / P90 45 s) | Unsupported abuse KPIs, brake wear, impact, SEVERE misuse | **Contained** (C0.3, DI-DEC-R1-TEMPORAL-CONTAINMENT-001) — not fixed: root cause UNKNOWN, historical rows retained | DI-TEST-R1-CONTAINMENT-001 | OPEN |
| DI-DEF-021 | DBI P2-C4 audit (A1) | Fragmented high-RPM sequences reported `NOT_OBSERVED` | No assessability gate before local negative | False evidence-of-absence on sparse labels | W1 `resolveHighEpisodesStatusWhenZeroAdmitted` | `ds4-rpm-episode-research.negative-evidence.opus.spec.ts` | FIXED |
| DI-DEF-022 | DBI P2-C4 audit (B1) | Overlap dedupe by peak throttle evicted `KICKDOWN_LIKE_PROXY_CANDIDATE` | Peak-throttle-only overlap merge | False kickdown negative | W1 classification-precedence dedupe | `ds4-powertrain-demand-kickdown.negative-evidence.opus.spec.ts` | FIXED |
| DI-DEF-023 | DBI P2-C4 audit (B3) | Sparse load labels (5/300) → `NOT_OBSERVED` | `entryLabelCount===0` without load-run coherence | False sustained-load negative | W1 contiguous load-present floor | `ds4-powertrain-demand-sustained-load.negative-evidence.opus.spec.ts` | FIXED |
| DI-DEF-024 | DBI P2-C4 audit (B2) | Warm / non-assessable cold → trip `NOT_OBSERVED` | Dead ternary; single cold bucket assessable | Trip-level negative without subtype opportunity | W1 `resolveColdEngineTripStatus` + triple-window assessability | cold-engine opus + S09 pin | FIXED |
| DI-DEF-025 | W1 closeout (B3) | Load run counted across 60s label gaps | Array-adjacent only in negative gate | False local NOT_OBSERVED | Gap-aware `computeLongestLoadPresentRunLabelCount` | sustained-load opus closeout tests | FIXED |
| DI-DEF-026 | W1 closeout (B2) | Global cold-bucket channel + any triple → ASSESSABLE | Decoupled triple vs channel | False subtype assessability | Per-subtype channel-in-triple predicate | cold-engine opus closeout tests | FIXED |
| DI-DEF-027 | B2 detector parity | HIGH_RPM/FULL_THROTTLE assessable with 1-of-3 channel in triple | Assessability looser than 3-bucket detector | False ASSESSABLE → NOT_OBSERVED | Require channel on all three triple labels | `detector-assessability.spec.ts` | FIXED |
| DI-DEF-028 | P2-C3 P1-04 | ABSTAINED B1 + forged positive duplicates → SAME_SOURCE_DUPLICATE | No participant re-validation before pairwise | Forged positive edges under abstain | `validateParticipantEvidenceIntegrity` pre-pairwise gate | `w2-integrity.spec.ts` #01 | FIXED |
| DI-DEF-029 | P2-C3 integrity | Malformed bundle / duplicate planes / A1 binding drift | Shape + integrity after structural-only validation | TypeError or silent admission | `bundle-shape` + `participant-integrity` + A1 identity cross-check | `w2-integrity.spec.ts` | FIXED |
| DI-DEF-030 | W2 closeout P1-01 | Nested missing fields bypassed structural checks | Outer-only shape validation | TypeError / false pairwise | Deep `bundle-shape` nested schema | `w2-closeout.spec.ts` | FIXED |
| DI-DEF-031 | W2 closeout P1-02/P2 | Cast-trusted kernel status; status in dup key | TS cast + status-scoped identity | Forged `UNRECOGNIZED_STATUS` positives; dup bypass | `kernel-status.v1` + identity key without status | `w2-closeout.spec.ts` | FIXED |
| DI-DEF-032 | W2 required shape | Nested adapter fields optional by presence-only checks | Shallow participant header | Missing semanticGuards / limitation arrays reach digest | `bundle-required-fields.v1` | `w2-required-shape-subtype.spec.ts` | FIXED |
| DI-DEF-033 | W2 B2 subtype | Empty or partial subtype map + positive bypass | Presence-only `subtypeAssessability` object | False admission / undefined subtype reads | `b2-subtype-completeness.v1` | `w2-required-shape-subtype.spec.ts` | FIXED |
