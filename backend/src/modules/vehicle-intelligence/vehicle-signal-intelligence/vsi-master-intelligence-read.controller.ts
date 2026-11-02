import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { VsiMasterIntelligenceReadService } from './vsi-master-intelligence-read.service';

/**
 * Production read-only Master Admin VSI intelligence (PR2). No materialize, no DIMO.
 * MFA step-up deferred by owner — MASTER_ADMIN RBAC only until SynqDrive MFA is activated.
 */
@Controller('admin/master-intelligence/vsi')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class VsiMasterIntelligenceReadController {
  constructor(private readonly reads: VsiMasterIntelligenceReadService) {}

  @Get('organizations/:organizationId/vehicles/:vehicleId/overview')
  getOverview(
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.reads.getFleetOverview(organizationId, vehicleId);
  }

  @Get('organizations/:organizationId/vehicles/:vehicleId/links/:providerSourceLinkId/profile')
  getProfile(
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('providerSourceLinkId') providerSourceLinkId: string,
  ) {
    return this.reads.getProfileDetail(organizationId, vehicleId, providerSourceLinkId);
  }

  @Get('organizations/:organizationId/vehicles/:vehicleId/links/:providerSourceLinkId/signals')
  getSignals(
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('providerSourceLinkId') providerSourceLinkId: string,
  ) {
    return this.reads.getReadonlySignals(organizationId, vehicleId, providerSourceLinkId);
  }

  @Get('organizations/:organizationId/vehicles/:vehicleId/links/:providerSourceLinkId/revisions')
  getRevisions(
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('providerSourceLinkId') providerSourceLinkId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.reads.getRevisionHistoryPage({
      organizationId,
      vehicleId,
      providerSourceLinkId,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      cursor: cursor ?? null,
    });
  }

  @Get('organizations/:organizationId/vehicles/:vehicleId/links/:providerSourceLinkId/revisions/as-of')
  getRevisionAsOf(
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('providerSourceLinkId') providerSourceLinkId: string,
    @Query('decisionAt') decisionAt: string,
    @Query('historicalLinkAttributionProven') historicalLinkAttributionProven?: string,
  ) {
    return this.reads.resolveRevisionAsOf({
      organizationId,
      vehicleId,
      providerSourceLinkId,
      decisionAt,
      historicalLinkAttributionProven: historicalLinkAttributionProven === 'true',
    });
  }

  @Get('organizations/:organizationId/vehicles/:vehicleId/links/:providerSourceLinkId/capability-resolver')
  resolveCapability(
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('providerSourceLinkId') providerSourceLinkId: string,
    @Query('consumerModule') consumerModule: string,
    @Query('featureId') featureId: string,
    @Query('evaluationTime') evaluationTime?: string,
  ) {
    return this.reads.resolveCapability({
      organizationId,
      vehicleId,
      providerSourceLinkId,
      consumerModule,
      featureId,
      evaluationTime,
    });
  }
}
