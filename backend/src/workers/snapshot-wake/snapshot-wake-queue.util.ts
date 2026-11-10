import type { JobsOptions } from 'bullmq';

import type { DimoSnapshotJobData } from './snapshot-wake.types';

export type SnapshotQueueJobState = string;

export interface SnapshotQueueJobRef {
  getState(): Promise<SnapshotQueueJobState>;
  remove(): Promise<void>;
}

export interface SnapshotQueueLike {
  getJob(jobId: string): Promise<SnapshotQueueJobRef | undefined>;
  add(
    name: string,
    data: DimoSnapshotJobData,
    opts: JobsOptions & { jobId: string; delay?: number },
  ): Promise<unknown>;
}

const DEFAULT_SNAPSHOT_JOB_OPTIONS: JobsOptions = {
  removeOnComplete: true,
  removeOnFail: { count: 50, age: 3600 },
};

export type SnapshotStableEnqueueOutcome =
  | 'ENQUEUED'
  | 'RECOVERED_TERMINAL'
  | 'COALESCED_QUEUED'
  | 'COALESCED_ACTIVE'
  | 'COALESCED_UNKNOWN';

export type SnapshotPhysicalAddKind = 'ENQUEUED' | 'RECOVERED_TERMINAL';

function isDuplicateJobIdError(err: unknown): boolean {
  const msg = (err as Error).message ?? '';
  return (
    msg.toLowerCase().includes('duplicate') ||
    msg.toLowerCase().includes('already exists')
  );
}

function isTerminalQueueState(state: SnapshotQueueJobState): boolean {
  return state === 'failed' || state === 'completed';
}

function isQueuedQueueState(state: SnapshotQueueJobState): boolean {
  return state === 'waiting' || state === 'delayed' || state === 'prioritized';
}

function isActiveQueueState(state: SnapshotQueueJobState): boolean {
  return state === 'active' || state === 'waiting-children';
}

export { isActiveQueueState, isQueuedQueueState };

/**
 * Single jobId snapshot enqueue with terminal recycling and bounded coalesce
 * when a same-vehicle job is already queued or active.
 */
export async function enqueueStableSnapshotJob(params: {
  queue: SnapshotQueueLike;
  jobName: string;
  jobId: string;
  data: DimoSnapshotJobData;
  delayMs?: number;
  /** Called immediately before queue.add — mutate params.data only (no post-add job updates). */
  beforePhysicalAdd?: (kind: SnapshotPhysicalAddKind) => void;
}): Promise<SnapshotStableEnqueueOutcome> {
  const delayMs = params.delayMs ?? 0;
  const existing = await params.queue.getJob(params.jobId);
  let recoveredTerminal = false;

  if (existing) {
    const state = await existing.getState();
    if (isTerminalQueueState(state)) {
      await existing.remove();
      recoveredTerminal = true;
    } else if (isQueuedQueueState(state)) {
      return 'COALESCED_QUEUED';
    } else if (isActiveQueueState(state)) {
      return 'COALESCED_ACTIVE';
    }
  }

  try {
    const addKind: SnapshotPhysicalAddKind = recoveredTerminal
      ? 'RECOVERED_TERMINAL'
      : 'ENQUEUED';
    params.beforePhysicalAdd?.(addKind);
    await params.queue.add(params.jobName, params.data, {
      jobId: params.jobId,
      delay: delayMs > 0 ? delayMs : undefined,
      ...DEFAULT_SNAPSHOT_JOB_OPTIONS,
    });
    return addKind;
  } catch (err: unknown) {
    if (isDuplicateJobIdError(err)) {
      return 'COALESCED_UNKNOWN';
    }
    throw err;
  }
}

/** Queued/delayed canonical job can claim the durable pending mailbox at worker start. */
export function isQueuedCoalesce(outcome: SnapshotStableEnqueueOutcome): boolean {
  return outcome === 'COALESCED_QUEUED';
}

/** Active/unknown coalesce requires a post-terminal successor/handoff consumer. */
export function coalesceNeedsPostTerminalSuccessor(
  outcome: SnapshotStableEnqueueOutcome,
): boolean {
  return outcome === 'COALESCED_ACTIVE' || outcome === 'COALESCED_UNKNOWN';
}

/** @deprecated Use coalesceNeedsPostTerminalSuccessor / isQueuedCoalesce */
export function snapshotQueueNeedsPendingWake(outcome: SnapshotStableEnqueueOutcome): boolean {
  return coalesceNeedsPostTerminalSuccessor(outcome);
}
