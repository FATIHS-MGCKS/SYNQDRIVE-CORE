/**
 * VSI universal discovery — native signal inventory contract (P0).
 *
 * Operational evidence stored separately from {@link VSI_PROFILE_CONTRACT_VERSION}
 * `signalsSnapshot`. Must not affect semantic profile fingerprints (P1a column).
 */

import {
  assertTriStateEvaluationShape,
  type VsiEvidenceAxisEvaluationV1,
  VsiEvidenceAxisEvaluationState,
  VsiEvidenceAxisNotEvaluatedReason,
} from './vsi-native-signal-discovery-evaluation-state';

export const VSI_NATIVE_SIGNAL_DISCOVERY_INVENTORY_CONTRACT_VERSION =
  'vsi-native-signal-discovery-v1' as const;

export type VsiNativeSignalDiscoveryInventoryContractVersion =
  typeof VSI_NATIVE_SIGNAL_DISCOVERY_INVENTORY_CONTRACT_VERSION;

/** Max native keys per link profile (presence-only inventory). */
export const VSI_NATIVE_DISCOVERY_INVENTORY_MAX_ENTRIES = 256;

export const VSI_NATIVE_DISCOVERY_INVENTORY_TRUNCATION_LIMITATION =
  'NATIVE_INVENTORY_TRUNCATED';

export const VsiNativeDiscoveryIngestionLimitation = {
  SNAPSHOT_INGEST_FIELD_LIST_BOUNDED: 'SNAPSHOT_INGEST_FIELD_LIST_BOUNDED',
  HF_MIRROR_SIGNAL_SET_BOUNDED: 'HF_MIRROR_SIGNAL_SET_BOUNDED',
  HF_MIRROR_BOUNDED_WINDOW: 'HF_MIRROR_BOUNDED_WINDOW',
  HF_MIRROR_DISABLED_OR_EMPTY: 'HF_MIRROR_DISABLED_OR_EMPTY',
  HF_SIGNAL_NOT_MIRRORED: 'HF_SIGNAL_NOT_MIRRORED',
  NATIVE_INVENTORY_TRUNCATED: VSI_NATIVE_DISCOVERY_INVENTORY_TRUNCATION_LIMITATION,
} as const;

export type VsiNativeDiscoveryIngestionLimitation =
  (typeof VsiNativeDiscoveryIngestionLimitation)[keyof typeof VsiNativeDiscoveryIngestionLimitation];

/** Bounded sample metadata — counts/times only, never scalar signal values. */
export type VsiNativeDiscoveryBoundedSampleMetadataV1 = {
  /** Inclusive observation window start (ISO-8601 UTC). */
  windowStartAt: string | null;
  windowEndAt: string | null;
  pointCount: number | null;
  tripCountWithPoints: number | null;
  /** Upper bound applied when reading (e.g. max points cap). */
  readCapApplied: number | null;
};

export type VsiNativeDiscoverySnapshotAxisV1 = {
  evaluation: VsiEvidenceAxisEvaluationV1;
  /** Last time a finite value was present in link-scoped VLS payload (ISO). */
  lastObservedAt: string | null;
  lastSourceTimestamp: string | null;
};

export type VsiNativeDiscoveryHistoricalAxisV1 = {
  evaluation: VsiEvidenceAxisEvaluationV1;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  sampleMetadata: VsiNativeDiscoveryBoundedSampleMetadataV1;
};

export type VsiNativeSignalDiscoveryInventoryEntryV1 = {
  providerNativeSignalName: string;
  /** From {@link evaluateCanonicalProviderNativeAlias} — never auto-mapped to canonical. */
  aliasVerdict: 'EXPLICIT_PRIMARY_ALIAS' | 'ALIAS_CONFLICT_UNRESOLVED' | 'UNKNOWN_SIGNAL';
  canonicalSignalKey: string | null;
  snapshot: VsiNativeDiscoverySnapshotAxisV1;
  historical: VsiNativeDiscoveryHistoricalAxisV1;
  ingestionLimitations: readonly string[];
};

export type VsiNativeSignalDiscoveryInventoryScopeV1 = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  providerIdentity: string;
};

export type VsiNativeSignalDiscoveryInventoryV1 = {
  contractVersion: VsiNativeSignalDiscoveryInventoryContractVersion;
  scope: VsiNativeSignalDiscoveryInventoryScopeV1;
  evaluatedAt: string;
  entries: readonly VsiNativeSignalDiscoveryInventoryEntryV1[];
  profileLimitations: readonly string[];
};

export function assertNativeDiscoveryInventoryScopeMatch(input: {
  inventory: VsiNativeSignalDiscoveryInventoryV1;
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  providerIdentity: string;
}): void {
  const s = input.inventory.scope;
  if (s.organizationId !== input.organizationId) {
    throw new Error('native discovery inventory organizationId mismatch');
  }
  if (s.vehicleId !== input.vehicleId) {
    throw new Error('native discovery inventory vehicleId mismatch');
  }
  if (s.providerSourceLinkId !== input.providerSourceLinkId) {
    throw new Error('native discovery inventory providerSourceLinkId mismatch');
  }
  if (s.providerIdentity !== input.providerIdentity) {
    throw new Error('native discovery inventory providerIdentity mismatch');
  }
}

export function truncateNativeSignalDiscoveryInventory(
  inventory: VsiNativeSignalDiscoveryInventoryV1,
  maxEntries: number = VSI_NATIVE_DISCOVERY_INVENTORY_MAX_ENTRIES,
): VsiNativeSignalDiscoveryInventoryV1 {
  if (inventory.entries.length <= maxEntries) {
    return inventory;
  }
  const sorted = [...inventory.entries].sort((a, b) =>
    a.providerNativeSignalName.localeCompare(b.providerNativeSignalName),
  );
  const entries = sorted.slice(0, maxEntries);
  const limitations = new Set(inventory.profileLimitations);
  limitations.add(VSI_NATIVE_DISCOVERY_INVENTORY_TRUNCATION_LIMITATION);
  return {
    ...inventory,
    entries,
    profileLimitations: [...limitations],
  };
}

export function validateNativeSignalDiscoveryInventoryWellFormed(
  inventory: VsiNativeSignalDiscoveryInventoryV1,
): void {
  if (inventory.contractVersion !== VSI_NATIVE_SIGNAL_DISCOVERY_INVENTORY_CONTRACT_VERSION) {
    throw new Error('invalid native discovery inventory contractVersion');
  }
  if (!inventory.scope.organizationId?.trim()) throw new Error('scope.organizationId required');
  if (!inventory.scope.vehicleId?.trim()) throw new Error('scope.vehicleId required');
  if (!inventory.scope.providerSourceLinkId?.trim()) {
    throw new Error('scope.providerSourceLinkId required');
  }
  if (!inventory.scope.providerIdentity?.trim()) throw new Error('scope.providerIdentity required');
  if (inventory.entries.length > VSI_NATIVE_DISCOVERY_INVENTORY_MAX_ENTRIES) {
    throw new Error('entries exceed VSI_NATIVE_DISCOVERY_INVENTORY_MAX_ENTRIES');
  }
  for (const entry of inventory.entries) {
    if (!entry.providerNativeSignalName?.trim()) {
      throw new Error('providerNativeSignalName required');
    }
    assertTriStateEvaluationShape(entry.snapshot.evaluation);
    assertTriStateEvaluationShape(entry.historical.evaluation);
    if (
      entry.historical.evaluation.state ===
        VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED &&
      entry.historical.sampleMetadata.pointCount != null &&
      entry.historical.sampleMetadata.pointCount <= 0
    ) {
      throw new Error('EVALUATED_OBSERVED historical axis requires positive pointCount');
    }
  }
}

export function emptyNativeSignalDiscoveryInventory(
  scope: VsiNativeSignalDiscoveryInventoryScopeV1,
  evaluatedAt: Date,
): VsiNativeSignalDiscoveryInventoryV1 {
  return {
    contractVersion: VSI_NATIVE_SIGNAL_DISCOVERY_INVENTORY_CONTRACT_VERSION,
    scope,
    evaluatedAt: evaluatedAt.toISOString(),
    entries: [],
    profileLimitations: [],
  };
}

export { VsiEvidenceAxisEvaluationState, VsiEvidenceAxisNotEvaluatedReason };
