import { resolveApdsV3ShadowPhysicalRequestIdentity } from './apds-v3-shadow-physical-identity.v1';

describe('resolveApdsV3ShadowPhysicalRequestIdentity', () => {
  it('CONFIRMED from enqueue attempt id', () => {
    const id = resolveApdsV3ShadowPhysicalRequestIdentity({
      id: 'bull-stable',
      attemptsMade: 2,
      data: {
        vehicleId: 'v',
        dimoTokenId: 1,
        apdShadowEnqueueEvidence: {
          attemptId: 'attempt-uuid',
          canonicalJobId: 'snapshot-v',
          binding: 'PHYSICAL_JOB_PAYLOAD',
          outcome: 'ENQUEUED',
          observedAtMs: 1,
        },
      },
    });
    expect(id).toEqual({
      physicalRequestId: 'enqueue-attempt:attempt-uuid',
      identityClass: 'CONFIRMED',
      correlationAttemptId: 'attempt-uuid',
    });
  });

  it('DERIVED from BullMQ job id + attemptsMade', () => {
    const id = resolveApdsV3ShadowPhysicalRequestIdentity({
      id: 'job-99',
      attemptsMade: 1,
      data: { vehicleId: 'v', dimoTokenId: 2 },
    });
    expect(id).toMatchObject({
      identityClass: 'DERIVED',
      physicalRequestId: 'bullmq:job-99:run:1',
    });
  });

  it('returns null when identity cannot be derived', () => {
    expect(resolveApdsV3ShadowPhysicalRequestIdentity({ data: { vehicleId: 'v', dimoTokenId: 1 } })).toBeNull();
  });
});
