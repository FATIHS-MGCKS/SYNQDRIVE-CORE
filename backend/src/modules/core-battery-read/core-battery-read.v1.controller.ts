import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { ProductSlug } from '@prisma/client';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { CoreVehicleReadProductGuard } from '@modules/core-vehicle-read/core-vehicle-read.product.guard';
import { CoreBatteryReadV1Service } from './core-battery-read.v1.service';

type CoreBatteryReadRequest = {
  coreVehicleReadProductSlug?: ProductSlug;
};

/**
 * Versioned core battery technical read API (P3-PR4).
 *
 * User JWT only (service JWT not allowlisted). See `core-battery-read.v1.types.ts`.
 */
@Controller('core/read/v1')
@UseGuards(OrgScopingGuard, PermissionsGuard, CoreVehicleReadProductGuard)
export class CoreBatteryReadV1Controller {
  constructor(private readonly batteryRead: CoreBatteryReadV1Service) {}

  @Get('organizations/:orgId/vehicles/:vehicleId/battery')
  @RequirePermission('fleet', 'read')
  getBattery(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Req() req: CoreBatteryReadRequest,
  ) {
    const productSlug = req.coreVehicleReadProductSlug!;
    return this.batteryRead.getForVehicle(orgId, vehicleId, productSlug);
  }
}
