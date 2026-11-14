import {
  extractOrgIdFromAppVehicleReadPath,
  isCoreAppM2mAllowlistedApiPath,
} from './core-app-m2m.allowlist';

describe('core-app-m2m.allowlist', () => {
  const org = 'org-aaaaaaaa-bbbb-cccc-dddddddddddd';

  it('matches exact app vehicle list and detail paths only', () => {
    const list = `/api/v1/core/app/read/v1/organizations/${org}/products/RENTAL/vehicles`;
    const detail = `${list}/veh-1`;
    expect(isCoreAppM2mAllowlistedApiPath(list)).toBe(true);
    expect(isCoreAppM2mAllowlistedApiPath(detail)).toBe(true);
    expect(isCoreAppM2mAllowlistedApiPath(`${list}/extra/nested`)).toBe(false);
    expect(isCoreAppM2mAllowlistedApiPath(list.replace('/vehicles', '/vehicles-extra'))).toBe(false);
  });

  it('extracts org id from app vehicle read paths', () => {
    const path = `/api/v1/core/app/read/v1/organizations/${org}/products/FLEET/vehicles/veh-1`;
    expect(extractOrgIdFromAppVehicleReadPath(path)).toBe(org);
  });
});