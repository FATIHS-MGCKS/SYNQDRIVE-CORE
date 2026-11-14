import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { ProductSlug } from '@prisma/client';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { CoreVehicleReadProductGuard } from '@modules/core-vehicle-read/core-vehicle-read.product.guard';
import { CoreBrakeReadV1Service } from './core-brake-read.v1.service';

type CoreBrakeReadRequest = {
  coreVehicleReadProductSlug?: ProductSlug;
};

/**
 * Versioned core brake technical read API (P3-PR8).
 * User JWT only — not on M2M allowlist.
 */
@Controller('core/read/v1')
@UseGuards(OrgScopingGuard, PermissionsGuard, CoreVehicleReadProductGuard)
export class CoreBrakeReadV1Controller {
  constructor(private readonly brakeRead: CoreBrakeReadV1Service) {}

  @Get('organizations/:orgId/vehicles/:vehicleId/brakes')
  @RequirePermission('fleet', 'read')
  getBrakes(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Req() req: CoreBrakeReadRequest,
  ) {
    const productSlug = req.coreVehicleReadProductSlug!;
    return this.brakeRead.getForVehicle(orgId, vehicleId, productSlug);
  }
}