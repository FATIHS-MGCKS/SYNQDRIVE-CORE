import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { RedisModule } from '@shared/redis/redis.module';
import { ObservabilityModule } from '@modules/observability/observability.module';
import { AdaptivePollingShadowRepository } from './adaptive-polling-shadow.repository';
import { AdaptivePollingShadowMetricsService } from './adaptive-polling-shadow-metrics.service';
import { AdaptivePollingShadowService } from './adaptive-polling-shadow.service';
import { ApdShadowActivationEpochService } from './apd-shadow-activation-epoch.service';
import { ApdShadowVsiLvAvailabilityLoader } from './apd-shadow-vsi-lv-availability.loader';
import { ApdShadowBaselinePollEvidenceService } from './apd-shadow-baseline-poll-evidence.service';

@Module({
  imports: [PrismaModule, ObservabilityModule, RedisModule],
  providers: [
    AdaptivePollingShadowRepository,
    AdaptivePollingShadowMetricsService,
    ApdShadowActivationEpochService,
    ApdShadowVsiLvAvailabilityLoader,
    ApdShadowBaselinePollEvidenceService,
    AdaptivePollingShadowService,
  ],
  exports: [
    AdaptivePollingShadowService,
    ApdShadowActivationEpochService,
    ApdShadowBaselinePollEvidenceService,
  ],
})
export class AdaptivePollingShadowModule {}
