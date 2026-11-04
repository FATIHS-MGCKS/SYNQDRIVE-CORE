# DS4 × RPM — Real Data PR-B3 Source Attestation & Pilot Read Boundary

| Field | Value |
|-------|--------|
| **Evidence ID** | DI-EVID-DS4-RPM-REAL-DATA-PR-B3-ATTESTATION-BOUNDARY |
| **Date** | 2026-11-04 |
| **Base main** | `592b93c3719ae3309b16150dc195c849d3fea6d2` (PR #2332 merged) |
| **decision_status** | PROPOSED — contracts + offline gates only; **no production reads in PR-B3** |

## 1. Source forensics (repository)

| Authority | Canonical module | Provable from persistence alone | Requires provider query |
|-----------|------------------|--------------------------------|-------------------------|
| Telemetry source family | `telemetry-source-family.ts` (`DimoVehicle.rawJson`) | Yes (when rawJson stored) | No |
| R1 historical OBD time veto | `hasUncertainHistoricalObdRecordTime` | Family classification only | No |
| Provider source link | V1A trip input / V1B summary `providerSourceLinkId` | Yes when rows bound | No |
| RPM HF buckets | V1A trip input / ClickHouse HF read services | Points if already ingested | Yes for missing trips |
| V1B admission / tier | `ds4-rpm-hf-v1b` persisted shadow summaries | Yes when run exists | No |
| VSI cadence tier | Trip classification snapshots in V1A/V1B | Yes when snapshotted | No |
| DS4 motion events | Motion-core shadow payload rows | Yes when run exists | No |
| Timestamp phase DS4↔DIMO | Contracts fix `UNKNOWN` | **Not** without calibration study | Possibly DIMO+DS4 anchor audit |

**Never used:** `Vehicle.hardwareType`, make/model inference.

## 2. Attestation architecture

Orthogonal dimensions (never equivalent):

- `SOURCE_FAMILY_PROVEN`
- `SOURCE_TIMESTAMP_AUTHORITY_PROVEN`
- `EVENT_LOCAL_CADENCE_ASSESSABLE`
- `CORRELATION_ELIGIBLE`

Modules: `ds4-rpm-real-data-source-attestation.contract.v1.ts`, `ds4-rpm-real-data-source-attestation-audit.v1.ts`, `ds4-rpm-real-data-attestation-fingerprint.v1.ts`.

Injected fixtures use `PROVEN_FROM_INJECTED_FIXTURE` — **not** production attestation.

## 3. Authorization boundary (design only)

`Ds4RpmRealDataPilotReadAuthorizationContextV1` enforced via `evaluateDs4RpmRealDataPilotReadAuthorizationV1` **outside** attestation bundles:

- Exact org / vehicle / trip allowlist / source link
- Bounded ISO window + response row budget + **positive integer query budget estimate**
- **Trusted execution boundary** `evaluatedAtIso` for expiry — never `request.requestedAtIso` or `issuedAt` fallback
- Require `issuedAt <= evaluatedAt < expiresAt`; reject invalid validity intervals
- Allow decision: `scopeValidationOnly: true`, `productionReadPermitted: false` (not production read permission)
- Automatic DENY on scope mismatch; provenance fingerprint mismatch → `CORRELATION_ELIGIBLE` BLOCKED

`assertDs4RpmRealDataPilotLiveReadNotExecutedInPrB3()` — no live Postgres/ClickHouse/DIMO in PR-B3.

## 4. Source readiness matrix (no live attestation)

| Cohort | Correlation eligible (PR-B3) |
|--------|------------------------------|
| Audi A4 | UNPROVEN |
| VW Arteon | UNPROVEN |
| VW Tiguan | **CONDITIONAL_BLOCKED_IF_R1_PROVEN** — fleet not permanently ineligible; R1-attested trips BLOCKED |
| Tesla Model 3 | NOT_APPLICABLE (ICE RPM) |

**Pilot conclusion:** `NO_ELIGIBLE_REAL_DATA_SOURCE_WITHOUT_OWNER_AUTHORIZED_ATTESTATION`

## 5. Minimal pilot read plan (future owner-authorized PR)

1. Owner-signed authorization record (scope + expiry + row budget)
2. Read-only Postgres: `DimoVehicle.rawJson` digest + trip/link binding
3. Read-only ClickHouse HF 1s AVG RPM+speed for authorized window only
4. Read-only persisted V1B + motion-core run ids for same trip
5. Assemble attestation bundle → PR-B3 audit; **exclude RUPTELA_R1** trips
6. Only then wire PR-B2 offline executor with `PROVEN_FROM_AUTHORIZED_READ`

## 6. R1 exclusion evidence

- Family gate: `ds4-rpm-shadow-correlation-source-family-gate.v1.ts`
- Attestation audit: `R1_HISTORICAL_OBD_POINT_TIME_CORRELATION_PROHIBITED`
- Readiness matrix Tiguan row: conditional R1 block per trip attestation (not whole fleet)

## 7. Validation

```bash
cd backend && npm run test:di:ds4-rpm-real-data-attestation  # includes adversarial hardening suite
cd backend && npm run test:di:ds4-rpm-real-data-replay
bash architecture/scripts/validate-module-registry.sh
```

## 8. Owner authorization requirements (explicit)

Separate from bundle flags; required before any live read PR:

1. Written owner scope: orgId, vehicleId, trip allowlist, sourceLinkId, ISO window, row budget
2. Read-only DB credentials scoped to that tenant/vehicle
3. Audit retention for authorization record id + request fingerprints
4. CI green on attestation branch
5. No bypass of R1 historical timestamp prohibition
