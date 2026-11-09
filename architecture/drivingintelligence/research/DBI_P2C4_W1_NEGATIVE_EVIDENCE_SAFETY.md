# DBI P2-C4 W1 — Negative evidence safety (research)

**Workstream:** `DBI_P2C4_W1_NEGATIVE_EVIDENCE_SAFETY`  
**Scope:** P2-A1, P2-B1, P2-B3 kernels (+ B2 adjacent negative assessability). P2-C3 unchanged.

## Status semantics

| Module | Before | After | Scientific justification |
|--------|--------|-------|-------------------------|
| A1 `highEpisodes.status` | Zero admitted episodes after fragmentation → `NOT_OBSERVED` | Rejected/censored runs or insufficient contiguous opportunity → `NOT_ASSESSABLE`; adequate sampling with no pattern → `NOT_OBSERVED` | Absence of an admitted episode is not evidence of absence when label opportunity cannot support `MIN_CORE_POINTS` |
| B1 kickdown dedupe | Higher `peakThrottlePct` replaced overlapping windows regardless of class | `KICKDOWN_LIKE_PROXY_CANDIDATE` precedence over `THROTTLE_STEP_OBSERVED`; deterministic tie-break | Positive proxy must not be evicted by a descriptive throttle step |
| B3 `tripEvidenceClassification` | Sparse load (`entryLabelCount=0`, few scattered labels) → `NOT_OBSERVED` | Contiguous load-present run below admission floor → `INSUFFICIENT_OBSERVATIONS` | Local negative requires coherent load-channel opportunity (≥ research `minObservations` contiguous labels), not ratio heuristics |
| B2 trip `status` | All paths without candidates → `NOT_OBSERVED` | All subtypes `NOT_ASSESSABLE` → `COMPUTED` (no trip-level negative); `NOT_OBSERVED` only when ≥1 subtype `ASSESSABLE` and zero candidates | Warm/no-cold-opportunity trips are not confirmed cold-proxy negatives |

## Regression proof

Dedicated specs: `*.negative-evidence.opus.spec.ts` under A1/B1/B3/B2; P2-C1.5 `S09` pin updated to `COMPUTED`; full `dbi-p2c*` + powertrain/RPM suites (412 tests in chain).

## W1 closeout (assessability refinement)

| Area | Fix |
|------|-----|
| B3 `computeLongestLoadPresentRunLabelCount` | Resets on missing load **or** label gap > `maxAdjacentLabelGapMs` (negative gate only; candidate detector unchanged) |
| B2 subtype assessability | Channel opportunity inside the same cadence-valid cold triple; **HIGH_RPM** and **FULL_THROTTLE** require the channel on **all three** buckets (detector parity); **HIGH_LOAD** needs load on any bucket of a triple |

## Remaining limitations

- B3 does not use a trip-wide load **ratio** threshold (empirical validation unresolved).
- A1 does not gate on v1b coverage ratio echoes (structural `MIN_CORE_POINTS` / sequence length only).
- P2-C3 still does not re-validate forged participant status (out of W1 scope).

## Finding ledger (W1)

| ID | BEFORE_BEHAVIOR | AFTER_BEHAVIOR | REGRESSION_PROOF |
|----|-----------------|----------------|------------------|
| P1-01 A1 | Fragmented high RPM → `NOT_OBSERVED` | → `NOT_ASSESSABLE` | `ds4-rpm-episode-research.negative-evidence.opus.spec.ts` |
| P1-02 B1 | Four-bucket overlap dropped kickdown | Kickdown retained | `ds4-powertrain-demand-kickdown.negative-evidence.opus.spec.ts` |
| P1-03 B3 | 5/300 scattered load → `NOT_OBSERVED` | → `INSUFFICIENT_OBSERVATIONS` | `ds4-powertrain-demand-sustained-load.negative-evidence.opus.spec.ts` |
| P2 B2 | Warm ECT → `NOT_OBSERVED` | → `COMPUTED` + subtype `NOT_ASSESSABLE` | cold-engine opus + S09 fixture pin |
