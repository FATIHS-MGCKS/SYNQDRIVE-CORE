# DS4 × RPM — Real Data PR-B2 Offline Replay Executor

| Field | Value |
|-------|--------|
| **Evidence ID** | DI-EVID-DS4-RPM-REAL-DATA-PR-B2-OFFLINE-EXECUTOR |
| **Date** | 2026-11-04 |
| **Base main** | `226a4b0cf868a58a026bab50b8a0c117998ee53f` (PR #2331 merged) |
| **decision_status** | PROPOSED — offline executor only; **zero production I/O** |

## 1. Executor architecture

Pure pipeline (`executeDs4RpmRealDataOfflineReplayTripV1`):

1. Production adapter guard (`assertProductionEvidenceSourceNotImplemented`)
2. Offline bundle validation (`validateDs4RpmRealDataOfflineInputBundleV1`) — org/vehicle/trip/link + DIMO `rawJson` family resolution only
3. Input fingerprint (`computeDs4RpmRealDataOfflineBundleInputFingerprintV1`)
4. PR-B1 eligibility audit (reused; `authorizedRealDataReadDeclared: false`)
5. Phase-0 shadow correlation harness (`executeDs4RpmShadowCorrelationHarness`, `SYNTHETIC_FIXTURE`)
6. Versioned trip artifact + cohort research report (`buildDs4RpmRealDataResearchReportV1`)

Modules under `backend/src/modules/vehicle-intelligence/driving-intelligence/ds4-rpm-real-data-replay/`.

## 2. Adapters

| Adapter | Status |
|---------|--------|
| `OFFLINE_INJECTED_BUNDLE` (`createStaticOfflineEvidenceAdapter`) | **Implemented** — test/harness bundles only |
| `AUTHORIZED_PRODUCTION_READ` | **Not implemented** — type stub only; separate owner boundary required |

`ownerAuthorizedProductionExecutionDeclared` must remain `false`; it does **not** grant production access.

## 3. Safety invariants preserved

- Source family from `resolveTelemetrySourceFamily(rawJson)` only
- R1 → eligibility `BLOCKED` + join reason `R1_HISTORICAL_OBD_POINT_TIME_CORRELATION_PROHIBITED`
- UNKNOWN family → bundle validation failure (no correlation)
- Tesla ICE → `NOT_APPLICABLE`
- No interpolation; `sourceTimestampPhase: UNKNOWN`; support width `UNKNOWN`
- No DS4/V1B/VSI authority changes — reuse only

## 4. Offline validation matrix (fixtures)

| Fixture | Intent |
|---------|--------|
| synthetic-api-valid | Non-R1 synthetic path + alignment envelope probes |
| r1-blocked | R1 veto |
| unknown-source | UNKNOWN family fail-closed |
| tesla-ice-na | ICE N/A |
| cross-tenant / wrong-link | Binding rejection before correlation |
| v1b-denied | `V1B_ADMISSION_DENIED` |
| cadence-mismatch | `LOCAL_EVENT_CADENCE_COARSER_THAN_VSI_TIER` |
| missing-rpm | UNAVAILABLE events |
| duplicate-ts | `DUPLICATE_RPM_TIMESTAMPS_IN_WINDOW` |

Synthetic pass **does not** claim real-world accuracy.

## 5. Real-data readiness

| Gate | PR-B2 |
|------|-------|
| Production Postgres/ClickHouse/DIMO reads | **Forbidden** |
| Owner-authorized execution PR | **Future** (separate boundary + credentials) |
| Eligibility attestation bundle | **Future** |

## 6. Validation commands

```bash
cd backend && npm run test:di:ds4-rpm-real-data-replay
cd backend && npm run test:di:ds4-rpm-shadow-correlation
bash architecture/scripts/validate-module-registry.sh
```

## 7. CI note — Backend R11 postgres+redis (non-critical on PR #2331)

Run `41785746957`: R11 integration tests passed; job failed on **Trip R12 PEC EV base-head red-proof** (`HEAD_PROBE_INFRASTRUCTURE_ERROR=true`, `HEAD_GREEN_PROVEN=NO`) — infrastructure/red-proof harness, unrelated to DS4-RPM PR-B2.
