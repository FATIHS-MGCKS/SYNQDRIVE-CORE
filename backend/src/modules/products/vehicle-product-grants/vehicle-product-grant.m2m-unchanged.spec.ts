import { isCoreAppM2mAllowlistedApiPath } from '@modules/core-app-m2m/core-app-m2m.allowlist';

describe('Vehicle product grants — M2M allowlist unchanged (P3-PR9)', () => {
  it('does not allowlist grant admin routes', () => {
    expect(
      isCoreAppM2mAllowlistedApiPath(
        '/api/v1/admin/organizations/11111111-1111-1111-1111-111111111111/product-vehicle-grants',
      ),
    ).toBe(false);
  });

  it('does not allowlist core vehicle read routes', () => {
    expect(
      isCoreAppM2mAllowlistedApiPath(
        '/api/v1/core/read/v1/organizations/11111111-1111-1111-1111-111111111111/vehicles',
      ),
    ).toBe(false);
  });
});