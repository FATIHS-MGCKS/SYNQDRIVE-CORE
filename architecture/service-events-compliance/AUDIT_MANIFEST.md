# Service Events & Compliance — Audit Manifest

| Field | Value |
|-------|-------|
| MODULE | Service Events & Compliance |
| MODULE_SLUG | `service-events-compliance` |
| AUDIT_STARTED_AT | 2026-11-08T12:00Z |
| AUDIT_COMPLETED_AT | IN_PROGRESS |
| REGISTRY_STATUS_AT_START | `NOT_STARTED` |
| REGISTRY_STATUS_AT_END | `AUDIT_IN_PROGRESS` |
| REPOSITORY | `FATIHS-MGCKS/SYNQDRIVE-alpha` |
| REPO_BASE_BRANCH | `main` |
| ORIGIN_MAIN_SHA | `233bbcb4cae395fdbf66b4b7e0ad51e8067a8a74` |
| AUDIT_BRANCH_SHA | `cursor/service-info-v2-maintenance-intelligence-238e` (see change ledger for head) |
| PRODUCTION_AUDITED_AT | 2026-11-08T12:31Z – 12:33Z |
| PRODUCTION_ACCESS | `VERIFIED_READ_ONLY` (bounded `SELECT` counts/shape only; see [`evidence/PRODUCTION_BASELINE.md`](evidence/PRODUCTION_BASELINE.md)) |
| PRODUCTION_RELEASE_SHA | `dbf5d91b7687fb88197a54ac29baf68d7fc1a5ab` |
| PRODUCTION_RELEASE_PATH | `/opt/synqdrive/releases/20261108000410_v4994` |
| REPO_PRODUCTION_DRIFT | `origin/main 233bbcb4c` is ahead of deployed `dbf5d91b7` (monitoring refresh script fix #2362 and intermediate commits); no service-compliance code differences claimed — not diffed file-by-file |
| RUNTIME_FOOTPRINT | Backend (NestJS services, controller endpoints), frontend (Rental Health UI), DB (`vehicle_service_events`, `vehicles` denormalized fields, reads `one_auto_provider_*`, `vehicle_latest_state`), no own queue/worker; consumed by Rental Health, insights detectors, notifications, vehicle file, AI health tool |
| AUDIT_MODE | `READ_ONLY` |
| VALIDATION_STATUS | Central registry validator run in this PR; module graph validator **not yet created** |
| REMAINING_LIMITATIONS | Full Phase 1 audit of TÜV/BOKraft inspection apply, brake/battery side effects of service events, and all insight/notification consumers deferred; graph/*.yaml, KNOWLEDGE_GRAPH, EVIDENCE_INDEX, OPEN_CONTRADICTIONS, FAILED_APPROACHES, OPEN_HYPOTHESES, OPEN_QUESTIONS, scripts not yet created |

## Audit-coverage matrix

| Surface | Inspected | Evidence | Result | Limitation |
|---------|-----------|----------|--------|------------|
| `service-compliance.service.ts` (`evaluateNextService`, `buildServiceInfoStatus`, `toRentalModuleHealth`) | yes | code read 2026-11-08 | HM-only next service; interval fields marked deprecated; history never resets next service | — |
| `service-compliance.types.ts`, `service-compliance-operational.signals.ts`, `service-overdue-task.util.ts/.service.ts`, `compliance-task-materialize.service.ts`, `compliance-display.mapper.ts`, `rental-blocking.policy.ts` | yes | code read | Task signals derived only from `TRACKED` HM evaluation; auto-materialization gated by `suggestionOnly` + org automation rule + dedupe key `service_overdue:<vehicleId>` | — |
| `service-events.service.ts`, constants, DTOs | yes | code read | Manual create/update/delete; `createFromDocumentExtraction` idempotent on `(organizationId, documentExtractionId)`; denorm refresh only FULL_SERVICE/GENERAL_INSPECTION (lastService*) and OIL_CHANGE (lastOilChange*) | — |
| Document extraction service rules + executor | yes | code read | SERVICE→FULL_SERVICE, OIL_CHANGE→OIL_CHANGE; apply gate requires confirmed event date; confirm-before-apply flow via action plan | extraction prompt/schema internals not audited |
| OneAuto `OE_SERVICE_SCHEDULE` parser, types, fixtures, documented contract | yes | code read + OpenAPI evidence `docs/provider-evidence/oneauto-six-sku-openapi-evidence.json` | Raw JSON stored in `OneAutoProviderResponse.responseBodyJson` (callback phase); `service_kms`/`service_months` are interval fields; OpenAPI describes `service_kms` as "Service interval in kilometres" | semantics confirmed by stored Production payload text (see decision register) |
| OneAuto `OE_SERVICE_HISTORY_EU` event mapper | yes | code read | Heuristic `classifyEventType` (oil/brake/repair keyword → else OTHER); `service_actions` preserved in `sourcePayloadJson` | — |
| HM `HmSignalUsageService.getServiceInfoSignals/isHmHealthActive` | yes | code read | distance/time to next service from HM SERVICE group cache; freshness 7 days enforced in compliance service | HM ingestion not audited |
| Odometer sources | yes | schema read | `VehicleLatestState.odometerKm/lastSeenAt/source`; `Vehicle.mileageKm` has no timestamp | — |
| Frontend consumers of `ServiceInfoStatus` | yes | grep + read | `service-info-display.ts` (hardcoded German HM-only copy), `HealthErrorsView` card+modal, `VehicleHealthBox` grid, `HealthVehicleDetailPanel`, `FleetConditionDetailView`, `vehicle-insights-logic` | not all consumers re-rendered in this PR |
| Production DB (bounded) | yes (read-only) | [`evidence/PRODUCTION_BASELINE.md`](evidence/PRODUCTION_BASELINE.md) | 11 service events (10 ONEAUTO), 1 SUCCEEDED `OE_SERVICE_SCHEDULE` job, 0 active HM_HEALTH links → every Production vehicle currently shows "No Tracking" | no PM2/log inspection; no per-tenant data |
