import {
  aggregateApdsV3ReplayPoints,
  type ApdsV3ReplayEpochPoint,
} from './apds-v3-p1b0-replay-core';
import type { ApdsV3OfflinePolicyInput } from './apds-v3-offline.types';

function point(
  decisionAtMs: number,
  over: Partial<ApdsV3OfflinePolicyInput> = {},
): ApdsV3ReplayEpochPoint {
  const input: ApdsV3OfflinePolicyInput = {
    organizationId: 'org',
    vehicleId: 'v1',
    providerSourceLinkId: 'l1',
    decisionAtMs,
    reconciliation: true,
    tripFsmState: 'RESTING',
    activityTier: 'RESTING_STANDBY',
    lastPhysicalPollMs: decisionAtMs - 300_000,
    lastLvProviderSourceMs: decisionAtMs - 120_000,
    lastProviderFetchedAtMs: decisionAtMs - 110_000,
    lastTopLevelProviderSourceMs: decisionAtMs - 115_000,
    profileClass: 'STABLE_PERIODIC',
    medianIntervalMs: 600_000,
    providerGapOpen: false,
    providerWakeOrReconnect: false,
    sourceLinkInvalidated: false,
    providerErrorRecent: false,
    p2cTopLevelAdvanceKnown: false,
    consumerDemandRevision: 'APDS_V3_CONSUMER_DEMAND_V1',
    signalProfileRevision: 'rev',
    ...over,
  };
  return {
    decisionAtMs,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tierIntervalMs: 180_000,
    input,
  };
}

describe('aggregateApdsV3ReplayPoints', () => {
  it('aggregates baseline vs v3 projected counts', () => {
    const t0 = 1_700_000_000_000;
    const points = [
      point(t0),
      point(t0 + 60_000),
      point(t0 + 120_000),
    ];
    const report = aggregateApdsV3ReplayPoints(points, {
      startMs: t0,
      endMs: t0 + 120_000,
    });
    expect(report.decisionTickCount).toBe(3);
    expect(report.baselineEligiblePhysicalOpportunities).toBeGreaterThanOrEqual(0);
    expect(report.vehicleCount).toBe(1);
  });

  it('reports KS_MX provider error ticks separately', () => {
    const t0 = 1_700_000_000_000;
    const report = aggregateApdsV3ReplayPoints(
      [point(t0, { excludeFromOptimizationCalibration: true, providerErrorRecent: true })],
      { startMs: t0, endMs: t0 },
    );
    expect(report.notAssessable).toBe(1);
    expect(report.ksMx2024ProviderErrorTicks).toBe(1);
  });
});
