import {
  aggregateApdsV3ReplayPoints,
  resolveReplayPhysicalCountPrecision,
  type ApdsV3ReplayEpochPoint,
} from './apds-v3-p1b0-replay-core';
import { APDS_V3_CONSUMER_DEMAND_REGISTRY_VERSION } from './consumer-demand-registry.v1';
import type { ApdsV3OfflinePolicyInput } from './apds-v3-offline.types';

function epochPoint(
  decisionAtMs: number,
  over: Partial<ApdsV3OfflinePolicyInput>,
  physicalRequestId?: string,
): ApdsV3ReplayEpochPoint {
  const input: ApdsV3OfflinePolicyInput = {
    organizationId: 'org',
    vehicleId: 'veh',
    providerSourceLinkId: 'link',
    decisionAtMs,
    reconciliation: true,
    tripFsmState: 'RESTING',
    activityTier: 'RESTING_STANDBY',
    lastPhysicalPollMs: decisionAtMs - 5_000,
    lastLvProviderSourceMs: decisionAtMs - 60_000,
    lastProviderFetchedAtMs: decisionAtMs - 55_000,
    lastTopLevelProviderSourceMs: decisionAtMs - 58_000,
    profileClass: 'STABLE_PERIODIC',
    medianIntervalMs: 600_000,
    providerGapOpen: false,
    providerWakeOrReconnect: false,
    sourceLinkInvalidated: false,
    providerErrorRecent: false,
    p2cTopLevelAdvanceKnown: false,
    consumerDemandRevision: APDS_V3_CONSUMER_DEMAND_REGISTRY_VERSION,
    signalProfileRevision: 'rev',
    signalProfileRevisionEffectiveAtMs: decisionAtMs - 300_000,
    ...over,
  };
  return {
    decisionAtMs,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tierIntervalMs: 180_000,
    physicalRequestId,
    input,
  };
}

describe('apds-v3-p1b0-replay integration exact counts', () => {
  const t0 = 1_700_000_000_000;

  it('baseline-not-due wake poll increments projected, hypothetical-not-due, and additional exactly once', () => {
    const report = aggregateApdsV3ReplayPoints(
      [
        epochPoint(t0, { providerWakeOrReconnect: true, lastPhysicalPollMs: t0 - 5_000 }, 'phys-a'),
        epochPoint(t0 + 1, { providerWakeOrReconnect: true, lastPhysicalPollMs: t0 - 5_000 }, 'phys-a'),
      ],
      { startMs: t0, endMs: t0 + 1 },
    );
    expect(report.dedupedV3ProjectedPhysicalPolls).toBe(1);
    expect(report.v3HypotheticalPollsWhenBaselineNotDue).toBe(1);
    expect(report.v3AdditionalPollsVsBaseline).toBe(1);
    expect(report.baselineEligiblePhysicalOpportunities).toBe(0);
  });

  it('baseline-due forced poll is projected but not additional', () => {
    const report = aggregateApdsV3ReplayPoints(
      [epochPoint(t0, { providerWakeOrReconnect: true, lastPhysicalPollMs: t0 - 600_000 }, 'phys-b')],
      { startMs: t0, endMs: t0 },
    );
    expect(report.baselineEligiblePhysicalOpportunities).toBe(1);
    expect(report.dedupedV3ProjectedPhysicalPolls).toBe(1);
    expect(report.v3HypotheticalPollsWhenBaselineNotDue).toBe(0);
    expect(report.v3AdditionalPollsVsBaseline).toBe(0);
  });

  it('mixed physical id coverage reports incomplete precision', () => {
    const points = [
      epochPoint(t0, {}, 'id-1'),
      epochPoint(t0 + 1, {}, undefined),
    ];
    expect(resolveReplayPhysicalCountPrecision(points)).toBe(
      'MIXED_PHYSICAL_ID_INCOMPLETE',
    );
    const report = aggregateApdsV3ReplayPoints(points, { startMs: t0, endMs: t0 + 1 });
    expect(report.physicalCountPrecision).toBe('MIXED_PHYSICAL_ID_INCOMPLETE');
  });
});
