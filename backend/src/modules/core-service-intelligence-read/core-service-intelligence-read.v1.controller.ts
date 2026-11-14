import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { ProductSlug } from '@prisma/client';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { CoreVehicleReadProductGuard } from '@modules/core-vehicle-read/core-vehicle-read.product.guard';
import { CoreServiceIntelligenceReadV1Service } from './core-service-intelligence-read.v1.service';

type CoreServiceIntelligenceReadRequest = {
  coreVehicleReadProductSlug?: ProductSlug;
};

/**
 * Versioned core service intelligence read API (P3-PR6).
 * User JWT only — not on M2M allowlist.
 */
@Controller('core/read/v1')
@UseGuards(OrgScopingGuard, PermissionsGuard, CoreVehicleReadProductGuard)
export class CoreServiceIntelligenceReadV1Controller {
  constructor(private readonly serviceIntelligenceRead: CoreServiceIntelligenceReadV1Service) {}

  @Get('organizations/:orgId/vehicles/:vehicleId/service-intelligence')
  @RequirePermission('fleet', 'read')
  getServiceIntelligence(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Req() req: CoreServiceIntelligenceReadRequest,
  ) {
    const productSlug = req.coreVehicleReadProductSlug!;
    return this.serviceIntelligenceRead.getForVehicle(orgId, vehicleId, productSlug);
  }
}
