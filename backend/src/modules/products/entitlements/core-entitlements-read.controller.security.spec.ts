import { CoreAppEntitlementsAuthGuard } from '@modules/core-app-m2m/core-app-entitlements-auth.guard';
import { CoreEntitlementsReadController } from './core-entitlements-read.controller';

describe('CoreEntitlementsReadController security metadata', () => {
  it('uses core/entitlements/v1 controller prefix', () => {
    const path = Reflect.getMetadata('path', CoreEntitlementsReadController);
    expect(path).toBe('core/entitlements/v1');
  });

  it('applies CoreAppEntitlementsAuthGuard for user and service principals', () => {
    const guards = Reflect.getMetadata('__guards__', CoreEntitlementsReadController);
    expect(guards).toEqual(expect.arrayContaining([CoreAppEntitlementsAuthGuard]));
  });

  it('exposes org-scoped list route', () => {
    const listHandler = CoreEntitlementsReadController.prototype.listOrganizationEntitlements;
    const listPath = Reflect.getMetadata('path', listHandler);
    expect(listPath).toBe('organizations/:orgId');
  });

  it('exposes org-scoped single-product route', () => {
    const handler = CoreEntitlementsReadController.prototype.getOrganizationProductEntitlement;
    const singlePath = Reflect.getMetadata('path', handler);
    expect(singlePath).toBe('organizations/:orgId/products/:productSlug');
  });
});
