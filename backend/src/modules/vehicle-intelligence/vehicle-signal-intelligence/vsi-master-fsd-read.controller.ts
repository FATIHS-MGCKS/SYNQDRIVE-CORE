import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { VsiMasterFsdReadService } from './vsi-master-fsd-read.service';

/**
 * Read-only Master Admin FSD evidence projection for VSI 2.0 (no provider dispatch, no mutations).
 */
@Controller('admin/master-intelligence/vsi')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class VsiMasterFsdReadController {
  constructor(private readonly reads: VsiMasterFsdReadService) {}

  @Get('organizations/:organizationId/vehicles/:vehicleId/links/:providerSourceLinkId/fsd/summary')
  getSummary(
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('providerSourceLinkId') providerSourceLinkId: string,
  ) {
    return this.reads.getSummary(organizationId, vehicleId, providerSourceLinkId);
  }

  @Get('organizations/:organizationId/vehicles/:vehicleId/links/:providerSourceLinkId/fsd/signals')
  getSignals(
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('providerSourceLinkId') providerSourceLinkId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('runId') runId?: string,
  ) {
    return this.reads.getSignalExplorer({
      organizationId,
      vehicleId,
      providerSourceLinkId,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      cursor: cursor ?? null,
      runId: runId ?? null,
    });
  }

  @Get('organizations/:organizationId/vehicles/:vehicleId/links/:providerSourceLinkId/fsd/runs')
  getRuns(
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('providerSourceLinkId') providerSourceLinkId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.reads.getRunHistory({
      organizationId,
      vehicleId,
      providerSourceLinkId,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      cursor: cursor ?? null,
    });
  }

  @Get(
    'organizations/:organizationId/vehicles/:vehicleId/links/:providerSourceLinkId/fsd/runs/:runId/inspector',
  )
  getRunInspector(
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('providerSourceLinkId') providerSourceLinkId: string,
    @Param('runId') runId: string,
  ) {
    return this.reads.getRunInspector({
      organizationId,
      vehicleId,
      providerSourceLinkId,
      runId,
    });
  }
}
