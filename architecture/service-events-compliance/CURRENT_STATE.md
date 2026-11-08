# Service Events & Compliance — Current State

**Registry coverage status:** `AUDIT_IN_PROGRESS`  
**Last verified (repository):** 2026-11-08  
**Production:** read-only baseline in `evidence/PRODUCTION_BASELINE.md` — no deploy or runtime mutation in this workstream.

## Scope

Provider-agnostic **Service Info V2**: deterministic maintenance forecast and provenance for the rental **Service Info Box**, built on existing `ServiceComplianceService`, `VehicleServiceEvent`, stored OneAuto schedule jobs, HM OEM signals (optional), and manual intervals — without new paid provider calls.

## Repository behavior (this branch)

### Backend

- Pure engine: `backend/src/modules/vehicle-intelligence/service-compliance/maintenance-forecast/` (`computeMaintenanceForecast`, calendar math, OneAuto/manual adapters, coverage rules).
- `MaintenanceForecastService.computeForVehicle` loads vehicle, events (≤200), odometer (`VehicleLatestState` → vehicle master), read-only succeeded `OE_SERVICE_SCHEDULE` job for VIN.
- `ServiceComplianceService` delegates `evaluateNextServiceDetailed`; headline source `ServiceNextSource`: `HM_OEM` | `COMPUTED_ONEAUTO_SCHEDULE` | `COMPUTED_MANUAL_INTERVAL`; optional `maintenanceForecast` on `ServiceInfoStatus`.
- Task bridge: only `HM_OEM` auto-materializable (`isAutoMaterializableServiceSource`); computed forecasts → `suggestionOnly`.
- Manual / OCR structured payload: `performedWork`, `serviceKind` on create/update and document apply; duplicate guard `SERVICE_EVENT_DUPLICATE` (409) with `allowDuplicate` escape hatch.
- Config: `MAINTENANCE_ODOMETER_STALE_DAYS`, `MAINTENANCE_CONFLICT_KM_TOLERANCE`, `MAINTENANCE_CONFLICT_DAYS_TOLERANCE`.

### Frontend

- `service-info-display.ts`: locale-aware `buildNextServiceDisplay` (no HM-only “no tracking” copy); `health.serviceInfo.v2.*` keys (9 locales).
- `ServiceMaintenanceForecastPanel` + `ManualServiceEntryDialog` / `ServiceIntervalsDialog` in Health modal and health detail service tab; upload reuses document intake.
- `VehicleHealthBox` compliance tile uses forecast display metadata.
- API types extended in `frontend/src/lib/api.ts`.

### Explicit non-goals (preserved)

- No automatic OneAuto schedule/history **requests** or provider activations.
- No production deploy or VPS changes in this PR.
- TÜV/BOKraft paths unchanged; service history list semantics preserved.

## Validation

```bash
cd backend && npx jest maintenance-forecast service-compliance.service service-events.service document-service-extraction
cd frontend && npx tsc --noEmit && npm run i18n:check:ci
bash architecture/scripts/validate-module-registry.sh
```

## Open gaps (see `contradictions/KNOWLEDGE_GAPS.md`)

- OE schedule **extra** positions: component vocabulary coverage incomplete without more Production schedule shape samples.
- HM OEM freshness vs computed headline: conflict surfacing implemented; operator policy for “which wins” beyond display is not productized.
- Manual intervals dialog does not yet preload oil-change intervals from vehicle GET (uses service-info interval fields for inspection only).
