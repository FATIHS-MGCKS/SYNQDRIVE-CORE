import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { SchedulerLeaderElectionModule } from '@shared/scheduler-leader/scheduler-leader-election.module';
import { DiV0Ds4RpmHfV1aModule } from '../rpm-hf-v1a/di-v0-ds4-rpm-hf-v1a.module';
import { Ds4RpmHfV1bShadowScheduler } from './ds4-rpm-hf-v1b-shadow.scheduler';
import { Ds4RpmHfV1bShadowService } from './ds4-rpm-hf-v1b-shadow.service';

/**
 * DS4 RPM HF V1B — post-trip temporal quality shadow (flags OFF by default).
 * Does not alter V1A contract, customer scores, or motion-core shadow scheduler.
 */
@Module({
  imports: [PrismaModule, SchedulerLeaderElectionModule, DiV0Ds4RpmHfV1aModule],
  providers: [Ds4RpmHfV1bShadowService, Ds4RpmHfV1bShadowScheduler],
  exports: [Ds4RpmHfV1bShadowService],
})
export class DiV0Ds4RpmHfV1bModule {}
