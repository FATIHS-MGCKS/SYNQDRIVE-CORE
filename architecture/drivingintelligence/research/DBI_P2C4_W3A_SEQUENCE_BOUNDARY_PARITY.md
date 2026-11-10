# DBI P2-C4 W3A — Sequence boundary parity (W3-046)

**Operation:** `DBI_P2C4_W3A_SEQUENCE_BOUNDARY_PARITY` · closeout `DBI_P2C4_W3A_EXACT_BOUNDARY_CLOSEOUT`  
**Base:** `9be9fa4862ebaff20920baa5ddcf82bdde645682`

## Finding W3-046 (P1)

**Symptom:** B3 sustained-load and B4 revving-idle detectors could merge label runs across v1b-admitted multichannel sequence breaks when inter-label gaps fell in `(sequenceMaxGapSeconds, maxAdjacentLabelGapMs]`.

**Closeout (P2-C4 W3A):** At equality with detector `maxAdjacentLabelGapMs` (B3 5000ms, B4-A 4000ms, B4-B 10000ms), the former “danger-window” helper treated gaps as in-cluster and **did not** split v1b sequences — a V1B continuity defect at exact detector limits.

**Affected surfaces:**

- B3 `detectGapAwareSustainedLoadCandidates` — merged high-load candidate spans
- B3 `computeLongestLoadPresentRunLabelCount` — inflated negative-opportunity runs
- B4 facet A/B detection — merged stationary/rpm runs
- B4 facet assessability — inflated coherent rpm+speed opportunity spans

**Cadence authority:** `validateDs4PowertrainDemand*InputBinding` → `cadenceProfile.sequenceMaxGapSeconds` from v1b `temporalCadenceProfile`, else documented fallback `{ nominalCadenceSeconds: 1, sequenceMaxGapSeconds: 2 }`.

## Red-before (v1 / danger-window)

Synthetic two-block grids often used **5s intra-block spacing**. Under `sequenceMaxGapSeconds = 2`, those blocks are **not** v1b-contiguous; they were legacy P37 research convenience only.

Inter-block gap in danger window (e.g. 3s, or exact 4000/5000/10000 ms): detectors could bridge across v1b breaks.

| Module | Red-before behavior |
|--------|---------------------|
| B3 positive | One merged candidate across blocks |
| B3 negative gate | Longest load-present run could span both blocks |
| B4 facet A | One merged high-rpm stationary candidate |
| B4 facet B | One merged excessive-idle span candidate (when assessable) |
| B4 assessability | Coherent runs could span both blocks |

## Green-after (v1.1 closeout — strict v1b continuity)

**Mechanism:** `gapCrossesAdmittedSequenceBoundary` / `splitBucketsAtAdmittedSequenceBoundaries` in `ds4-powertrain-demand-multichannel-sequence-boundary.v1.ts`:

- Split when `labelGapMs > sequenceMaxGapSeconds * 1000`
- **No split** when `labelGapMs === sequenceMaxGapSeconds * 1000`
- Detector `maxAdjacentLabelGapMs` applies **only inside** each v1b-admitted sequence (does not override continuity)

**Legitimate v1b fixtures:** admitted **1 Hz** label cadence (`stepMs = 1000`) with enough labels per block to satisfy each research duration floor (e.g. B3 `minResearchLabelSpanMs = 20_000` → 21 labels per qualifying block).

**Policy versions:**

- `sustained-load-gap-aware-research-v1.1`
- `revving-idle-dual-facet-research-v1.1`

**Regression:**

- `ds4-powertrain-demand-w3-sequence-boundary.w3-046.opus.spec.ts` (O-W3-046*)
- `ds4-powertrain-demand-w3-exact-boundary.w3-046-closeout.opus.spec.ts` (exact 4000/5000/10000 ms oracles)
- Full `ds4-powertrain-demand` + `dbi-p2c*` suites

## Scientific versioning

Candidate inventory and longest-run semantics respect v1b sequence continuity first; detector cluster rules unchanged within each admitted sequence. Trip-level negative gates remain W1-safe.

## Open debt (unchanged)

- DI-DEF-045 — B1 `candidateSupportTier` enum validation (W3-C)
