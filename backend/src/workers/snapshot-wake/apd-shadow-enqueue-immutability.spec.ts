import {
  enqueueStableSnapshotJob,
  type SnapshotQueueLike,
  type SnapshotQueueJobState,
} from './snapshot-wake-queue.util';
import type { DimoSnapshotJobData } from './snapshot-wake.types';
import { buildApdShadowEnqueueEvidence } from './apd-shadow-enqueue-evidence.util';
import {
  claimCoalescedEnqueueAttemptById,
  recordCoalescedEnqueueAttempt,
} from './apd-shadow-enqueue-evidence.redis-store';
import { snapshotJobId } from './snapshot-wake.util';

function createImmutableQueueHarness(
  initial: Record<string, SnapshotQueueJobState> = {},
): SnapshotQueueLike & {
  add: jest.Mock;
  updateData?: jest.Mock;
  getJob: jest.Mock;
  states: Map<string, SnapshotQueueJobState>;
  lastAddPayload: { data: unknown } | null;
} {
  const states = new Map<string, SnapshotQueueJobState>(Object.entries(initial));
  const lastAddPayload = { data: null as unknown };

  const getJob = jest.fn(async (jobId: string) => {
    const state = states.get(jobId);
    if (!state) return undefined;
    return {
      getState: async () => state,
      remove: async () => {
        states.delete(jobId);
      },
      updateData: jest.fn(),
    };
  });

  const add = jest.fn(
    async (
      _name: string,
      data: unknown,
      opts: { jobId: string; delay?: number },
    ) => {
      lastAddPayload.data = data;
      states.set(opts.jobId, opts.delay ? 'delayed' : 'waiting');
    },
  );

  return {
    getJob,
    add,
    states,
    lastAddPayload,
    updateData: jest.fn(),
  };
}

describe('APDS enqueue immutability (H1)', () => {
  const jobId = 'snapshot-veh-a';
  const baseData: DimoSnapshotJobData = {
    vehicleId: 'veh-a',
    dimoTokenId: 99,
    origin: 'SCHEDULED',
  };

  it('stamps enqueue evidence only on physical add, never via updateData', async () => {
    const queue = createImmutableQueueHarness();
    const observedAtMs = 1_700_000_000_000;

    await enqueueStableSnapshotJob({
      queue,
      jobName: 'snapshot',
      jobId,
      data: baseData,
      beforePhysicalAdd: (kind) => {
        baseData.apdShadowEnqueueEvidence = buildApdShadowEnqueueEvidence({
          outcome: kind,
          observedAtMs,
          attemptId: 'physical-attempt-1',
          canonicalJobId: jobId,
        });
      },
    });

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.lastAddPayload?.data).toEqual(
      expect.objectContaining({
        apdShadowEnqueueEvidence: expect.objectContaining({
          outcome: 'ENQUEUED',
          observedAtMs,
          binding: 'PHYSICAL_JOB_PAYLOAD',
        }),
        dimoTokenId: 99,
        origin: 'SCHEDULED',
      }),
    );
    expect(queue.updateData).not.toHaveBeenCalled();
  });

  it('COALESCED_QUEUED does not call queue.add or mutate waiting job payload', async () => {
    const queue = createImmutableQueueHarness({ [jobId]: 'waiting' });
    const outcome = await enqueueStableSnapshotJob({
      queue,
      jobName: 'snapshot',
      jobId,
      data: baseData,
    });
    expect(outcome).toBe('COALESCED_QUEUED');
    expect(queue.add).not.toHaveBeenCalled();
    expect(queue.lastAddPayload?.data).toBeNull();
  });

  it('RECOVERED_TERMINAL stamps RECOVERED_TERMINAL on new job data', async () => {
    const queue = createImmutableQueueHarness({ [jobId]: 'failed' });
    const data: DimoSnapshotJobData = { ...baseData };
    await enqueueStableSnapshotJob({
      queue,
      jobName: 'snapshot',
      jobId,
      data,
      beforePhysicalAdd: (kind) => {
        data.apdShadowEnqueueEvidence = buildApdShadowEnqueueEvidence({
          outcome: kind,
          observedAtMs: 42,
          attemptId: 'physical-attempt-2',
          canonicalJobId: jobId,
        });
      },
    });
    expect(queue.lastAddPayload?.data).toEqual(
      expect.objectContaining({
        apdShadowEnqueueEvidence: expect.objectContaining({
          outcome: 'RECOVERED_TERMINAL',
          observedAtMs: 42,
        }),
      }),
    );
  });

  it('coalesced attempt claim is atomic per attemptId', async () => {
    const store = new Map<string, string>();
    const redis = {
      set: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
        return 'OK';
      }),
      rpush: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      del: jest.fn(async (key: string) => {
        store.delete(key);
        return 1;
      }),
      eval: jest.fn(async (_s: string, _n: number, key: string) => {
        const raw = store.get(key) ?? null;
        if (raw) store.delete(key);
        return raw;
      }),
    };
    const attempt = await recordCoalescedEnqueueAttempt(redis, {
      vehicleId: 'veh-a',
      canonicalJobId: snapshotJobId('veh-a'),
      enqueueOutcome: 'COALESCED',
      observedAtMs: 100,
      requestOpportunityId: null,
    });
    const first = await claimCoalescedEnqueueAttemptById(redis, attempt.attemptId);
    const second = await claimCoalescedEnqueueAttemptById(redis, attempt.attemptId);
    expect(first?.enqueueOutcome).toBe('COALESCED');
    expect(second).toBeNull();
  });
});
