# RPM Multi-Cadence Tier — Phase 2 (VSI additive integration)

## Scope

Adds optional `engine_rpm.cadenceIntelligence.rpmCadenceTierResolution` (`vsi-rpm-cadence-tier-resolution-v1`) during profile materialization and operational refresh.

## Non-effects

- Legacy Active RPM V1.1 labels (`RPM_1HZ` / `RPM_STANDARD` / `UNKNOWN`) unchanged.
- `cadenceSemanticFingerprint` and profile semantic revision unchanged when only tier operational fields advance.
- No V1A/V1B admission, flags, migrations, or product consumers.

## Block contents

Per rolling link-scoped trip window (same 3–5 trips as `activeRpmProfile`):

- Per-trip tier (`classifyVsiRpmCadenceTierV1`), confidence, coverage band, analysis readiness, decision code, interval evidence counts.
- Optional rolling vehicle tier summary (supermajority when sufficient classifiable trips).
- Provenance + `evidenceObservedAt` (latest HF timestamp in rolling window).

Missing HF / preserved prior cadence paths keep prior tier block when RPM cadence is preserved.

Operational refresh merges **legacy `activeRpmProfile` and `rpmCadenceTierResolution` independently** by rolling `tripClassifications.endMs` monotonicity per block (stale tier cannot overwrite fresher persisted tier when legacy advances, and vice versa).

Per-trip tier snapshots include diagnostic percentiles and density fields (no raw time series).
