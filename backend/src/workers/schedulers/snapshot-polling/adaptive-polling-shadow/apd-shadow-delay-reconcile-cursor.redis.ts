import type { RedisService } from '@shared/redis/redis.service';

const CURSOR_PREFIX = 'apd:shadow:delay-reconcile-cursor:v1';
const TTL_SECONDS = 604_800;

function cursorKey(input: {
  organizationId: string;
  vehicleId: string;
  activationEpochId: string;
}): string {
  return `${CURSOR_PREFIX}:${input.organizationId}:${input.vehicleId}:${input.activationEpochId}`;
}

export async function loadDelayReconcileOpportunityCursor(
  redis: Pick<RedisService, 'get'>,
  scope: {
    organizationId: string;
    vehicleId: string;
    activationEpochId: string;
  },
): Promise<string | undefined> {
  const raw = await redis.get(cursorKey(scope));
  return raw && raw.length > 0 ? raw : undefined;
}

export async function saveDelayReconcileOpportunityCursor(
  redis: Pick<RedisService, 'set'>,
  scope: {
    organizationId: string;
    vehicleId: string;
    activationEpochId: string;
  },
  opportunityId: string,
): Promise<void> {
  await redis.set(cursorKey(scope), opportunityId, 'EX', TTL_SECONDS);
}

export async function clearDelayReconcileOpportunityCursor(
  redis: Pick<RedisService, 'del'>,
  scope: {
    organizationId: string;
    vehicleId: string;
    activationEpochId: string;
  },
): Promise<void> {
  await redis.del(cursorKey(scope));
}
