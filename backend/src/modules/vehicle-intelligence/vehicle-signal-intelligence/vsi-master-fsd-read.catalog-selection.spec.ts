import {
  isCatalogSelectionSearchIndeterminateV1,
  TARGETED_CATALOG_LOOKUP_LIMIT_V1,
} from './vsi-master-fsd-read.catalog-resolution';

describe('catalog bounded lookup indeterminate semantics', () => {
  it('marks search incomplete when recent scan is exhausted without authoritative catalog', () => {
    expect(
      isCatalogSelectionSearchIndeterminateV1({
        authoritativeFound: false,
        recentScanCount: 64,
        maxRunScan: 64,
        targetedScanCount: 0,
      }),
    ).toBe(true);
  });

  it('marks search incomplete when targeted lookup returns a full bound without authoritative catalog', () => {
    expect(
      isCatalogSelectionSearchIndeterminateV1({
        authoritativeFound: false,
        recentScanCount: 10,
        maxRunScan: 64,
        targetedScanCount: TARGETED_CATALOG_LOOKUP_LIMIT_V1,
      }),
    ).toBe(true);
  });

  it('is definitive within a small scan when no completed authoritative catalog exists', () => {
    expect(
      isCatalogSelectionSearchIndeterminateV1({
        authoritativeFound: false,
        recentScanCount: 3,
        maxRunScan: 64,
        targetedScanCount: 0,
      }),
    ).toBe(false);
  });
});
