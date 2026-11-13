import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { ProductSlug } from '@prisma/client';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { CoreVehicleReadProductGuard } from '@modules/core-vehicle-read/core-vehicle-read.product.guard';
import { CoreDrivingAssessmentReadV1Service } from './core-driving-assessment-read.v1.service';

type CoreDrivingAssessmentReadRequest = {
  coreVehicleReadProductSlug?: ProductSlug;
};

/**
 * Versioned core DS4 Assessment L2 read API (P3-PR3).
 *
 * User JWT only (service JWT not allowlisted). Trip visibility matches core.trip.read.v1.
 * See `core-driving-assessment-read.v1.types.ts` for publication-safety contract.
 */
@Controller('core/read/v1')
@UseGuards(OrgScopingGuard, PermissionsGuard, CoreVehicleReadProductGuard)
export class CoreDrivingAssessmentReadV1Controller {
  constructor(private readonly drivingAssessmentRead: CoreDrivingAssessmentReadV1Service) {}

  @Get('organizations/:orgId/vehicles/:vehicleId/trips/:tripId/driving-assessment')
  @RequirePermission('fleet', 'read')
  getDrivingAssessment(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('tripId') tripId: string,
    @Req() req: CoreDrivingAssessmentReadRequest,
  ) {
    const productSlug = req.coreVehicleReadProductSlug!;
    return this.drivingAssessmentRead.getForTrip(orgId, vehicleId, tripId, productSlug);
  }
}
