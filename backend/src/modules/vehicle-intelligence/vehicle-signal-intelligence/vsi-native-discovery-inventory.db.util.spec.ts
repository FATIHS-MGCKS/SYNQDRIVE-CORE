import {
  buildCanonicalEmptyNativeDiscoveryInventoryDbJson,
  isLegacyEmptyNativeDiscoveryInventoryRaw,
  normalizeNativeSignalDiscoveryInventoryFromProfileRow,
} from './vsi-native-discovery-inventory.db.util';

describe('vsi-native-discovery-inventory.db.util', () => {
  it('treats legacy [] and canonical empty object as empty inventory', () => {
    expect(isLegacyEmptyNativeDiscoveryInventoryRaw([])).toBe(true);
    expect(isLegacyEmptyNativeDiscoveryInventoryRaw(buildCanonicalEmptyNativeDiscoveryInventoryDbJson())).toBe(
      true,
    );
  });

  it('normalizes canonical empty DB JSON with profile scope', () => {
    const row = {
      nativeSignalDiscoveryInventory: buildCanonicalEmptyNativeDiscoveryInventoryDbJson(),
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      providerSourceLinkId: 'link-1',
      providerIdentity: 'DIMO',
      evaluatedAt: new Date('2026-11-02T10:00:00.000Z'),
    };
    const normalized = normalizeNativeSignalDiscoveryInventoryFromProfileRow(row);
    expect(normalized.scope.organizationId).toBe('org-1');
    expect(normalized.entries).toHaveLength(0);
    expect(normalized.contractVersion).toBe('vsi-native-signal-discovery-v1');
  });
});
