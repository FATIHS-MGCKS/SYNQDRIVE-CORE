# One Auto OEM specification PR-B — Master Admin API + UI (2026-11-02)

| Field | Value |
|-------|-------|
| **Depends on** | PR #2313 merged (`20261102160000_vehicle_oem_specification_identity_pra`) |
| **Master GET** | `GET /admin/vehicles/:vehicleId` → `mapToRegisteredVehicle` exposes ten nullable OEM fields + `registrationIdentityProvenance` |
| **Master PATCH** | Existing org-scoped `PATCH …/vehicles/:vehicleId` + `technicalSpecificationSave.confirmedFieldKeys` for OEM keys |
| **Runtime writes** | Gated on migration applied in target environment; no provider / One Auto auto-apply |

## Backend

- `vehicle-oem-specification-patch.util.ts` — explicit confirmation, `USER_CONFIRMED` provenance, max-length validation, protected-field blocks, v1→v2 in-memory upgrade on OEM save (P3 fields preserved).
- `vehicles.service.update` — chains technical then OEM patch; strips OEM keys from generic Prisma body; optimistic concurrency when protected OEM correction.

## Frontend

- Connected Vehicle detail: **OEM specifications** section with per-field edit + confirmation checkbox.
- Save uses `api.vehicles.update` with `technicalSpecificationSave.confirmedFieldKeys`.

## Safety (unchanged)

- Master Admin auth + tenant scope on PATCH.
- No changes to `Vehicle.color`, `TransmissionType`, or provider import paths.
- No fabricated defaults for nullable OEM columns.

## Tests

- `vehicle-oem-specification-patch.util.spec.ts` — legacy v1 provenance + protected USER_CONFIRMED regression.
- Frontend util + save helper unit tests.
