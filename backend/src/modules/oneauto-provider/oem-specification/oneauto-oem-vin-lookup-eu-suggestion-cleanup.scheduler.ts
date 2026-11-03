import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { OneAutoOemVinLookupEuSuggestionCleanupService } from './oneauto-oem-vin-lookup-eu-suggestion-cleanup.service';
import { OneAutoOemVinLookupEuSuggestionRecoveryService } from './oneauto-oem-vin-lookup-eu-suggestion-recovery.service';

@Injectable()
export class OneAutoOemVinLookupEuSuggestionCleanupScheduler {
  constructor(
    private readonly cleanup: OneAutoOemVinLookupEuSuggestionCleanupService,
    private readonly recovery: OneAutoOemVinLookupEuSuggestionRecoveryService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
  ) {}

  /** Recover missing snapshots from persisted provider responses (no HTTP). */
  @Cron('0 */10 * * * *')
  async scheduledRecovery(): Promise<void> {
    if (!this.leaderGuard.shouldRun('oneauto_oem_suggestion_snapshot_cleanup')) return;
    await this.recovery.recoverMissingSnapshotsBatch();
  }

  @Cron('15 5 * * *')
  async scheduledRun(): Promise<void> {
    if (!this.leaderGuard.shouldRun('oneauto_oem_suggestion_snapshot_cleanup')) return;
    await this.recovery.recoverMissingSnapshotsBatch();
    await this.cleanup.deleteExpiredBatch();
  }
}
