import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { OneAutoOemVinLookupEuSuggestionCleanupService } from './oneauto-oem-vin-lookup-eu-suggestion-cleanup.service';

@Injectable()
export class OneAutoOemVinLookupEuSuggestionCleanupScheduler {
  constructor(
    private readonly cleanup: OneAutoOemVinLookupEuSuggestionCleanupService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
  ) {}

  @Cron('15 5 * * *')
  async scheduledRun(): Promise<void> {
    if (!this.leaderGuard.shouldRun('oneauto_oem_suggestion_snapshot_cleanup')) return;
    await this.cleanup.deleteExpiredBatch();
  }
}
