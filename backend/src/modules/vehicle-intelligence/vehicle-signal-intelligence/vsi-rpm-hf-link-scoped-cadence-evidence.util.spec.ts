import {
  analyzeEngineRpmCadence,
} from './vsi-profile-cadence-stats.util';
import {
  mergeActiveRpmProfileOntoEngineRpmCadence,
  resolveActiveRpmProfileV1,
} from './vsi-active-rpm-profile-resolver.util';
import {
  buildVsiRpmCombinedEvidenceInputFromProfileSignal,
  resolveVsiRpmCombinedEvidenceAvailabilityV1,
  VSI_RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN,
} from './vsi-engine-rpm-combined-evidence-v1.util';
import type { HfTripRpmPointsReadResult } from '@modules/clickhouse/clickhouse-hf.types';
import {
  evaluateTripWindowSourceLinkAttributionV1,
  loadLinkScopedRpmHfCadencePointsV1,
  sourceLinksCoveringInterval,
  VSI_RPM_HF_HISTORICAL_MULTI_LINK_AT_TRIP_WINDOW,
} from './vsi-rpm-hf-link-scoped-cadence-evidence.util';

function mockHfResult(
  partial: Partial<HfTripRpmPointsReadResult> & Pick<HfTripRpmPointsReadResult, 'status' | 'points'>,
): HfTripRpmPointsReadResult {
  return {
    available: partial.status === 'SUCCESS' || partial.status === 'EMPTY',
    orgId: 'org-1',
    vehicleId: 'veh-1',
    tripId: 't1',
    tripWindowFromIso: '',
    tripWindowToIso: '',
    signalName: 'powertrainCombustionEngineSpeed',
    totalMatchingCount: partial.points.length,
    returnedCount: partial.points.length,
    rawRowsReturned: partial.points.length,
    limit: 100,
    offset: 0,
    completenessStatus: 'COMPLETE',
    duplicateTimestampCount: 0,
    invalidValueCount: 0,
    tenantScopeViolation: partial.tenantScopeViolation ?? false,
    ...partial,
  };
}

function tripRow(
  tripId: string,
  startMs: number,
  endMs: number,
  valueRpm: number,
  tokenId: number | null = 100,
): HfTripRpmPointsReadResult['points'][number] {
  return {
    recordedAtMs: startMs + 1000,
    recordedAtIso: new Date(startMs + 1000).toISOString(),
    valueRpm,
    unit: 'rpm',
    quality: 'normalized',
    orgId: 'org-1',
    vehicleId: 'veh-1',
    tripId,
    tokenId,
  };
}

describe('VSI P1-F link-scoped HF cadence evidence', () => {
  const linkA: { id: string; activatedAtMs: number; deactivatedAtMs: number | null } = {
    id: 'link-a',
    activatedAtMs: 0,
    deactivatedAtMs: 500_000,
  };
  const linkB = {
    id: 'link-b',
    activatedAtMs: 500_000,
    deactivatedAtMs: null as number | null,
  };

  it('A — single link: trip-scoped reads include only matching trip/org rows', async () => {
    const tripWindows = [{ tripId: 't1', startMs: 10_000, endMs: 20_000 }];
    const hf = {
      getTripRpmHfPoints: jest.fn(async () =>
        mockHfResult({
          status: 'SUCCESS',
          points: [tripRow('t1', 10_000, 20_000, 1500)],
        }),
      ),
    };

    const loaded = await loadLinkScopedRpmHfCadencePointsV1({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      targetLinkId: 'link-a',
      linkIntervals: [linkA],
      tripWindows,
      expectedDimoTokenId: 100,
      requireDimoToken: true,
      maxPoints: 100,
      hf,
    });

    expect(loaded.hfReadStatus).toBe('SUCCESS');
    expect(loaded.points).toHaveLength(1);
    expect(loaded.attributionLimitations).toHaveLength(0);
    expect(hf.getTripRpmHfPoints).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-1', tripId: 't1' }),
    );
  });

  it('B — device switch: foreign trip bulk points are not pulled (trip-scoped only)', async () => {
    const tripWindows = [{ tripId: 't-b', startMs: 600_000, endMs: 610_000 }];
    const hf = {
      getTripRpmHfPoints: jest.fn(async () =>
        mockHfResult({
          status: 'SUCCESS',
          points: [tripRow('t-b', 600_000, 610_000, 1200, 200)],
        }),
      ),
    };

    const loaded = await loadLinkScopedRpmHfCadencePointsV1({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      targetLinkId: 'link-b',
      linkIntervals: [linkA, linkB],
      tripWindows,
      expectedDimoTokenId: 200,
      requireDimoToken: true,
      maxPoints: 100,
      hf,
    });

    expect(loaded.points).toHaveLength(1);
    expect(loaded.points[0]!.value).toBe(1200);
  });

  it('B2 — rejects HF rows with mismatched device token on target link', async () => {
    const tripWindows = [{ tripId: 't-b', startMs: 600_000, endMs: 610_000 }];
    const hf = {
      getTripRpmHfPoints: jest.fn(async () =>
        mockHfResult({
          status: 'SUCCESS',
          points: [tripRow('t-b', 600_000, 610_000, 1500, 999)],
        }),
      ),
    };

    const loaded = await loadLinkScopedRpmHfCadencePointsV1({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      targetLinkId: 'link-b',
      linkIntervals: [linkA, linkB],
      tripWindows,
      expectedDimoTokenId: 200,
      requireDimoToken: true,
      maxPoints: 100,
      hf,
    });

    expect(loaded.points).toHaveLength(0);
    expect(loaded.attributionLimitations).toContain(VSI_RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN);
  });

  it('C — mid-trip link switch: overlapping lifetimes fail-closed for HF cadence', () => {
    const trip = { tripId: 't-switch', startMs: 400_000, endMs: 600_000 };
    const attribution = evaluateTripWindowSourceLinkAttributionV1({
      targetLinkId: 'link-b',
      links: [linkA, linkB],
      tripStartMs: trip.startMs,
      tripEndMs: trip.endMs,
    });
    expect(attribution.attributable).toBe(false);
    expect(attribution.limitation).toBe(VSI_RPM_HF_HISTORICAL_MULTI_LINK_AT_TRIP_WINDOW);
  });

  it('D — overlapping link lifetimes on same trip window are detected', () => {
    const covering = sourceLinksCoveringInterval([linkA, linkB], 450_000, 550_000);
    expect(covering).toHaveLength(2);
  });

  it('F — missing DIMO token fails closed without HF points', async () => {
    const loaded = await loadLinkScopedRpmHfCadencePointsV1({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      targetLinkId: 'link-a',
      linkIntervals: [linkA],
      tripWindows: [{ tripId: 't1', startMs: 1_000, endMs: 2_000 }],
      expectedDimoTokenId: null,
      requireDimoToken: true,
      maxPoints: 100,
      hf: { getTripRpmHfPoints: jest.fn() },
    });
    expect(loaded.points).toHaveLength(0);
    expect(loaded.attributionLimitations).toContain(VSI_RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN);
    expect(loaded.hfReadStatus).toBe('EMPTY');
  });

  it('G — tenant scope violation yields no points and attribution limitation', async () => {
    const hf = {
      getTripRpmHfPoints: jest.fn(async () =>
        mockHfResult({
          status: 'TENANT_SCOPE_VIOLATION',
          points: [],
          tenantScopeViolation: true,
        }),
      ),
    };
    const loaded = await loadLinkScopedRpmHfCadencePointsV1({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      targetLinkId: 'link-a',
      linkIntervals: [linkA],
      tripWindows: [{ tripId: 't1', startMs: 1_000, endMs: 2_000 }],
      expectedDimoTokenId: 100,
      requireDimoToken: true,
      maxPoints: 100,
      hf,
    });
    expect(loaded.points).toHaveLength(0);
    expect(loaded.attributionLimitations).toContain(VSI_RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN);
  });

  it('H — reactivation: only the target link interval may attribute a trip window', () => {
    const linkBClosed = { ...linkB, deactivatedAtMs: 800_000 };
    const linkA2 = {
      id: 'link-a2',
      activatedAtMs: 800_000,
      deactivatedAtMs: null as number | null,
    };
    const ok = evaluateTripWindowSourceLinkAttributionV1({
      targetLinkId: 'link-a2',
      links: [linkA, linkBClosed, linkA2],
      tripStartMs: 810_000,
      tripEndMs: 820_000,
    });
    expect(ok.attributable).toBe(true);
  });

  it('P1-E regression: vehicle-wide foreign intervals no longer inflate cadence after link-scoped load', async () => {
    const tripWindows = [{ tripId: 't-b', startMs: 600_000, endMs: 610_000 }];
    const hf = {
      getTripRpmHfPoints: jest.fn(async () =>
        mockHfResult({
          status: 'SUCCESS',
          points: [tripRow('t-b', 600_000, 610_000, 1200, 200)],
          limit: 12_000,
        }),
      ),
    };

    const loaded = await loadLinkScopedRpmHfCadencePointsV1({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      targetLinkId: 'link-b',
      linkIntervals: [linkA, linkB],
      tripWindows,
      expectedDimoTokenId: 200,
      requireDimoToken: true,
      maxPoints: 12_000,
      hf,
    });

    const evidence = {
      iceRpmApplicability: 'APPLICABLE' as const,
      tripWindows,
      points: loaded.points,
      provenance: loaded.hfReadStatus === 'SUCCESS' ? ['CLICKHOUSE_TELEMETRY_HF_POINTS'] : [],
      hfReadStatus: loaded.hfReadStatus,
      attributionLimitations: loaded.attributionLimitations,
    };
    const cadence = mergeActiveRpmProfileOntoEngineRpmCadence(
      analyzeEngineRpmCadence(evidence),
      evidence,
    );
    expect(cadence.observedSampleCount).toBe(1);
    const profile = resolveActiveRpmProfileV1(evidence);
    expect(profile?.activeProfile).not.toBe('RPM_1HZ');
  });

  it('PR2272 — attribution limitations on cadence block PROVEN_HISTORICAL_ONLY', () => {
    const evidence = {
      iceRpmApplicability: 'APPLICABLE' as const,
      tripWindows: [{ tripId: 't1', startMs: 0, endMs: 10_000 }],
      points: [{ recordedAtMs: 1000, value: 1500 }],
      provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS'],
      hfReadStatus: 'SUCCESS' as const,
      attributionLimitations: [VSI_RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN],
    };
    const cadence = analyzeEngineRpmCadence(evidence);
    const input = buildVsiRpmCombinedEvidenceInputFromProfileSignal({
      rpmApplicability: 'APPLICABLE',
      profileLimitations: [],
      signal: {
        empiricalObservation: 'NEVER_OBSERVED',
        freshnessClassification: 'UNKNOWN',
        lastValidObservationAt: null,
        qualityClassification: 'NEVER_OBSERVED',
        powertrainApplicability: 'APPLICABLE',
        cadenceIntelligence: cadence,
      } as never,
    });
    const combined = resolveVsiRpmCombinedEvidenceAvailabilityV1(input);
    expect(combined.availability).toBe('NOT_PROVEN');
    expect(combined.limitations).toContain(VSI_RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN);
  });
});