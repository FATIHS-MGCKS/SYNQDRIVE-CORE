import { aggregateApdsV3ReplayPoints, type ApdsV3ReplayEpochPoint } from './apds-v3-p1b0-replay-core';
import { APDS_V3_CONSUMER_DEMAND_REGISTRY_VERSION } from './consumer-demand-registry.v1';
import type { ApdsV3OfflinePolicyInput } from './apds-v3-offline.types';

function inputBase(
  decisionAtMs: number,
  over: Partial<ApdsV3OfflinePolicyInput> = {},
): ApdsV3OfflinePolicyInput {
  return {
    organizationId: 'org',
    vehicleId: 'veh',
    providerSourceLinkId: 'link',
    decisionAtMs,
    reconciliation: true,
    tripFsmState: 'RESTING',
    activityTier: 'RESTING_STANDBY',
    lastPhysicalPollMs: decisionAtMs - 600_000,
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
}

function point(
  at: number,
  over: Partial<ApdsV3OfflinePolicyInput> = {},
  physicalRequestId?: string,
): ApdsV3ReplayEpochPoint {
  return {
    decisionAtMs: at,
    organizationId: over.organizationId ?? 'org',
    vehicleId: over.vehicleId ?? 'veh',
    tierIntervalMs: 180_000,
    physicalRequestId,
    input: inputBase(at, over),
  };
}

describe('aggregateApdsV3ReplayPoints adversarial', () => {
  const t0 = 1_700_000_000_000;

  it('dedupes duplicate physicalRequestId across baseline and V3 counts', () => {
    const report = aggregateApdsV3ReplayPoints(
      [
        point(t0, {}, 'req-1'),
        point(t0 + 1, {}, 'req-1'),
      ],
      { startMs: t0, endMs: t0 + 1 },
    );
    expect(report.decisionTickCount).toBe(2);
    expect(report.physicalCountPrecision).toBe('CONFIRMED_PHYSICAL_ID');
    expect(report.dedupedBaselinePhysicalOpportunities).toBe(1);
    expect(report.dedupedV3ProjectedPhysicalPolls).toBe(1);
  });

  it('does not credit savings for excluded calibration vehicles', () => {
    const report = aggregateApdsV3ReplayPoints(
      [
        point(
          t0,
          {
            excludeFromOptimizationCalibration: true,
            lastPhysicalPollMs: t0 - 120_000,
            lastLvProviderSourceMs: t0 - 3_600_000,
          },
          'ksmx',
        ),
      ],
      { startMs: t0, endMs: t0 },
    );
    expect(report.notAssessable).toBe(1);
    expect(report.counterfactualHypotheticalSkipSavings).toBe(0);
  });

  it('tracks hypothetical poll when baseline not due without counting as additional on forced baseline-due', () => {
    const report = aggregateApdsV3ReplayPoints(
      [
        point(t0, {
          lastPhysicalPollMs: t0 - 600_000,
          providerWakeOrReconnect: true,
        }),
      ],
      { startMs: t0, endMs: t0 },
    );
    expect(report.v3AdditionalPollsVsBaseline).toBe(0);
    expect(report.forcedSafetyPoll).toBeGreaterThanOrEqual(1);
  });

  it('unknown activity tier marks baseline not assessable', () => {
    const report = aggregateApdsV3ReplayPoints(
      [point(t0, { activityTier: 'CUSTOM_UNKNOWN_TIER_X' })],
      { startMs: t0, endMs: t0 },
    );
    expect(report.canonicalEligibilityTicksNotAssessable).toBe(1);
  });

  it('lv miss uses advance evidence not staleness alone', () => {
    const report = aggregateApdsV3ReplayPoints(
      [
        point(t0, {
          lastPhysicalPollMs: t0 - 120_000,
          lastLvProviderSourceMs: t0 - 3_600_000,
          lvStrictSourceAdvanceObservedAtMs: null,
        }),
      ],
      { startMs: t0, endMs: t0 },
    );
    expect(report.hindsightLvSourceAdvanceMissObserved).toBe(0);
  });

  it('mixed vehicles do not share dedupe keys', () => {
    const report = aggregateApdsV3ReplayPoints(
      [
        point(t0, { vehicleId: 'v1' }, 'shared-id'),
        point(t0, { vehicleId: 'v2' }, 'shared-id'),
      ],
      { startMs: t0, endMs: t0 },
    );
    expect(report.vehicleCount).toBe(2);
  });
});
