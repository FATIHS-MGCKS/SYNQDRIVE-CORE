/**
 * Operational CAS invariants for native discovery inventory refresh (P0).
 *
 * Discovery updates reuse {@link buildOperationalProfileRefreshCasWhere} semantics
 * without incrementing profileRevision or changing semantic contentFingerprint.
 */

import type { VsiNativeSignalDiscoveryInventoryV1 } from './vsi-native-signal-discovery-inventory.contract';
import { assertNativeDiscoveryInventoryScopeMatch } from './vsi-native-signal-discovery-inventory.contract';
import { stableNativeDiscoveryInventoryJson } from './vsi-native-discovery-inventory.db.util';

export const VsiNativeDiscoveryOperationalWriteOutcome = {
  APPLIED: 'APPLIED',
  NOOP: 'NOOP',
  STALE_SEMANTICS: 'STALE_SEMANTICS',
  BINDING_MISMATCH: 'BINDING_MISMATCH',
  OUT_OF_ORDER_SOURCE: 'OUT_OF_ORDER_SOURCE',
  CAS_CONFLICT: 'CAS_CONFLICT',
} as const;

export type VsiNativeDiscoveryOperationalWriteOutcome =
  (typeof VsiNativeDiscoveryOperationalWriteOutcome)[keyof typeof VsiNativeDiscoveryOperationalWriteOutcome];

export type VsiNativeDiscoveryOperationalCasContextV1 = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  providerIdentity: string;
  latestStateProviderBindingId: string | null;
  latestStateSourceTimestampMs: number | null;
  lastMaterializedSourceTimestampMs: number | null;
  /** When true, binding match is required (non-lifecycle-relaxed paths). */
  requireBindingMatch: boolean;
  semanticFingerprintUnchanged: boolean;
  priorInventoryJson: string | null;
  nextInventory: VsiNativeSignalDiscoveryInventoryV1;
};

export function evaluateNativeDiscoveryOperationalCasPreconditions(
  ctx: VsiNativeDiscoveryOperationalCasContextV1,
): VsiNativeDiscoveryOperationalWriteOutcome {
  try {
    assertNativeDiscoveryInventoryScopeMatch({
      inventory: ctx.nextInventory,
      organizationId: ctx.organizationId,
      vehicleId: ctx.vehicleId,
      providerSourceLinkId: ctx.providerSourceLinkId,
      providerIdentity: ctx.providerIdentity,
    });
  } catch {
    return VsiNativeDiscoveryOperationalWriteOutcome.BINDING_MISMATCH;
  }

  if (
    ctx.requireBindingMatch &&
    ctx.latestStateProviderBindingId &&
    ctx.latestStateProviderBindingId !== ctx.providerSourceLinkId
  ) {
    return VsiNativeDiscoveryOperationalWriteOutcome.BINDING_MISMATCH;
  }

  if (
    ctx.latestStateSourceTimestampMs != null &&
    ctx.lastMaterializedSourceTimestampMs != null &&
    ctx.latestStateSourceTimestampMs < ctx.lastMaterializedSourceTimestampMs
  ) {
    return VsiNativeDiscoveryOperationalWriteOutcome.OUT_OF_ORDER_SOURCE;
  }

  if (!ctx.semanticFingerprintUnchanged) {
    return VsiNativeDiscoveryOperationalWriteOutcome.STALE_SEMANTICS;
  }

  const nextJson = stableNativeDiscoveryInventoryJson(ctx.nextInventory);
  if (ctx.priorInventoryJson != null && ctx.priorInventoryJson === nextJson) {
    return VsiNativeDiscoveryOperationalWriteOutcome.NOOP;
  }

  return VsiNativeDiscoveryOperationalWriteOutcome.APPLIED;
}

/** Inventory-only refresh must never bump profileRevision (invariant helper). */
export function assertInventoryOnlyRefreshPreservesProfileRevision(input: {
  profileRevisionBefore: number;
  profileRevisionAfter: number;
  semanticFingerprintBefore: string;
  semanticFingerprintAfter: string;
}): void {
  if (input.profileRevisionBefore !== input.profileRevisionAfter) {
    throw new Error('inventory-only refresh must not increment profileRevision');
  }
  if (input.semanticFingerprintBefore !== input.semanticFingerprintAfter) {
    throw new Error('inventory-only refresh must not change semantic fingerprint');
  }
}
