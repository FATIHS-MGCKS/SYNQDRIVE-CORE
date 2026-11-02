import { mapDecisionRowToSummary } from './apds-master-intelligence-read.mapper';

describe('apds-master-intelligence-read.mapper', () => {
  it('marks simulated next poll as not executed poll proof', () => {
    const summary = mapDecisionRowToSummary({
      id: 'dec-1',
      organizationId: 'org',
      vehicleId: 'veh',
      opportunityId: 'opp-long-id-1234567890',
      decisionAt: new Date('2026-10-28T10:00:00.000Z'),
      activationEpochId: null,
      realPollId: null,
      realPollStatus: null,
      shadowExecutionVersion: 'P25_APD_SHADOW_EXEC_V2',
      reconciliation: true,
      enqueueOutcome: null,
      enqueueOutcomeAt: null,
      policyVersion: 'P25_APD_B2_V1',
      profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
      profileClass: 'LV_8H',
      decision: 'ADVANCE',
      reason: 'TEST',
      lastLvSourceAt: null,
      lastProviderFetchedAt: null,
      expectedWindowStart: null,
      expectedWindowEnd: null,
      providerGapState: null,
      connectivityState: null,
      wakeCorrelationId: null,
      realPollStartedAt: null,
      realPollVisibleLvSourceAt: null,
      realPollCompletedAt: null,
      newLvSourceObserved: false,
      newLvSourceAt: null,
      newTopLevelSourceObserved: false,
      newObdSourceObserved: false,
      newIgnitionSourceObserved: false,
      simulatedNextPollAt: new Date('2026-10-28T12:00:00.000Z'),
      simulatedDiscoveryAt: null,
      additionalDiscoveryDelayMs: null,
      legacyAssessmentImpact: 'NONE',
      legacyPublicationImpact: 'NONE',
      legacyCustomerImpact: 'NONE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(summary.opportunityId).toBe('opp-long-id-1234567890');
    expect(summary.opportunityIdPrefix).toBe('opp-long-id-…');
    expect(summary.simulatedNextPollAtIsNotExecutedPoll).toBe(true);
    expect(summary.realPollLinkStatus).toBe('NOT_LINKED');
  });
});
