import type { VehicleSignalCapabilityProfile } from '@prisma/client';
import {
  emptyNativeSignalDiscoveryInventory,
  VSI_NATIVE_SIGNAL_DISCOVERY_INVENTORY_CONTRACT_VERSION,
  type VsiNativeSignalDiscoveryInventoryScopeV1,
  type VsiNativeSignalDiscoveryInventoryV1,
} from './vsi-native-signal-discovery-inventory.contract';

/** Canonical DB default / backfill shape (scope filled on first scoped write or read). */
export const VSI_NATIVE_DISCOVERY_CANONICAL_EMPTY_DB = {
  contractVersion: VSI_NATIVE_SIGNAL_DISCOVERY_INVENTORY_CONTRACT_VERSION,
  entries: [],
  profileLimitations: [],
} as const;

export function buildCanonicalEmptyNativeDiscoveryInventoryDbJson(): typeof VSI_NATIVE_DISCOVERY_CANONICAL_EMPTY_DB {
  return {
    contractVersion: VSI_NATIVE_DISCOVERY_CANONICAL_EMPTY_DB.contractVersion,
    entries: [],
    profileLimitations: [],
  };
}

export function isLegacyEmptyNativeDiscoveryInventoryRaw(raw: unknown): boolean {
  if (raw == null) return true;
  if (Array.isArray(raw) && raw.length === 0) return true;
  if (typeof raw === 'object' && raw !== null) {
    const o = raw as { entries?: unknown[] };
    return Array.isArray(o.entries) && o.entries.length === 0;
  }
  return false;
}

export function normalizeNativeSignalDiscoveryInventoryFromProfileRow(
  row: Pick<
    VehicleSignalCapabilityProfile,
    | 'nativeSignalDiscoveryInventory'
    | 'organizationId'
    | 'vehicleId'
    | 'providerSourceLinkId'
    | 'providerIdentity'
    | 'evaluatedAt'
  >,
): VsiNativeSignalDiscoveryInventoryV1 {
  const scope: VsiNativeSignalDiscoveryInventoryScopeV1 = {
    organizationId: row.organizationId,
    vehicleId: row.vehicleId,
    providerSourceLinkId: row.providerSourceLinkId,
    providerIdentity: row.providerIdentity,
  };
  const raw = row.nativeSignalDiscoveryInventory;
  if (isLegacyEmptyNativeDiscoveryInventoryRaw(raw)) {
    return emptyNativeSignalDiscoveryInventory(scope, row.evaluatedAt);
  }
  const parsed = raw as Partial<VsiNativeSignalDiscoveryInventoryV1>;
  return {
    contractVersion:
      parsed.contractVersion ?? VSI_NATIVE_SIGNAL_DISCOVERY_INVENTORY_CONTRACT_VERSION,
    scope: parsed.scope ?? scope,
    evaluatedAt: parsed.evaluatedAt ?? row.evaluatedAt.toISOString(),
    entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    profileLimitations: Array.isArray(parsed.profileLimitations)
      ? parsed.profileLimitations
      : [],
  };
}

export function stableNativeDiscoveryInventoryJson(
  inventory: VsiNativeSignalDiscoveryInventoryV1,
): string {
  return JSON.stringify(inventory, (_k, v) => (v === undefined ? null : v));
}
