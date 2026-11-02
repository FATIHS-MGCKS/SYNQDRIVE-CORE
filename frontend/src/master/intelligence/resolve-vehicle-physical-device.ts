import { api } from '../../lib/api';

/**
 * Resolves the installed physical device for a vehicle using existing PDI list reads.
 * Returns null when none or ambiguous without a single INSTALLED match.
 */
export async function resolvePhysicalDeviceIdForVehicle(
  organizationId: string,
  vehicleId: string,
): Promise<string | null> {
  try {
    const res = await api.admin.physicalDeviceInventory.listDevices({
      ownerOrganizationId: organizationId,
      limit: 100,
    });
    const installed = res.items.filter(
      (d) => d.currentVehicleId === vehicleId && d.status === 'INSTALLED',
    );
    if (installed.length !== 1) return null;
    return installed[0]!.id;
  } catch {
    return null;
  }
}
