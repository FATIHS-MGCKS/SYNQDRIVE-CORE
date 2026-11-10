# VSI Master FSD Read API (v1)

Contract: `vsi-master-fsd-read-v1`

Base path (after global API prefix): `/api/v1/admin/master-intelligence/vsi`

Auth: `MASTER_ADMIN` + `RolesGuard` (read-only; no provider dispatch).

## Endpoints

| Surface | Method | Path |
|--------|--------|------|
| Summary | GET | `organizations/:organizationId/vehicles/:vehicleId/links/:providerSourceLinkId/fsd/summary` |
| Signal Explorer | GET | `.../fsd/signals?limit=&cursor=&runId=` |
| Run history | GET | `.../fsd/runs?limit=&cursor=` |
| Run inspector | GET | `.../fsd/runs/:runId/inspector` |

Pagination:

- **Signals** — cursor is the last **logical catalog signal name** from the authoritative `availableSignalNames` set (internal fingerprint/rejected-document rows excluded). Pages are stable over unique signal names; all stage rows for those names are loaded together (no row-level pagination).
- **Runs** — cursor = `ISO8601|runId`.

## Authoritative catalog vs latest activity

- **Latest activity** (`execution.fsd3.latestActivityRunId`) — newest FSD3 run for the link (any status).
- **Authoritative catalog** (`catalog.authoritativeRunId`) — newest **valid** `COMPLETED` run with `LIVE_DIMO_VERIFIED` provenance (`catalog.availability = AUTHORITATIVE_LIVE`). A newer `FAILED`, `PENDING`, or `IN_PROGRESS` run does **not** hide an older still-valid catalog.
- **Scan safety** — recent-run scan is bounded; when no catalog is found in the first window, a targeted DB lookup for completed catalog stages runs. When both windows exhaust without a pick, `catalog.availability = SEARCH_INCOMPLETE` and `catalog.selectionLimitation = CATALOG_SEARCH_INCOMPLETE` (not a definitive absence claim).
- Explicit `runId` on signal explorer is scoped to org/vehicle/link; non-authoritative runs are returned with `catalogAuthoritative: false` and must not be presented as verified live catalog.

## FSD3 / FSD4 cross-stream historical

FSD3 (`FSD3_CATALOG_SNAPSHOT`) and FSD4 (`FSD4_HISTORICAL`) are separate runs. Historical evidence is associated only when `historicalLink = LINKED` (matching org, vehicle, source link, DIMO token, connection fingerprint, and declared catalog fingerprint on the FSD4 catalog stage). Otherwise the API surfaces `UNVERIFIED_LINK` / `NOT_AVAILABLE` with an explicit limitation — never arbitrary same-vehicle FSD4 runs.

## Stage evidence semantics

- `CATALOG_VERIFIED` / catalog declaration does **not** imply snapshot or historical observed.
- Unexecuted (`PLANNED`/`SKIPPED`) snapshot/historical stages → `NOT_EXECUTED` (never numeric zero as a proxy).
- `IN_PROGRESS`, `UNKNOWN_OUTCOME`, and `FAILED` stages with persisted rows → aggregate `PARTIAL`, not `NOT_EXECUTED`.
- Completeness uses the **planned/eligible** evidence subset (`queryPlanned` rows), not full catalog declaration count alone.
- Stage columns use per-stage presentation (`OBSERVED`, `NULL_OBSERVED`, `MISSING`, `QUERY_FAILED`, …).
- `catalogQuery` / `snapshotQuery` / `historicalQuery` reflect **that stage’s** evidence row flags, not copied from catalog.
- FSD4 `AGGREGATED_1S` is never proven native 1Hz in this projection.

## Request ledger (inspector)

- Lifecycle distinguishes **RESERVED_UNDISPATCHED** from planned/dispatched/settled attempts.
- `budgetByStage` reports per-stage checkpoint budgets; aggregate `budgetTotal` is the first parsable stage budget, not a merged execution budget.
- Malformed checkpoint ledgers are listed in `malformedCheckpointStages`; safe attempt summaries never include provider payloads or credentials.
- Persisted attempt counts are bookkeeping, not exact external HTTP call totals.

## Empty / not-yet-executed semantics

```json
{
  "contractVersion": "vsi-master-fsd-read-v1",
  "catalog": {
    "availability": "AUTHORITATIVE_LIVE",
    "provenanceClass": "LIVE_DIMO_VERIFIED",
    "declaredSignalCount": 26,
    "authoritativeRunId": "run_fsd3_completed"
  },
  "execution": {
    "fsd3": {
      "state": "FAILED",
      "latestActivityRunId": "run_fsd3_failed_newer"
    },
    "fsd4": {
      "state": "COMPLETED",
      "historicalCrossStreamLink": "LINKED"
    }
  },
  "evidence": {
    "snapshot": "NOT_EXECUTED",
    "historical": "AVAILABLE"
  }
}
```

VSI profile endpoints (`.../profile`, `.../revisions`) remain authoritative for LV/RPM classifications.
