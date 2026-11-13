import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { ProductSlug } from '@prisma/client';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { CoreVehicleReadProductGuard } from '@modules/core-vehicle-read/core-vehicle-read.product.guard';
import { CoreDtcReadV1Service } from './core-dtc-read.v1.service';

type CoreDtcReadRequest = {
  coreVehicleReadProductSlug?: ProductSlug;
};

/**
 * Versioned core DTC technical read API (P3-PR5).
 * User JWT only — not on M2M allowlist.
 */
@Controller('core/read/v1')
@UseGuards(OrgScopingGuard, PermissionsGuard, CoreVehicleReadProductGuard)
export class CoreDtcReadV1Controller {
  constructor(private readonly dtcRead: CoreDtcReadV1Service) {}

  @Get('organizations/:orgId/vehicles/:vehicleId/dtc')
  @RequirePermission('fleet', 'read')
  getDtc(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Req() req: CoreDtcReadRequest,
  ) {
    const productSlug = req.coreVehicleReadProductSlug!;
    return this.dtcRead.getForVehicle(orgId, vehicleId, productSlug);
  }
}
