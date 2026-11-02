# TDL End-Validation Observability PR0 — As-of Replay Export Contract V1

OPERATION=TDL_END_VALIDATION_OBSERVABILITY_PR0  
SCHEMA_VERSION=1  
PRODUCTION_ACTIVATION=FORBIDDEN (observability flag default OFF)

## Purpose

Read-only contract for exporting persisted end-validation **decision observations** from
`trip_end_validation_decision_observations` to support future **as-of** offline replays.
This contract does **not** change FSM decisions and does **not** authorize production replays in PR0.

Synthetic fixtures under `TDL_CUSUM_REPLAY_FIXTURES_V1/` remain regression tests only.

## Clock domains

| Field | Domain | Semantics |
|-------|--------|-----------|
| `qualifiedStopBoundaryAt` | EVENT_TIME | FSM qualified stop / possible-end anchor when known |
| `canonicalEndBoundaryAt` | EVENT_TIME | Algorithmic end boundary (CUSUM change-point, CH segment end) |
| `eventTimeAt` | EVENT_TIME | Primary event-time anchor for the decision (often = canonical boundary) |
| `evidenceAvailableAt` | EVIDENCE_AVAILABILITY | When bounded core/window evidence became available to the worker (nullable) |
| `workerDecisionAt` | WORKER_TIME | When the FSM branch executed |
| `workerConfirmationAt` | WORKER_TIME | Worker commit instant (legacy `cusumValidatedAt` overload — CH vs CUSUM disambiguated via `endConfirmationSource`) |
| `persistedAt` | DB_TIME | Append-only insert time |

Never synthesize missing timestamps — export explicit JSON `null`.

## Sort order (deterministic)

1. `vehicleId` ASC  
2. `tripId` ASC NULLS LAST  
3. `endCycleToken` ASC NULLS LAST  
4. `workerDecisionAt` ASC  
5. `decisionOutcome` ASC  
6. `id` ASC  

## Export shape (JSONL recommended)

Each line is one observation with:

- All scalar columns from `trip_end_validation_decision_observations`
- `schemaVersion`
- `provenance`: `{ source: 'trip_end_validation_decision_observations', exportOperationId, exportedAt }`
- `missingEvidence`: boolean derived from `missingEvidenceFlags` non-empty

## Idempotency

Consumers must treat `idempotencyKey` as the dedupe key. Replays must not double-count retries.

## Tenant isolation

Exports MUST filter by `organizationId` (and optional vehicle allowlist). Cross-tenant joins are forbidden.

## Retention (operational)

- Append-only table; no in-place updates.
- **Documented target:** 90 days rolling delete by `persistedAt` — **NOT enforced in PR0** (no purge job, no DB TTL).
- **Activation gate:** a dedicated retention worker or scheduled purge is **mandatory before** fleet-wide observability flag rollout at scale.
- No historical backfill in PR0.

## Input / output provenance linkage

| Replay input | Observation fields |
|--------------|-------------------|
| END_VALIDATION core window | `coreWindowPointCount`, `inputFingerprint`, `evidenceRevision` |
| CUSUM detector | `cusumReason`, `detectorOutcome`, `decisionReason` |
| Retry budget | `retryCount`, `retryBudgetMax` |
| Finalize commit | `FINALIZE_COMMITTED` row + trip `raw_detection_meta.endValidation` (existing) |

## As-of rule (future harness)

When simulating attempt *k* at worker time *t*, exclude observations with `persistedAt > t` and
evidence with `evidenceAvailableAt > t`. PR0 only persists live decisions; replay engine remains future work.

**Status:** `AS_OF_REPLAY_CONTRACT_DEFINED=YES`, `AS_OF_REPLAY_REPRODUCIBLE=NO` — core window time series and per-attempt evidence availability are not fully persisted for historical reconstruction; observations capture bounded metadata only.

## Related metrics (Prometheus)

Low-cardinality counters/histograms registered on `TripMetricsService`:

- `synqdrive_trip_end_validation_decision_total`
- `synqdrive_trip_end_validation_cusum_outcome_total`
- `synqdrive_trip_end_validation_retry_exhaustion_total`
- `synqdrive_trip_end_validation_clickhouse_assist_total`
- `synqdrive_trip_end_validation_observability_write_failures_total`
- `synqdrive_trip_end_validation_decision_latency_seconds`

## Crash window and durability (PR0)

- Observability writes are **best-effort** and **not lossless**.
- Evidence may be **lost in the window between FSM commit and the asynchronous Postgres insert** (process crash, worker restart, or DB outage after the decision path returns).
- PR0 does **not** implement transactional outbox, synchronous dual-write, or replay-from-observations authority.
- **As-of replay** is contract-defined only; historical reconstruction from persisted inputs alone remains **NOT reproducible** in PR0 (`AS_OF_REPLAY_REPRODUCIBLE=NO`).

## Activation prerequisites (fail-closed)

Production or fleet-wide activation must set **all** of:

| Variable | Requirement |
|----------|-------------|
| `TRIP_END_VALIDATION_OBSERVABILITY_ENABLED` | `true` |
| `TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS` | non-empty allowlist |
| `TRIP_END_VALIDATION_OBSERVABILITY_ACTIVATION_ACK` | `true` — owner attests migration applied |
| `TRIP_END_VALIDATION_OBSERVABILITY_ACK_BEST_EFFORT` | `true` — owner accepts best-effort / crash-window loss |

Missing any gate ⇒ **no writes** (same as flag OFF for FSM decisions).

## Feature flag

- `TRIP_END_VALIDATION_OBSERVABILITY_ENABLED` (default **false**)
- `TRIP_END_VALIDATION_OBSERVABILITY_VEHICLE_IDS` (comma allowlist; empty allowlist ⇒ **no writes**)
- `TRIP_END_VALIDATION_OBSERVABILITY_ACTIVATION_ACK` (default **false**)
- `TRIP_END_VALIDATION_OBSERVABILITY_ACK_BEST_EFFORT` (default **false**)

Writer failures must not affect trip FSM (errors swallowed after metric increment).

**Follow-up PR (not PR0):** enforced 90-day purge job and/or transactional outbox if fleet-scale retention guarantees are required.
