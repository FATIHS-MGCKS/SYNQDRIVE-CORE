import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import type { CoreAppServicePrincipal } from '@modules/core-app-m2m/core-app-m2m.types';
import { CoreAppVehicleReadAuthGuard } from './core-app-vehicle-read-auth.guard';
import { CoreAppVehicleReadV1Service } from './core-app-vehicle-read.v1.service';

type CoreAppVehicleReadRequest = {
  coreAppServicePrincipal: CoreAppServicePrincipal;
};

/**
 * Product-bound Core App vehicle identity read API (P3-PR11B).
 *
 * Full path: /api/v1/core/app/read/v1/organizations/:orgId/products/:productSlug/vehicles[...]
 *
 * Authentication: Core App service JWT only (core:app:vehicle:read).
 * Product identity is bound to the verified service principal; path product must match.
 */
@Controller('core/app/read/v1')
@UseGuards(CoreAppVehicleReadAuthGuard)
export class CoreAppVehicleReadV1Controller {
  constructor(private readonly vehicleRead: CoreAppVehicleReadV1Service) {}

  @Get('organizations/:orgId/products/:productSlug/vehicles')
  listVehicles(
    @Param('orgId') orgId: string,
    @Req() req: CoreAppVehicleReadRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const productSlug = req.coreAppServicePrincipal.productSlug as ProductSlug;
    const pagination = this.vehicleRead.parsePagination(page, limit);
    return this.vehicleRead.listForProduct(orgId, productSlug, pagination);
  }

  @Get('organizations/:orgId/products/:productSlug/vehicles/:vehicleId')
  getVehicle(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Req() req: CoreAppVehicleReadRequest,
  ) {
    const productSlug = req.coreAppServicePrincipal.productSlug as ProductSlug;
    return this.vehicleRead.getForProduct(orgId, vehicleId, productSlug);
  }
}