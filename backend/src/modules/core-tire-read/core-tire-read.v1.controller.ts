import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { ProductSlug } from '@prisma/client';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { CoreVehicleReadProductGuard } from '@modules/core-vehicle-read/core-vehicle-read.product.guard';
import { CoreTireReadV1Service } from './core-tire-read.v1.service';

type CoreTireReadRequest = {
  coreVehicleReadProductSlug?: ProductSlug;
};

/**
 * Versioned core tire technical read API (P3-PR7).
 * User JWT only — not on M2M allowlist.
 */
@Controller('core/read/v1')
@UseGuards(OrgScopingGuard, PermissionsGuard, CoreVehicleReadProductGuard)
export class CoreTireReadV1Controller {
  constructor(private readonly tireRead: CoreTireReadV1Service) {}

  @Get('organizations/:orgId/vehicles/:vehicleId/tires')
  @RequirePermission('fleet', 'read')
  getTires(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Req() req: CoreTireReadRequest,
  ) {
    const productSlug = req.coreVehicleReadProductSlug!;
    return this.tireRead.getForVehicle(orgId, vehicleId, productSlug);
  }
}