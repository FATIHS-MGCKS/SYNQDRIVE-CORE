import { buildApdsV3ShadowDecisionFingerprint } from './apds-v3-shadow-decision-fingerprint.v1';

describe('APDS V3 shadow decision fingerprint', () => {
  const base = {
    organizationId: 'o',
    vehicleId: 'v',
    providerSourceLinkId: 'l',
    physicalRequestId: 'enqueue-attempt:a',
    activationVersion: 'APDS_V3_SHADOW_ACTIVATION_V1',
    policyVersion: 'v1',
    baselineCanonicalDue: true,
    baselineAuthority: 'B',
    baselineAssessable: true,
    v3Decision: 'POLL',
    v3Reason: 'ok',
    expectedInformationGain: 1,
    informationGainHeuristic: true,
    consumerDemandFailClosed: false,
    observationQuality: 'LOW',
    observationScope: 'BASELINE_PHYSICAL_POLL_START_ONLY',
    missingEvidenceReasons: ['P2C_OBSERVATION_NOT_PERSISTED'],
  };

  it('is stable for identical scientific payload', () => {
    expect(buildApdsV3ShadowDecisionFingerprint(base)).toBe(
      buildApdsV3ShadowDecisionFingerprint({ ...base }),
    );
  });

  it('changes when scientific decision differs', () => {
    const a = buildApdsV3ShadowDecisionFingerprint(base);
    const b = buildApdsV3ShadowDecisionFingerprint({ ...base, v3Decision: 'SKIP' });
    expect(a).not.toBe(b);
  });
});
