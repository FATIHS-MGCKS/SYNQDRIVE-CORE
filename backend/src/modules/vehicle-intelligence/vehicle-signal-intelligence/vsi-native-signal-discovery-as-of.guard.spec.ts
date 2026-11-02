import {
  VSI_NATIVE_DISCOVERY_INVENTORY_NOT_AS_OF_LIMITATION,
  VsiNativeDiscoveryConsumerTemporalMode,
  assertApdsHistoricalContextDoesNotUseHeadDiscoveryInventory,
  resolveNativeDiscoveryInventoryForConsumerContext,
  revisionRowMayIncludeNativeDiscoveryInventory,
} from './vsi-native-signal-discovery-as-of.guard';
import { emptyNativeSignalDiscoveryInventory } from './vsi-native-signal-discovery-inventory.contract';

describe('vsi-native-signal-discovery-as-of.guard', () => {
  const head = emptyNativeSignalDiscoveryInventory(
    {
      organizationId: 'org',
      vehicleId: 'veh',
      providerSourceLinkId: 'link',
      providerIdentity: 'DIMO',
    },
    new Date(),
  );

  it('returns null inventory + limitation for AS_OF mode', () => {
    const view = resolveNativeDiscoveryInventoryForConsumerContext({
      mode: VsiNativeDiscoveryConsumerTemporalMode.AS_OF,
      headInventory: head,
    });
    expect(view.inventory).toBeNull();
    expect(view.limitations).toContain(VSI_NATIVE_DISCOVERY_INVENTORY_NOT_AS_OF_LIMITATION);
  });

  it('allows head inventory only in HEAD mode', () => {
    const view = resolveNativeDiscoveryInventoryForConsumerContext({
      mode: VsiNativeDiscoveryConsumerTemporalMode.HEAD,
      headInventory: head,
    });
    expect(view.inventory).toBe(head);
    expect(view.limitations).toHaveLength(0);
  });

  it('throws if APDS AS_OF attaches head inventory (leakage prevention)', () => {
    expect(() =>
      assertApdsHistoricalContextDoesNotUseHeadDiscoveryInventory({
        mode: VsiNativeDiscoveryConsumerTemporalMode.AS_OF,
        attachedInventory: head,
      }),
    ).toThrow(/must not attach head nativeSignalDiscoveryInventory/);
  });

  it('documents revision rows exclude operational inventory in P1a design', () => {
    expect(revisionRowMayIncludeNativeDiscoveryInventory()).toBe(false);
  });
});
