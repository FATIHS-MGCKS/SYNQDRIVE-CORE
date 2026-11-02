# One Auto OEM specification PR-B — Master Admin API + UI (2026-11-02)

| Field | Value |
|-------|-------|
| **Depends on** | PR #2313 merged (`20261102160000_vehicle_oem_specification_identity_pra`) |
| **Master GET** | `GET /admin/vehicles/:vehicleId` → `mapToRegisteredVehicle` exposes ten nullable OEM fields + `registrationIdentityProvenance` |
| **Master PATCH** | `PATCH …/vehicles/:vehicleId` — `OrgScopingGuard`, `@RequirePermission('fleet','write')`; **OEM keys require `actorPlatformRole === MASTER_ADMIN`** in `VehiclesService.update` (technical specs unchanged for org fleet.write) |
| **Optimistic concurrency** | **All** non-empty OEM patches use conditional `updateMany` on `id` + `updatedAt` (+ org when scoped); stale → `VEHICLE_OEM_SPEC_SAVE_CONFLICT` |

## Backend

- `vehicle-oem-specification-patch.util.ts` — explicit confirmation, `USER_CONFIRMED` provenance, max-length validation, protected-field blocks, v1→v2 in-memory upgrade on OEM save (P3 fields preserved).
- `vehicles.service.update` — chains technical then OEM patch; strips OEM keys from generic Prisma body; **Master Admin gate for OEM bodies**; **optimistic concurrency for every OEM write** (`VEHICLE_OEM_SPEC_SAVE_CONFLICT`).

## Frontend

- Connected Vehicle detail: **OEM specifications** section with per-field edit + confirmation checkbox.
- Save uses `api.vehicles.update` with `technicalSpecificationSave.confirmedFieldKeys`.

## Safety (unchanged)

- Master Admin auth + tenant scope on PATCH.
- No changes to `Vehicle.color`, `TransmissionType`, or provider import paths.
- No fabricated defaults for nullable OEM columns.

## Tests

- `vehicle-oem-specification-patch.util.spec.ts` — legacy v1 provenance + protected USER_CONFIRMED regression.
- `vehicle-oem-specification-patch.security.spec.ts` — controller actor forwarding + Master gate negative.
- `vehicles.service.oem-update.spec.ts` — stale optimistic rejection (unit).
- `vehicle-oem-specification-patch.postgres.integration.spec.ts` — auth + concurrent OEM writes (`VEHICLE_OEM_SPEC_PATCH_PG=1`); Vehicle Detail CI via `scripts/test/vehicle-oem-spec-patch-postgres-ci.sh` (6 tests, disposable DB).
- **i18n governance:** `hardcoded-copy-inventory.json` updates belong in a separate authority-only PR (merge after this PR) to avoid `MIXED_GOVERNANCE_AUTHORITY_AND_PRODUCT_CHANGE`.
- Frontend util + save helper unit tests.
