import type { ApdShadowCanonicalEnqueueOutcome } from '../schedulers/snapshot-polling/adaptive-polling-shadow/p25-apd-shadow-execution-versions';
import type { ApdShadowEnqueueEvidence } from './snapshot-wake.types';
import type { SnapshotStableEnqueueOutcome } from './snapshot-wake-queue.util';
import type { SnapshotWakeOutcome } from './snapshot-wake.types';

export function stableEnqueueOutcomeToCanonical(
  outcome: SnapshotStableEnqueueOutcome,
): ApdShadowCanonicalEnqueueOutcome {
  switch (outcome) {
    case 'ENQUEUED':
      return 'ENQUEUED';
    case 'RECOVERED_TERMINAL':
      return 'RECOVERED_TERMINAL';
    case 'COALESCED_QUEUED':
    case 'COALESCED_ACTIVE':
    case 'COALESCED_UNKNOWN':
      return 'COALESCED';
    default:
      return 'COALESCED';
  }
}

export function snapshotWakeOutcomeToCanonical(
  outcome: SnapshotWakeOutcome,
): ApdShadowCanonicalEnqueueOutcome | null {
  switch (outcome) {
    case 'ENQUEUED':
    case 'RECOVERED_TERMINAL':
    case 'COALESCED':
    case 'QUEUE_FAILED':
    case 'PERSIST_FAILED':
      return outcome;
    default:
      return null;
  }
}

export function buildApdShadowEnqueueEvidence(
  outcome: ApdShadowCanonicalEnqueueOutcome,
  observedAtMs: number,
): ApdShadowEnqueueEvidence {
  return { outcome, observedAtMs };
}
