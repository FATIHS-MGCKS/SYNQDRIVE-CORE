import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { OneAutoProviderExecutionService } from './oneauto-provider-execution.service';

@Injectable()
export class OneAutoProviderJobExpiryScheduler {
  private readonly logger = new Logger(OneAutoProviderJobExpiryScheduler.name);

  constructor(
    private readonly execution: OneAutoProviderExecutionService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
    private readonly config: ConfigService,
  ) {}

  /** Expire AWAITING_PROVIDER jobs when retention elapses — no provider HTTP. */
  @Cron('0 * * * * *')
  async expireDueAwaitingJobs(): Promise<void> {
    if (!this.leaderGuard.shouldRun('oneauto_provider_job_expiry')) return;
    const cfg = this.config.get<{ enabled?: boolean }>('oneautoProvider');
    if (cfg?.enabled !== true) return;
    const expired = await this.execution.expireDueAwaitingProviderJobsBatch(50);
    if (expired > 0) {
      this.logger.log(`OneAuto expired ${expired} AWAITING_PROVIDER job(s) (retention elapsed)`);
    }
  }
}
