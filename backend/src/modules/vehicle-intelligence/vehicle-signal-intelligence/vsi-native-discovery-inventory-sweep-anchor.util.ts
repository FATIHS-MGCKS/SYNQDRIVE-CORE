import type { PrismaClient } from '@prisma/client';

export type VsiNativeDiscoveryInventorySweepOutboxAnchor = {
  organizationId: string;
  vehicleId: string;
};

/**
 * Outbox rows require a tenant-scoped vehicle FK. The sweep itself is fleet-wide;
 * this anchor is only a valid (organizationId, vehicleId) carrier — not the sweep scope.
 * Skips organizations with no ACTIVE registry vehicles (empty or inactive-only orgs).
 */
export async function resolveNativeDiscoveryInventorySweepOutboxAnchor(
  prisma: PrismaClient,
): Promise<VsiNativeDiscoveryInventorySweepOutboxAnchor | null> {
  const vehicle = await prisma.vehicle.findFirst({
    where: { registryLifecycle: 'ACTIVE' },
    orderBy: [{ organizationId: 'asc' }, { id: 'asc' }],
    select: { id: true, organizationId: true },
  });
  if (!vehicle) {
    return null;
  }
  return { organizationId: vehicle.organizationId, vehicleId: vehicle.id };
}
