import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PdiMasterIntelligenceReadService } from './pdi-master-intelligence-read.service';

/**
 * Read-only Master Admin PDI device intelligence (PR4). No provisioning writes, no MFA step-up.
 */
@Controller('admin/master-intelligence/pdi')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class PdiMasterIntelligenceReadController {
  constructor(private readonly reads: PdiMasterIntelligenceReadService) {}

  @Get('devices/:physicalDeviceId/intelligence')
  getIntelligence(
    @Param('physicalDeviceId') physicalDeviceId: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.reads.getDeviceIntelligence(physicalDeviceId, organizationId ?? null);
  }

  @Get('devices/:physicalDeviceId/connection-episodes')
  getConnectionEpisodes(
    @Param('physicalDeviceId') physicalDeviceId: string,
    @Query('organizationId') organizationId: string,
    @Query('vehicleId') vehicleId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    if (!organizationId?.trim() || !vehicleId?.trim()) {
      throw new BadRequestException('organizationId and vehicleId are required');
    }
    return this.reads.getConnectionEpisodes({
      physicalDeviceId,
      organizationId: organizationId.trim(),
      vehicleId: vehicleId.trim(),
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      cursor: cursor ?? null,
    });
  }
}
