import { isApdsV3ShadowRuntimeReady } from './apds-v3-shadow.config';
import { resolveApdsV3ShadowPhysicalRequestIdentity } from './apds-v3-shadow-physical-identity.v1';
import { buildApdsV3ShadowDecisionFingerprint } from './apds-v3-shadow-decision-fingerprint.v1';

describe('APDS V3 P1B1 remediation adversarial', () => {
  it('kill switch transition disables runtime', () => {
    process.env.WORKER_APDS_V3_SHADOW_ENABLED = 'false';
    expect(isApdsV3ShadowRuntimeReady()).toBe(false);
    process.env.WORKER_APDS_V3_SHADOW_ENABLED = 'true';
    process.env.WORKER_APDS_V3_SHADOW_ACTIVATION_VERSION = 'APDS_V3_SHADOW_ACTIVATION_V1';
    expect(isApdsV3ShadowRuntimeReady()).toBe(true);
    delete process.env.WORKER_APDS_V3_SHADOW_ENABLED;
    delete process.env.WORKER_APDS_V3_SHADOW_ACTIVATION_VERSION;
  });

  it('different physical attempts do not collapse', () => {
    const a = resolveApdsV3ShadowPhysicalRequestIdentity({
      id: 'j',
      attemptsMade: 0,
      data: {
        vehicleId: 'v',
        dimoTokenId: 1,
        apdShadowEnqueueEvidence: {
          attemptId: 'one',
          canonicalJobId: 'snapshot-v',
          binding: 'PHYSICAL_JOB_PAYLOAD',
          outcome: 'ENQUEUED',
          observedAtMs: 1,
        },
      },
    });
    const b = resolveApdsV3ShadowPhysicalRequestIdentity({
      id: 'j',
      attemptsMade: 0,
      data: {
        vehicleId: 'v',
        dimoTokenId: 1,
        apdShadowEnqueueEvidence: {
          attemptId: 'two',
          canonicalJobId: 'snapshot-v',
          binding: 'PHYSICAL_JOB_PAYLOAD',
          outcome: 'ENQUEUED',
          observedAtMs: 2,
        },
      },
    });
    expect(a?.physicalRequestId).not.toBe(b?.physicalRequestId);
  });

  it('duplicate delivery fingerprints match', () => {
    const row = {
      organizationId: 'o',
      vehicleId: 'v',
      providerSourceLinkId: 'l',
      physicalRequestId: 'enqueue-attempt:x',
      activationVersion: 'APDS_V3_SHADOW_ACTIVATION_V1',
      policyVersion: 'p',
      baselineCanonicalDue: null,
      baselineAuthority: 'B',
      baselineAssessable: false,
      v3Decision: 'NOT_ASSESSABLE',
      v3Reason: 'INSUFFICIENT',
      expectedInformationGain: null,
      informationGainHeuristic: false,
      consumerDemandFailClosed: true,
      observationQuality: null,
      observationScope: 'BASELINE_PHYSICAL_POLL_START_ONLY',
      missingEvidenceReasons: ['P2C_OBSERVATION_NOT_PERSISTED'],
    };
    expect(buildApdsV3ShadowDecisionFingerprint(row)).toBe(
      buildApdsV3ShadowDecisionFingerprint(row),
    );
  });
});
