import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRpmEvidenceFromIntervalReplayTrips,
  classifySingleTripRpmProfile,
  resolveActiveRpmProfileV1,
} from '../../../vehicle-signal-intelligence/vsi-active-rpm-profile-resolver.util';
import { resolveTripRpmProfileFromVsi } from '../ds4-rpm-hf-v1a-admission';
import {
  buildDs4RpmHfV1aDataQuality,
  buildSyntheticRpmPointsFromIntervals,
} from '../ds4-rpm-hf-v1a-data-quality';

describe('ds4-rpm-hf-v1a fixture replay', () => {
  const fixture = JSON.parse(
    readFileSync(
      join(
        __dirname,
        '../../../vehicle-signal-intelligence/fixtures/rpm-production-interval-replay.json',
      ),
      'utf8',
    ),
  ) as {
    tiguan: {
      trips: Array<{ tripId: string; startMs: number; endMs: number; intervalsSec: number[] }>;
    };
    audi: {
      trips: Array<{ tripId: string; startMs: number; endMs: number; intervalsSec: number[] }>;
    };
  };

  it('Tiguan dense trip → data quality shows intervals and gaps', () => {
    const trip = fixture.tiguan.trips.find(
      (t) => t.tripId === '98d2a8e0-8b7d-4529-bf76-acee44d61fbe',
    )!;
    const points = buildSyntheticRpmPointsFromIntervals({
      tripStartMs: trip.startMs,
      intervalsSec: trip.intervalsSec.slice(0, 80),
    });
    const dq = buildDs4RpmHfV1aDataQuality({
      read: {
        status: 'SUCCESS',
        available: true,
        orgId: 'o',
        vehicleId: 'v',
        tripId: trip.tripId,
        tripWindowFromIso: new Date(trip.startMs).toISOString(),
        tripWindowToIso: new Date(trip.startMs + 3_600_000).toISOString(),
        signalName: 'powertrainCombustionEngineSpeed',
        points: [],
        totalMatchingCount: points.length,
        returnedCount: points.length,
        rawRowsReturned: points.length,
        limit: 12000,
        offset: 0,
        completenessStatus: 'COMPLETE',
        duplicateTimestampCount: 0,
        invalidValueCount: 0,
        tenantScopeViolation: false,
      },
      points: points.map((p) => ({ ...p, orgId: 'o', vehicleId: 'v', tripId: trip.tripId })),
    });
    expect(dq.validPointCount).toBeGreaterThan(10);
    expect(dq.observedIntervals.intervalMedianSeconds).not.toBeNull();
    expect(dq.gapInterpretationPolicy).toBe('MISSING_POINTS_NOT_ENGINE_STOP');
    expect(dq.identifiedGaps.length).toBeGreaterThan(0);
  });

  it('Tiguan representative trip → VSI trip profile RPM_1HZ', () => {
    const trip = fixture.tiguan.trips.find(
      (t) => t.tripId === '7e72506d-b693-4910-8c1f-00849c9a3af3',
    )!;
    const classification = classifySingleTripRpmProfile({
      trip: { tripId: trip.tripId, startMs: trip.startMs, endMs: trip.startMs + 5_000_000 },
      points: buildSyntheticRpmPointsFromIntervals({
        tripStartMs: trip.startMs,
        intervalsSec: trip.intervalsSec,
      }).map((p) => ({ recordedAtMs: p.recordedAtMs, value: p.valueRpm })),
    });
    expect(classification.profile).toBe('RPM_1HZ');
  });

  it('Audi trip → RPM_STANDARD trip classification', () => {
    const trip = fixture.audi.trips[0]!;
    const classification = classifySingleTripRpmProfile({
      trip: { tripId: trip.tripId, startMs: trip.startMs, endMs: trip.startMs + 900_000 },
      points: buildSyntheticRpmPointsFromIntervals({
        tripStartMs: trip.startMs,
        intervalsSec: trip.intervalsSec,
      }).map((p) => ({ recordedAtMs: p.recordedAtMs, value: p.valueRpm })),
    });
    expect(classification.profile).toBe('RPM_STANDARD');
  });

  it('rolling resolver + per-trip admission respects historical STANDARD vs rolling RPM_1HZ', () => {
    const phase = fixture.tiguan.trips.filter((t) => {
      const day = new Date(t.endMs).toISOString().slice(0, 10);
      return day >= '2026-10-23' && day <= '2026-10-27';
    });
    const rollingTrips = phase.slice(-6).map((t) => ({
      tripId: t.tripId,
      startMs: t.startMs,
      endMs: t.endMs,
      intervalsSec: t.intervalsSec,
    }));
    const evidence = buildRpmEvidenceFromIntervalReplayTrips(rollingTrips);
    const resolution = resolveActiveRpmProfileV1(evidence);
    expect(resolution?.activeProfile).toBe('RPM_1HZ');

    const earlySparse = fixture.tiguan.trips.find(
      (t) => t.tripId === 'bc310e1b-5c87-488a-9a19-ceb40991cbe4',
    )!;
    const rollingTripProfile = resolveTripRpmProfileFromVsi({
      tripId: earlySparse.tripId,
      tripClassifications: resolution?.tripClassifications ?? [],
    });
    expect(rollingTripProfile).toBe('UNCLASSIFIED');
    const perTrip = resolveActiveRpmProfileV1(
      buildRpmEvidenceFromIntervalReplayTrips([
        {
          tripId: earlySparse.tripId,
          startMs: earlySparse.startMs,
          endMs: earlySparse.endMs,
          intervalsSec: earlySparse.intervalsSec,
        },
      ]),
    );
    expect(perTrip?.tripClassifications[0]?.profile).toBe('RPM_STANDARD');
  });
});

describe('ds4-rpm-hf-v1a-data-quality edge cases', () => {
  it('duplicate timestamps are counted', () => {
    const t0 = Date.UTC(2026, 9, 27, 10, 0, 0);
    const points = [
      {
        recordedAtMs: t0,
        recordedAtIso: new Date(t0).toISOString(),
        valueRpm: 1000,
        unit: 'rpm',
        quality: 'normalized',
        orgId: 'o',
        vehicleId: 'v',
        tripId: 't',
        tokenId: 424242,
      },
      {
        recordedAtMs: t0,
        recordedAtIso: new Date(t0).toISOString(),
        valueRpm: 1100,
        unit: 'rpm',
        quality: 'normalized',
        orgId: 'o',
        vehicleId: 'v',
        tripId: 't',
        tokenId: 424242,
      },
    ];
    const dq = buildDs4RpmHfV1aDataQuality({
      read: {
        status: 'SUCCESS',
        available: true,
        orgId: 'o',
        vehicleId: 'v',
        tripId: 't',
        tripWindowFromIso: new Date(t0).toISOString(),
        tripWindowToIso: new Date(t0 + 60_000).toISOString(),
        signalName: 'powertrainCombustionEngineSpeed',
        points: [],
        totalMatchingCount: 2,
        returnedCount: 2,
        rawRowsReturned: 2,
        limit: 12000,
        offset: 0,
        completenessStatus: 'COMPLETE',
        duplicateTimestampCount: 1,
        invalidValueCount: 0,
        tenantScopeViolation: false,
      },
      points,
    });
    expect(dq.duplicateTimestampCount).toBe(1);
  });

  it('long trip incompleteness when total exceeds returned', () => {
    const dq = buildDs4RpmHfV1aDataQuality({
      read: {
        status: 'SUCCESS',
        available: true,
        orgId: 'o',
        vehicleId: 'v',
        tripId: 't',
        tripWindowFromIso: new Date().toISOString(),
        tripWindowToIso: new Date().toISOString(),
        signalName: 'powertrainCombustionEngineSpeed',
        points: [],
        totalMatchingCount: 15000,
        returnedCount: 12000,
        rawRowsReturned: 12000,
        limit: 12000,
        offset: 0,
        completenessStatus: 'INCOMPLETE_MORE_POINTS_AVAILABLE',
        duplicateTimestampCount: 0,
        invalidValueCount: 0,
        tenantScopeViolation: false,
      },
      points: buildSyntheticRpmPointsFromIntervals({
        tripStartMs: Date.UTC(2026, 0, 1),
        intervalsSec: Array.from({ length: 12000 }, () => 1),
      }),
    });
    expect(dq.completenessLabel).toBe('INCOMPLETE_MORE_POINTS_AVAILABLE');
    expect(dq.totalMatchingCount).toBe(15000);
  });
});
