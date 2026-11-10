export type SnapshotJobOrigin = 'SCHEDULED' | 'PROVIDER_WAKE' | 'WAKE_PROBE';

export type SnapshotWakeReason = 'SPEED_MOVEMENT' | 'IGNITION_ON';

export type SnapshotWakeSignalName = 'speed' | 'isIgnitionOn';

export type ProviderWakeTimestampClass =
  | 'FRESH'
  | 'STALE'
  | 'FUTURE_INVALID'
  | 'MISSING'
  | 'INVALID';

export interface SnapshotWakeContext {
  source: 'DIMO_TRIGGER';
  reason: SnapshotWakeReason;
  providerObservedAt: string | null;
  receivedAt: string;
  signalName: SnapshotWakeSignalName;
  probeGeneration: 0 | 1;
}

/** Durable enqueue boundary evidence for APD shadow (no poll authority). */
export interface ApdShadowEnqueueEvidence {
  /** Unique enqueue/coalesce boundary attempt (not the BullMQ job id). */
  attemptId: string;
  /** BullMQ stable job id (`snapshot-<vehicleId>`) this attempt targeted. */
  canonicalJobId: string;
  /** Only physical `queue.add` payloads may bind poll-start enqueue attribution. */
  binding: 'PHYSICAL_JOB_PAYLOAD';
  outcome:
    | 'ENQUEUED'
    | 'RECOVERED_TERMINAL'
    | 'COALESCED'
    | 'QUEUE_FAILED'
    | 'PERSIST_FAILED';
  observedAtMs: number;
}

export interface DimoSnapshotJobData {
  vehicleId: string;
  dimoTokenId: number;
  origin?: SnapshotJobOrigin;
  wakeContext?: SnapshotWakeContext;
  /** Observe-only APD shadow correlation id (no poll authority). */
  apdShadowOpportunityId?: string;
  /** Written at snapshot wake/scheduler enqueue boundary; consumed at processor poll-start. */
  apdShadowEnqueueEvidence?: ApdShadowEnqueueEvidence;
}

export type SnapshotWakeOutcome =
  | 'ENQUEUED'
  | 'RECOVERED_TERMINAL'
  | 'COALESCED'
  | 'ALREADY_COVERED'
  | 'IGNORED_FSM_ACTIVE'
  | 'IGNORED_INELIGIBLE'
  | 'INVALID_SIGNAL'
  | 'QUEUE_FAILED'
  | 'PERSIST_FAILED';

export type CoalescedWakeConsumerOutcome =
  | 'CONSUMER_READY'
  | 'PERSIST_FAILED'
  | 'QUEUE_FAILED';

export interface RequestSnapshotInput {
  vehicleId: string;
  dimoTokenId: number;
  origin: SnapshotJobOrigin;
  wakeContext?: SnapshotWakeContext;
  delayMs?: number;
  apdShadowOpportunityId?: string;
}

export interface PendingSnapshotWakeRecord {
  dimoTokenId: number;
  wakeContext: SnapshotWakeContext;
  updatedAtMs: number;
  version: number;
}

export interface SuccessorSnapshotWakeRecord {
  dimoTokenId: number;
  origin: SnapshotJobOrigin;
  wakeContext: SnapshotWakeContext;
  notBeforeMs: number;
  updatedAtMs: number;
  version: number;
}

export interface PendingWakePersistResult {
  ok: boolean;
  version?: number;
  error?: string;
}

export interface SuccessorHandoffPersistResult {
  ok: boolean;
  version?: number;
  notBeforeMs?: number;
  error?: string;
}

export interface ClaimedPendingSnapshotWake {
  record: PendingSnapshotWakeRecord;
  version: number;
}

export interface SnapshotWakeForensics {
  source: 'DIMO_TRIGGER';
  reason: SnapshotWakeReason;
  providerObservedAt: string | null;
  receivedAt: string;
  snapshotFetchedAt: string | null;
  probeGeneration: 0 | 1;
  cooldownBypassUsed: boolean;
}

export interface EvaluateSnapshotForTripStartWakeOptions {
  wakeContext?: SnapshotWakeContext | null;
  snapshotFetchedAt?: Date | null;
}
