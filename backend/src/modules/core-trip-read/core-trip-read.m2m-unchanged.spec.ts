import { isCoreAppM2mAllowlistedApiPath } from '@modules/core-app-m2m/core-app-m2m.allowlist';

describe('Core trip read API — M2M allowlist unchanged (P3-PR2)', () => {
  const org = '11111111-1111-1111-1111-111111111111';
  const veh = 'veh-1';
  const trip = 'trip-1';

  it('does not allowlist core trip read routes', () => {
    expect(
      isCoreAppM2mAllowlistedApiPath(
        `/api/v1/core/read/v1/organizations/${org}/vehicles/${veh}/trips`,
      ),
    ).toBe(false);
    expect(
      isCoreAppM2mAllowlistedApiPath(
        `/api/v1/core/read/v1/organizations/${org}/vehicles/${veh}/trips/${trip}`,
      ),
    ).toBe(false);
  });
});
