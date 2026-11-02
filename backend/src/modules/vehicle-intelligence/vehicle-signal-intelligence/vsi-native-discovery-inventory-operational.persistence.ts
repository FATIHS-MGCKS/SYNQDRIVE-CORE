import type { Prisma } from '@prisma/client';
import {
  evaluateNativeDiscoveryOperationalCasPreconditions,
  VsiNativeDiscoveryOperationalWriteOutcome,
} from './vsi-native-signal-discovery-operational-cas.contract';
import {
  assertNativeDiscoveryInventoryScopeMatch,
  validateNativeSignalDiscoveryInventoryWellFormed,
  type VsiNativeSignalDiscoveryInventoryV1,
} from './vsi-native-signal-discovery-inventory.contract';
import { buildOperationalProfileRefreshCasWhere } from './vsi-profile-operational-refresh.util';
import {
  normalizeNativeSignalDiscoveryInventoryFromProfileRow,
  stableNativeDiscoveryInventoryJson,
} from './vsi-native-discovery-inventory.db.util';
import { mergeNativeDiscoveryInventoryEntries } from './vsi-native-discovery-inventory-merge.util';

export type VsiNativeDiscoveryInventoryOperationalPersistOutcome =
  | 'applied'
  | 'noop'
  | 'binding_mismatch'
  | 'out_of_order'
  | 'not_found'
  | 'conflict';

export type VsiNativeDiscoveryInventoryOperationalPersistInput = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  providerIdentity: string;
  nextInventory: VsiNativeSignalDiscoveryInventoryV1;
  latestStateProviderBindingId?: string | null;
  latestStateSourceTimestampMs?: number | null;
  requireBindingMatch?: boolean;
};

function mapCasOutcome(
  outcome: VsiNativeDiscoveryOperationalWriteOutcome,
): VsiNativeDiscoveryInventoryOperationalPersistOutcome | 'proceed' {
  switch (outcome) {
    case VsiNativeDiscoveryOperationalWriteOutcome.APPLIED:
      return 'proceed';
    case VsiNativeDiscoveryOperationalWriteOutcome.NOOP:
      return 'noop';
    case VsiNativeDiscoveryOperationalWriteOutcome.BINDING_MISMATCH:
      return 'binding_mismatch';
    case VsiNativeDiscoveryOperationalWriteOutcome.OUT_OF_ORDER_SOURCE:
      return 'out_of_order';
    case VsiNativeDiscoveryOperationalWriteOutcome.STALE_SEMANTICS:
      return 'conflict';
    case VsiNativeDiscoveryOperationalWriteOutcome.CAS_CONFLICT:
      return 'conflict';
    default:
      return 'conflict';
  }
}

export async function persistNativeDiscoveryInventoryOperationalCas(
  tx: Prisma.TransactionClient,
  input: VsiNativeDiscoveryInventoryOperationalPersistInput,
): Promise<VsiNativeDiscoveryInventoryOperationalPersistOutcome> {
  validateNativeSignalDiscoveryInventoryWellFormed(input.nextInventory);
  assertNativeDiscoveryInventoryScopeMatch({
    inventory: input.nextInventory,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    providerSourceLinkId: input.providerSourceLinkId,
    providerIdentity: input.providerIdentity,
  });

  const row = await tx.vehicleSignalCapabilityProfile.findUnique({
    where: {
      organizationId_vehicleId_providerSourceLinkId: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerSourceLinkId: input.providerSourceLinkId,
      },
    },
  });
  if (!row) {
    return 'not_found';
  }

  const persistedInventory = normalizeNativeSignalDiscoveryInventoryFromProfileRow(row);
  const mergedNext = mergeNativeDiscoveryInventoryEntries(persistedInventory, input.nextInventory);

  const priorJson = stableNativeDiscoveryInventoryJson(persistedInventory);
  const preflight = evaluateNativeDiscoveryOperationalCasPreconditions({
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    providerSourceLinkId: input.providerSourceLinkId,
    providerIdentity: input.providerIdentity,
    latestStateProviderBindingId: input.latestStateProviderBindingId ?? input.providerSourceLinkId,
    latestStateSourceTimestampMs: input.latestStateSourceTimestampMs ?? null,
    lastMaterializedSourceTimestampMs: row.lastMaterializedSourceTimestamp?.getTime() ?? null,
    requireBindingMatch: input.requireBindingMatch ?? true,
    semanticFingerprintUnchanged: true,
    priorInventoryJson: priorJson,
    nextInventory: mergedNext,
  });

  const mapped = mapCasOutcome(preflight);
  if (mapped !== 'proceed') {
    return mapped;
  }

  const updated = await tx.vehicleSignalCapabilityProfile.updateMany({
    where: buildOperationalProfileRefreshCasWhere(row),
    data: {
      nativeSignalDiscoveryInventory: mergedNext as unknown as Prisma.InputJsonValue,
    },
  });
  if (updated.count === 0) {
    return 'conflict';
  }
  return 'applied';
}
