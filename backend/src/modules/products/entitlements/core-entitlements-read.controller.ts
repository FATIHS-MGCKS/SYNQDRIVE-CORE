import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { EntitlementsQueryService } from './entitlements-query.service';

/**
 * Versioned read API for organization product entitlements (P1A).
 *
 * Full path: /api/v1/core/entitlements/v1/organizations/:orgId[...]
 *
 * Authentication: user JWT via global AuthGuard only (no M2M — blocker B1).
 * Authorization: OrgScopingGuard (tenant isolation; MASTER_ADMIN cross-org read).
 *
 * Writes remain on admin/products (MASTER_ADMIN) — not exposed here.
 */
@Controller('core/entitlements/v1')
@UseGuards(OrgScopingGuard)
export class CoreEntitlementsReadController {
  constructor(private readonly entitlements: EntitlementsQueryService) {}

  @Get('organizations/:orgId')
  listOrganizationEntitlements(@Param('orgId') orgId: string) {
    return this.entitlements.listForOrganization(orgId);
  }

  @Get('organizations/:orgId/products/:productSlug')
  getOrganizationProductEntitlement(
    @Param('orgId') orgId: string,
    @Param('productSlug') productSlug: string,
  ) {
    return this.entitlements.getForOrganizationProduct(orgId, productSlug);
  }
}
