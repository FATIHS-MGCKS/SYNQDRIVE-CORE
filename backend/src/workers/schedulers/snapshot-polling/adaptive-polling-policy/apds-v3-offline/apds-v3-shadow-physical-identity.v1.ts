import type { ApdShadowEnqueueEvidence } from '../../../../snapshot-wake/snapshot-wake.types';
import type { DimoSnapshotJobData } from '../../../../snapshot-wake/snapshot-wake.types';
import { snapshotJobId } from '../../../../snapshot-wake/snapshot-wake.util';

export type ApdsV3PhysicalRequestIdentityClass = 'DERIVED' | 'CORRELATED' | 'UNVERIFIED';

export type ApdsV3ShadowPhysicalRequestIdentity = {
  /** Authoritative physical DIMO fetch attempt id (BullMQ run boundary). */
  physicalRequestId: string;
  physicalFetchAttemptId: string;
  /** Enqueue boundary id — not a physical fetch identity. */
  enqueueAttemptId: string | null;
  identityClass: ApdsV3PhysicalRequestIdentityClass;
};

type JobLike = {
  id?: string;
  attemptsMade?: number;
  data?: DimoSnapshotJobData;
};

const ADMISSIBLE_ENQUEUE_OUTCOMES = new Set<ApdShadowEnqueueEvidence['outcome']>([
  'ENQUEUED',
  'RECOVERED_TERMINAL',
]);

export function isAdmissibleApdsV3EnqueueEvidence(
  evidence: ApdShadowEnqueueEvidence | undefined,
  vehicleId: string,
): evidence is ApdShadowEnqueueEvidence {
  if (!evidence) return false;
  if (evidence.binding !== 'PHYSICAL_JOB_PAYLOAD') return false;
  if (!ADMISSIBLE_ENQUEUE_OUTCOMES.has(evidence.outcome)) return false;
  if (evidence.canonicalJobId !== snapshotJobId(vehicleId)) return false;
  return typeof evidence.attemptId === 'string' && evidence.attemptId.length > 0;
}

/**
 * Physical fetch identity is always DERIVED from BullMQ job id + attemptsMade.
 * Enqueue attempt is correlated metadata only (CORRELATED), never CONFIRMED physical id.
 */
export function resolveApdsV3ShadowPhysicalRequestIdentity(
  job: JobLike,
  vehicleId: string,
): ApdsV3ShadowPhysicalRequestIdentity | null {
  if (typeof job.id !== 'string' || job.id.length === 0) {
    return null;
  }
  const attemptsMade = job.attemptsMade ?? 0;
  const physicalFetchAttemptId = `physical-fetch:${job.id}:run:${attemptsMade}`;
  const ev = job.data?.apdShadowEnqueueEvidence;
  const enqueueAttemptId =
    isAdmissibleApdsV3EnqueueEvidence(ev, vehicleId) ? ev.attemptId : null;
  const identityClass: ApdsV3PhysicalRequestIdentityClass = enqueueAttemptId
    ? 'CORRELATED'
    : 'DERIVED';

  return {
    physicalRequestId: physicalFetchAttemptId,
    physicalFetchAttemptId,
    enqueueAttemptId,
    identityClass,
  };
}
