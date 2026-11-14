import { isCoreAppM2mAllowlistedApiPath } from '@modules/core-app-m2m/core-app-m2m.allowlist';

describe('Core brake read API — M2M allowlist unchanged (P3-PR8)', () => {
  const brakePath =
    '/api/v1/core/read/v1/organizations/11111111-1111-1111-1111-111111111111/vehicles/veh-1/brakes';

  it('does not allowlist core brake read route', () => {
    expect(isCoreAppM2mAllowlistedApiPath(brakePath)).toBe(false);
  });
});