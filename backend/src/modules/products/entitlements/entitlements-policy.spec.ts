import { OrgProductStatus } from '@prisma/client';
import { isEntitledForAnyAccess, resolveEntitlementCapabilities } from './entitlements-policy';

describe('entitlements-policy', () => {
  it('ACTIVE grants UI and vehicle activation', () => {
    expect(resolveEntitlementCapabilities(OrgProductStatus.ACTIVE)).toEqual({
      canAccessProductUi: true,
      canActivateVehicles: true,
    });
    expect(isEntitledForAnyAccess(OrgProductStatus.ACTIVE)).toBe(true);
  });

  it('TRIAL grants UI only (vehicle activation fail-closed, B5)', () => {
    expect(resolveEntitlementCapabilities(OrgProductStatus.TRIAL)).toEqual({
      canAccessProductUi: true,
      canActivateVehicles: false,
    });
    expect(isEntitledForAnyAccess(OrgProductStatus.TRIAL)).toBe(true);
  });

  it('SUSPENDED and CANCELLED deny all capabilities', () => {
    for (const status of [OrgProductStatus.SUSPENDED, OrgProductStatus.CANCELLED] as const) {
      expect(resolveEntitlementCapabilities(status)).toEqual({
        canAccessProductUi: false,
        canActivateVehicles: false,
      });
      expect(isEntitledForAnyAccess(status)).toBe(false);
    }
  });

  it('missing assignment is not entitled', () => {
    expect(resolveEntitlementCapabilities(null)).toEqual({
      canAccessProductUi: false,
      canActivateVehicles: false,
    });
    expect(isEntitledForAnyAccess(undefined)).toBe(false);
  });
});
