# VSI P1-F — HF source-link isolation fix (2026-10-31)

## Problem (P1-E)

`VsiProfileCadenceEvidenceLoader.loadRpmEvidence` used `ClickHouseHfService.getBoundedSignalValuePoints({ vehicleId, signal, time })`, which filters only `vehicle_id` + time. VSI profiles are keyed by `(organizationId, vehicleId, providerSourceLinkId)`, so foreign HF rows (other trips, prior devices, wrong org if mis-tagged) could enter link-scoped cadence stats.

## Fix (minimal)

1. **Per-trip org-scoped reads** — for each link-clipped finalized trip window, call `getTripRpmHfPoints({ orgId, vehicleId, tripId, tripStart, tripEnd })` (existing DS4 RPM HF V1A contract).
2. **Historical link lifecycle gate** — skip HF for trip windows covered by zero or multiple `vehicle_data_source_links` episodes; emit `RPM_HF_HISTORICAL_MULTI_LINK_AT_TRIP_WINDOW` or `RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN`.
3. **DIMO token filter (when resolved)** — `telemetry_hf_points.token_id` returned on trip read; points with mismatched `token_id` vs link `dimoVehicle.tokenId` are excluded; limitation `RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN`.
4. **DIMO without token** — fail-closed: no HF points, `RPM_HF_DEVICE_TOKEN_UNRESOLVED` + attribution limitation.
5. **Tenant scope violation** — existing CH fail-closed → no points + attribution limitation.
6. **Cadence analyzer** — `attributionLimitations` on `VsiRpmCadenceEvidenceInput` merged into `cadenceIntelligence.limitations` (feeds PR #2272 combined evidence fail-closed path).

## Identity guarantees and boundaries

| Layer | Guarantees | Does not guarantee |
|-------|------------|-------------------|
| `getTripRpmHfPoints` | `org_id`, `vehicle_id`, `trip_id`, signal, trip time window; tenant row validation | Source-link episode (device) if mirror assigns wrong `trip_id` or `token_id` |
| Link lifecycle gate | Single link episode covers clipped trip window | Mid-trip device swap inside one trip without link boundary |
| `token_id` filter | DIMO device token match when link token known | HM / non-DIMO links (trip+org only; no token column semantics) |

**Not implemented (documented):** no new CH schema, no backfill, no retroactive rewrite of stored profiles, no `providerSourceLinkId` column on HF points.

## Tests

`vsi-rpm-hf-link-scoped-cadence-evidence.util.spec.ts` — P1-E scenarios A–H, PR2272 combined fail-closed, P1-E contamination regression.

## Related PRs preserved

- #2272 combined evidence (limitations on cadence)
- #2263 provenance dedup (unchanged)
- #2265 fetch quality (unchanged)
- #2266 applicability (unchanged)
- LV cadence loader unchanged

## Differential evidence

Before: vehicle-wide bulk envelope `[min(trip.start), max(trip.end)]` admitted all RPM HF rows for `vehicle_id`.

After: only rows from attributable trips via org+trip contract (+ optional token filter).
