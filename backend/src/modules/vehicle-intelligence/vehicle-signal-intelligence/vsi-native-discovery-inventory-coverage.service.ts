import type { PrismaClient } from '@prisma/client';
import { isVsiDiscoveryInventoryReconcileEnabled } from './vsi-discovery-inventory-reconcile.config';
import { isVsiDiscoveryHfInventoryEnabled } from './vsi-discovery-hf-inventory.config';
import { isVsiDiscoverySnapshotInventoryEnabled } from './vsi-discovery-snapshot-inventory.config';
import { probeNativeDiscoveryInventoryColumnAvailable } from './vsi-native-discovery-inventory-schema.guard';
import {
  assessNativeDiscoveryInventoryReconcileNeed,
  type VsiNativeDiscoveryInventoryReconcileAssessment,
} from './vsi-native-discovery-inventory-reconcile.evaluation';
import { VsiProfileLifecycleOutboxStatus } from '@prisma/client';

export type VsiNativeDiscoveryInventoryCoverageSnapshotV1 = {
  contractVersion: 'vsi-native-discovery-inventory-coverage-v1';
  generatedAt: string;
  reconcileFeatureEnabled: boolean;
  snapshotAxisFeatureEnabled: boolean;
  hfAxisFeatureEnabled: boolean;
  inventorySchemaAvailable: boolean;
  eligibleActiveLinkProfiles: number;
  inventoryPresent: number;
  inventoryMissing: number;
  inventoryStale: number;
  snapshotAxisEvaluated: number;
  hfAxisEvaluated: number;
  attributionAmbiguous: number;
  reconciliationPending: number;
  reconciliationFailed: number;
  lastSuccessfulInventoryRefreshAt: string | null;
};

function emptyCoverage(generatedAt: Date): VsiNativeDiscoveryInventoryCoverageSnapshotV1 {
  return {
    contractVersion: 'vsi-native-discovery-inventory-coverage-v1',
    generatedAt: generatedAt.toISOString(),
    reconcileFeatureEnabled: isVsiDiscoveryInventoryReconcileEnabled(),
    snapshotAxisFeatureEnabled: isVsiDiscoverySnapshotInventoryEnabled(),
    hfAxisFeatureEnabled: isVsiDiscoveryHfInventoryEnabled(),
    inventorySchemaAvailable: false,
    eligibleActiveLinkProfiles: 0,
    inventoryPresent: 0,
    inventoryMissing: 0,
    inventoryStale: 0,
    snapshotAxisEvaluated: 0,
    hfAxisEvaluated: 0,
    attributionAmbiguous: 0,
    reconciliationPending: 0,
    reconciliationFailed: 0,
    lastSuccessfulInventoryRefreshAt: null,
  };
}

/**
 * Read-only bounded coverage snapshot for operators (does not claim eligibility as coverage).
 */
export async function buildNativeDiscoveryInventoryCoverageSnapshot(
  prisma: PrismaClient,
  input?: { maxProfiles?: number },
): Promise<VsiNativeDiscoveryInventoryCoverageSnapshotV1> {
  const now = new Date();
  const maxProfiles = input?.maxProfiles ?? 500;
  const schemaAvailable = await probeNativeDiscoveryInventoryColumnAvailable(prisma);
  if (!schemaAvailable) {
    return emptyCoverage(now);
  }

  const profiles = await prisma.vehicleSignalCapabilityProfile.findMany({
    where: {
      vehicle: { registryLifecycle: 'ACTIVE' },
    },
    orderBy: [{ organizationId: 'asc' }, { vehicleId: 'asc' }],
    take: maxProfiles,
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

  const activeLinkKeys = new Set(
    (
      await prisma.vehicleDataSourceLink.findMany({
        where: { isActive: true, vehicle: { registryLifecycle: 'ACTIVE' } },
        select: { id: true, vehicleId: true, vehicle: { select: { organizationId: true } } },
        take: maxProfiles * 2,
      })
    ).map((l) => `${l.vehicle.organizationId}:${l.vehicleId}:${l.id}`),
  );

  let eligibleActiveLinkProfiles = 0;
  let inventoryPresent = 0;
  let inventoryMissing = 0;
  let inventoryStale = 0;
  let snapshotAxisEvaluated = 0;
  let hfAxisEvaluated = 0;
  let attributionAmbiguous = 0;
  let lastSuccessfulInventoryRefreshAt: Date | null = null;

  for (const profile of profiles) {
    const scopeKey = `${profile.organizationId}:${profile.vehicleId}:${profile.providerSourceLinkId}`;
    if (!activeLinkKeys.has(scopeKey)) {
      continue;
    }
    eligibleActiveLinkProfiles += 1;
    const assessment = assessNativeDiscoveryInventoryReconcileNeed(profile);
    if (assessment.missingInventory) {
      inventoryMissing += 1;
    } else {
      inventoryPresent += 1;
    }
    if (assessment.staleInventory) {
      inventoryStale += 1;
    }
    if (
      isVsiDiscoverySnapshotInventoryEnabled() &&
      !assessment.missingInventory &&
      !assessment.snapshotAxisNeedsRefresh
    ) {
      snapshotAxisEvaluated += 1;
    }
    if (
      isVsiDiscoveryHfInventoryEnabled() &&
      !assessment.missingInventory &&
      !assessment.hfAxisNeedsRefresh
    ) {
      hfAxisEvaluated += 1;
    }
    if (assessment.attributionAmbiguous) {
      attributionAmbiguous += 1;
    }
    if (!assessment.missingInventory) {
      const inv = profile.nativeSignalDiscoveryInventory as { evaluatedAt?: string };
      const ts = inv?.evaluatedAt ? Date.parse(inv.evaluatedAt) : NaN;
      if (Number.isFinite(ts)) {
        const d = new Date(ts);
        if (!lastSuccessfulInventoryRefreshAt || d > lastSuccessfulInventoryRefreshAt) {
          lastSuccessfulInventoryRefreshAt = d;
        }
      }
    }
  }

  const [reconciliationPending, reconciliationFailed] = await Promise.all([
    prisma.vsiProfileLifecycleOutbox.count({
      where: {
        eventType: { in: ['NATIVE_DISCOVERY_INVENTORY_RECONCILE', 'NATIVE_DISCOVERY_INVENTORY_SWEEP'] },
        status: { in: [VsiProfileLifecycleOutboxStatus.PENDING, VsiProfileLifecycleOutboxStatus.PROCESSING] },
      },
    }),
    prisma.vsiProfileLifecycleOutbox.count({
      where: {
        eventType: { in: ['NATIVE_DISCOVERY_INVENTORY_RECONCILE', 'NATIVE_DISCOVERY_INVENTORY_SWEEP'] },
        status: VsiProfileLifecycleOutboxStatus.FAILED,
      },
    }),
  ]);

  return {
    contractVersion: 'vsi-native-discovery-inventory-coverage-v1',
    generatedAt: now.toISOString(),
    reconcileFeatureEnabled: isVsiDiscoveryInventoryReconcileEnabled(),
    snapshotAxisFeatureEnabled: isVsiDiscoverySnapshotInventoryEnabled(),
    hfAxisFeatureEnabled: isVsiDiscoveryHfInventoryEnabled(),
    inventorySchemaAvailable: true,
    eligibleActiveLinkProfiles,
    inventoryPresent,
    inventoryMissing,
    inventoryStale,
    snapshotAxisEvaluated,
    hfAxisEvaluated,
    attributionAmbiguous,
    reconciliationPending,
    reconciliationFailed,
    lastSuccessfulInventoryRefreshAt: lastSuccessfulInventoryRefreshAt?.toISOString() ?? null,
  };
}
