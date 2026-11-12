import { OrgProductStatus } from '@prisma/client';
import {
  isEntitledForAnyAccess,
  isOrganizationProductLicenseTermExpired,
  resolveEntitlementCapabilities,
} from './entitlements-policy';

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

  describe('OrganizationProduct.expiresAt (status-only parity with ProductLicenseGuard)', () => {
    const past = new Date('2020-01-01T00:00:00.000Z');
    const future = new Date('2030-01-01T00:00:00.000Z');
    const asOf = new Date('2026-06-01T00:00:00.000Z');

    it('reports licenseTermExpired factually when expiresAt is in the past', () => {
      expect(isOrganizationProductLicenseTermExpired(past, asOf)).toBe(true);
      expect(isOrganizationProductLicenseTermExpired(future, asOf)).toBe(false);
      expect(isOrganizationProductLicenseTermExpired(null, asOf)).toBe(false);
    });

    it('keeps ACTIVE capabilities when licenseTermExpired (no expiresAt enforcement yet)', () => {
      expect(resolveEntitlementCapabilities(OrgProductStatus.ACTIVE)).toEqual({
        canAccessProductUi: true,
        canActivateVehicles: true,
      });
      expect(isOrganizationProductLicenseTermExpired(past, asOf)).toBe(true);
    });
  });
});
