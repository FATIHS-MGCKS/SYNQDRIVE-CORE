# VSI P1-D — RPM dual-lane combined evidence (2026-10-31)

## Contract (`vsi-rpm-combined-evidence-v1`)

| Value | Meaning |
|-------|---------|
| `PROVEN_LIVE` | Lane A: snapshot `OBSERVED` + `FRESH` + valid `lastValidObservationAt`. HF alone never upgrades to live. |
| `PROVEN_HISTORICAL_ONLY` | Lane B: link-attributed HF samples + trip/cadence window; snapshot not live-proven. |
| `NOT_PROVEN` | Neither lane meets proof thresholds. |
| `NOT_APPLICABLE` | Powertrain / RPM applicability excludes the signal. |

Lane A and Lane B fields on the profile and read DTO are **unchanged**. Combined assessment is additive on Master read `engine_rpm` signal DTO only.

## Source-link fail-closed (HF → combined)

HF historical proof requires:

- `observedSampleCount > 0`
- HF provenance tag (e.g. `CLICKHOUSE_TELEMETRY_HF_POINTS`)
- Finalized trip window or trip classification rows on cadence
- **No** profile limitations: `MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS`, `LATEST_STATE_NOT_ATTRIBUTED_TO_SOURCE_LINK`, `PROVIDER_IDENTITY_MISMATCH_DECLARED_CATALOG_DIMO_ONLY`
- **No** cadence limitation `RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN`

ClickHouse query shape is **not** changed in this PR.

## Audi A4 reference (P0-a audit semantics)

| Axis | Before P1-D | After P1-D |
|------|-------------|------------|
| Lane A snapshot | `NEVER_OBSERVED` | unchanged |
| Lane B HF | samples + `RPM_STANDARD` | unchanged |
| P0-a finding | `MISLEADING_PRESENTATION` | `EXPECTED_BEHAVIOR` (`rpm_dual_lane_combined_historical_only_v1`) when matrix classifier inputs match |
| Combined DTO | absent | `PROVEN_HISTORICAL_ONLY` |

Historical matrix JSON (`SIGNAL_INTEGRITY_MATRIX_2026-10-30.json`) is **not** overwritten.

## Verification

```bash
cd backend && npx jest --testPathPatterns='vsi-engine-rpm-combined-evidence|vsi-master-intelligence-read.mapper.spec|vsi-p0a-signal-integrity-audit.engine|vsi-signal-powertrain-applicability|vsi-profile-evaluator.spec|vsi-signal-quality.classifier.spec|vsi-profile-cadence-stats.util.spec|vsi-provider-last-successful-fetch-meta'
cd frontend && npm run i18n:check && npm test -- vsi-master-intelligence-ui vsi-engine-rpm-dual-provenance
bash architecture/scripts/validate-module-registry.sh
```

## Differential notes (other cohort fixtures)

| Vehicle | Snapshot | HF | Combined (typical) | Cadence profile |
|---------|----------|-----|-------------------|-----------------|
| Tesla M3 | N/A | N/A | `NOT_APPLICABLE` | unchanged |
| Tiguan | varies | HF present | `PROVEN_HISTORICAL_ONLY` or `NOT_PROVEN` if attribution blocked | unchanged (incl. UNKNOWN) |
| Arteon | ICE never observed + HF | same as Audi pattern | `PROVEN_HISTORICAL_ONLY` when attribution holds | unchanged |
