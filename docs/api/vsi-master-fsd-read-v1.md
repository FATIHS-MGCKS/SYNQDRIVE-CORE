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

Pagination: `limit` max 50; signals cursor = last `providerNativeSignalName`; runs cursor = `ISO8601|runId`.

## Empty / not-yet-executed semantics

- `CATALOG_VERIFIED` does **not** imply snapshot observed.
- Unexecuted snapshot/historical stages → `NOT_EXECUTED` (never numeric zero as a proxy).
- FSD4 `AGGREGATED_1S` is never proven native 1Hz in this projection.
- Ledger attempt counts are persisted bookkeeping, not exact external HTTP counts.

## Mock example (summary, catalog-only)

```json
{
  "contractVersion": "vsi-master-fsd-read-v1",
  "catalog": {
    "availability": "AUTHORITATIVE_LIVE",
    "provenanceClass": "LIVE_DIMO_VERIFIED",
    "declaredSignalCount": 26
  },
  "execution": {
    "fsd3": { "state": "COMPLETED" },
    "fsd4": { "state": "NOT_YET_EXECUTED" }
  },
  "evidence": {
    "snapshot": "NOT_EXECUTED",
    "historical": "NOT_EXECUTED"
  }
}
```

VSI profile endpoints (`.../profile`, `.../revisions`) remain authoritative for LV/RPM classifications.
