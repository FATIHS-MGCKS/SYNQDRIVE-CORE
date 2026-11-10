import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { ObservabilityModule } from '@modules/observability/observability.module';
import { ApdsV3ShadowEligibilityService } from './apds-v3-shadow-eligibility.service';
import { ApdsV3ShadowRepository } from './apds-v3-shadow.repository';
import { ApdsV3ShadowService } from './apds-v3-shadow.service';
import { ApdsV3ShadowMetricsService } from './apds-v3-shadow-metrics.service';

@Module({
  imports: [PrismaModule, ObservabilityModule],
  providers: [
    ApdsV3ShadowEligibilityService,
    ApdsV3ShadowRepository,
    ApdsV3ShadowMetricsService,
    ApdsV3ShadowService,
  ],
  exports: [ApdsV3ShadowService],
})
export class ApdsV3ShadowModule {}
