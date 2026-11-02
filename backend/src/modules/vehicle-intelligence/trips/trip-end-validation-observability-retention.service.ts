import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import tripEndValidationObservabilityRetentionConfig, {
  TRIP_END_VALIDATION_OBSERVATION_RETENTION_BATCH_SIZE_MAX,
  TRIP_END_VALIDATION_OBSERVATION_RETENTION_DAYS_MAX,
  TRIP_END_VALIDATION_OBSERVATION_RETENTION_DAYS_MIN,
  TRIP_END_VALIDATION_OBSERVATION_RETENTION_MAX_BATCHES_CAP,
} from '@config/trip-end-validation-observability-retention.config';
import { PrismaService } from '@shared/database/prisma.service';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { withTdlEndValidationObservationRetentionAdvisoryLock } from './trip-end-validation-observability-retention-advisory-lock';
import {
  TDL_EV_OBS_RETENTION_PURGE_STATUS,
  TDL_EV_OBS_RETENTION_SKIP_REASON,
  type TripEndValidationObservabilityRetentionReport,
  type TripEndValidationObservabilityRetentionRunOptions,
} from './trip-end-validation-observability-retention.types';

export function validateTripEndValidationObservabilityRetentionConfig(
  cfg: ConfigType<typeof tripEndValidationObservabilityRetentionConfig>,
): string[] {
  const blockers: string[] = [];
  if (!cfg.enabled) {
    blockers.push('TRIP_END_VALIDATION_OBSERVATION_RETENTION_ENABLED!=true');
  }
  if (
    cfg.retentionDays < TRIP_END_VALIDATION_OBSERVATION_RETENTION_DAYS_MIN ||
    cfg.retentionDays > TRIP_END_VALIDATION_OBSERVATION_RETENTION_DAYS_MAX
  ) {
    blockers.push(
      `retention days out of range (${TRIP_END_VALIDATION_OBSERVATION_RETENTION_DAYS_MIN}-${TRIP_END_VALIDATION_OBSERVATION_RETENTION_DAYS_MAX})`,
    );
  }
  if (cfg.batchSize < 1 || cfg.batchSize > TRIP_END_VALIDATION_OBSERVATION_RETENTION_BATCH_SIZE_MAX) {
    blockers.push(`batch size out of range (1-${TRIP_END_VALIDATION_OBSERVATION_RETENTION_BATCH_SIZE_MAX})`);
  }
  if (
    cfg.maxBatchesPerRun < 1 ||
    cfg.maxBatchesPerRun > TRIP_END_VALIDATION_OBSERVATION_RETENTION_MAX_BATCHES_CAP
  ) {
    blockers.push(
      `max batches out of range (1-${TRIP_END_VALIDATION_OBSERVATION_RETENTION_MAX_BATCHES_CAP})`,
    );
  }
  return blockers;
}

export function computeRetentionCutoff(
  retentionDays: number,
  now: Date = new Date(),
): Date {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

@Injectable()
export class TripEndValidationObservabilityRetentionService {
  private readonly logger = new Logger(TripEndValidationObservabilityRetentionService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(tripEndValidationObservabilityRetentionConfig.KEY)
    private readonly config: ConfigType<typeof tripEndValidationObservabilityRetentionConfig>,
    private readonly leaderGuard: SchedulerLeaderGuardService,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {}

  resolveDryRun(options: TripEndValidationObservabilityRetentionRunOptions): boolean {
    return options.dryRun ?? this.config.dryRun;
  }

  async runOnce(
    options: TripEndValidationObservabilityRetentionRunOptions = {},
  ): Promise<TripEndValidationObservabilityRetentionReport> {
    const trigger = options.trigger ?? 'manual';
    const startedAtMs = Date.now();
    const now = options.now ?? new Date();
    const dryRun = this.resolveDryRun(options);

    const configBlockers = validateTripEndValidationObservabilityRetentionConfig(this.config);
    if (configBlockers.length > 0) {
      return this.skippedReport(
        trigger,
        dryRun,
        startedAtMs,
        TDL_EV_OBS_RETENTION_SKIP_REASON.INVALID_CONFIG,
        configBlockers.join('; '),
      );
    }

    if (!this.config.enabled) {
      return this.skippedReport(
        trigger,
        dryRun,
        startedAtMs,
        TDL_EV_OBS_RETENTION_SKIP_REASON.DISABLED,
      );
    }

    if (!this.leaderGuard.shouldRun('trip_end_validation_observability_retention')) {
      return this.skippedReport(
        trigger,
        dryRun,
        startedAtMs,
        TDL_EV_OBS_RETENTION_SKIP_REASON.LEADER_SKIP,
      );
    }

    if (this.running) {
      return this.skippedReport(
        trigger,
        dryRun,
        startedAtMs,
        TDL_EV_OBS_RETENTION_SKIP_REASON.IN_PROCESS_GUARD,
      );
    }

    const tableReady = await this.observationsTableExists();
    if (!tableReady) {
      return this.skippedReport(
        trigger,
        dryRun,
        startedAtMs,
        TDL_EV_OBS_RETENTION_SKIP_REASON.TABLE_MISSING,
      );
    }

    this.running = true;
    try {
      const lockOutcome = await withTdlEndValidationObservationRetentionAdvisoryLock(
        this.prisma,
        () => this.executePurge(trigger, dryRun, now, startedAtMs),
      );
      if (!lockOutcome.acquired) {
        return this.skippedReport(
          trigger,
          dryRun,
          startedAtMs,
          TDL_EV_OBS_RETENTION_SKIP_REASON.LOCK_CONTENTED,
        );
      }
      return lockOutcome.result!;
    } finally {
      this.running = false;
    }
  }

  async observationsTableExists(): Promise<boolean> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT to_regclass('public.trip_end_validation_decision_observations') IS NOT NULL AS exists
      `;
      return rows[0]?.exists === true;
    } catch {
      return false;
    }
  }

  async getLastSuccessfulPurgeFinishedAt(): Promise<Date | null> {
    if (!(await this.purgeRunTableExists())) return null;
    const row = await this.prisma.tripEndValidationObservabilityRetentionPurgeRun.findFirst({
      where: { status: TDL_EV_OBS_RETENTION_PURGE_STATUS.COMPLETED },
      orderBy: { completedAt: 'desc' },
      select: { completedAt: true },
    });
    return row?.completedAt ?? null;
  }

  private async purgeRunTableExists(): Promise<boolean> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT to_regclass('public.trip_end_validation_observability_retention_purge_runs') IS NOT NULL AS exists
      `;
      return rows[0]?.exists === true;
    } catch {
      return false;
    }
  }

  private async executePurge(
    trigger: 'cron' | 'manual',
    dryRun: boolean,
    now: Date,
    startedAtMs: number,
  ): Promise<TripEndValidationObservabilityRetentionReport> {
    const cutoff = computeRetentionCutoff(this.config.retentionDays, now);
    let runId: string | undefined;

    if (await this.purgeRunTableExists()) {
      const run = await this.prisma.tripEndValidationObservabilityRetentionPurgeRun.create({
        data: {
          trigger,
          dryRun,
          status: TDL_EV_OBS_RETENTION_PURGE_STATUS.RUNNING,
          cutoffAt: cutoff,
        },
      });
      runId = run.id;
    }

    let eligibleCount = 0;
    let rowsDeleted = 0;
    let batchCount = 0;
    let errorMessage: string | undefined;

    try {
      eligibleCount = await this.prisma.tripEndValidationDecisionObservation.count({
        where: { persistedAt: { lt: cutoff } },
      });

      if (!dryRun && eligibleCount > 0) {
        for (let i = 0; i < this.config.maxBatchesPerRun; i++) {
          const rows = await this.prisma.tripEndValidationDecisionObservation.findMany({
            where: { persistedAt: { lt: cutoff } },
            select: { id: true },
            orderBy: [{ persistedAt: 'asc' }, { id: 'asc' }],
            take: this.config.batchSize,
          });
          if (rows.length === 0) break;
          batchCount++;
          const res = await this.prisma.tripEndValidationDecisionObservation.deleteMany({
            where: { id: { in: rows.map((r) => r.id) } },
          });
          rowsDeleted += res.count;
          if (rows.length < this.config.batchSize) break;
        }
      }

      const durationMs = Date.now() - startedAtMs;
      if (runId) {
        await this.prisma.tripEndValidationObservabilityRetentionPurgeRun.update({
          where: { id: runId },
          data: {
            status: TDL_EV_OBS_RETENTION_PURGE_STATUS.COMPLETED,
            eligibleCount,
            rowsDeleted,
            batchCount,
            durationMs,
            completedAt: new Date(),
          },
        });
      }

      this.recordMetrics('completed', dryRun, rowsDeleted, durationMs);

      this.logger.log(
        `TDL end-validation observability retention ${trigger} — dryRun=${dryRun} eligible=${eligibleCount} deleted=${rowsDeleted} batches=${batchCount} cutoff=${cutoff.toISOString()}`,
      );

      return {
        trigger,
        dryRun,
        skipped: false,
        runId,
        cutoffAt: cutoff,
        eligibleCount,
        rowsDeleted,
        batchCount,
        durationMs,
      };
    } catch (err: unknown) {
      errorMessage = (err as Error).message;
      const durationMs = Date.now() - startedAtMs;
      if (runId) {
        await this.prisma.tripEndValidationObservabilityRetentionPurgeRun.update({
          where: { id: runId },
          data: {
            status: TDL_EV_OBS_RETENTION_PURGE_STATUS.FAILED,
            eligibleCount,
            rowsDeleted,
            batchCount,
            durationMs,
            errorMessage,
            completedAt: new Date(),
          },
        });
      }
      this.recordMetrics('failed', dryRun, rowsDeleted, durationMs);
      throw err;
    }
  }

  private recordMetrics(
    status: 'completed' | 'failed' | 'skipped',
    dryRun: boolean,
    rowsDeleted: number,
    durationMs: number,
  ): void {
    try {
      this.tripMetrics?.tripEndValidationObservabilityRetentionRunsTotal.inc({
        status,
        dry_run: dryRun ? 'true' : 'false',
      });
      if (rowsDeleted > 0) {
        this.tripMetrics?.tripEndValidationObservabilityRetentionRowsDeletedTotal.inc(
          rowsDeleted,
        );
      }
      if (status === 'completed') {
        this.tripMetrics?.tripEndValidationObservabilityRetentionLastSuccessTimestamp.set(
          Math.floor(Date.now() / 1000),
        );
      }
      void durationMs;
    } catch {
      // Non-blocking metrics.
    }
  }

  private skippedReport(
    trigger: 'cron' | 'manual',
    dryRun: boolean,
    startedAtMs: number,
    skipReason: (typeof TDL_EV_OBS_RETENTION_SKIP_REASON)[keyof typeof TDL_EV_OBS_RETENTION_SKIP_REASON],
    detail?: string,
  ): TripEndValidationObservabilityRetentionReport {
    this.recordMetrics('skipped', dryRun, 0, Date.now() - startedAtMs);
    if (detail) {
      this.logger.debug(`TDL EV observability retention skipped (${skipReason}): ${detail}`);
    }
    return {
      trigger,
      dryRun,
      skipped: true,
      skipReason,
      eligibleCount: 0,
      rowsDeleted: 0,
      batchCount: 0,
      durationMs: Date.now() - startedAtMs,
      errorMessage: detail,
    };
  }
}
