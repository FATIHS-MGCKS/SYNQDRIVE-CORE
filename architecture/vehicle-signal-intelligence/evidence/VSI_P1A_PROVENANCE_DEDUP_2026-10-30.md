# VSI P1-A — Cadence provenance deduplication (2026-10-30)

## Root cause (FC-PROV-DEDUP)

| Stage | Location | Behavior |
|-------|----------|----------|
| First tag assignment | `vsi-profile-cadence-evidence.loader.ts` | Sets `provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS']` (RPM HF success) or `['POSTGRES_BATTERY_MEASUREMENTS']` (LV). |
| Duplicate append | `analyzeEngineRpmCadence` | Pushed `CLICKHOUSE_TELEMETRY_HF_POINTS` again when HF success + in-trip points. |
| Duplicate append | `analyzeLvVoltageCadence` | Spread `input.provenance` and appended `POSTGRES_BATTERY_MEASUREMENTS` again. |

Identical tags do **not** represent distinct evidence sources. Order is informational only; duplicates had no product semantics but broke P0-a integrity checks and polluted DTO/UI provenance arrays.

## Fix

- `dedupeCadenceProvenanceTags` — first-seen order, exact string equality.
- RPM: skip append when tag already present; normalize input and post-append lists.
- LV: merge loader tag once via dedupe helper.

No changes to sample counts, intervals, density labels, RPM/LV profiles, confidence, or freshness.

## Verification

```bash
cd backend && npx jest --testPathPatterns='vsi-profile-cadence-stats.util.spec|vsi-p0a-signal-integrity-audit.engine'
```

P0-a differential: `vsi-p0a-signal-integrity-audit.engine.spec.ts` — `P1-a differential` + updated Audi fixture (single cadence provenance).

Full production matrix replay requires read-only bundle export; stored profiles retain historical duplicates until cadence refresh/materialization.

## References

- P0-b: `/opt/cursor/artifacts/VSI_P0B_ROOT_CAUSE_REPORT_2026-10-30.md`
- RC-PROV-001, RC-PROV-002
