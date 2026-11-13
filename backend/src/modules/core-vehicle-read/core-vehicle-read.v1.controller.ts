import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { parseCoreVehicleReadPagination } from './core-vehicle-read.pagination';
import { CoreVehicleReadProductGuard } from './core-vehicle-read.product.guard';
import { CoreVehicleReadV1Service } from './core-vehicle-read.v1.service';

type CoreVehicleReadRequest = {
  coreVehicleReadProductSlug?: ProductSlug;
};

/**
 * Versioned core vehicle identity read API (P3-PR1).
 *
 * **Product scope:** Org-wide vehicle registry reads for user JWT callers with `fleet.read`.
 * `?productSlug=` confirms an active `OrganizationProduct` license only — not per-vehicle
 * product assignment. Future App/M2M may require explicit ProductVehicle grants (not in P3-PR1).
 *
 * Auth: user JWT (global AuthGuard). Service JWT not allowlisted — fail-closed.
 * Org scoping + fleet read permission + active product license via ?productSlug=
 */
@Controller('core/read/v1')
@UseGuards(OrgScopingGuard, PermissionsGuard, CoreVehicleReadProductGuard)
export class CoreVehicleReadV1Controller {
  constructor(private readonly vehicleRead: CoreVehicleReadV1Service) {}

  @Get('organizations/:orgId/vehicles')
  @RequirePermission('fleet', 'read')
  listVehicles(
    @Param('orgId') orgId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Req() req?: CoreVehicleReadRequest,
  ) {
    const productSlug = req!.coreVehicleReadProductSlug!;
    const pagination = parseCoreVehicleReadPagination(page, limit);
    return this.vehicleRead.listForOrganization(orgId, productSlug, pagination);
  }

  @Get('organizations/:orgId/vehicles/:vehicleId')
  @RequirePermission('fleet', 'read')
  getVehicle(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Req() req: CoreVehicleReadRequest,
  ) {
    const productSlug = req.coreVehicleReadProductSlug!;
    return this.vehicleRead.getForOrganization(orgId, vehicleId, productSlug);
  }
}
