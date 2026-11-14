# P3-PR11B — Core App product-bound vehicle identity read (non-normative)

## API

- `GET /api/v1/core/app/read/v1/organizations/:orgId/products/:productSlug/vehicles`
- `GET /api/v1/core/app/read/v1/organizations/:orgId/products/:productSlug/vehicles/:vehicleId`

## Principal policy

- **M2M only** (`core_app_service`, scope `core:app:vehicle:read`).
- Product identity from verified `CoreAppServicePrincipal.productSlug`; path `productSlug` must match (403 otherwise).
- User JWT **rejected** (403).
- Vehicle scope via `ProductVehicleAccessService` (ACTIVE license, mode, grants, lifecycle).

## Exposure gate

Routes registered only when **both**:

- `CORE_APP_M2M_ENABLED=true`
- `CORE_APP_VEHICLE_READ_V1_ENABLED=true`

Default: **off**. Do not enable in production without deployment gate checklist below.

## Deployment gate (before production enable)

1. Distributed rate-limit readiness on M2M exchange and read paths.
2. M2M token revocation / credential & grant version recheck operational.
3. Per-client `allowedScopes` includes `core:app:vehicle:read` only where intended (not auto-granted).
4. `CoreAppServiceOrgGrant` + `OrganizationProduct` ACTIVE for each app×org×product.
5. Production flag parity reviewed (both flags explicit).
6. Consumer apps routed away from legacy org vehicle list and `core/read/v1`.
7. Private end-user **user-to-vehicle** binding still required for consumer launch (out of PR11B).

## Out of scope

Module intelligence reads, legacy hardening, VYMOD slug migration, user-to-vehicle binding, module capability tables.