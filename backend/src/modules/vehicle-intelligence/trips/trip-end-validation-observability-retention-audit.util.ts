import type { Prisma } from '@prisma/client';
import type { ConfigType } from '@nestjs/config';
import type tripEndValidationObservabilityRetentionConfig from '@config/trip-end-validation-observability-retention.config';
import { TDL_EV_OBS_RETENTION_PURGE_STATUS } from './trip-end-validation-observability-retention.types';

const STALE_RUNNING_ERROR =
  'stale_running_abandoned: worker exited before purge completion';

/**
 * Marks orphaned RUNNING audit rows so they cannot satisfy activation readiness.
 */
export async function reconcileStaleRunningPurgeRuns(
  tx: Prisma.TransactionClient,
  now: Date,
  cfg: ConfigType<typeof tripEndValidationObservabilityRetentionConfig>,
): Promise<number> {
  const threshold = new Date(now.getTime() - cfg.staleRunningAfterMinutes * 60 * 1000);
  const res = await tx.tripEndValidationObservabilityRetentionPurgeRun.updateMany({
    where: {
      status: TDL_EV_OBS_RETENTION_PURGE_STATUS.RUNNING,
      startedAt: { lt: threshold },
    },
    data: {
      status: TDL_EV_OBS_RETENTION_PURGE_STATUS.ABANDONED,
      errorMessage: STALE_RUNNING_ERROR,
      completedAt: now,
    },
  });
  return res.count;
}

/**
 * Bounded delete of old purge audit rows (successful and terminal failures).
 */
export async function trimOldPurgeAuditRuns(
  tx: Prisma.TransactionClient,
  now: Date,
  cfg: ConfigType<typeof tripEndValidationObservabilityRetentionConfig>,
): Promise<number> {
  const cutoff = new Date(now.getTime() - cfg.auditRetentionDays * 24 * 60 * 60 * 1000);
  const stale = await tx.tripEndValidationObservabilityRetentionPurgeRun.findMany({
    where: {
      startedAt: { lt: cutoff },
      status: {
        in: [
          TDL_EV_OBS_RETENTION_PURGE_STATUS.COMPLETED,
          TDL_EV_OBS_RETENTION_PURGE_STATUS.FAILED,
          TDL_EV_OBS_RETENTION_PURGE_STATUS.ABANDONED,
        ],
      },
    },
    select: { id: true },
    orderBy: { startedAt: 'asc' },
    take: cfg.auditTrimBatchSize,
  });
  if (stale.length === 0) return 0;
  const res = await tx.tripEndValidationObservabilityRetentionPurgeRun.deleteMany({
    where: { id: { in: stale.map((r) => r.id) } },
  });
  return res.count;
}

export { STALE_RUNNING_ERROR };
