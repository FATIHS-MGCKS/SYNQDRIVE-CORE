# DS4 Layer-2 historical export schema (V1)

| Field | Value |
|-------|--------|
| **Document ID** | `DI-EXPORT-DS4-LAYER2-HISTORICAL-V1` |
| **Export schema version** | `DS4_LAYER2_HISTORICAL_EXPORT_V1` |
| **Reconstruction mode** | `PERSISTED_ASSESSMENT_ONLY` |
| **Scope (P1)** | Rows in `di_v0_ds4_trip_assessment_v1` for a single `organizationId` |

## Purpose

Reproducible, **read-only** research export of persisted DS4 trip assessments with deterministic Layer-2 longitudinal load observables projected from stored `event_summaries_json` (no motion-only recomputation, no DB writes).

## Code entry points

| Role | Path |
|------|------|
| Contract / schema version | `backend/src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/export/ds4-layer2-historical-export.v1.contract.ts` |
| Export builder (CSV + manifest + coverage) | `…/export/ds4-layer2-historical-export.v1.ts` |
| Postgres loader (read-only) | `…/export/ds4-layer2-historical-export.loader.v1.ts` |
| CLI | `backend/scripts/research/ds4-layer2-historical-export.cli.ts` |

## Reused kernels (no duplicated formulas)

- `projectDs4LongitudinalLoadObservablesV1FromPersistedAssessmentV1`
- `loadDs4LongitudinalEvidenceQualityContextV1`
- `coerceDs4TripAssessmentEventSummariesFromPersistedJsonV1`

## Artifacts

1. `manifest.json` — schema version, UTC timestamp, org id, **evaluationCodeSha** (git HEAD at export run), contract versions, collection cutoff, source collection id, row counts, SHA-256 checksums, `reconstructionMode`. Historical assessment/motion provenance remains on each CSV row (`computed_at_utc`, pins, fingerprints); it is not the evaluation code identity.
2. `assessments.csv` — one row per assessment identity; trip exposure (E_s, D, coverage); ACCEL/BRAKE L2 metrics (B_k, I_k, Phi_k, Phi_d, S_k, intensity stats). **NULL preserved as empty cells.**
3. `longitudinal_events.csv` — one row per **admissible** persisted `eventIntensityRecords` entry (FULL / BIN_ONLY).
4. `exclusions.csv` — `EXCLUDED_ARTEFACT` and `UNRATED` records with reason codes and explicit null-intensity semantics.
5. `coverage_summary.json` — assessment-row aggregates by vehicle, source family, speed authority, status, exposure availability.

## Integrity rules

- Strict `organizationId` scope on assessment and motion pin validation.
- Motion run must match assessment `sourceMotionRunId`, scope, `pinnedSnapshotHash`, and `combinedInputIdentity` (fail-closed).
- No mixing `C4_ONLY` and `C5_1_PREFERRED` within a row (partition is per assessment).
- No wall-clock trip duration fallback for exposure.
- No zero imputation for excluded intensity.

## Pinned contract versions (manifest)

| Name | Value |
|------|--------|
| Assessment | `DS4_TRIP_ASSESSMENT_V1` |
| Layer-2 projector | `DS4_LOAD_OBSERVABLES_V1` |
| Exposure | `DS4_ASSESSMENT_DRIVING_EXPOSURE_V2` |
| Longitudinal evidence quality | `DS4_LONGITUDINAL_EVIDENCE_QUALITY_V1` / `20261029` |

## CLI (read-only)

```bash
cd backend
npx ts-node scripts/research/ds4-layer2-historical-export.cli.ts \
  --organization-id=<uuid> \
  --out-dir=/path/to/artifacts
```

Optional: `--deploy-sha=<40-char-git-sha>` must match checkout `HEAD` (assertion only). Optional: `--collection-cutoff-utc=` (defaults to documented proposed collection boundary).

## Tests

```bash
cd backend && npm run test:di:ds4-layer2-export
```

## Non-effects (P1)

- No migrations, flags, worker changes, backfill, replay, or production mutations.
- No motion-only historical recomputation annex.
