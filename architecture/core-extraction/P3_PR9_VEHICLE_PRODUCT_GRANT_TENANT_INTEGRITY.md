# P3-PR9 — Vehicle product grant tenant integrity (non-normative)

## Application invariants (enforced in `VehicleProductGrantService`)

- Grant mutations require `vehicle.organizationId === route organizationId`.
- New grants require `registryLifecycle = ACTIVE`.
- Reads (`hasActiveGrant`, list) join vehicle org + eligible lifecycle.
- Organization product must be `ACTIVE` before grant/re-grant.

## Database gaps (foundation PR)

- `vehicle_product_grants.organization_id` is not composite-FK-linked to `(vehicles.id, vehicles.organization_id)` because `vehicles` has no matching composite unique key.
- No cross-table CHECK or trigger (explicitly out of scope for P3-PR9).

## Required gates before consumer read enforcement (follow-up)

1. **Offboarding:** revoke or invalidate grants when `registryLifecycle` leaves `ACTIVE`.
2. **Org transfer:** revoke or rewrite grants when canonical `Vehicle.organizationId` changes.
3. **License suspension:** future read path must deny on inactive `OrganizationProduct` even if grant row is `ACTIVE`.
4. **Assignment mode:** `OrganizationProduct` per-org access mode (`ORGANIZATION_WIDE` | `SELECTED_VEHICLES`) — not implemented in P3-PR9; do not treat ProductSlug maps as authoritative.