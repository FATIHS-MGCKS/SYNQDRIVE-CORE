# Tiguan incident — read-only historical trip S4 eligibility assessment

**Operation:** `TIGUAN_S4_BOUNDARY_RECONCILIATION_ADMISSION_FIX` (assessment only)  
**Status:** READ_ONLY — no production replay, backfill, or deploy authorized by this document  
**Incident canonical trip:** `2245f107-0dda-412f-9903-dbfe1cd725a7`  
**Incident vehicle (VW Tiguan):** `19fedd4b-c4e8-4de8-a125-dab293326e7e`  
**Incident date:** 2026-10-31  
**Production baseline referenced in prior audit:** `442607ca…`

## Purpose

Record whether a **separate**, explicitly authorized historical replay could be considered after code fix merge — without executing replay in this workstream.

## Confirmed root cause (code path)

1. Successful `PARTIAL_TRIP_BOUNDARY_EXTENSION` commits `boundaryRepair.repairType` on the canonical trip row via `repairTripBoundariesWithAudit`.
2. Post-repair orchestration sets `boundaryRefresh.state = PENDING` (route/behavior refresh), which made `canReleaseTripDiBoundaryAdmission` return `BOUNDARY_REFRESH_IN_FLIGHT` for trips **without** a partial-extension exception.
3. `releaseForBoundaryScannedTripIds` runs only for intra-gap split scan sets; Tiguan canonical repair is **not** guaranteed to appear there.
4. S4 discovery (`DiV0S4DiscoveryService`) requires `raw_detection_meta.diV0BoundaryAdmissionV1.revisionKey` aligned with `buildTripDiBoundaryRevisionKey` — admission never written ⇒ discovery ineligible.

## Fix shape (draft PR)

- After `repairResult.applied` and **before** `finalizeBoundaryRepairRefresh`, call `TripDiBoundaryAdmissionService.tryReleaseAfterPartialTripBoundaryExtension` → existing `tryReleaseForTripTransactional(..., 'RECONCILIATION')`.
- `canReleaseTripDiBoundaryAdmission` allows release when partial extension is committed **and** retryable `boundaryRefresh.generation` matches `readCurrentBoundaryRepairGeneration` **and** trip row times match repair meta (not `repairType` alone).

## Preconditions for any future historical replay (not executed here)

| Gate | Requirement |
|------|-------------|
| Code | Fix merged to `main` and deployed per normal release process |
| Authorization | Explicit owner instruction + read-only eligibility re-check on Production |
| Trip row | Canonical trip `COMPLETED`, FSM `RESTING`, no open proposed boundary repairs |
| Meta | `boundaryRepair.repairType = PARTIAL_TRIP_BOUNDARY_EXTENSION` present after prior repair |
| Suffix | CANCELLED LIVE_FSM suffix row must **not** be independently admitted (customer list / forensics policy unchanged) |
| S4 | Leader-gated discovery only; work items via existing `createWorkItem` + supersede rules |
| Scoring | No driving-impact or customer scoring mutation in admission hook |

## Expected post-fix behavior for net-new repairs

Repaired canonical trips acquire `diV0BoundaryAdmissionV1` in the same reconciliation transaction window (after repair commit, before refresh finalize), enabling discovery on subsequent leader ticks without duplicate admission patches.

## Explicit non-actions (this assessment)

- No UPDATE/INSERT against Production for trip `2245f107-…`
- No manual S4 work-item creation for historical window
- No feature-flag toggles
- No Tire/VSI or Arteon scope

## Evidence pointers

- Prior incident audit: `/opt/cursor/artifacts/TIGUAN_INCIDENT_P0_CANONICAL_TRIP_VISIBILITY_AND_S4_DISCOVERY_AUDIT.md` (Cloud Agent artifact; may not be in git)
- Unit: `trip-di-boundary-admission.unit.spec.ts` (partial extension + refresh guard)
- PostgreSQL: `trip-di-boundary-admission.postgres.integration.spec.ts` (when `S4A_POSTGRES_LIVE`)
