# P3-PR11A — Product vehicle access foundation (non-normative)

## Scope

Canonical evaluator: `ProductVehicleAccessService` (`resolveProductVehicleAccess`, `buildAuthorizedVehicleWhere`, `assertVehicleAuthorized`).

Uses existing authorities only:
- `OrganizationProduct` (ACTIVE license + `vehicleAccessMode`)
- `VehicleProductGrant` (SELECTED_VEHICLES only)
- `Vehicle.organizationId` + `registryLifecycle` (ACTIVE eligible)

## Foundation only — consumer rollout blocked until

1. Legacy read-route bypass (`vehicles/*`, `vehicle-intelligence/*`) is gated or consumer apps are confined to enforced surfaces.
2. `core.read.v1` controllers adopt `ProductVehicleAccessService`.
3. App principal / user-to-vehicle binding for private consumer apps.
4. VYMOD `ProductSlug` registration.
5. Module capability enforcement (separate authority).