import {
  claimCoalescedEnqueueAttemptById,
  recordCoalescedEnqueueAttempt,
  consumeStagedApdShadowEnqueueEvidence,
} from './apd-shadow-enqueue-evidence.redis-store';
import {
  buildApdShadowEnqueueEvidence,
  stableEnqueueOutcomeToCanonical,
} from './apd-shadow-enqueue-evidence.util';
import { snapshotJobId } from './snapshot-wake.util';

describe('APDS enqueue attempt attribution (H1-R)', () => {
  const vehicleId = 'veh-a';
  const jobId = snapshotJobId(vehicleId);

  function createRedis() {
    const store = new Map<string, string>();
    const lists = new Map<string, string[]>();
    return {
      store,
      set: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
        return 'OK';
      }),
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      del: jest.fn(async (key: string) => {
        store.delete(key);
        return 1;
      }),
      rpush: jest.fn(async (key: string, value: string) => {
        const list = lists.get(key) ?? [];
        list.push(value);
        lists.set(key, list);
        return list.length;
      }),
      expire: jest.fn(async () => 1),
      eval: jest.fn(async (_script: string, _n: number, key: string) => {
        const raw = store.get(key) ?? null;
        if (raw) store.delete(key);
        return raw;
      }),
    };
  }

  it('physical evidence is bound to attemptId and canonicalJobId', () => {
    const evidence = buildApdShadowEnqueueEvidence({
      outcome: 'ENQUEUED',
      observedAtMs: 100,
      attemptId: 'att-1',
      canonicalJobId: jobId,
    });
    expect(evidence.binding).toBe('PHYSICAL_JOB_PAYLOAD');
    expect(evidence.attemptId).toBe('att-1');
    expect(evidence.canonicalJobId).toBe(jobId);
  });

  it('two simultaneous coalesced attempts do not overwrite each other', async () => {
    const redis = createRedis();
    const a1 = await recordCoalescedEnqueueAttempt(redis, {
      vehicleId,
      canonicalJobId: jobId,
      enqueueOutcome: 'COALESCED',
      observedAtMs: 1,
      requestOpportunityId: null,
    });
    const a2 = await recordCoalescedEnqueueAttempt(redis, {
      vehicleId,
      canonicalJobId: jobId,
      enqueueOutcome: 'COALESCED',
      observedAtMs: 2,
      requestOpportunityId: null,
    });
    expect(a1.attemptId).not.toBe(a2.attemptId);
    expect(await claimCoalescedEnqueueAttemptById(redis, a1.attemptId)).toMatchObject({
      attemptId: a1.attemptId,
    });
    expect(await claimCoalescedEnqueueAttemptById(redis, a1.attemptId)).toBeNull();
    expect(await claimCoalescedEnqueueAttemptById(redis, a2.attemptId)).toBeTruthy();
  });

  it('vehicle-scoped staged consume is disabled (no false physical poll binding)', async () => {
    const redis = createRedis();
    expect(await consumeStagedApdShadowEnqueueEvidence(redis, vehicleId)).toBeNull();
  });

  it('COALESCED variants map to canonical COALESCED only', () => {
    expect(stableEnqueueOutcomeToCanonical('COALESCED_QUEUED')).toBe('COALESCED');
    expect(stableEnqueueOutcomeToCanonical('COALESCED_ACTIVE')).toBe('COALESCED');
  });
});
