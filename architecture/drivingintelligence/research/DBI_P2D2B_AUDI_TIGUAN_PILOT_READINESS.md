# P2-D2B — Audi A4 (KS MS 661) & VW Tiguan (WOB L 7503) real-data pilot readiness

**Operation:** `DBI_P2D2B_AUDI_TIGUAN_REAL_DATA_PILOT_PREPARATION`  
**Base SHA:** `be4284e383654824e37d3dbcecdd9f82cefcfbfa` (includes PR #2400 P2-D1, PR #2401 P2-D2A)  
**Mode:** Read-only evidence readiness and pilot design — **no Production I/O**

## Executive technical summary

This phase prepares an owner-reviewable, bounded plan for a future **read-only** real-data pilot on two cohorts only:

| Cohort | Plate (historical label) | In scope |
|--------|--------------------------|----------|
| Audi A4 | KS MS 661 | YES |
| VW Tiguan | WOB L 7503 | YES |
| VW Arteon | — | **EXCLUDED** |
| Tesla Model 3 | — | **EXCLUDED** |

No live configuration was read. Repository citations (EXP-021, CHANGE_LEDGER) are **HISTORICAL_UNVERIFIED** until an owner-authorized Production read confirms org/vehicle/trip/link binding and `DimoVehicle.rawJson` family resolution.

Code deliverable: `ds4-rpm-pilot-preparation-v1` pure planning helpers + `buildDs4RpmPilotPreparationReportV1` — no live adapter, no workers, no flags.

## Reused authorities (unchanged)

P2-A1/A2, P2-D1 fusion, P2-D2A replay bridge, PR-B1/B2/B3 real-data replay, source-family + R1 gates, pilot-read authorization contracts, fingerprint infrastructure.

## Audi readiness matrix

| Dimension | Status |
|-----------|--------|
| Organization / vehicle / source link (live) | **UNVERIFIED** |
| Historical plate KS MS 661 | HISTORICAL_UNVERIFIED (`c10351f8-…`, token 187361 cited in CHANGE_LEDGER) |
| Source family | **UNKNOWN** until `rawJson` read |
| R1 containment | Required if family resolves `RUPTELA_R1` |
| RPM V1A/V1B/VSI | **UNVERIFIED** (requirements listed in code) |
| DS4 motion run | **UNVERIFIED** (persisted attestation required) |
| Temporal cross-domain fusion | **UNVERIFIED** / blocked if R1 |

## Tiguan readiness matrix

| Dimension | Status |
|-----------|--------|
| Organization / vehicle / source link (live) | **UNVERIFIED** |
| Historical plate WOB L 7503 | HISTORICAL_UNVERIFIED (`19fedd4b-…`, token 192922; LTE R1 reference-drive citations) |
| Source family | **UNKNOWN** — **conditional R1 risk** from repository narrative |
| R1 containment | **Assume veto until disproven** |
| RPM / DS4 | Same UNVERIFIED posture as Audi |

## Proven vs unverified

**Proven (repository-only):**

- P2-D1 + P2-D2A offline synthetic paths execute on research contracts.
- PR-B3 scope-check authorization model exists (not production-read permission).

**Unverified (requires future owner-approved read):**

- All live IDs, trip selections, motion run pins, V1B fingerprints, HF RPM windows, family attestation.

## R1 scientific restrictions

If `resolveTelemetrySourceFamily(rawJson) → RUPTELA_R1`:

- DS4×RPM temporal fusion **BLOCKED** (no timestamp correlation, no physical sync claims).
- Allowed: RPM-only descriptive dynamics, DS4-only motion research, cadence/data-quality assessment, R1 containment validation.

No bypass via timestamp shifts, metadata relabeling, or speed-as-clock claims.

## RPM evidence requirements (future read)

Per vehicle: V1A trip input, V1B tier-aware result + run id, RPM input fingerprint, provider source link, bounded DIMO HF 1s AVG window, VSI tier (`RPM_1S` / `RPM_2S` / `RPM_3S` / SPARSE), duplicate/conflict counts, sequence boundaries, ICE applicability. **RPM_3S is not eligible for full event-local fusion.**

## DS4 motion evidence requirements (future read)

org/vehicle/trip/motionRunId binding, persisted event rows (V1/V2 material parity), speed buckets, algorithm versions, **independent** motion-run provenance (not injected-bundle fingerprint alone).

## Candidate trip selection procedure

Offline-only `rankDs4RpmPilotTripCandidatesV1` (requires `cohortContext`):

1. Filter to active cohort allowlist **and** `cohortVehicleLabel === cohortContext` (no cross-cohort leak).
2. Empty cohort → cohort-specific abstention (never cross-cohort placeholder).
3. Invalid rows abstain individually; valid rows remain rankable in the same cohort.
4. Abstain if V1B fingerprint/admission or motion run missing (per row).
4. Score: DS4 events, RPM points, cadence tier, penalties for gaps/duplicates/conflicts.
5. Tie-break: lexicographic `candidateTripId`.
6. **`tripSelected` remains false** — no invented production selection.

R1-proven trips: rank may proceed for **per-domain data quality**; temporal fusion classifications include `TEMPORAL_FUSION_BLOCKED_R1`.

## Future minimal read authorization scope

See `buildDs4RpmPilotMinimalReadPlanV1` — Postgres identity + V1B/V1A, motion shadow runs, bounded ClickHouse HF (planned, not executed). Requires:

- `Ds4RpmRealDataPilotReadAuthorizationContextV1`
- Owner approval checklist (separate from this PR)
- `productionReadPermitted: false` until explicit owner instruction

## Security and privacy

- `rawJson` → digest only in artifacts
- No serials/tokens in exports
- Read-only snapshots, row/budget caps

## Missing evidence inventory

Listed on `Ds4RpmPilotPreparationReportV1.missingEvidenceInventory` (generated in tests and report builder).

## GO / NO-GO matrix

| Gate | Audi | Tiguan |
|------|------|--------|
| Owner authorized read scope | NO_GO | NO_GO |
| Source family resolved | NO_GO | CONDITIONAL (R1 risk) |
| RPM + V1B binding | NO_GO | NO_GO |
| DS4 motion attested | NO_GO | NO_GO |
| Offline synthetic regression | GO | GO |

## Owner approval checklist

1. Confirm live orgId / vehicleId per plate  
2. Sign trip allowlist + ISO window  
3. Approve providerSourceLinkId + budgets  
4. Acknowledge R1 veto if applicable  
5. Acknowledge REAL_OBSERVATION unauthorized until separate gate  
6. Authorize read-only extraction only  

## Later replay wiring (when attested)

Independently attested bundles may feed: B2 replay → B3 attestation → A2 dynamics → P2-D1 fusion → P2-D2A artifact, preserving R1 veto, REAL_OBSERVATION prohibition, and no synthetic→real relabel.

## Validation

```bash
cd backend && npx jest ds4-rpm-pilot-preparation ds4-rpm-real-data-fusion-replay
```
