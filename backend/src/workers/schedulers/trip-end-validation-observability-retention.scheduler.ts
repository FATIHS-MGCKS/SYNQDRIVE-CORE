import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TripEndValidationObservabilityRetentionService } from '@modules/vehicle-intelligence/trips/trip-end-validation-observability-retention.service';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';

/**
 * Nightly purge for TDL end-validation observability rows (90d @ persistedAt default).
 * Leader-only + in-process guard + PostgreSQL advisory lock inside service.
 */
@Injectable()
export class TripEndValidationObservabilityRetentionScheduler {
  private readonly logger = new Logger(TripEndValidationObservabilityRetentionScheduler.name);

  constructor(
    private readonly retention: TripEndValidationObservabilityRetentionService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
  ) {}

  @Cron('45 4 * * *')
  async scheduledRun(): Promise<void> {
    if (!this.leaderGuard.shouldRun('trip_end_validation_observability_retention')) return;
    try {
      const report = await this.retention.runOnce({ trigger: 'cron' });
      if (!report.skipped && report.eligibleCount > 0) {
        this.logger.log(
          `TDL EV observability retention cron — dryRun=${report.dryRun} eligible=${report.eligibleCount} deleted=${report.rowsDeleted}`,
        );
      }
    } catch (err: unknown) {
      this.logger.error(
        `TDL EV observability retention cron failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
