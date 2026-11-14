import { isCoreAppM2mAllowlistedApiPath } from '@modules/core-app-m2m/core-app-m2m.allowlist';

describe('Core App vehicle read M2M allowlist regression', () => {
  const org = '11111111-1111-1111-1111-111111111111';

  it('allowlists app vehicle read paths', () => {
    expect(
      isCoreAppM2mAllowlistedApiPath(
        `/api/v1/core/app/read/v1/organizations/${org}/products/RENTAL/vehicles`,
      ),
    ).toBe(true);
    expect(
      isCoreAppM2mAllowlistedApiPath(
        `/api/v1/core/app/read/v1/organizations/${org}/products/RENTAL/vehicles/veh-1`,
      ),
    ).toBe(true);
  });

  it('does not allowlist legacy core.read.v1 vehicle paths', () => {
    expect(
      isCoreAppM2mAllowlistedApiPath(`/api/v1/core/read/v1/organizations/${org}/vehicles`),
    ).toBe(false);
    expect(
      isCoreAppM2mAllowlistedApiPath(
        `/api/v1/core/read/v1/organizations/${org}/vehicles/veh-1`,
      ),
    ).toBe(false);
  });
});