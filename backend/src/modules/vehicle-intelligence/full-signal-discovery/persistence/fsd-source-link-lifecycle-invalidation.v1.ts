import type { Prisma } from '@prisma/client';
import { acquirePgAdvisoryXactLock64 } from '@shared/database/pg-advisory-lock.util';
import {
  FSD_DISCOVERY_RUN_EXECUTABLE_STATUSES,
  FsdDiscoveryPersistenceError,
  type FsdDiscoveryRunScopeV1,
} from './fsd-discovery-persistence.contract.v1';

export const FSD_SOURCE_LINK_INVALIDATION_REASON_DEACTIVATED = 'SOURCE_LINK_DEACTIVATED' as const;
export const FSD_SOURCE_LINK_INVALIDATION_REASON_SUPERSEDED = 'SOURCE_LINK_SUPERSEDED' as const;

export type FsdSourceLinkLifecycleInvalidationReasonV1 =
  | typeof FSD_SOURCE_LINK_INVALIDATION_REASON_DEACTIVATED
  | typeof FSD_SOURCE_LINK_INVALIDATION_REASON_SUPERSEDED;

export function buildFsdDiscoverySourceLinkLockKey(scope: FsdDiscoveryRunScopeV1): string {
  return `fsd-discovery:${scope.organizationId}:${scope.vehicleId}:${scope.providerSourceLinkId}`;
}

export type InvalidateExecutableFsdRunsForDimoSourceLinkResultV1 = {
  invalidatedCount: number;
  invalidatedRunIds: string[];
};

/**
 * P5B: synchronous FSD run invalidation inside the caller's open transaction.
 * Does not start a nested transaction. Acquires the standard source-link advisory lock.
 */
export async function invalidateExecutableFsdRunsForDimoSourceLinkInTransaction(
  tx: Prisma.TransactionClient,
  input: FsdDiscoveryRunScopeV1 & {
    invalidationReason: FsdSourceLinkLifecycleInvalidationReasonV1;
  },
): Promise<InvalidateExecutableFsdRunsForDimoSourceLinkResultV1> {
  const scope: FsdDiscoveryRunScopeV1 = {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    providerSourceLinkId: input.providerSourceLinkId,
  };
  await acquirePgAdvisoryXactLock64(tx, buildFsdDiscoverySourceLinkLockKey(scope));

  const link = await tx.vehicleDataSourceLink.findFirst({
    where: {
      id: scope.providerSourceLinkId,
      vehicleId: scope.vehicleId,
      provider: 'DIMO',
      sourceType: 'DIMO',
      vehicle: { organizationId: scope.organizationId },
    },
    select: { id: true },
  });
  if (!link) {
    throw new FsdDiscoveryPersistenceError(
      'TENANT_SCOPE_VIOLATION',
      'DIMO source link not found for scoped lifecycle invalidation',
    );
  }

  const executable = await tx.fsdDiscoveryRun.findMany({
    where: {
      organizationId: scope.organizationId,
      vehicleId: scope.vehicleId,
      providerSourceLinkId: scope.providerSourceLinkId,
      invalidatedAt: null,
      status: { in: [...FSD_DISCOVERY_RUN_EXECUTABLE_STATUSES] },
    },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  if (executable.length === 0) {
    return { invalidatedCount: 0, invalidatedRunIds: [] };
  }

  const invalidatedAt = new Date();
  const result = await tx.fsdDiscoveryRun.updateMany({
    where: {
      organizationId: scope.organizationId,
      vehicleId: scope.vehicleId,
      providerSourceLinkId: scope.providerSourceLinkId,
      invalidatedAt: null,
      status: { in: [...FSD_DISCOVERY_RUN_EXECUTABLE_STATUSES] },
    },
    data: {
      status: 'INVALIDATED',
      invalidatedAt,
      invalidationReason: input.invalidationReason,
      leaseOwner: null,
      leaseExpiresAt: null,
      version: { increment: 1 },
    },
  });

  return {
    invalidatedCount: result.count,
    invalidatedRunIds: executable.map((r) => r.id),
  };
}
