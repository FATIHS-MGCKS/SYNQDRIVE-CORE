import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { parseCoreVehicleReadPagination } from '@modules/core-vehicle-read/core-vehicle-read.pagination';
import { CoreVehicleReadProductGuard } from '@modules/core-vehicle-read/core-vehicle-read.product.guard';
import { CoreTripReadV1Service } from './core-trip-read.v1.service';

type CoreTripReadRequest = {
  coreVehicleReadProductSlug?: ProductSlug;
};

/**
 * Versioned core technical trip read API (P3-PR2).
 *
 * User JWT only (service JWT not allowlisted). Org scope + fleet.read + product license.
 * No private/business classification; see `core-trip-read.v1.types.ts` for the visibility contract.
 */
@Controller('core/read/v1')
@UseGuards(OrgScopingGuard, PermissionsGuard, CoreVehicleReadProductGuard)
export class CoreTripReadV1Controller {
  constructor(private readonly tripRead: CoreTripReadV1Service) {}

  @Get('organizations/:orgId/vehicles/:vehicleId/trips')
  @RequirePermission('fleet', 'read')
  listTrips(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Req() req?: CoreTripReadRequest,
  ) {
    const productSlug = req!.coreVehicleReadProductSlug!;
    const pagination = parseCoreVehicleReadPagination(page, limit);
    return this.tripRead.listForVehicle(orgId, vehicleId, productSlug, pagination);
  }

  @Get('organizations/:orgId/vehicles/:vehicleId/trips/:tripId')
  @RequirePermission('fleet', 'read')
  getTrip(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('tripId') tripId: string,
    @Req() req: CoreTripReadRequest,
  ) {
    const productSlug = req.coreVehicleReadProductSlug!;
    return this.tripRead.getForVehicle(orgId, vehicleId, tripId, productSlug);
  }
}
