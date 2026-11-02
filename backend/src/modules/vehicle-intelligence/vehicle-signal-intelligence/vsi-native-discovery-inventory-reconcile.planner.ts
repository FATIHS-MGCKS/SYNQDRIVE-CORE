import type { PrismaClient } from '@prisma/client';
import { isVsiDiscoveryInventoryReconcileEnabled } from './vsi-discovery-inventory-reconcile.config';
import { probeNativeDiscoveryInventoryColumnAvailable } from './vsi-native-discovery-inventory-schema.guard';
import {
  assessNativeDiscoveryInventoryReconcileNeed,
  type VsiNativeDiscoveryInventoryReconcileAssessment,
} from './vsi-native-discovery-inventory-reconcile.evaluation';
import { VSI_DISCOVERY_INVENTORY_RECONCILE_MAX_LINKS_PER_SWEEP } from './vsi-profile-lifecycle.constants';

export type VsiNativeDiscoveryInventoryReconcileCandidate = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  assessment: VsiNativeDiscoveryInventoryReconcileAssessment;
  profileUpdatedAt: Date;
};

export type VsiNativeDiscoveryInventorySweepCursor = {
  organizationId: string;
  providerSourceLinkId: string;
} | null;

export async function planNativeDiscoveryInventoryReconcileSweep(input: {
  prisma: PrismaClient;
  cursor?: VsiNativeDiscoveryInventorySweepCursor;
  maxLinks?: number;
}): Promise<{
  candidates: VsiNativeDiscoveryInventoryReconcileCandidate[];
  nextCursor: VsiNativeDiscoveryInventorySweepCursor;
  schemaAvailable: boolean;
}> {
  if (!isVsiDiscoveryInventoryReconcileEnabled()) {
    return { candidates: [], nextCursor: null, schemaAvailable: false };
  }

  const schemaAvailable = await probeNativeDiscoveryInventoryColumnAvailable(input.prisma);
  if (!schemaAvailable) {
    return { candidates: [], nextCursor: null, schemaAvailable: false };
  }

  const max = input.maxLinks ?? VSI_DISCOVERY_INVENTORY_RECONCILE_MAX_LINKS_PER_SWEEP;
  const cursor = input.cursor ?? null;

  const links = await input.prisma.vehicleDataSourceLink.findMany({
    where: {
      isActive: true,
      vehicle: { registryLifecycle: 'ACTIVE' },
      ...(cursor
        ? {
            OR: [
              { vehicle: { organizationId: { gt: cursor.organizationId } } },
              {
                vehicle: { organizationId: cursor.organizationId },
                id: { gt: cursor.providerSourceLinkId },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ vehicle: { organizationId: 'asc' } }, { id: 'asc' }],
    take: max,
    select: {
      id: true,
      vehicleId: true,
      vehicle: { select: { organizationId: true } },
    },
  });

  const candidates: VsiNativeDiscoveryInventoryReconcileCandidate[] = [];
  let lastScanned: { organizationId: string; providerSourceLinkId: string } | null = null;

  for (const link of links) {
    lastScanned = {
      organizationId: link.vehicle.organizationId,
      providerSourceLinkId: link.id,
    };
    const profile = await input.prisma.vehicleSignalCapabilityProfile.findUnique({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId: link.vehicle.organizationId,
          vehicleId: link.vehicleId,
          providerSourceLinkId: link.id,
        },
      },
      select: {
        organizationId: true,
        vehicleId: true,
        providerSourceLinkId: true,
        providerIdentity: true,
        evaluatedAt: true,
        updatedAt: true,
        lastMaterializedSourceTimestamp: true,
        nativeSignalDiscoveryInventory: true,
      },
    });
    if (!profile) {
      continue;
    }
    const assessment = assessNativeDiscoveryInventoryReconcileNeed(profile);
    if (!assessment.needsReconcile) {
      continue;
    }
    candidates.push({
      organizationId: profile.organizationId,
      vehicleId: profile.vehicleId,
      providerSourceLinkId: profile.providerSourceLinkId,
      assessment,
      profileUpdatedAt: profile.updatedAt,
    });
  }

  const nextCursor =
    lastScanned && links.length >= max
      ? {
          organizationId: lastScanned.organizationId,
          providerSourceLinkId: lastScanned.providerSourceLinkId,
        }
      : null;

  return { candidates, nextCursor, schemaAvailable };
}
