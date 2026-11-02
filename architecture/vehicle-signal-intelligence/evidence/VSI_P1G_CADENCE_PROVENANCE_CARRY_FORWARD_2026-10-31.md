# VSI P1-G — Cadence provenance carry-forward (2026-10-31)

## Problem (post-deploy audit)

P1-A dedupe runs inside `analyzeEngineRpmCadence` / `analyzeLvVoltageCadence` only when `refreshRpmCadence` is true. On `SNAPSHOT_HOOK`, `rpmEvidence` is null and `mergeCadenceOntoSignal` re-attached `priorCadenceByKey` verbatim, preserving duplicate `CLICKHOUSE_TELEMETRY_HF_POINTS` tags from pre-P1-A rows.

## Fix

- `normalizeAttachedCadenceProvenance` — wraps `dedupeCadenceProvenanceTags` (first-seen order, exact duplicate removal only).
- Applied in `mergeCadenceOntoSignal` for both fresh cadence and prior carry-forward branches.
- No RPM/LV re-analysis, no sample/cadence/tier/attribution changes.

## Verification

```bash
cd backend && npx jest --testPathPatterns='vsi-p1g-cadence-provenance-carry-forward|vsi-profile-cadence.enricher|vsi-profile-cadence-stats.util.spec|vsi-engine-rpm-combined-evidence-v1|vsi-rpm-hf-link-scoped-cadence-evidence|vsi-p0a-signal-integrity-audit.engine'
```

Historical production rows are unchanged until the next materialization attach.

## References

- Post-deploy audit: P1 provenance carry-forward root cause (SNAPSHOT_HOOK bypass).
- P1-A: `VSI_P1A_PROVENANCE_DEDUP_2026-10-30.md`
