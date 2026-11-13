import { isCoreAppM2mAllowlistedApiPath } from '@modules/core-app-m2m/core-app-m2m.allowlist';

describe('Core vehicle read API — M2M allowlist unchanged (P3-PR1)', () => {
  const vehicleList =
    '/api/v1/core/read/v1/organizations/11111111-1111-1111-1111-111111111111/vehicles';
  const vehicleSingle =
    '/api/v1/core/read/v1/organizations/11111111-1111-1111-1111-111111111111/vehicles/veh-1';

  it('does not allowlist core vehicle read routes', () => {
    expect(isCoreAppM2mAllowlistedApiPath(vehicleList)).toBe(false);
    expect(isCoreAppM2mAllowlistedApiPath(vehicleSingle)).toBe(false);
  });

  it('still allowlists entitlements routes only', () => {
    const org = '11111111-1111-1111-1111-111111111111';
    expect(isCoreAppM2mAllowlistedApiPath(`/api/v1/core/entitlements/v1/organizations/${org}`)).toBe(
      true,
    );
  });
});
