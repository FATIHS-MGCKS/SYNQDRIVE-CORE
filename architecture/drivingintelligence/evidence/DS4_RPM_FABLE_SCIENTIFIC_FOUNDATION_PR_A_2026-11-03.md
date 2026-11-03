# DS4 × RPM — Fable Scientific Foundation PR-A (Phase 0 correction)

| Field | Value |
|-------|--------|
| **Evidence ID** | DI-EVID-DS4-RPM-FABLE-SCIENTIFIC-FOUNDATION-PR-A |
| **Date** | 2026-11-03 |
| **Stack base** | PR #2325 branch `cursor/ds4-rpm-shadow-correlation-harness-v1-2c57` @ `f4050463965d77543cd0a3f6baffc7e1c5a01407` |
| **PR-A head** | (see PR-A merge commit on `cursor/ds4-rpm-fable-scientific-foundation-pr-a-2c57`) |
| **decision_status** | PROPOSED — research harness correction only |

## Reproduced defect (C1)

**Confirmed:** `missingIntervalSecondsInWindow` (pre-PR-A) used `floor(winStart / tierBucketWidthMs)` anchored at Unix epoch. For `RPM_2S`/`RPM_3S`, identical regular series and equal in-window sample support produced different `missing` and `PARTIAL` vs `AVAILABLE` depending on `startLabel mod tierWidth`.

**Smallest counterexample (reproduced in `ds4-rpm-shadow-correlation-c1-coverage.property.spec.ts`):**

- Regular 2 s RPM series, 4 s half-open DS4 window, two in-window samples.
- Window `[epoch 1000000, 1000004)` → legacy epoch-grid missing **0**.
- Window `[epoch 1000001, 1000005)` → legacy epoch-grid missing **1** → `PARTIAL`.

## Verified measurement semantics (code + architecture evidence)

| Axis | Verified fact | Source |
|------|---------------|--------|
| A. Physical aggregation support width | DIMO HF GraphQL uses `interval:"1s"` with per-signal `agg: AVG` (e.g. `powertrainCombustionEngineSpeed(agg: AVG)`). **Physical bucket interior support width is not proven** in Phase 0. | `backend/src/modules/dimo/queries/high-frequency.query.ts`; V1A `bucketSemanticsNote` |
| B. Effective interval between records | VSI tier labels (`RPM_1S`/`2S`/`3S`) classify **observed inter-point interval statistics** (P50/P75, purity) — `EFFECTIVE_RESOLUTION_TIER_NOT_DEVICE_CADENCE`. | `vsi-rpm-cadence-tier.util.ts` semantics |
| C. V1B sequence gap tolerance | Tier profiles define `sequenceMaxGapSeconds` (1S: 2 s, 2S: 3 s, 3S: 4 s) for **continuous sequence** detection — distinct from coverage deficiency. | `ds4-rpm-hf-v1b-temporal.engine.ts` |
| D. DS4 event window | Half-open `[startLabel, endLabel+1s)`; DS4 labels carry `±1 s label + unvalidated clock offset`. C4/L3 speed uses centred 3-label support (2 s span). | `motion-event-detector.ts`, `c4-adaptive-l3.ts` |
| E. Timestamp phase | Row timestamp = query-grid bucket start anchored at ingestion `from` (not source time). Cross-domain phase **UNKNOWN** without ingestion anchors. | EXP-021 C0.3; Decision register; harness `sourceTimestampPhase: UNKNOWN` |

**Non-equivalence enforced in PR-A:** tier nominal step is **not** used as physical measurement width for coverage; window-relative gap deficiency uses **observed median inter-point cadence in-window**, with tier nominal only as `INFERRED_FROM_VSI_TIER_NOMINAL` when a single sample exists.

## Mathematical correction (coverage model v1)

Window-relative gap deficiency (translation invariant):

\[
D = \max(0, g_{lead} - c) + \max(0, g_{trail} - c) + \sum_j \max(0, \Delta t_j - c)
\]

- \(g_{lead} = t_{first} - t_{windowStart}\), \(g_{trail} = t_{windowEndExclusive} - t_{last}\) (instant observation semantics; aggregation support width **UNKNOWN**).
- \(c\) = median observed \(\Delta t\) in-window when \(n \ge 2\); else inferred tier nominal with explicit source flag.

`coverageModelVersion`: `ds4-rpm-shadow-window-relative-gap-v1`.

## PR-A behavioral changes

| Area | Change |
|------|--------|
| C1 | Epoch grid removed; `gapDeficiencySeconds` + lead/trail/internal metrics |
| C2 | Alignment envelope: DS4 label (1 s) + kernel half-support (1 s) bound, effective cadence + tier step probes; stability flags; no auto correction |
| C4 | `descriptiveRpmStats` (first/last/delta/direction); order stats explicitly **not** transient proof |
| C5/C6 | `iceRpmEventApplicability`; `ICE_RPM_NOT_APPLICABLE`; R1 `RUPTELA_R1` source-family gate |
| Provenance | `telemetrySourceFamily` + attestation on sample evidence |

## Fixture cohort BEFORE vs AFTER (SYNTHETIC_FIXTURE)

Historical baseline (PR #2325 pre-PR-A, documented in harness evidence):

| Metric | Before |
|--------|--------|
| Defensible share (all events) | 31.25% (5/16) |
| Excl. negative controls | 41.67% (5/12) |
| `RPM_2S_STEP` ACCELERATION | PARTIAL (parity artefact) |

**After PR-A** (CLI replay 2026-11-03):

| Metric | After |
|--------|--------|
| Defensible share (all events) | **37.5% (6/16)** |
| Excl. negative controls | **50% (6/12)** |
| `RPM_2S_STEP` | **both events AVAILABLE** (`gapDeficiencySeconds: 0`) |
| Negative controls | 100% UNAVAILABLE (unchanged) |
| EV | `ICE_RPM_NOT_APPLICABLE` (first-class, not admission-only wording) |

## Validation

```bash
cd backend && npm run test:di:ds4-rpm-shadow-correlation
cd backend && npx ts-node --transpile-only scripts/research/ds4-rpm-shadow-correlation-harness.cli.ts
```

28/28 harness tests passing at PR-A authoring time.

## Non-effects

- DS4 manoeuvre event counts unchanged.
- V1B admission, VSI tier classification, DS4 speed authority unchanged.
- No production flags, schema, API, UI, scoring, ratio/gear library.

## Remaining scientific uncertainties

- DIMO bucket label phase vs DS4 grid ingestion anchors (still UNKNOWN).
- Physical AVG support width inside 1 s buckets (UNKNOWN).
- Real-data loader + R1 containment on production ClickHouse paths (not exercised in fixtures).
- Calibration of alignment envelope bounds on real vehicles (diagnostic only today).

## Merge / dependency plan

1. Merge **PR #2325** (Phase 0 harness) when owner-ready.
2. Rebase or merge **PR-A** onto updated #2325 branch; land PR-A before any real-data replay interpretation.
3. **NO-GO** for customer surfaces, DS4 consumer wiring, or detection-improvement claims until real-data experiment (PR-B/C roadmap).
