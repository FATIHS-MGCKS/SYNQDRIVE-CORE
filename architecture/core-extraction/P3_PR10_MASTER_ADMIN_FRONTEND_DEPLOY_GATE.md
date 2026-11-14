# P3-PR10 — Master Admin frontend deploy gate (non-normative)

Before deploying backend P3-PR10 to an environment used by Master Admin product assignment UI:

1. **`POST /admin/products/assign`** must send **`vehicleAccessMode`** (`ORGANIZATION_WIDE` | `SELECTED_VEHICLES`) on every new assignment.
2. Re-assignments must send the **current** mode unchanged, or use only plan/status updates until the UI supports mode display.
3. **Vehicle access mode changes** must use **`PATCH /admin/products/org/:orgId/:productSlug/vehicle-access-mode`** with `vehicleAccessMode` and `ifCurrentVehicleAccessMode` (optimistic concurrency).
4. All assignment mutations require **Master Admin MFA step-up** (`MASTER_ORGANIZATION`); legacy assign UI without step-up will receive **403** when IAM MFA flags are enforced.
5. License removal (`DELETE`) does not delete `VehicleProductGrant` rows; grants are **dormant** until explicit cleanup or future enforcement.

Backend may ship before frontend only when Master Admin assignment is not used in that environment, or the UI is updated first.