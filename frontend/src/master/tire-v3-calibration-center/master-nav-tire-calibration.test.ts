import { describe, expect, it, vi } from 'vitest';
import { MASTER_NAV_GROUPS, MASTER_NAV_ITEM_BY_ID } from '../navigation/master-nav.config';
import { getVisibleMasterNavItemIds } from '../navigation/master-nav-permissions';

vi.mock('../../lib/auth', () => ({
  getStoredUser: () => ({ platformRole: 'MASTER_ADMIN' }),
  isMasterAdmin: () => true,
  hasMasterBillingAccess: () => false,
}));
import { getVisibleMasterNavItemIds } from '../navigation/master-nav-permissions';

describe('master nav tire calibration center', () => {
  it('registers engineering nav item', () => {
    const item = MASTER_NAV_ITEM_BY_ID['tire-v3-calibration-center'];
    expect(item?.labelKey).toBe('master.nav.tireV3CalibrationCenter');
    expect(item?.permissions).toContain('MASTER_ADMIN');
  });

  it('is listed under engineering group', () => {
    const engineering = MASTER_NAV_GROUPS.find((g) => g.id === 'engineering');
    expect(engineering?.items).toContain('tire-v3-calibration-center');
  });

  it('is visible for master admin permission set', () => {
    expect(getVisibleMasterNavItemIds()).toContain('tire-v3-calibration-center');
  });
});
