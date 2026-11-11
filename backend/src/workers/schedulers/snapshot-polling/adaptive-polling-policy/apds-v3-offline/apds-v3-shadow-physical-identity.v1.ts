import type { DimoSnapshotJobData } from '../../../../snapshot-wake/snapshot-wake.types';

export type ApdsV3PhysicalRequestIdentityClass = 'CONFIRMED' | 'DERIVED' | 'UNVERIFIED';

export type ApdsV3ShadowPhysicalRequestIdentity = {
  physicalRequestId: string;
  identityClass: ApdsV3PhysicalRequestIdentityClass;
  correlationAttemptId: string | null;
};

type JobLike = {
  id?: string;
  attemptsMade?: number;
  data?: DimoSnapshotJobData;
};

/**
 * Authoritative physical poll attempt identity from enqueue / BullMQ provenance.
 * Wall-clock pollStartedAtMs is never used as a physical identity.
 */
export function resolveApdsV3ShadowPhysicalRequestIdentity(
  job: JobLike,
): ApdsV3ShadowPhysicalRequestIdentity | null {
  const ev = job.data?.apdShadowEnqueueEvidence;
  if (
    ev?.binding === 'PHYSICAL_JOB_PAYLOAD' &&
    typeof ev.attemptId === 'string' &&
    ev.attemptId.length > 0
  ) {
    return {
      physicalRequestId: `enqueue-attempt:${ev.attemptId}`,
      identityClass: 'CONFIRMED',
      correlationAttemptId: ev.attemptId,
    };
  }
  if (typeof job.id === 'string' && job.id.length > 0) {
    const attemptsMade = job.attemptsMade ?? 0;
    return {
      physicalRequestId: `bullmq:${job.id}:run:${attemptsMade}`,
      identityClass: 'DERIVED',
      correlationAttemptId: null,
    };
  }
  return null;
}
