# OneAuto OE_SERVICE_HISTORY_EU → VehicleServiceEvent ingestion (V1 draft)

## Scope

Automatic, idempotent persistence of successful `OE_SERVICE_HISTORY_EU` provider payloads into `VehicleServiceEvent` for vehicle Service & Compliance history display.

## Activation

Set `ONEAUTO_OE_SERVICE_HISTORY_INGESTION_ENABLED=1` (default **off**). Ingestion runs after job `SUCCEEDED` from:

- Full-data callback completion
- Sync HTTP 200 execution path
- E4 failed-callback recovery replay

No provider HTTP in ingestion or backfill paths.

## Schema

- `ServiceEventOrigin.ONEAUTO`
- `VehicleServiceEvent`: `one_auto_provider_job_id`, `external_source_event_key`, `source_payload_json`
- Unique `(organization_id, one_auto_provider_job_id, external_source_event_key)`
- `one_auto_oe_service_history_eu_ingestions` audit row per provider job

## HM/OEM isolation

Imported events use types outside `FULL_SERVICE_BASELINE_EVENT_TYPES` (typically `OIL_CHANGE` / `OTHER`). Ingestion does **not** call `refreshVehicleHistoryDenorm` or touch next-service HM/OEM fields.

## Backfill (non-production during draft)

```bash
ONEAUTO_OE_SERVICE_HISTORY_INGESTION_ENABLED=1 \
npx ts-node -r tsconfig-paths/register scripts/ops/oneauto-oe-service-history-eu-backfill.ts \
  --vehicle-id=8c850ff1-4201-432b-af2e-2711dbc7ca48 \
  --org-id=faa710c9-6d91-4079-a7d5-91fdccdec14a \
  --dry-run
```

Remove `--dry-run` only after owner approval on target environment.

## Rollback

1. Set `ONEAUTO_OE_SERVICE_HISTORY_INGESTION_ENABLED=0`
2. Optional: delete rows where `origin = 'ONEAUTO'` and `one_auto_provider_job_id IS NOT NULL` (scoped by org/vehicle)
3. Drop ingestion audit rows for the same jobs

Raw `OneAutoProviderResponse` rows remain unchanged.
