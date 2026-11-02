# DS4 Trip Assessment L2 Contract (V1)

| Field | Value |
|-------|-------|
| **Document ID** | `DI-CONTRACT-DS4-TRIP-ASSESSMENT-L2-V1` |
| **Status** | `IMPLEMENTED` — worker **OFF** by default (PR-A) |
| **Table** | `di_v0_ds4_trip_assessment_v1` |
| **Assessment version** | `DS4_TRIP_ASSESSMENT_V1` |

## Input source (exclusive)

- `di_v0_motion_core_shadow_runs_v1` with `shadow_status = SUCCEEDED`
- Decoded payload via existing gzip reader
- Intensity via `readPersistedMotionEventIntensityForPayload` only

## Trip assessment statuses

| Status | Meaning |
|--------|---------|
| `RATED` | Ordinal trip rating allowed **only** when `ordinalTripRatingApproved` quality policy flag is true |
| `UNRATED_COUNTS_ONLY` | Manoeuvre counts / observation valid; ordinal trip rating withheld |
| `INSUFFICIENT_EVIDENCE` | Missing or ambiguous evidence (labels, speed authority, etc.) |
| `UNSUPPORTED` | Provider / motion contract cannot supply DS4 assessment evidence (not used for vehicle allowlist) |
| `PENDING` | No motion run available yet |
| `FAILED` | Processing/contract/source identity failure |

## Fail-closed rules

- No legacy HF / TripBehaviorEvent / TripDrivingImpact inputs
- Unknown event-row contract → assessment `FAILED`
- No fabricated zero stress; zero event counts only when observation valid and no accepted manoeuvres
- No V1 intensity inference; no peak acceleration as ordinal substitute
- `NO_VALID_DRIVING_EXPOSURE` when canonical Es cannot be derived (fail-closed when no manoeuvres to observe)

## PR-A2 — Event intensity eligibility (2026-10-28)

Per ACCELERATION / DECELERATION event (via `readPersistedMotionEventIntensityForPayload` only):

| Gate | Requirement |
|------|-------------|
| Quality | `event.quality === OK` |
| Coverage | `coverageRatio === 1` |
| Steps | `steps === durationS` |
| Duration | `durationS >= 2` |
| Intensity | Valid V2 persisted intensity present |

| Duration | Tier |
|----------|------|
| `>= 3s` | `FULL_ELIGIBLE` (`ADMISSIBLE_FULL`) |
| `2s` | `BIN_ONLY` (`ADMISSIBLE_BIN_ONLY`) |

`eventSummaries` carries per-kind counts (total, admissible, full, bin-only, unrated, excluded artefacts, admissible share, duration + intensity distributions) and per-event `eventIntensityRecords` with explicit reason codes.

Engine: `ds4-assessment-event-intensity-eligibility.v1.ts`

## PR-A2 — Canonical driving exposure

- **Es**: integrated seconds where FSM `MOVING` + `evidenceQuality DIRECT` + usable numeric DS4 speed quality on consecutive label intervals (actual Δt, max gap = motion event guard `maxGapS`)
- **D_km**: ∫ speed over Es (km/h × seconds / 3600)
- Provenance version `DS4_ASSESSMENT_DRIVING_EXPOSURE_V2` on `eventSummaries.drivingExposure` (1s grid gap, duplicate-label fail-closed, no C5.1→c4Speeds fallback)

Engine: `ds4-assessment-driving-exposure.v1.ts`

Quality policy default bumped to `DS4_ASSESSMENT_QUALITY_POLICY_V2` (ordinal trip rating still **off**).

## Code

- Engine: `backend/src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/ds4-trip-assessment-v1.engine.ts`
- Fleet admission: `ds4-assessment-eligibility-policy.v1.ts` (tenant-safe scope; fleet-wide). Calibration cohort: `ds4-assessment-calibration-cohort.v1.ts` (tests/eval only)
