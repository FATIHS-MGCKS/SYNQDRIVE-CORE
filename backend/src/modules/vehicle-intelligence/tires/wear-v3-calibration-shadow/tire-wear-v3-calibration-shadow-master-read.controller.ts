import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { TireWearV3CalibrationShadowMasterReadService } from './tire-wear-v3-calibration-shadow-master-read.service';

@Controller('admin/master-intelligence/tire-wear-v3-calibration-shadow')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class TireWearV3CalibrationShadowMasterReadController {
  constructor(private readonly reads: TireWearV3CalibrationShadowMasterReadService) {}

  @Get('summary')
  getSummary() {
    return this.reads.getGlobalSummary();
  }

  @Get('writer-health')
  getWriterHealth() {
    return this.reads.getWriterHealth();
  }

  @Get('organizations')
  listOrganizations(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.reads.listOrganizationsWithSnapshots({
      limit: limit != null ? Number(limit) : undefined,
      offset: offset != null ? Number(offset) : undefined,
    });
  }

  @Get('organizations/:organizationId/vehicles')
  listVehicles(
    @Param('organizationId') organizationId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.reads.listVehiclesWithSnapshots({
      organizationId,
      limit: limit != null ? Number(limit) : undefined,
      offset: offset != null ? Number(offset) : undefined,
    });
  }

  @Get('organizations/:organizationId/vehicles/:vehicleId/setups')
  listSetups(
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.reads.listSetupsForVehicle({ organizationId, vehicleId });
  }

  @Get('organizations/:organizationId/vehicles/:vehicleId/setups/:tireSetupId/snapshots')
  listSnapshots(
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('tireSetupId') tireSetupId: string,
    @Query('wheelPosition') wheelPosition?: string,
    @Query('mountPeriodId') mountPeriodId?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.reads.listSnapshotsForSetup({
      organizationId,
      vehicleId,
      tireSetupId,
      wheelPosition,
      mountPeriodId,
      limit: limit != null ? Number(limit) : undefined,
      cursor: cursor ?? null,
    });
  }

  @Get(
    'organizations/:organizationId/vehicles/:vehicleId/setups/:tireSetupId/snapshots/:snapshotId',
  )
  getSnapshotDetail(
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('tireSetupId') tireSetupId: string,
    @Param('snapshotId') snapshotId: string,
  ) {
    return this.reads.getSnapshotDetail({
      organizationId,
      vehicleId,
      tireSetupId,
      snapshotId,
    });
  }

  @Get('organizations/:organizationId/vehicles/:vehicleId/setups/:tireSetupId/quality')
  getSetupQuality(
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('tireSetupId') tireSetupId: string,
  ) {
    return this.reads.getSetupQualityInspection({
      organizationId,
      vehicleId,
      tireSetupId,
    });
  }

  /** @deprecated Prefer scoped list + quality endpoints; retained for P3 compatibility. */
  @Get('organizations/:organizationId/vehicles/:vehicleId/setups/:tireSetupId')
  getSetupInspection(
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('tireSetupId') tireSetupId: string,
  ) {
    return this.reads.getSetupInspection({
      organizationId,
      vehicleId,
      tireSetupId,
    });
  }
}
