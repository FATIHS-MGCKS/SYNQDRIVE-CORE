# OneAuto OE_SERVICE_HISTORY_EU → VehicleServiceEvent ingestion (V1 draft)

## Scope

Automatic, idempotent persistence of successful `OE_SERVICE_HISTORY_EU` provider payloads into `VehicleServiceEvent` for vehicle Service & Compliance history display.

## Activation

Set `ONEAUTO_OE_SERVICE_HISTORY_INGESTION_ENABLED=1` or `true` (default **off**). Unknown env values do **not** enable ingestion. Ingestion runs after job `SUCCEEDED` from:

- Full-data callback completion (errors isolated — job stays `SUCCEEDED`)
- Sync HTTP 200 execution path
- E4 failed-callback recovery replay

No provider HTTP in ingestion or backfill paths.

## Schema

Migration: `20261103231000_oneauto_oe_service_history_eu_ingestion` (after `one_auto_provider_jobs`).

- `ServiceEventOrigin.ONEAUTO`
- `VehicleServiceEvent`: `one_auto_provider_job_id`, `external_source_event_key`, `one_auto_vehicle_historical_event_key`, `source_payload_json`
- Unique per job event: `(organization_id, one_auto_provider_job_id, external_source_event_key)`
- Unique cross-job vehicle identity: `(organization_id, vehicle_id, one_auto_vehicle_historical_event_key)` for `ONEAUTO` origin
- `one_auto_oe_service_history_eu_ingestions` audit row per provider job (independent of provider job status)
- `one_auto_oe_service_history_eu_ingestion_event_links` — evidence links per job/source key (`CREATED` | `LINKED_EXISTING`)

## HM/OEM isolation

Imported events use types outside `FULL_SERVICE_BASELINE_EVENT_TYPES` (typically `OIL_CHANGE` / `OTHER`). `hasServiceBaseline` is derived from baseline event types (and vehicle denorm), **not** from `hasServiceHistory`. Ingestion does **not** call `refreshVehicleHistoryDenorm` or touch next-service HM/OEM fields.

Service history UI loads up to 100 recent events; total history remains available via count/pagination path on the service-info API.

## Backfill (non-production during draft)

Prisma-only CLI — does **not** boot `AppModule` (no schedulers/queues).

From repository root:

```bash
cd backend && ONEAUTO_OE_SERVICE_HISTORY_INGESTION_ENABLED=1 \
npx ts-node -r tsconfig-paths/register scripts/ops/oneauto-oe-service-history-eu-backfill.ts \
  --vehicle-id=8c850ff1-4201-432b-af2e-2711dbc7ca48 \
  --org-id=faa710c9-6d91-4079-a7d5-91fdccdec14a \
  --dry-run
```

Dry-run validates persisted provider JSON locally and prints expected provider/import event counts (Arteon: 2 / 2, **0** provider GETs).

Remove `--dry-run` only after owner approval on target environment.

## Rollback

1. Set `ONEAUTO_OE_SERVICE_HISTORY_INGESTION_ENABLED=0`
2. Optional: delete rows where `origin = 'ONEAUTO'` and `one_auto_provider_job_id IS NOT NULL` (scoped by org/vehicle)
3. Drop ingestion audit rows for the same jobs

Raw `OneAutoProviderResponse` rows remain unchanged.
