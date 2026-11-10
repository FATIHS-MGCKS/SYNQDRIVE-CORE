# DBI P2-C4 W3A — Sequence boundary parity (W3-046)

**Operation:** `DBI_P2C4_W3A_SEQUENCE_BOUNDARY_PARITY`  
**Base:** `9be9fa4862ebaff20920baa5ddcf82bdde645682`

## Finding W3-046 (P1)

**Symptom:** B3 sustained-load and B4 revving-idle detectors could merge label runs across v1b-admitted multichannel sequence breaks when inter-label gaps fell in `(sequenceMaxGapSeconds, maxAdjacentLabelGapMs)`.

**Affected surfaces:**

- B3 `detectGapAwareSustainedLoadCandidates` — merged high-load candidate spans
- B3 `computeLongestLoadPresentRunLabelCount` — inflated negative-opportunity runs
- B4 facet A/B detection — merged stationary/rpm runs
- B4 facet assessability — inflated coherent rpm+speed opportunity spans

**Cadence authority:** `validateDs4PowertrainDemand*InputBinding` → `cadenceProfile.sequenceMaxGapSeconds` from v1b `temporalCadenceProfile`, else documented fallback `{ nominalCadenceSeconds: 1, sequenceMaxGapSeconds: 2 }`.

## Red-before (v1 research policy)

Synthetic two-block grids: each block internally valid at 5s cluster spacing; inter-block gap **3s** (`> 2s` sequence, `≤ 5s` detector bridge).

| Module | Red-before behavior |
|--------|---------------------|
| B3 positive | One merged candidate (~10 labels) |
| B3 negative gate | Longest load-present run could span both blocks (≥ 6) |
| B4 facet A | One merged high-rpm stationary candidate |
| B4 facet B | One merged excessive-idle span candidate (when assessable) |
| B4 assessability | Coherent runs could span both blocks |

## Green-after (v1.1 research policy)

**Mechanism:** `gapCrossesAdmittedSequenceBoundary` + `splitBucketsAtAdmittedSequenceBoundaries` in `ds4-powertrain-demand-multichannel-sequence-boundary.v1.ts` — flush/split only when `sequenceMaxGapSeconds * 1000 < gap < maxAdjacentLabelGapMs` (strict upper bound preserves 5s-spaced research runs).

**Policy versions:**

- `sustained-load-gap-aware-research-v1.1`
- `revving-idle-dual-facet-research-v1.1`

**Regression:** `ds4-powertrain-demand-w3-sequence-boundary.w3-046.opus.spec.ts` (oracles O-W3-046*); full `ds4-powertrain-demand` + `dbi-p2c*` suites.

## Scientific versioning

Candidate inventory and longest-run semantics change only across admitted sequence boundaries in the danger window; detector cluster rules unchanged. Trip-level negative gates remain W1-safe.

## Open debt (unchanged)

- DI-DEF-045 — B1 `candidateSupportTier` enum validation (W3-C)
