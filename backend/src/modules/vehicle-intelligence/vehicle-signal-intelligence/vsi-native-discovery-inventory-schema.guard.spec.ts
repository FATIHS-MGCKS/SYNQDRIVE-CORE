import { isNativeDiscoveryInventorySchemaPrismaError } from './vsi-native-discovery-inventory-schema.guard';

describe('vsi-native-discovery-inventory-schema.guard', () => {
  it('detects Prisma P2022 as schema errors', () => {
    expect(isNativeDiscoveryInventorySchemaPrismaError({ code: 'P2022' })).toBe(true);
  });

  it('detects native discovery column name in message', () => {
    expect(
      isNativeDiscoveryInventorySchemaPrismaError(
        new Error('column native_signal_discovery_inventory does not exist'),
      ),
    ).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isNativeDiscoveryInventorySchemaPrismaError(new Error('timeout'))).toBe(false);
  });
});
