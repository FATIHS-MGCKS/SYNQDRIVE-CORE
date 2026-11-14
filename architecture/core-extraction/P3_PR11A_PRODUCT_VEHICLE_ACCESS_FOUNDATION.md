# P3-PR11A — Product vehicle access foundation (non-normative)

## Scope

Canonical evaluator: `ProductVehicleAccessService` (`resolveProductVehicleAccess`, `getAuthorizedVehicleWhere`, `assertVehicleAuthorized`).

Uses existing authorities only:
- `OrganizationProduct` (ACTIVE license + `vehicleAccessMode`)
- `VehicleProductGrant` (SELECTED_VEHICLES only)
- `Vehicle.organizationId` + `registryLifecycle` (ACTIVE eligible)

## Server-authoritative license context

- Authorization context is **server-authoritative** only.
- Public methods resolve license state from the database (`OrganizationProduct` with `status === ACTIVE`).
- **No caller-supplied entitlement context** — `ResolvedProductVehicleAccess` is an internal type; it is not accepted as proof of entitlement on public APIs.
- Future request-level caching of resolved access requires a **separate reviewed authority and invalidation contract** before any cache is introduced.

## Foundation only — consumer rollout blocked until

1. Legacy read-route bypass (`vehicles/*`, `vehicle-intelligence/*`) is gated or consumer apps are confined to enforced surfaces.
2. `core.read.v1` controllers adopt `ProductVehicleAccessService`.
3. App principal / user-to-vehicle binding for private consumer apps.
4. VYMOD `ProductSlug` registration.
5. Module capability enforcement (separate authority).