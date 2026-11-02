import { describe, expect, it, vi } from 'vitest';
import { MASTER_NAV_ITEM_BY_ID } from '../navigation/master-nav.config';
import { canAccessMasterNavItem, getVisibleMasterNavItemIds } from '../navigation/master-nav-permissions';

vi.mock('../../lib/auth', () => ({
  getStoredUser: () => ({ platformRole: 'ORG_ADMIN', platformPermissions: ['master-billing'] }),
  isMasterAdmin: () => false,
  hasMasterBillingAccess: () => true,
}));

describe('Master Intelligence — permission isolation', () => {
  it('does not grant intelligence nav to billing-only users', () => {
    expect(canAccessMasterNavItem(MASTER_NAV_ITEM_BY_ID['vsi-intelligence'])).toBe(false);
    expect(canAccessMasterNavItem(MASTER_NAV_ITEM_BY_ID['apds-intelligence'])).toBe(false);
    expect(getVisibleMasterNavItemIds()).not.toContain('vsi-intelligence');
    expect(getVisibleMasterNavItemIds()).not.toContain('apds-intelligence');
  });
});
