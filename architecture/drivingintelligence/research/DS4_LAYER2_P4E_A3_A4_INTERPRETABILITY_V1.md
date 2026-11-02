# DS4 Layer-2 P4E A3+A4 — interpretability support (research only)

**Operation:** `DS4_LAYER2_P4E_A3_A4_INTERPRETABILITY_SUPPORT`  
**Schema:** `DS4_LAYER2_P4E_A3_A4_INTERPRETABILITY_V1`

## Scope

Research-side diagnostics and documentation only. **`computeDs4LongitudinalLoadObservablesV1` is not modified.** Customer-facing scores, admission, motion detection, and calibration are unchanged.

## A3 — Intensity decomposition

For each kind *k* (acceleration / deceleration) when load metrics are available:

| Symbol | Load-model field | Definition |
|--------|------------------|------------|
| **B_k** | `specificLongitudinalImpulseMps` | Σ (a_i × T_i) over admissible events |
| **I_k** | `normalizedMeanAccelMps2` | B_k / E_s |
| **S_k** | `maneuverTimeShare` | (Σ T_i) / E_s |
| **meanEventAcceleration_k** | *diagnostic* | B_k / (Σ T_i) — duration-weighted mean absolute event acceleration |

**Identity (verified offline on pinned cohort):**

```text
I_k = S_k × meanEventAcceleration_k
```

A2 zero-load cells (B_k = I_k = S_k = 0, no admissible events of that kind, no UNRATED/EXCLUDED rows of that kind) yield **meanEventAcceleration_k = 0** and **identityHoldsWithinTolerance = true**.

When load metrics are `UNAVAILABLE`, decomposition fields are null (no unsupported null→0 conversion).

## A4 — Evidence quantity annotation

Uses **N_FULL** = `fullEventCount` (FULL-duration admissible events), reusing existing Layer-2 percentile gates:

| Tier | Condition | Existing load behavior |
|------|-----------|------------------------|
| `FULL_EVENT_COUNT_LT_3` | N_FULL < 3 | `intensityMedianFullMps2` null |
| `FULL_EVENT_COUNT_3_TO_9` | 3 ≤ N_FULL < 10 | median supported; P90 null |
| `FULL_EVENT_COUNT_GTE_10` | N_FULL ≥ 10 | median and P90 supported |
| `UNAVAILABLE` | load metrics gated | — |

Labels describe **evidence quantity** only, not per-event accuracy or admission confidence.

## Artifacts

CLI: `npm run research:ds4-layer2-p4e-a3-a4-interpretability -- --out-dir=...`

Outputs: cohort summary JSON, trip diagnostics CSV, full interpretability JSON, `P4E_A3_A4_INVARIANT_REPORT.md`.

## Compatibility

- P2 pinned fixtures byte-identical (129 events)
- A1 repair research sidecar unchanged
- A2 kind-scoped zero-load preserved in load model
