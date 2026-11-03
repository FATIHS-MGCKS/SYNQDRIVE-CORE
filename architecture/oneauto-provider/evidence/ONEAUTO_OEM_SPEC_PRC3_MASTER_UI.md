# One Auto OEM specification PR-C3 — Master Admin suggestion UI

| Field | Value |
|-------|-------|
| **Operation** | `ONEAUTO_OEM_SPEC_PRC3_MASTER_ADMIN_UI` |
| **Depends on** | PR-C2 read API (#2319), PR-B OEM PATCH (#2314), PR #2320 optimistic concurrency |
| **Feature flag** | `ONEAUTO_OEM_SUGGESTIONS_ENABLED=false` (default OFF) |

## Scope

Master Connected Vehicle drawer — **OEM specifications** section extended with:

1. **Read-only** panel calling `GET /admin/organizations/:orgId/vehicles/:vehicleId/oem-specification-suggestions` (MFA step-up `MASTER_ONEAUTO_PROVIDER_EXECUTE`).
2. Side-by-side canonical vs suggested values with comparison states `MATCH` | `MISSING` | `CONFLICT` | `NOT_COMPARABLE`.
3. Provenance distinction: USER_CONFIRMED chips on canonical rows; suggestion panel never auto-writes.
4. **Per-field apply** reuses existing org vehicle PATCH + `technicalSpecificationSave.confirmedFieldKeys` (PR-B); no bulk accept; NOT_COMPARABLE / code fields not inferred from descriptions.
5. `VEHICLE_OEM_SPEC_SAVE_CONFLICT` → reload canonical + suggestions; explicit dismiss banner.

## UI states

| State | UX |
|-------|-----|
| Flag off | Informational copy (no provider call side effects) |
| MFA required | Localized message; global step-up event may fire from API 403 |
| Access denied | Tenant/access message |
| Load error | Retry |
| Empty snapshots | No active snapshot copy |
| Save conflict | Warning + dismiss; data refreshed |

## Security

- Safe DTO only (no raw VIN, `responseBodyJson`, provider secrets) — enforced server-side `assertSafeOemSuggestionListDto`.
- No new provider execution paths in UI.

## Tests

- `connected-vehicle-oem-suggestions.util.test.ts`
- `ConnectedVehicleOemSpecificationsSection.suggestions.test.tsx`
- Existing OEM util/save tests unchanged

## i18n

- New keys under `master.cv.oemSpecs.suggestions.*` in all 9 product locales (`master.cv.oemSpecs.*.ts`).
