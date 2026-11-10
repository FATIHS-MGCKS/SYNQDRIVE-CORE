import { randomUUID } from 'node:crypto';
import type { ApdShadowCanonicalEnqueueOutcome } from '../schedulers/snapshot-polling/adaptive-polling-shadow/p25-apd-shadow-execution-versions';
export type ApdShadowEnqueueRedis = {
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<unknown>;
  rpush(key: string, value: string): Promise<number>;
  expire(key: string, ttl: number): Promise<number>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
  eval(script: string, numKeys: number, key: string): Promise<unknown>;
};

/** Observational coalesced attempt — never merged into BullMQ job payloads. */
export type CoalescedApdShadowEnqueueAttempt = {
  attemptId: string;
  vehicleId: string;
  canonicalJobId: string;
  enqueueOutcome: ApdShadowCanonicalEnqueueOutcome;
  observedAtMs: number;
  requestOpportunityId: string | null;
};

const TTL_SECONDS = 86_400;

const COALESCE_QUEUE_SUFFIX = 'apd:shadow:enqueue-coalesce-queue:v2';
const ATTEMPT_KEY_PREFIX = 'apd:shadow:enqueue-attempt:v2';

function coalesceQueueKey(vehicleId: string, canonicalJobId: string): string {
  return `${COALESCE_QUEUE_SUFFIX}:${vehicleId}:${canonicalJobId}`;
}

export function coalescedAttemptRedisKey(attemptId: string): string {
  return `${ATTEMPT_KEY_PREFIX}:${attemptId}`;
}

/**
 * Durably records a coalesced enqueue attempt without mutating the canonical job.
 * RPUSH preserves ordering; each attempt has a unique id-scoped key for atomic claims.
 */
export async function recordCoalescedEnqueueAttempt(
  redis: Pick<ApdShadowEnqueueRedis, 'set' | 'rpush' | 'expire'>,
  input: Omit<CoalescedApdShadowEnqueueAttempt, 'attemptId'> & {
    attemptId?: string;
  },
): Promise<CoalescedApdShadowEnqueueAttempt> {
  const attempt: CoalescedApdShadowEnqueueAttempt = {
    attemptId: input.attemptId ?? randomUUID(),
    vehicleId: input.vehicleId,
    canonicalJobId: input.canonicalJobId,
    enqueueOutcome: input.enqueueOutcome,
    observedAtMs: input.observedAtMs,
    requestOpportunityId: input.requestOpportunityId,
  };
  const queueKey = coalesceQueueKey(input.vehicleId, input.canonicalJobId);
  const attemptKey = coalescedAttemptRedisKey(attempt.attemptId);
  await redis.set(attemptKey, JSON.stringify(attempt), 'EX', TTL_SECONDS);
  await redis.rpush(queueKey, attempt.attemptId);
  await redis.expire(queueKey, TTL_SECONDS);
  return attempt;
}

/**
 * Atomic GET+DEL on attempt id — one consumer may claim each attempt exactly once.
 */
export async function claimCoalescedEnqueueAttemptById(
  redis: Pick<ApdShadowEnqueueRedis, 'eval'>,
  attemptId: string,
): Promise<CoalescedApdShadowEnqueueAttempt | null> {
  const key = coalescedAttemptRedisKey(attemptId);
  const script = `
    local raw = redis.call('GET', KEYS[1])
    if not raw then return nil end
    redis.call('DEL', KEYS[1])
    return raw
  `;
  const raw = (await redis.eval(script, 1, key)) as string | null;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CoalescedApdShadowEnqueueAttempt;
  } catch {
    return null;
  }
}

/** @deprecated Vehicle-scoped consume — causes false physical attribution; do not use at poll-start. */
export async function consumeStagedApdShadowEnqueueEvidence(
  _redis: Pick<ApdShadowEnqueueRedis, 'get' | 'del'>,
  _vehicleId: string,
): Promise<null> {
  return null;
}

/** @deprecated Use recordCoalescedEnqueueAttempt */
export async function stageApdShadowEnqueueEvidence(
  redis: Pick<ApdShadowEnqueueRedis, 'set' | 'rpush' | 'expire'>,
  input: {
    vehicleId: string;
    canonicalJobId: string;
    enqueueOutcome: ApdShadowCanonicalEnqueueOutcome;
    observedAtMs: number;
    attemptId?: string;
  },
): Promise<CoalescedApdShadowEnqueueAttempt> {
  return recordCoalescedEnqueueAttempt(redis, {
    ...input,
    requestOpportunityId: null,
  });
}

/** Visible for adversarial tests */
export { coalesceQueueKey };
