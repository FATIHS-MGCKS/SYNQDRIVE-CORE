import type { Prisma } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';

export const TDL_END_VALIDATION_OBSERVATION_RETENTION_LOCK_SCOPE =
  'tdl:end_validation_obs:retention:global';

export type TdlEvObsRetentionLockClient = PrismaService | Prisma.TransactionClient;

/**
 * Session-level advisory lock on the caller's PostgreSQL session.
 * Acquire/release and all guarded purge work MUST share one connection — use
 * `runWithTdlEndValidationObservationRetentionAdvisoryLock`.
 */
export async function tryAcquireTdlEndValidationObservationRetentionAdvisoryLock(
  client: TdlEvObsRetentionLockClient,
): Promise<boolean> {
  const rows = await client.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_lock(hashtextextended(${TDL_END_VALIDATION_OBSERVATION_RETENTION_LOCK_SCOPE}, 0)) AS locked
  `;
  return rows[0]?.locked === true;
}

export async function releaseTdlEndValidationObservationRetentionAdvisoryLock(
  client: TdlEvObsRetentionLockClient,
): Promise<void> {
  await client.$executeRaw`
    SELECT pg_advisory_unlock(hashtextextended(${TDL_END_VALIDATION_OBSERVATION_RETENTION_LOCK_SCOPE}, 0))
  `;
}

export function computeRetentionPurgeTransactionTimeoutMs(input: {
  maxBatchesPerRun: number;
  batchSize: number;
}): number {
  const estimatedMs = 20_000 + input.maxBatchesPerRun * 300;
  return Math.min(900_000, Math.max(60_000, estimatedMs));
}

export type TdlEvObsRetentionLockRunOutcome<T> =
  | { acquired: true; result: T }
  | { acquired: false; reason: 'contended' };

/**
 * Pins one pooled connection via Prisma interactive transaction (HV-R22 pattern).
 * Lock is released in `finally` before the transaction commits.
 */
export async function runWithTdlEndValidationObservationRetentionAdvisoryLock<T>(
  prisma: PrismaService,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { timeoutMs?: number },
): Promise<TdlEvObsRetentionLockRunOutcome<T>> {
  const outcome = await prisma.$transaction(
    async (tx) => {
      const acquired = await tryAcquireTdlEndValidationObservationRetentionAdvisoryLock(tx);
      if (!acquired) {
        return { kind: 'contended' as const };
      }
      try {
        const result = await work(tx);
        return { kind: 'ok' as const, result };
      } finally {
        await releaseTdlEndValidationObservationRetentionAdvisoryLock(tx);
      }
    },
    { timeout: options?.timeoutMs ?? 600_000 },
  );

  if (outcome.kind === 'contended') {
    return { acquired: false, reason: 'contended' };
  }
  return { acquired: true, result: outcome.result };
}

/** @deprecated Use runWithTdlEndValidationObservationRetentionAdvisoryLock */
export async function withTdlEndValidationObservationRetentionAdvisoryLock<T>(
  prisma: PrismaService,
  fn: () => Promise<T>,
): Promise<{ acquired: boolean; result?: T }> {
  const outcome = await runWithTdlEndValidationObservationRetentionAdvisoryLock(
    prisma,
    async () => fn(),
  );
  if (!outcome.acquired) {
    return { acquired: false };
  }
  return { acquired: true, result: outcome.result };
}
