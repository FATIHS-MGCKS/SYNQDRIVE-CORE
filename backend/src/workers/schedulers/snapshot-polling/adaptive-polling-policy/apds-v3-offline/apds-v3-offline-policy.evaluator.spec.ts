import { evaluateApdsV3OfflinePolicy } from './apds-v3-offline-policy.evaluator';
import type { ApdsV3OfflinePolicyInput } from './apds-v3-offline.types';
import { APDS_V3_CONSUMER_DEMAND_REGISTRY_VERSION } from './consumer-demand-registry.v1';

function baseInput(over: Partial<ApdsV3OfflinePolicyInput> = {}): ApdsV3OfflinePolicyInput {
  const now = 1_700_000_000_000;
  return {
    organizationId: 'org_a',
    vehicleId: 'veh_1',
    providerSourceLinkId: 'link_1',
    decisionAtMs: now,
    reconciliation: true,
    tripFsmState: 'RESTING',
    activityTier: 'RESTING_STANDBY',
    lastPhysicalPollMs: now - 600_000,
    lastLvProviderSourceMs: now - 60_000,
    lastProviderFetchedAtMs: now - 55_000,
    lastTopLevelProviderSourceMs: now - 58_000,
    profileClass: 'STABLE_PERIODIC',
    medianIntervalMs: 600_000,
    providerGapOpen: false,
    providerWakeOrReconnect: false,
    sourceLinkInvalidated: false,
    providerErrorRecent: false,
    p2cTopLevelAdvanceKnown: false,
    consumerDemandRevision: APDS_V3_CONSUMER_DEMAND_REGISTRY_VERSION,
    signalProfileRevision: 'vsi-rev-1',
    signalProfileRevisionEffectiveAtMs: now - 300_000,
    ...over,
  };
}

describe('evaluateApdsV3OfflinePolicy', () => {
  it('forces poll on active trip', () => {
    const d = evaluateApdsV3OfflinePolicy(
      baseInput({ tripFsmState: 'ACTIVE', reconciliation: true }),
    );
    expect(d.decision).toBe('FORCED_SAFETY_POLL');
  });

  it('NOT_ASSESSABLE for KS_MX calibration exclusion', () => {
    const d = evaluateApdsV3OfflinePolicy(
      baseInput({ excludeFromOptimizationCalibration: true }),
    );
    expect(d.decision).toBe('NOT_ASSESSABLE');
  });

  it('fail-closed consumer gate prevents skip after joint skip candidate', () => {
    const now = 1_700_000_000_000;
    const d = evaluateApdsV3OfflinePolicy(
      baseInput({
        decisionAtMs: now,
        lastPhysicalPollMs: now - 120_000,
        lastLvProviderSourceMs: now - 3_600_000,
        medianIntervalMs: 600_000,
        profileClass: 'STABLE_PERIODIC',
      }),
    );
    expect(d.decision).toBe('INSUFFICIENT_EVIDENCE');
    expect(d.reason).toContain('CONSUMER_FAIL_CLOSED');
  });

  it('future LV source yields insufficient evidence via causality', () => {
    const decisionAt = 1_700_000_000_000;
    const d = evaluateApdsV3OfflinePolicy(
      baseInput({
        decisionAtMs: decisionAt,
        lastLvProviderSourceMs: decisionAt + 60_000,
      }),
    );
    expect(d.decision).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('B2 poll prevents misclassified joint skip', () => {
    const now = 1_700_000_000_000;
    const d = evaluateApdsV3OfflinePolicy(
      baseInput({
        lastPhysicalPollMs: now - 5_000,
        lastLvProviderSourceMs: now - 3_600_000,
        medianIntervalMs: 600_000,
      }),
    );
    expect(d.decision).not.toBe('WOULD_SKIP');
    if (d.reason.includes('B2B4')) {
      expect(d.decision).toBe('WOULD_POLL');
    }
  });

  it('wake override forces poll', () => {
    const d = evaluateApdsV3OfflinePolicy(
      baseInput({ providerWakeOrReconnect: true }),
    );
    expect(d.decision).toBe('FORCED_SAFETY_POLL');
  });

  it('repeatability at UTC boundary', () => {
    const input = baseInput({ decisionAtMs: 1_700_000_000_000 });
    expect(evaluateApdsV3OfflinePolicy(input)).toEqual(
      evaluateApdsV3OfflinePolicy({ ...input }),
    );
  });
});
