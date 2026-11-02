/**
 * As-of safety for native discovery inventory (P0).
 *
 * Head inventory is never historical evidence for APDS / revision as-of replay.
 */

import type { VsiNativeSignalDiscoveryInventoryV1 } from './vsi-native-signal-discovery-inventory.contract';

export const VSI_NATIVE_DISCOVERY_INVENTORY_AUTHORITY = 'HEAD_ONLY' as const;

export const VSI_NATIVE_DISCOVERY_INVENTORY_NOT_AS_OF_LIMITATION =
  'NATIVE_DISCOVERY_INVENTORY_NOT_AS_OF_AUTHORITATIVE';

export const VsiNativeDiscoveryConsumerTemporalMode = {
  HEAD: 'HEAD',
  AS_OF: 'AS_OF',
} as const;

export type VsiNativeDiscoveryConsumerTemporalMode =
  (typeof VsiNativeDiscoveryConsumerTemporalMode)[keyof typeof VsiNativeDiscoveryConsumerTemporalMode];

export type VsiNativeDiscoveryInventoryConsumerViewV1 = {
  inventory: VsiNativeSignalDiscoveryInventoryV1 | null;
  limitations: readonly string[];
  authority: typeof VSI_NATIVE_DISCOVERY_INVENTORY_AUTHORITY | 'UNAVAILABLE';
};

/**
 * APDS historical resolver and as-of replay must call this — never attach head inventory to AS_OF.
 */
export function resolveNativeDiscoveryInventoryForConsumerContext(input: {
  mode: VsiNativeDiscoveryConsumerTemporalMode;
  headInventory: VsiNativeSignalDiscoveryInventoryV1 | null;
}): VsiNativeDiscoveryInventoryConsumerViewV1 {
  if (input.mode === VsiNativeDiscoveryConsumerTemporalMode.AS_OF) {
    return {
      inventory: null,
      limitations: [VSI_NATIVE_DISCOVERY_INVENTORY_NOT_AS_OF_LIMITATION],
      authority: 'UNAVAILABLE',
    };
  }
  return {
    inventory: input.headInventory,
    limitations: [],
    authority: VSI_NATIVE_DISCOVERY_INVENTORY_AUTHORITY,
  };
}

export function assertApdsHistoricalContextDoesNotUseHeadDiscoveryInventory(input: {
  mode: VsiNativeDiscoveryConsumerTemporalMode;
  attachedInventory: VsiNativeSignalDiscoveryInventoryV1 | null | undefined;
}): void {
  if (input.mode !== VsiNativeDiscoveryConsumerTemporalMode.AS_OF) {
    return;
  }
  if (input.attachedInventory != null) {
    throw new Error('APDS AS_OF must not attach head nativeSignalDiscoveryInventory');
  }
}

/** Revision rows (P5-H1) never captured operational inventory in P0/P1a design. */
export function revisionRowMayIncludeNativeDiscoveryInventory(): false {
  return false;
}
