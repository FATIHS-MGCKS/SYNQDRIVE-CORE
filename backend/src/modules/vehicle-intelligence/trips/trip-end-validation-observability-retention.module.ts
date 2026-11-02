import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import tripEndValidationObservabilityRetentionConfig from '@config/trip-end-validation-observability-retention.config';
import { SchedulerLeaderElectionModule } from '@shared/scheduler-leader/scheduler-leader-election.module';
import { TripEndValidationObservabilityRetentionService } from './trip-end-validation-observability-retention.service';

@Module({
  imports: [
    ConfigModule.forFeature(tripEndValidationObservabilityRetentionConfig),
    SchedulerLeaderElectionModule,
  ],
  providers: [TripEndValidationObservabilityRetentionService],
  exports: [TripEndValidationObservabilityRetentionService],
})
export class TripEndValidationObservabilityRetentionModule {}
