# RPM Multi-Cadence Tier — Phase 3B (V1B tier-aware shadow)

## Scope

Adds a separately identifiable V1B shadow engine variant:

- Legacy: `ds4-rpm-hf-v1b-engine-v1` (unchanged admission, fingerprint, temporal defaults)
- Tier-aware: `ds4-rpm-hf-v1b-engine-v1-tier-aware`

## Behavior

- Per-trip tier evidence from `rpmCadenceTierResolution.tripClassifications[tripId]` only.
- Missing/stale tier → defer tier-aware outbox only; legacy evaluation unchanged.
- Defer budget / readiness window exhaustion → terminal `TIER_EVIDENCE_NOT_AVAILABLE` (no fabricated tier).
- Tier policy gates on `analysisReadiness`, `cadenceConfidence`, `tripCoverageBand` — label alone insufficient.
- **Phase 4I:** `admission.qualityExposure` (`ds4-rpm-hf-v1b-admission-quality-v1`) surfaces cadence tier/readiness, `analysisMode`, observed bucket coverage ratio, and `qualityScope: OBSERVED_HF_TEMPORAL` with `impliesFullTripCoverage: false` and `tierAnalyticsReady` (true only for `TIER_ANALYTICS_OK`). Does not change admission routing or temporal/RPM math.
- Temporal engine parameterized for `RPM_2S` / `RPM_3S` observation (no duplicated engine).

## Non-effects

- No production flag activation.
- No customer-facing scores or DS4 motion changes.
- No DB migration (same outbox/run tables; distinct `engine_version`).
