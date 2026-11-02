import type { Prisma } from '@prisma/client';
import {
  isLegacyEmptyNativeDiscoveryInventoryRaw,
  normalizeNativeSignalDiscoveryInventoryFromProfileRow,
} from './vsi-native-discovery-inventory.db.util';
import { isVsiDiscoveryHfInventoryEnabled } from './vsi-discovery-hf-inventory.config';
import { isVsiDiscoverySnapshotInventoryEnabled } from './vsi-discovery-snapshot-inventory.config';
import {
  VsiEvidenceAxisEvaluationState,
  VsiEvidenceAxisNotEvaluatedReason,
} from './vsi-native-signal-discovery-evaluation-state';
import type { VsiNativeSignalDiscoveryInventoryV1 } from './vsi-native-signal-discovery-inventory.contract';

export type VsiNativeDiscoveryInventoryReconcileAxis =
  | 'snapshot'
  | 'historical';

export type VsiNativeDiscoveryInventoryReconcileAssessment = {
  needsReconcile: boolean;
  missingInventory: boolean;
  staleInventory: boolean;
  snapshotAxisNeedsRefresh: boolean;
  hfAxisNeedsRefresh: boolean;
  attributionAmbiguous: boolean;
};

type ProfileRowSlice = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  providerIdentity: string;
  evaluatedAt: Date;
  updatedAt: Date;
  lastMaterializedSourceTimestamp: Date | null;
  nativeSignalDiscoveryInventory: Prisma.JsonValue;
};

function inventoryEvaluatedAtMs(inventory: VsiNativeSignalDiscoveryInventoryV1): number {
  const parsed = Date.parse(inventory.evaluatedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function axisNeedsRefresh(
  inventory: VsiNativeSignalDiscoveryInventoryV1,
  axis: VsiNativeDiscoveryInventoryReconcileAxis,
): boolean {
  if (inventory.entries.length === 0) {
    return true;
  }
  for (const entry of inventory.entries) {
    const evaluation =
      axis === 'snapshot' ? entry.snapshot.evaluation : entry.historical.evaluation;
    if (evaluation.state === VsiEvidenceAxisEvaluationState.NOT_EVALUATED) {
      const reason = evaluation.notEvaluatedReason ?? '';
      if (
        reason === VsiEvidenceAxisNotEvaluatedReason.INVENTORY_NOT_REFRESHED ||
        reason === VsiEvidenceAxisNotEvaluatedReason.SNAPSHOT_EXTRACTOR_NOT_RUN ||
        reason === VsiEvidenceAxisNotEvaluatedReason.DISCOVERY_FEATURE_DISABLED
      ) {
        return true;
      }
    }
  }
  return false;
}

function hasAttributionAmbiguousLimitation(inventory: VsiNativeSignalDiscoveryInventoryV1): boolean {
  if (
    inventory.profileLimitations.includes(
      VsiEvidenceAxisNotEvaluatedReason.LINK_ATTRIBUTION_AMBIGUOUS,
    )
  ) {
    return true;
  }
  for (const entry of inventory.entries) {
    for (const limitation of entry.ingestionLimitations) {
      if (limitation === VsiEvidenceAxisNotEvaluatedReason.LINK_ATTRIBUTION_AMBIGUOUS) {
        return true;
      }
    }
    const snapReason = entry.snapshot.evaluation.notEvaluatedReason;
    if (snapReason === VsiEvidenceAxisNotEvaluatedReason.LINK_ATTRIBUTION_AMBIGUOUS) {
      return true;
    }
  }
  return false;
}

/**
 * Determines whether operational inventory refresh is needed for enabled discovery axes.
 * Does not imply provider signal unsupported when HF data is absent.
 */
export function assessNativeDiscoveryInventoryReconcileNeed(
  profile: ProfileRowSlice,
): VsiNativeDiscoveryInventoryReconcileAssessment {
  const snapshotEnabled = isVsiDiscoverySnapshotInventoryEnabled();
  const hfEnabled = isVsiDiscoveryHfInventoryEnabled();
  const missingInventory = isLegacyEmptyNativeDiscoveryInventoryRaw(
    profile.nativeSignalDiscoveryInventory,
  );
  const inventory = missingInventory
    ? null
    : normalizeNativeSignalDiscoveryInventoryFromProfileRow(profile);

  const profileFreshnessMs = Math.max(
    profile.evaluatedAt.getTime(),
    profile.lastMaterializedSourceTimestamp?.getTime() ?? 0,
    profile.updatedAt.getTime(),
  );
  const staleInventory =
    inventory != null && inventoryEvaluatedAtMs(inventory) < profileFreshnessMs;

  const snapshotAxisNeedsRefresh =
    snapshotEnabled && (missingInventory || staleInventory || (inventory != null && axisNeedsRefresh(inventory, 'snapshot')));
  const hfAxisNeedsRefresh =
    hfEnabled && (missingInventory || staleInventory || (inventory != null && axisNeedsRefresh(inventory, 'historical')));

  const attributionAmbiguous = inventory != null && hasAttributionAmbiguousLimitation(inventory);

  return {
    needsReconcile: snapshotAxisNeedsRefresh || hfAxisNeedsRefresh,
    missingInventory,
    staleInventory,
    snapshotAxisNeedsRefresh,
    hfAxisNeedsRefresh,
    attributionAmbiguous,
  };
}
