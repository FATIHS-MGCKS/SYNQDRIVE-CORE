# FSD P6C — production fleet manifest template

Do **not** copy the CI offline fixture (`fsd-p6c-offline-fleet-manifest.v1.json`). Production manifests must set:

- `"productionManifest": true`
- **No** `"offlineFixtureHydration"`
- Non-empty `declaredFieldNames` per vehicle from **verified live catalog** evidence
- Unique production UUIDs for `organizationId`, each `vehicleId`, `providerSourceLinkId`
- Unique `discoveryRequestKey` / `historicalRequestKey` per vehicle (no `offline` / `p6c-offline` substrings)
- Per-vehicle or fleet `historicalWindow` within budget `maxHistoricalWindowSeconds`

## Sketch (replace all REPLACE values)

```json
{
  "schemaVersion": "FSD_P6C_FLEET_MANIFEST_V1",
  "productionManifest": true,
  "organizationId": "REPLACE_ORG_UUID",
  "historicalWindow": {
    "fromUtc": "REPLACE_ISO_START",
    "toUtc": "REPLACE_ISO_END"
  },
  "budget": {
    "maxRequestsPerRun": 12,
    "maxHistoricalWindowSeconds": 3600,
    "maxSnapshotFieldsPerDocument": 26,
    "maxHistoricalFloatFieldsPerChunk": 8,
    "maxResponseBytes": 524288
  },
  "vehicles": [
    {
      "label": "tesla_model_3",
      "vehicleId": "REPLACE_VEHICLE_UUID",
      "providerSourceLinkId": "REPLACE_LINK_UUID",
      "discoveryRequestKey": "REPLACE_DISCOVERY_KEY",
      "historicalRequestKey": "REPLACE_HISTORICAL_KEY",
      "catalogProvenance": "VERIFIED_LIVE_CATALOG",
      "declaredFieldNames": ["REPLACE_FROM_VERIFIED_LIVE_CATALOG_EVIDENCE"]
    }
  ]
}
```

Repeat `vehicles[]` entries for `vw_tiguan`, `audi_a4`, `vw_arteon` in that order.

After catalog fetch, re-run `OFFLINE_PLAN` is **not** valid for production — use planner with live `declaredFieldNames` only, or a future live-catalog planning mode.
