# DS4 × RPM — Real Data PR-B1 Source Eligibility & Replay Preparation

| Field | Value |
|-------|--------|
| **Evidence ID** | DI-EVID-DS4-RPM-REAL-DATA-PR-B1-SOURCE-ELIGIBILITY |
| **Date** | 2026-11-04 |
| **Base main** | `ff28a368533c1f50ce84e1618790046fadaa0c16` (Phase 0 #2325 + PR-A #2328 merged) |
| **decision_status** | PROPOSED — research preparation only; **no production reads in PR-B1** |

## 1. Source authority matrix

| Authority axis | Canonical implementation | Must not infer from |
|----------------|------------------------|---------------------|
| Telemetry source family | `resolveTelemetrySourceFamily(DimoVehicle.rawJson)` → `RUPTELA_R1` \| `API_SYNTHETIC` \| `UNKNOWN` | `Vehicle.hardwareType`, make/model |
| R1 historical OBD time | `hasUncertainHistoricalObdRecordTime` → true only for `RUPTELA_R1` | UNKNOWN treated as non-R1 |
| Shadow join R1 block | `validateRpmSampleSourceFamilyAuthority` → `R1_HISTORICAL_OBD_POINT_TIME_CORRELATION_PROHIBITED` | — |
| REAL observation attestation | `sourceFamilyAttestation === PROVEN_FROM_DIMO_IDENTITY` + non-null family | fixture defaults |
| RPM HF V1A buckets | `buildHighFrequencyQuery` — `interval:"1s"`, per-signal `agg:AVG`; row `timestamp` = grid label | OEM CAN Hz |
| V1B admission / ICE | `routeDs4RpmHfV1bFromV1aAdmission`; `iceRpmApplicability` on summary | hardwareType |
| VSI cadence tier | Trip-level P50/P75 effective resolution (`EFFECTIVE_RESOLUTION_TIER_NOT_DEVICE_CADENCE`) | device nominal Hz |
| DS4 motion events | Motion-core shadow persisted rows; label ±1 s uncertainty (harness envelope) | trip aggregates alone |
| Tenant / trip / link | Org-scoped vehicleId, tripId, `providerSourceLinkId` on sample evidence | first DB row |
| Timestamp phase | Contract-fixed `sourceTimestampPhase: UNKNOWN` until ingestion anchor attestation | synthetic alignment |

Code: `telemetry-source-family.ts`, `ds4-rpm-shadow-correlation-source-family-gate.v1.ts`, `high-frequency.query.ts`, `vsi-rpm-cadence-tier.util.ts`, `ds4-rpm-real-data-replay/*`.

## 2. Reference cohort vehicle eligibility (no production attestation in PR-B1)

**Rule:** Without a bound, owner-authorized read bundle per vehicle/trip/link, status is **UNPROVEN** (or **NOT_APPLICABLE** for ICE on BEV). Historical architecture mentions (Tiguan LTE_R1 drives, Audi/Arteon canary notes) are **not** substituted for attestation.

| Cohort label | ICE RPM | Historical timestamp authority | Local event cadence | Motion quality | V1B admitted | VSI tier | Speed co-bucket | **Overall (PR-B1)** |
|--------------|---------|--------------------------------|---------------------|----------------|--------------|----------|-----------------|------------------------|
| Audi A4 | UNPROVEN | UNPROVEN | UNPROVEN | UNPROVEN | UNPROVEN | UNPROVEN | UNPROVEN | **UNPROVEN** |
| VW Arteon | UNPROVEN | UNPROVEN | UNPROVEN | UNPROVEN | UNPROVEN | UNPROVEN | UNPROVEN | **UNPROVEN** |
| VW Tiguan | UNPROVEN (ICE path) | **BLOCKED if R1 family proven** else UNPROVEN | UNPROVEN | UNPROVEN | UNPROVEN | UNPROVEN | UNPROVEN | **UNPROVEN** (R1 → **BLOCKED** when family attested) |
| Tesla Model 3 | **NOT_APPLICABLE** | UNPROVEN (synthetic/API path common) | UNPROVEN | UNPROVEN | UNPROVEN | UNPROVEN | UNPROVEN | **NOT_APPLICABLE** for ICE RPM correlation |

## 3. RPM + CAN speed co-bucketing feasibility

- **Query shape:** Single HF GraphQL `signals` query returns `speed(agg: AVG)` and `powertrainCombustionEngineSpeed(agg: AVG)` on the **same 1 s grid** anchored to query `from`/`to` ISO bounds.
- **Feasibility:** Co-bucketing is **structurally supported** by the query; **scientific usability** remains **UNPROVEN** per trip until: proven source family, V1B admission, VSI tier, motion event windows, and abstention metrics are attested.
- **Not proven:** physical support width inside bucket, LTE_R1 sample timing vs label, missing buckets (gaps are not interpolated in harness).

## 4. DIMO timestamp semantics (read-only audit)

| Topic | Verified behavior |
|-------|-------------------|
| Aggregation | 1 s `AVG` per signal — not raw CAN frame timing |
| Anchors | `from` / `to` on query set ingestion window; bucket label = grid start |
| Phase | Cross-domain DS4 label vs DIMO bucket **UNKNOWN** in contracts |
| Gaps | Missing buckets → no harness interpolation; gap deficiency window-relative |
| R1 | Point-time historical correlation **prohibited** when family proven R1 |
| Speed | Same row timestamp as RPM in HF response — alignment experiments only |

## 5. Real-data loader design (read-only replay, PR-B1 contract only)

Type: `Ds4RpmRealDataReplayLoaderManifestV1` in `ds4-rpm-real-data-replay-loader` contract module.

| Requirement | Design |
|-------------|--------|
| Isolation | Hard org / vehicle / trip / source-link scoping in manifest |
| Source family | From `DimoVehicle.rawJson` only; attestation `PROVEN_FROM_DIMO_IDENTITY` |
| Fingerprints | Stable V1A/V1B/sample digests wired into shadow join input (existing harness patterns) |
| Query provenance | Persist `dimoQueryFromIso`, `dimoQueryToIso`, interval=1s, aggregation note |
| Support width | Always `UNKNOWN`; no invented observation width |
| Interpolation | **NONE** |
| Persistence | **NONE** (immutable evidence JSON artifacts only) |
| Abstention | Eligibility audit + shadow reason codes when authority missing |
| Outputs | Immutable replay bundle + cohort report (future PR-B2 executor) |

**PR-B1 does not implement ClickHouse/Postgres/DIMO network loaders.**

## 6. Scientific experiment plan (PR-B2+ execution)

1. **Eligible event cohort:** DS4 manoeuvre events with `iceRpmEventApplicability !== NOT_APPLICABLE`, V1B succeeded, VSI tier in {1S,2S,3S}, source family not R1, attestation proven.
2. **Stratification:** RPM_1S / RPM_2S / RPM_3S from VSI authoritative tier; local cadence gate separate.
3. **Exclusions:** R1 family; `SOURCE_FAMILY_BINDING_UNPROVEN`; EV ICE N/A; aggregate-only RPM; duplicate/conflict timestamps.
4. **Alignment experiments:** Envelope offset probes (existing PR-A module); placebo ±1/±2 s shifts on **labels only** (diagnostic, not correction).
5. **Controls:** Tenant mismatch; timestamp shift negative; EV N/A; R1 family block; synthetic fixture parity.
6. **Metrics:** Event-level AVAILABLE/PARTIAL/UNAVAILABLE; gap deficiency; envelope stability enum; abstention reason histogram — **no accuracy/causality claims** without independent ground truth.

## 7. Production read authorization requirements

Owner must explicitly authorize **each** of:

1. Read scope: orgId, vehicleId, tripId(s), time window, DIMO tokenId / source link id  
2. Environment: production read-only role; no workers, no reprocessing, no schema migration  
3. Attestation capture: store `rawJson` family resolution audit trail + HF query bounds + fingerprints  
4. CI / governance: critical gate green on replay branch; registry validator pass  
5. Separate PR for executor (PR-B2) — PR-B1 is design + contracts only  

## 8. Remaining uncertainties

- Per-vehicle production attestation for the four reference cohorts  
- DIMO bucket interior support width vs DS4 label phase calibration  
- API_SYNTHETIC Tesla path: speed/RPM co-bucket semantics for non-ICE research extensions  
- Trip-level VSI tier vs event-local cadence mismatch prevalence on real trips  
- Independent ground truth for any future “accuracy” narrative  

## 9. Validation (PR-B1)

```bash
cd backend && npm run test:di:ds4-rpm-real-data-replay
cd backend && npm run test:di:ds4-rpm-shadow-correlation
bash architecture/scripts/validate-module-registry.sh
```
