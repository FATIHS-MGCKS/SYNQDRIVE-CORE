import type { PrismaService } from '@shared/database/prisma.service';

export const TDL_END_VALIDATION_OBSERVATION_RETENTION_LOCK_SCOPE =
  'tdl:end_validation_obs:retention:global';

/**
 * Session-scoped PostgreSQL advisory lock for global observability retention purge.
 * Held only for the duration of one purge run (acquire → purge → release).
 */
export async function withTdlEndValidationObservationRetentionAdvisoryLock<T>(
  prisma: PrismaService,
  fn: () => Promise<T>,
): Promise<{ acquired: boolean; result?: T }> {
  const rows = await prisma.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_lock(hashtextextended(${TDL_END_VALIDATION_OBSERVATION_RETENTION_LOCK_SCOPE}, 0)) AS locked
  `;
  const locked = rows[0]?.locked === true;
  if (!locked) {
    return { acquired: false };
  }
  try {
    const result = await fn();
    return { acquired: true, result };
  } finally {
    await prisma.$executeRaw`
      SELECT pg_advisory_unlock(hashtextextended(${TDL_END_VALIDATION_OBSERVATION_RETENTION_LOCK_SCOPE}, 0))
    `;
  }
}
