import { isCoreAppM2mAllowlistedApiPath } from '@modules/core-app-m2m/core-app-m2m.allowlist';

describe('Core battery read API — M2M allowlist unchanged (P3-PR4)', () => {
  const batteryPath =
    '/api/v1/core/read/v1/organizations/11111111-1111-1111-1111-111111111111/vehicles/veh-1/battery';

  it('does not allowlist core battery read route', () => {
    expect(isCoreAppM2mAllowlistedApiPath(batteryPath)).toBe(false);
  });
});
