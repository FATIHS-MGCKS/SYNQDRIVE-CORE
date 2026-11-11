import { evaluateApdsV3OfflinePolicy } from './apds-v3-offline-policy.evaluator';
import { APDS_V3_CONSUMER_DEMAND_REGISTRY_VERSION } from './consumer-demand-registry.v1';
import type { ApdsV3OfflinePolicyInput } from './apds-v3-offline.types';

/**
 * Registry v1 hard-safety UNKNOWN freshness blocks certified WOULD_SKIP.
 * Research-only skips may be reported separately in replay as HYPOTHETICAL_RESEARCH_CANDIDATE.
 */
describe('consumer demand research boundary', () => {
  it('never returns certified WOULD_SKIP under default registry v1 joint-skip path', () => {
    const now = 1_700_000_000_000;
    const input: ApdsV3OfflinePolicyInput = {
      organizationId: 'org',
      vehicleId: 'veh',
      providerSourceLinkId: 'link',
      decisionAtMs: now,
      reconciliation: true,
      tripFsmState: 'RESTING',
      activityTier: 'RESTING_STANDBY',
      lastPhysicalPollMs: now - 120_000,
      lastLvProviderSourceMs: now - 3_600_000,
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
      signalProfileRevision: 'rev',
      signalProfileRevisionEffectiveAtMs: now - 300_000,
    };
    const d = evaluateApdsV3OfflinePolicy(input);
    expect(d.decision).not.toBe('WOULD_SKIP');
  });
});
