import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { ApdsMasterIntelligenceReadService } from './apds-master-intelligence-read.service';

/**
 * Read-only Master Admin APDS shadow intelligence (PR3). No activation, no provider calls, no MFA step-up.
 */
@Controller('admin/master-intelligence/apds')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class ApdsMasterIntelligenceReadController {
  constructor(private readonly reads: ApdsMasterIntelligenceReadService) {}

  @Get('organizations/:organizationId/vehicles/:vehicleId/overview')
  getOverview(
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Query('providerSourceLinkId') providerSourceLinkId?: string,
  ) {
    return this.reads.getOverview(organizationId, vehicleId, providerSourceLinkId ?? null);
  }

  @Get('organizations/:organizationId/vehicles/:vehicleId/epochs')
  getEpochs(
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.reads.getEpochHistory({
      organizationId,
      vehicleId,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      cursor: cursor ?? null,
    });
  }

  @Get('organizations/:organizationId/vehicles/:vehicleId/decisions')
  getDecisions(
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('policyVersion') policyVersion?: string,
  ) {
    return this.reads.getDecisionHistory({
      organizationId,
      vehicleId,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      cursor: cursor ?? null,
      policyVersion: policyVersion ?? null,
    });
  }

  @Get('organizations/:organizationId/vehicles/:vehicleId/decisions/:opportunityId')
  getDecisionDetail(
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('opportunityId') opportunityId: string,
    @Query('policyVersion') policyVersion: string,
  ) {
    if (!policyVersion?.trim()) {
      throw new BadRequestException('policyVersion query parameter is required');
    }
    return this.reads.getDecisionDetail({
      organizationId,
      vehicleId,
      opportunityId,
      policyVersion,
    });
  }

  @Get('organizations/:organizationId/vehicles/:vehicleId/decisions/:opportunityId/vsi-correlation')
  getVsiCorrelation(
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('opportunityId') opportunityId: string,
    @Query('providerSourceLinkId') providerSourceLinkId: string,
    @Query('policyVersion') policyVersion: string,
    @Query('decisionAt') decisionAt: string,
    @Query('historicalLinkAttributionProven') historicalLinkAttributionProven?: string,
  ) {
    return this.reads.getVsiCorrelation({
      organizationId,
      vehicleId,
      providerSourceLinkId,
      opportunityId,
      policyVersion,
      decisionAt,
      historicalLinkAttributionProven: historicalLinkAttributionProven === 'true',
    });
  }

  @Get('organizations/:organizationId/vehicles/:vehicleId/real-polls/:realPollId')
  getRealPoll(
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('realPollId') realPollId: string,
  ) {
    return this.reads.getRealPollEvidence(organizationId, vehicleId, realPollId);
  }
}
