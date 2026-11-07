# DS4 DBI W0 — F03 selection calibration v1 (research)

**Status:** OFFLINE_RESEARCH_IMPLEMENTATION (Architect options **A+B+C**; option D deferred)  
**D8 thresholds:** FROZEN (`DS4_DBI_W0_RESEARCH_THRESHOLDS_V1`)  
**Scientific validation:** **NOT PERFORMED** — synthetic / exact-null references only.

## Estimands

| Label | Meaning |
| --- | --- |
| `OBSERVED_TRIP_METRIC` | Trip `d8Burstiness.status` / IOD under frozen gate |
| `UNRESTRICTED_RESEARCH_DIAGNOSTIC` | IOD from same τ bins **without** changing status |
| `NULL_MODEL_REFERENCE` | Exact `P(D8 KNOWN &#124; n, E*, Uniform τ)` |
| `CONDITIONAL_NULL_REFERENCE` | `E[IOD &#124; D8 KNOWN]` under same null |

## Null model

- IID Uniform τ onsets on `[0, E*)`
- Bin probabilities `p_k = w_k / E*` with `w_k` from `exposureBinWidthsSecondsV1` (partial final bin)
- D8 KNOWN iff `E*≥60`, `n≥10`, `nonempty bins ≥10`

## Exact methods

1. **Eligibility:** multinomial occupancy dynamic program (sequential binomial decomposition); not Monte Carlo primary.
2. **Conditional IOD:** multinomial count enumeration when composition count ≤ `2_000_000`; otherwise `supported: false` with reason (no fabricated rates).

## Independent oracles (IID Uniform τ)

| n | E* | P(KNOWN) | E[IOD &#124; KNOWN] |
| --- | --- | --- | --- |
| 12 | 660 | 0.02252486 | 0.28260870 |
| 12 | 665 | 0.02806004 | 0.37711880 |

## Monte Carlo

Wilson 95% intervals on `P(KNOWN)`; stderr on accepted-only IOD samples — **estimation error only**.

## Trip + offline reporting

- Kernel field: `d8SelectionCalibrationResearch` (does not alter `d8Burstiness`).
- Offline CLI: `f03SelectionCalibration` block + sensitivity matrix.

## Non-effects

No motion engine, FSM, RPM, threshold, F04, production DB, deploy, or W1 activation.
