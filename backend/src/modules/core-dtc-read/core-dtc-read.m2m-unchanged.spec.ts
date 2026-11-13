import { isCoreAppM2mAllowlistedApiPath } from '@modules/core-app-m2m/core-app-m2m.allowlist';

describe('Core DTC read API — M2M allowlist unchanged (P3-PR5)', () => {
  const dtcPath =
    '/api/v1/core/read/v1/organizations/11111111-1111-1111-1111-111111111111/vehicles/veh-1/dtc';

  it('does not allowlist core DTC read route', () => {
    expect(isCoreAppM2mAllowlistedApiPath(dtcPath)).toBe(false);
  });
});
