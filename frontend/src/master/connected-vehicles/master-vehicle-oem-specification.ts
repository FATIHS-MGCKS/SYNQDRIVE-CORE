import { api } from '../../lib/api';
import {
  buildOemFieldSavePatch,
  type OemSpecificationFieldKey,
} from './connected-vehicle-oem-specifications.util';

export async function saveMasterVehicleOemSpecificationField(input: {
  organizationId: string;
  vehicleId: string;
  fieldKey: OemSpecificationFieldKey;
  value: string | null;
  userConfirmed: boolean;
}): Promise<void> {
  const orgId = input.organizationId.trim();
  const vehicleId = input.vehicleId.trim();
  if (!orgId || !vehicleId) throw new Error('ORG_VEHICLE_REQUIRED');

  const normalized =
    input.value == null || String(input.value).trim() === '' ? null : String(input.value).trim();

  const patch = buildOemFieldSavePatch(input.fieldKey, normalized, input.userConfirmed);
  await api.vehicles.update(orgId, vehicleId, patch);
}
