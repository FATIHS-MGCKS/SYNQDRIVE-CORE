import { randomUUID } from 'node:crypto';
import type { ApdShadowCanonicalEnqueueOutcome } from '../schedulers/snapshot-polling/adaptive-polling-shadow/p25-apd-shadow-execution-versions';
import type { RedisService } from '@shared/redis/redis.service';

/** Observational staging only — never mutates BullMQ job payloads. */
export type StagedApdShadowEnqueueEvidence = {
  attemptId: string;
  vehicleId: string;
  enqueueOutcome: ApdShadowCanonicalEnqueueOutcome;
  observedAtMs: number;
  canonicalJobId: string;
};

const TTL_SECONDS = 86_400;

export function apdShadowEnqueueEvidenceRedisKey(vehicleId: string): string {
  return `apd:shadow:enqueue-evidence:v1:${vehicleId}`;
}

export async function stageApdShadowEnqueueEvidence(
  redis: Pick<RedisService, 'set'>,
  input: Omit<StagedApdShadowEnqueueEvidence, 'attemptId'> & {
    attemptId?: string;
  },
): Promise<StagedApdShadowEnqueueEvidence> {
  const payload: StagedApdShadowEnqueueEvidence = {
    attemptId: input.attemptId ?? randomUUID(),
    vehicleId: input.vehicleId,
    enqueueOutcome: input.enqueueOutcome,
    observedAtMs: input.observedAtMs,
    canonicalJobId: input.canonicalJobId,
  };
  await redis.set(
    apdShadowEnqueueEvidenceRedisKey(input.vehicleId),
    JSON.stringify(payload),
    'EX',
    TTL_SECONDS,
  );
  return payload;
}

/**
 * One-shot consume: correlates coalesced enqueue attempts with the next poll-start
 * without overwriting the canonical job's execution payload.
 */
export async function consumeStagedApdShadowEnqueueEvidence(
  redis: Pick<RedisService, 'get' | 'del'>,
  vehicleId: string,
): Promise<StagedApdShadowEnqueueEvidence | null> {
  const key = apdShadowEnqueueEvidenceRedisKey(vehicleId);
  const raw = await redis.get(key);
  if (!raw) return null;
  await redis.del(key);
  try {
    return JSON.parse(raw) as StagedApdShadowEnqueueEvidence;
  } catch {
    return null;
  }
}
