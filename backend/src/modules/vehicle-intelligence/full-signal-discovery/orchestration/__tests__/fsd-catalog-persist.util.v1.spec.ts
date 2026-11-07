import { hasPersistedFsdCatalogFetchV1 } from '../fsd-catalog-persist.util.v1';

describe('hasPersistedFsdCatalogFetchV1', () => {
  it('accepts empty availableSignalNames when succeeded', () => {
    expect(
      hasPersistedFsdCatalogFetchV1({
        succeeded: true,
        availableSignalNames: [],
        declaredCatalogFingerprint: 'abc',
      }),
    ).toBe(true);
  });

  it('rejects missing array when succeeded', () => {
    expect(hasPersistedFsdCatalogFetchV1({ succeeded: true })).toBe(false);
  });

  it('rejects non-array names', () => {
    expect(
      hasPersistedFsdCatalogFetchV1({
        succeeded: true,
        availableSignalNames: null as unknown as string[],
      }),
    ).toBe(false);
  });
});
