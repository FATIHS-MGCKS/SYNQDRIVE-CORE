import { isCoreAppM2mAllowlistedApiPath } from '@modules/core-app-m2m/core-app-m2m.allowlist';

describe('Core service intelligence read — M2M allowlist unchanged', () => {
  const path =
    '/api/v1/core/read/v1/organizations/11111111-1111-1111-1111-111111111111/vehicles/veh-1/service-intelligence';

  it('does not allowlist core service intelligence route', () => {
    expect(isCoreAppM2mAllowlistedApiPath(path)).toBe(false);
  });
});
