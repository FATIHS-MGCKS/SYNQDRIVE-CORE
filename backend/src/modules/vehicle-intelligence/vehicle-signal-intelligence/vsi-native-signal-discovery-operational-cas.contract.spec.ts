import {
  VsiNativeDiscoveryOperationalWriteOutcome,
  assertInventoryOnlyRefreshPreservesProfileRevision,
  evaluateNativeDiscoveryOperationalCasPreconditions,
} from './vsi-native-signal-discovery-operational-cas.contract';
import { emptyNativeSignalDiscoveryInventory } from './vsi-native-signal-discovery-inventory.contract';

describe('vsi-native-signal-discovery-operational-cas.contract', () => {
  const scope = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    providerSourceLinkId: 'link-1',
    providerIdentity: 'DIMO',
  };

  it('rejects out-of-order source timestamps', () => {
    const next = emptyNativeSignalDiscoveryInventory(scope, new Date());
    const outcome = evaluateNativeDiscoveryOperationalCasPreconditions({
      ...scope,
      latestStateProviderBindingId: 'link-1',
      latestStateSourceTimestampMs: 1000,
      lastMaterializedSourceTimestampMs: 2000,
      requireBindingMatch: true,
      semanticFingerprintUnchanged: true,
      priorInventoryJson: null,
      nextInventory: next,
    });
    expect(outcome).toBe(VsiNativeDiscoveryOperationalWriteOutcome.OUT_OF_ORDER_SOURCE);
  });

  it('rejects binding mismatch', () => {
    const next = emptyNativeSignalDiscoveryInventory(scope, new Date());
    const outcome = evaluateNativeDiscoveryOperationalCasPreconditions({
      ...scope,
      latestStateProviderBindingId: 'other-link',
      latestStateSourceTimestampMs: 3000,
      lastMaterializedSourceTimestampMs: 2000,
      requireBindingMatch: true,
      semanticFingerprintUnchanged: true,
      priorInventoryJson: null,
      nextInventory: next,
    });
    expect(outcome).toBe(VsiNativeDiscoveryOperationalWriteOutcome.BINDING_MISMATCH);
  });

  it('rejects when semantic fingerprint would change', () => {
    const next = emptyNativeSignalDiscoveryInventory(scope, new Date());
    const outcome = evaluateNativeDiscoveryOperationalCasPreconditions({
      ...scope,
      latestStateProviderBindingId: 'link-1',
      latestStateSourceTimestampMs: 3000,
      lastMaterializedSourceTimestampMs: 2000,
      requireBindingMatch: true,
      semanticFingerprintUnchanged: false,
      priorInventoryJson: null,
      nextInventory: next,
    });
    expect(outcome).toBe(VsiNativeDiscoveryOperationalWriteOutcome.STALE_SEMANTICS);
  });

  it('is idempotent when inventory JSON unchanged', () => {
    const next = emptyNativeSignalDiscoveryInventory(scope, new Date('2026-11-02T10:00:00.000Z'));
    const json = JSON.stringify(next);
    const outcome = evaluateNativeDiscoveryOperationalCasPreconditions({
      ...scope,
      latestStateProviderBindingId: 'link-1',
      latestStateSourceTimestampMs: 3000,
      lastMaterializedSourceTimestampMs: 2000,
      requireBindingMatch: true,
      semanticFingerprintUnchanged: true,
      priorInventoryJson: json,
      nextInventory: next,
    });
    expect(outcome).toBe(VsiNativeDiscoveryOperationalWriteOutcome.NOOP);
  });

  it('inventory-only refresh preserves revision and semantic fingerprint', () => {
    expect(() =>
      assertInventoryOnlyRefreshPreservesProfileRevision({
        profileRevisionBefore: 3,
        profileRevisionAfter: 3,
        semanticFingerprintBefore: 'abc',
        semanticFingerprintAfter: 'abc',
      }),
    ).not.toThrow();
    expect(() =>
      assertInventoryOnlyRefreshPreservesProfileRevision({
        profileRevisionBefore: 3,
        profileRevisionAfter: 4,
        semanticFingerprintBefore: 'abc',
        semanticFingerprintAfter: 'abc',
      }),
    ).toThrow(/profileRevision/);
  });
});
