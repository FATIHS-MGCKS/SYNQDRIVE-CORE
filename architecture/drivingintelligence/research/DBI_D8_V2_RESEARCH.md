# DBI D8 V2 — research sidecar (two-layer event intelligence)

**Status:** `OFFLINE_RESEARCH_ONLY` — does not alter frozen D8 V1, W1C metric counting, or production paths.

## Layers

1. **Descriptive** — DS4-admitted events + moving-exposure clock (no re-detection): counts, rate + Garwood Poisson CI, gaps, `shareGapsWithin30s`, descriptive event groups (`clusters`, chained while inter-event gap ≤ 120 s), coverage class, event refs.
2. **Inference** — Greenwood normalized-spacing statistic, conditional IID-uniform τ null (seeded MC), one-sided clustering p-value when `admittedEventCount ≥ nMin`.

**W0 fail-closed inheritance:** `computeDs4DbiD8V2FromW0ContextV1` requires a full `Ds4DbiW0TripKernelResultV1` and derives trip-level fail-closed from `diagnostics.failClosedReasons` (same typed set as W1C). On fail-closed, both layers are `NOT_EVALUABLE` with no valid rate or Greenwood output; callers cannot override with a boolean flag. Historical replay passes **canonical** payload digest to the kernel; raw file SHA is verified separately against pinned source evidence.

**W0 evaluation context binding:** `verifyDs4DbiD8V2W0EvaluationContextV1` checks trip/run identity, `kernel.contentFingerprintObserved` vs supplied payload, tripMeta fingerprint vs observed digest, and shadow bundle consistency before valid V2 output.

**Garwood rate CI:** exact χ² (Garwood) count limits via stable regularized-gamma / χ² quantiles (`garwoodPoissonCountCiV1`, `garwoodPoissonRatePerMinuteCiV1`).

## Frozen references

- D8 V1: `computeDs4DbiW0D8FromTauOnsetsV1` unchanged.
- `nMin`: `DS4_DBI_D8_V2_RESEARCH_NMIN_V1 = 10` (preregistered power table in module; not trip-tuned).
- Null seed: `DS4_DBI_D8_V2_NULL_MC_SEED_V1 = 20261107`.

## Code

- Module: `backend/src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-dbi-d8-v2-event-intelligence.research.v1.ts`
- Tests: `.../__tests__/ds4-dbi-d8-v2-event-intelligence.research.v1.spec.ts`
- CLI: `npm run research:ds4-dbi-d8-v2-replay -- --json`

## Non-effects

No worker, DB, API, UI, F04, W1C replacement, composite score, threshold changes to V1.
