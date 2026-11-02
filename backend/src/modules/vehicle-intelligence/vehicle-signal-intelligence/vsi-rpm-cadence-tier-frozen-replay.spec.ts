import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRpmEvidenceFromIntervalReplayTrips,
  classifySingleTripRpmProfile,
} from './vsi-active-rpm-profile-resolver.util';
import {
  computeFrozenCohortFixtureInputDigest,
  computeFrozenTripFixtureInputDigest,
  RPM_CADENCE_TIER_SOURCE_SERIES_DIGEST_ATTESTATION,
  type RpmCadenceTierFrozenTripFixture,
} from './vsi-rpm-cadence-tier-frozen-digest.util';
import {
  classifyVsiRpmCadenceTierV1,
  VSI_RPM_CADENCE_TIER_CONTRACT_VERSION,
} from './vsi-rpm-cadence-tier.util';

const fableDeltaManifest = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/rpm-cadence-tier-fable-delta-manifest.json'), 'utf8'),
) as {
  rootCause: string;
  differingTripIdsBeforeFix: unknown[];
};

type FrozenCohort = {
  contractVersion: string;
  classifierFrozenAggregates: {
    tiguan: Record<string, number>;
    audi: Record<string, number>;
  };
  fableDocumentedReferenceAggregates: {
    tiguan: Record<string, number>;
    audi: Record<string, number>;
  };
  fixtureInputDigestManifest: {
    cohortFixtureInputDigest: string;
    duplicateTimestampCountSemantics: string;
    sourceSeriesDigestAttestation: typeof RPM_CADENCE_TIER_SOURCE_SERIES_DIGEST_ATTESTATION;
  };
  fleets: {
    tiguan: { trips: RpmCadenceTierFrozenTripFixture[]; tripCount: number };
    audi: { trips: RpmCadenceTierFrozenTripFixture[]; tripCount: number };
  };
};

function loadFrozenCohort(): FrozenCohort {
  const path = join(__dirname, 'fixtures/rpm-multicadence-tier-frozen-cohort-v1.json');
  return JSON.parse(readFileSync(path, 'utf8')) as FrozenCohort;
}

function allTrips(cohort: FrozenCohort): RpmCadenceTierFrozenTripFixture[] {
  return [...cohort.fleets.tiguan.trips, ...cohort.fleets.audi.trips];
}

const TIER_LABELS = ['RPM_1S', 'RPM_2S', 'RPM_3S', 'SPARSE', 'UNKNOWN'] as const;

function normalizeTierTally(tally: Record<string, number>): Record<string, number> {
  return Object.fromEntries(TIER_LABELS.map((label) => [label, tally[label] ?? 0]));
}

function tallyTiers(trips: RpmCadenceTierFrozenTripFixture[]): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const trip of trips) {
    const result = classifyVsiRpmCadenceTierV1({
      intervalsSec: trip.intervalsSec,
      rpmPointCount: trip.rpmPointCount,
      tripDurationSeconds: trip.tripDurationSeconds,
    });
    tally[result.tier] = (tally[result.tier] ?? 0) + 1;
  }
  return normalizeTierTally(tally);
}

describe('vsi-rpm-cadence-tier frozen cohort replay', () => {
  const cohort = loadFrozenCohort();
  const trips = allTrips(cohort);

  it('loads frozen cohort with 61 Tiguan and 57 Audi trips (fixed window, no NOW())', () => {
    expect(cohort.fleets.tiguan.tripCount).toBe(61);
    expect(cohort.fleets.audi.tripCount).toBe(57);
    expect(cohort.contractVersion).toBe('rpm-multicadence-frozen-cohort-v1');
  });

  it('verifies recomputed fixture input digests match stored per-trip hashes', () => {
    for (const trip of trips) {
      expect(trip.fixtureInputDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(computeFrozenTripFixtureInputDigest(trip)).toBe(trip.fixtureInputDigest);
    }
  });

  it('verifies cohort fixture input digest manifest', () => {
    expect(computeFrozenCohortFixtureInputDigest(trips)).toBe(
      cohort.fixtureInputDigestManifest.cohortFixtureInputDigest,
    );
  });

  it('documents source series digest as export-attested only (not interval-derived)', () => {
    expect(cohort.fixtureInputDigestManifest.sourceSeriesDigestAttestation.algorithm).toBe(
      RPM_CADENCE_TIER_SOURCE_SERIES_DIGEST_ATTESTATION.algorithm,
    );
    for (const trip of trips) {
      expect(trip.seriesDigest).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('matches FABLE documented reference aggregates on frozen fixture (Tiguan)', () => {
    expect(tallyTiers(cohort.fleets.tiguan.trips)).toEqual(
      cohort.fableDocumentedReferenceAggregates.tiguan,
    );
  });

  it('matches FABLE documented reference aggregates on frozen fixture (Audi)', () => {
    const tally = tallyTiers(cohort.fleets.audi.trips);
    expect(tally).toEqual(cohort.fableDocumentedReferenceAggregates.audi);
    expect(tally.RPM_1S ?? 0).toBe(0);
  });

  it('aligns with FABLE replay expected tier labels for all 118 trips', () => {
    for (const trip of trips) {
      expect(trip.fableExpectedTier).toBeDefined();
      const got = classifyVsiRpmCadenceTierV1({
        intervalsSec: trip.intervalsSec,
        rpmPointCount: trip.rpmPointCount,
        tripDurationSeconds: trip.tripDurationSeconds,
      }).tier;
      expect(got).toBe(trip.fableExpectedTier);
    }
  });

  it('documents prior FABLE delta root cause (percentile semantics)', () => {
    expect(fableDeltaManifest.rootCause).toBe('PERCENTILE_OR_ROUNDING_SEMANTICS');
    expect(fableDeltaManifest.differingTripIdsBeforeFix).toHaveLength(5);
  });

  it('sentinel: Audi a62ed62d → RPM_2S HIGH, minimal trip coverage', () => {
    const trip = cohort.fleets.audi.trips.find((t) => t.tripIdPrefix === 'a62ed62d')!;
    const result = classifyVsiRpmCadenceTierV1({
      intervalsSec: trip.intervalsSec,
      rpmPointCount: trip.rpmPointCount,
      tripDurationSeconds: trip.tripDurationSeconds,
    });
    expect(result.tier).toBe('RPM_2S');
    expect(result.cadenceConfidence).toBe('HIGH');
    expect(result.activeSpanRatio!).toBeLessThan(0.15);
    expect(result.tripCoverageBand).toBe('MINIMAL_SPAN');
    expect(result.analysisReadiness).toBe('ACTIVE_SPAN_ONLY');
  });

  it('sentinel: Audi f7e826f4 → SPARSE (irregular spread)', () => {
    const trip = cohort.fleets.audi.trips.find((t) => t.tripIdPrefix === 'f7e826f4')!;
    const result = classifyVsiRpmCadenceTierV1({
      intervalsSec: trip.intervalsSec,
      rpmPointCount: trip.rpmPointCount,
      tripDurationSeconds: trip.tripDurationSeconds,
    });
    expect(result.tier).toBe('SPARSE');
    expect(result.decisionCode).toBe('IRREGULAR_SPREAD');
  });

  it('sentinel: Tiguan c8c321a8 → RPM_1S HIGH', () => {
    const trip = cohort.fleets.tiguan.trips.find((t) => t.tripIdPrefix === 'c8c321a8')!;
    const result = classifyVsiRpmCadenceTierV1({
      intervalsSec: trip.intervalsSec,
      rpmPointCount: trip.rpmPointCount,
      tripDurationSeconds: trip.tripDurationSeconds,
    });
    expect(result.tier).toBe('RPM_1S');
    expect(result.cadenceConfidence).toBe('HIGH');
  });

  it('sentinel: Tiguan 722211e7 → UNKNOWN QUORUM', () => {
    const trip = cohort.fleets.tiguan.trips.find((t) => t.tripIdPrefix === '722211e7')!;
    const result = classifyVsiRpmCadenceTierV1({
      intervalsSec: trip.intervalsSec,
      rpmPointCount: trip.rpmPointCount,
      tripDurationSeconds: trip.tripDurationSeconds,
    });
    expect(result.tier).toBe('UNKNOWN');
    expect(result.decisionCode).toBe('QUORUM');
  });

  it('sentinel: Tiguan 371cba40 → RPM_2S HIGH with very low trip coverage', () => {
    const trip = cohort.fleets.tiguan.trips.find((t) => t.tripIdPrefix === '371cba40')!;
    const result = classifyVsiRpmCadenceTierV1({
      intervalsSec: trip.intervalsSec,
      rpmPointCount: trip.rpmPointCount,
      tripDurationSeconds: trip.tripDurationSeconds,
    });
    expect(result.tier).toBe('RPM_2S');
    expect(result.cadenceConfidence).toBe('HIGH');
    expect(result.activeSpanRatio!).toBeLessThan(0.05);
    expect(result.analysisReadiness).toBe('ACTIVE_SPAN_ONLY');
  });

  it('legacy QUORUM: Tiguan 7f1ed7b9 (legacy RPM_1HZ) → UNKNOWN QUORUM', () => {
    const trip = cohort.fleets.tiguan.trips.find((t) => t.tripIdPrefix === '7f1ed7b9')!;
    const evidence = buildRpmEvidenceFromIntervalReplayTrips([trip]);
    expect(
      classifySingleTripRpmProfile({ trip: evidence.tripWindows[0]!, points: evidence.points })
        .profile,
    ).toBe('RPM_1HZ');
    const tier = classifyVsiRpmCadenceTierV1({
      intervalsSec: trip.intervalsSec,
      rpmPointCount: trip.rpmPointCount,
      tripDurationSeconds: trip.tripDurationSeconds,
    });
    expect(tier.tier).toBe('UNKNOWN');
    expect(tier.decisionCode).toBe('QUORUM');
  });

  it('legacy VSI Active RPM labels unchanged on frozen cohort (per fleet)', () => {
    function legacyForTrips(ts: RpmCadenceTierFrozenTripFixture[]) {
      const tally: Record<string, number> = {};
      for (const trip of ts) {
        const evidence = buildRpmEvidenceFromIntervalReplayTrips([trip]);
        const row = classifySingleTripRpmProfile({
          trip: evidence.tripWindows[0]!,
          points: evidence.points,
        });
        tally[row.profile] = (tally[row.profile] ?? 0) + 1;
      }
      return tally;
    }
    expect(legacyForTrips(cohort.fleets.tiguan.trips)).toEqual({
      RPM_1HZ: 22,
      RPM_STANDARD: 28,
      UNKNOWN: 11,
    });
    expect(legacyForTrips(cohort.fleets.audi.trips)).toEqual({
      RPM_STANDARD: 54,
      UNKNOWN: 3,
    });
  });

  it('all 22 legacy Tiguan RPM_1HZ trips map to RPM_1S or UNKNOWN only', () => {
    const mapping: { tripIdPrefix: string; tier: string; decisionCode: string }[] = [];
    for (const trip of cohort.fleets.tiguan.trips) {
      const evidence = buildRpmEvidenceFromIntervalReplayTrips([trip]);
      const legacy = classifySingleTripRpmProfile({
        trip: evidence.tripWindows[0]!,
        points: evidence.points,
      });
      if (legacy.profile !== 'RPM_1HZ') continue;
      const tier = classifyVsiRpmCadenceTierV1({
        intervalsSec: trip.intervalsSec,
        rpmPointCount: trip.rpmPointCount,
        tripDurationSeconds: trip.tripDurationSeconds,
      });
      mapping.push({
        tripIdPrefix: trip.tripIdPrefix,
        tier: tier.tier,
        decisionCode: tier.decisionCode,
      });
      expect(['RPM_1S', 'UNKNOWN']).toContain(tier.tier);
    }
    expect(mapping).toHaveLength(22);
    expect(mapping.filter((m) => m.decisionCode === 'QUORUM').map((m) => m.tripIdPrefix).sort()).toEqual([
      '722211e7',
      '7f1ed7b9',
    ]);
  });

  it('contract version is vsi-rpm-cadence-tier-v1', () => {
    const trip = cohort.fleets.tiguan.trips[0]!;
    const result = classifyVsiRpmCadenceTierV1({
      intervalsSec: trip.intervalsSec,
      rpmPointCount: trip.rpmPointCount,
      tripDurationSeconds: trip.tripDurationSeconds,
    });
    expect(result.contractVersion).toBe(VSI_RPM_CADENCE_TIER_CONTRACT_VERSION);
  });
});
