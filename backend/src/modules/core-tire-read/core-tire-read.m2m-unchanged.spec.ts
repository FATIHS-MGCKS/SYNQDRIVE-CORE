import { isCoreAppM2mAllowlistedApiPath } from '@modules/core-app-m2m/core-app-m2m.allowlist';

describe('Core tire read API — M2M allowlist unchanged (P3-PR7)', () => {
  const tirePath =
    '/api/v1/core/read/v1/organizations/11111111-1111-1111-1111-111111111111/vehicles/veh-1/tires';

  it('does not allowlist core tire read route', () => {
    expect(isCoreAppM2mAllowlistedApiPath(tirePath)).toBe(false);
  });
});