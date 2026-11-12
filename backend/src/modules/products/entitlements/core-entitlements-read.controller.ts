import { Controller, ForbiddenException, Get, Param, Req, UseGuards } from '@nestjs/common';
import { CoreAppEntitlementsAuthGuard } from '@modules/core-app-m2m/core-app-entitlements-auth.guard';
import type { CoreAppServicePrincipal } from '@modules/core-app-m2m/core-app-m2m.types';
import { EntitlementsQueryService } from './entitlements-query.service';

type EntitlementsRequest = {
  coreAppServicePrincipal?: CoreAppServicePrincipal;
};

/**
 * Versioned read API for organization product entitlements (P1A).
 *
 * Full path: /api/v1/core/entitlements/v1/organizations/:orgId[...]
 *
 * Authentication: user JWT (global AuthGuard) or core app service JWT when CORE_APP_M2M_ENABLED.
 * Authorization: CoreAppEntitlementsAuthGuard (OrgScoping for users; service principal for M2M).
 *
 * Writes remain on admin/products (MASTER_ADMIN) — not exposed here.
 */
@Controller('core/entitlements/v1')
@UseGuards(CoreAppEntitlementsAuthGuard)
export class CoreEntitlementsReadController {
  constructor(private readonly entitlements: EntitlementsQueryService) {}

  @Get('organizations/:orgId')
  listOrganizationEntitlements(@Param('orgId') orgId: string, @Req() req: EntitlementsRequest) {
    const principal = req.coreAppServicePrincipal;
    if (principal) {
      return this.entitlements.listForOrganizationProductOnly(orgId, principal.productSlug);
    }
    return this.entitlements.listForOrganization(orgId);
  }

  @Get('organizations/:orgId/products/:productSlug')
  getOrganizationProductEntitlement(
    @Param('orgId') orgId: string,
    @Param('productSlug') productSlug: string,
    @Req() req: EntitlementsRequest,
  ) {
    const principal = req.coreAppServicePrincipal;
    if (principal && productSlug !== principal.productSlug) {
      throw new ForbiddenException('Service token is not authorized for this product');
    }
    return this.entitlements.getForOrganizationProduct(orgId, productSlug);
  }
}
