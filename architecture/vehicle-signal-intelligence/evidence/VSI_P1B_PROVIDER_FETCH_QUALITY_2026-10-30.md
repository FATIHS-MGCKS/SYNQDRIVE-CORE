# VSI P1-B — Provider last successful fetch quality (2026-10-30)

## Contract (verified)

| Field | Semantics |
|-------|-----------|
| `VehicleLatestState.providerFetchedAt` | SynqDrive wall clock when a provider acquisition was **persisted** on the attributed VLS row (canonical: *last successful provider acquisition*). |
| Not proven by timestamp alone | Strict telemetry source advance — limitation `PROVIDER_FETCH_TIME_NOT_SOURCE_ADVANCE_PROOF` retained. |
| Not a physical sensor | Limitation `PROVIDER_LAST_SUCCESSFUL_FETCH_WALL_CLOCK_NOT_PHYSICAL_SIGNAL`. |

Failed polls that do not update VLS leave the prior timestamp (stale fetch recency → `OBSERVED_STALE`). Missing timestamp → `NEVER_OBSERVED`.

## Root cause (FC-FETCH-QUALITY)

1. Evaluator marked meta row `OBSERVED` from `providerFetchedAt`.
2. `mergeEmpiricalRow` added `EMPIRICAL_EXTRACTOR_NOT_IMPLEMENTED_BY_CURRENT_EVALUATOR`.
3. `freshnessClassification` stayed `UNKNOWN` (no fetch-recency mapping).
4. `classifyVsiSignalQuality` required sensor-style `FRESH` → `UNKNOWN` quality while empirical was `OBSERVED`.

## Fix

- Skip extractor-not-implemented limitation for this materialized meta key.
- Map fetch recency via existing `classifyTelemetryFreshness` → profile `FRESH`/`STALE` (`vsi-provider-last-successful-fetch-meta.util.ts`).
- Dedicated quality branch for `provider_last_successful_fetch` only (fetch-recency buckets, not sensor rules).

No change to physical signal quality paths, cadence (PR #2263), or polling.

## Verification

```bash
cd backend && npx jest --testPathPatterns='vsi-provider-last-successful-fetch-meta|vsi-profile-evaluator.spec|vsi-signal-quality.classifier.spec|vsi-p0a-signal-integrity-audit.engine|vsi-profile-cadence-stats.util.spec'
```

Historical `SIGNAL_INTEGRITY_MATRIX_2026-10-30.json` not overwritten.
