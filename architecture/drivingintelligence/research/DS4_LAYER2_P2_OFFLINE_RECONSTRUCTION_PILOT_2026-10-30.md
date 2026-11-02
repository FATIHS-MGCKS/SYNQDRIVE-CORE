# DS4 Layer-2 P2 offline reconstruction pilot

**Status:** research-only adapter (draft). **Not** production assessment persistence. **Not** merged into P1 canonical historical export.

## Purpose

Reconstruct Layer-2 research rows for **eight** motion-only trips from the feasibility audit (`DS4_LAYER2_P2_HISTORICAL_RECONSTRUCTION_FEASIBILITY`, production SHA `7ab55a0d22223ad9de5bc6691b726e169d377517`):

| Vehicle line | Count | Speed authority |
|--------------|-------|-----------------|
| Audi A4 | 4 | `C4_ONLY` |
| VW Tiguan | 3 | `C5_1_PREFERRED` |
| Tesla Model 3 | 1 | `C5_1_PREFERRED` |

Trip IDs are pinned in `ds4-layer2-p2-offline-reconstruction.cohort.v1.ts` (sourced from audit `initialP2CohortRecommendation`). Each entry also pins **expected vehicle UUID** (DS4 calibration cohort roles) and **expected source family** (`RUPTELA_R1` / `API_SYNTHETIC`); runtime rejects scope mismatches before offline compute.

## Architecture

- **Read path:** `di_v0_motion_core_shadow_runs_v1` (SELECT) + S4 work-item source family; **no** writes.
- **Compute path (canonical, unchanged):** `computeDs4TripAssessmentV1` → exposure + intensity eligibility → `projectDs4LongitudinalLoadObservablesV1FromPersistedAssessmentV1` with `resolveDs4LongitudinalEvidenceQualityForLayer2V1` via loader context (`sparseChannelOutcome` from motion payload `contract.sparse`, not null).
- **Isolation:** `reconstructionMode=NEWLY_COMPUTED_OFFLINE`; artifacts prefixed `p2_*`; P1 export remains `PERSISTED_ASSESSMENT_ONLY`.

## Revision selection

Per trip: enumerate all `SUCCEEDED` runs → score candidates → select latest `created_at` among runs that are V2 collection-eligible, exposure-derivable, and have known speed authority; **tie-break** equal timestamps with lexicographic `motionRunId` (ascending). Record all candidates in `p2_revision_selection.csv` with rejection reasons. Never mix revisions.

## Operator entry

```bash
DS4_LAYER2_P2_PRODUCTION_RECONSTRUCTION_AUTHORIZED=1 \
  npx ts-node backend/scripts/research/ds4-layer2-p2-offline-reconstruction.cli.ts \
  --out-dir=/tmp/ds4-p2-pilot-out \
  --feasibility-audit-production-sha=7ab55a0d22223ad9de5bc6691b726e169d377517
```

Requires clean checkout attestation (P2 pathspecs) and `--out-dir` **outside** the git tree. **Do not** run against production without explicit authorization.

## Tests

`cd backend && npm run test:di:ds4-layer2-p2-offline` — synthetic fixtures only; no production DB.

## Out of scope (this pilot)

- Bulk historical reconstruction
- Persisting `di_v0_ds4_trip_assessment_v1`
- Worker replay / feature flags / deploy
