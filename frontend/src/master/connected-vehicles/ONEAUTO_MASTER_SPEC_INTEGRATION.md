# Master Admin — One Auto API (future integration contract)

**Status:** Reserved for a later PR. No backend client, no paid calls, no production button in this phase.

## UI placement (canonical)

Adjacent to existing specification actions in `VehicleRegistrationModal`:

- Container: `data-testid="vehicle-registration-spec-actions"`
- Existing: `data-testid="vehicle-registration-fetch-ai-specs"` (unchanged)
- Existing: `data-testid="vehicle-registration-upload-zb1"` (ZB-I upload)
- Future: **One Auto API** button on the same flex row (`data-testid="vehicle-registration-oneauto-api"`) opens `OneAutoServiceDialog` (P2).

## Intended flow (future)

1. Operator opens vehicle specification edit (Connected Vehicles → edit specifications).
2. Clicks **One Auto API** (future control beside ZB-I upload).
3. Service catalog modal (OE Service History EU, OE Service Schedule, OE Build Decode, OE Build Sheet EU, OE VIN Lookup EU, Recall Check, …).
4. Show list price from configured tariff table; explicit confirm before any outbound request.
5. Backend-only `x-api-key`; async jobs + webhook/poll per provider semantics.
6. Result preview → selective import into **existing** models:
   - `VehicleServiceEvent` (+ provenance external provider id)
   - Manufacturer service interval fields on vehicle registration payload
   - Motion physics / identity only via existing registration-identity-review APIs
7. Never auto-overwrite user-confirmed values; duplicate detection by provider fingerprint + date/mileage.

## RBAC

- `MASTER_ADMIN` + org-scoped vehicle binding; reuse fleet-condition / fleet write patterns from registration identity review.
- Per-org daily spend cap (future config).
