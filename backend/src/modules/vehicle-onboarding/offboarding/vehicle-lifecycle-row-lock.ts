import type { Prisma, VehicleRegistryLifecycle } from '@prisma/client';

/**
 * Serializes registry lifecycle and link mutations with FSD runs that reference `vehicles` via FK.
 * `FOR NO KEY UPDATE` blocks concurrent lifecycle UPDATE on the row but allows `KEY SHARE`
 * for `fsd_discovery_runs` inserts — avoids 40P01 cycles with FSD advisory-lock + FK paths.
 */
export async function lockVehicleRowForLifecycleMutation(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; vehicleId: string },
): Promise<VehicleRegistryLifecycle> {
  const lockedRows = await tx.$queryRaw<Array<{ registry_lifecycle: VehicleRegistryLifecycle }>>`
    SELECT registry_lifecycle
    FROM vehicles
    WHERE id = ${input.vehicleId}
      AND organization_id = ${input.organizationId}
    FOR NO KEY UPDATE
  `;
  if (lockedRows.length === 0) {
    throw new Error('VEHICLE_SCOPE_NOT_FOUND');
  }
  return lockedRows[0]!.registry_lifecycle;
}
