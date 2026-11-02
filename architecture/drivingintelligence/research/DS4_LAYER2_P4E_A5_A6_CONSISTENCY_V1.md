# DS4 Layer-2 P4E A5+A6 — secant consistency and tier decomposition (research only)

**Operation:** `DS4_LAYER2_P4E_A5_A6_CONSISTENCY_TIER_DECOMPOSITION`  
**Schema:** `DS4_LAYER2_P4E_A5_A6_CONSISTENCY_V1`  
**Required ancestor:** `88acf162faba98bbca851c174fb116fa991aa4e9`

## Scope

Research-side diagnostics only. **No changes** to `computeDs4LongitudinalLoadObservablesV1`, motion detection, admission, calibration, or customer scores.

Inputs:

- P2 pinned intensity rows (mean acceleration, duration, tier classification)
- P4B persisted event speed evidence (boundary speeds, in-window aggregates)

Offline pinned cohort uses the same synthetic motion payload harness as P4B tests, with optional **boundary alignment to P2 mean** for secant closure in CI (not a production motion claim).

## A5 — Secant consistency and event shape

For each admissible event with joined P4B + P2 intensity:

| Quantity | Definition | Units |
|----------|------------|-------|
| Boundary Δv | `\|v_end − v_start\| / 3.6` | m/s |
| Secant acceleration | `Δv / T` | m/s² |
| Impulse residual (signed) | `a_mean × T − Δv` | m/s |
| Acceleration residual (signed) | `a_mean − a_secant` | m/s² |
| Shape index | `(v̄_window − v_mid) / \|Δv\|_kmh` | dimensionless |

Where `v_mid = (v_start + v_end) / 2` and `v̄_window` is the **P4B aggregated** in-window mean speed (not per-sample peak/derivative reconstruction).

### Limitations (shape index)

- Requires finite boundary speeds and `|Δv| > 0`.
- Requires P4B `windowMeanSpeedKmh` (missing → `UNAVAILABLE_MISSING_WINDOW_MEAN`).
- Uses one scalar window mean; does not infer curvature beyond that aggregate.
- Repair-influenced windows remain flagged via P4B; samples are **not** treated as independent measurements.
- **No** peak acceleration, **no** new detector, **no** event rejection from residuals or shape.

### FULL vs BIN_ONLY support

`speedSupportDurationTier` mirrors P4B/P2 `durationTier` (`FULL_ELIGIBLE` vs `BIN_ONLY`). Diagnostics are exported for both; BIN_ONLY sparse-window limitations remain in P4B evidence.

## A6 — FULL / BIN_ONLY load decomposition

Per trip and kind *k* (acceleration / deceleration), over **admissible** events only:

```text
B_total = B_FULL + B_BIN_ONLY
B_FULL = Σ_{i ∈ ADMISSIBLE_FULL} a_i T_i
B_BIN_ONLY = Σ_{i ∈ ADMISSIBLE_BIN_ONLY} a_i T_i
```

Shares (when `B_total > 0`):

- `fullContributionShare = B_FULL / B_total`
- `binOnlyContributionShare = B_BIN_ONLY / B_total`

Semantics:

| `tierImpulseSemantics` | Meaning |
|------------------------|---------|
| `DECOMPOSED` | Load model metrics available; tier sums exported |
| `ZERO_LOAD` | A2 kind-scoped zero load (`B=I=S=0`, no UNRATED/EXCLUDED of that kind) |
| `UNAVAILABLE` | Load metrics gated; tier fields null (no false zero) |

Verification: `bTotalMatchesLoadModelB` compares `B_total` to load-model `specificLongitudinalImpulseMps`.

## Artifacts

CLI: `npm run research:ds4-layer2-p4e-a5-a6-consistency -- --out-dir=...`

Outputs: cohort summary JSON, A5 event CSV, A6 tier CSV, trip diagnostics JSON, `P4E_A5_A6_INVARIANT_REPORT.md`.

## Compatibility

- P2 pinned fixtures byte-identical (129 events, 11 trips)
- A1 repair research unchanged
- A2 zero/null semantics preserved in load model
- A3 intensity identity and A4 support annotations unchanged (recomputed in validation)
