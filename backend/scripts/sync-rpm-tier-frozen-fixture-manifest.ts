import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyVsiRpmCadenceTierV1 } from '../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-rpm-cadence-tier.util';
import {
  computeFrozenCohortFixtureInputDigest,
  computeFrozenTripFixtureInputDigest,
  RPM_CADENCE_TIER_SOURCE_SERIES_DIGEST_ATTESTATION,
  type RpmCadenceTierFrozenTripFixture,
} from '../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-rpm-cadence-tier-frozen-digest.util';

const fixturePath = join(
  __dirname,
  '../src/modules/vehicle-intelligence/vehicle-signal-intelligence/fixtures/rpm-multicadence-tier-frozen-cohort-v1.json',
);

type Cohort = {
  contractVersion: string;
  fleets: {
    tiguan: { trips: RpmCadenceTierFrozenTripFixture[]; tripCount: number; vehicleId: string };
    audi: { trips: RpmCadenceTierFrozenTripFixture[]; tripCount: number; vehicleId: string };
  };
  [key: string]: unknown;
};

const cohort = JSON.parse(readFileSync(fixturePath, 'utf8')) as Cohort;
const allTrips = [...cohort.fleets.tiguan.trips, ...cohort.fleets.audi.trips];

for (const trip of allTrips) {
  trip.fixtureInputDigest = computeFrozenTripFixtureInputDigest(trip);
}

let fableByPrefix = new Map<string, string>();
try {
  const rec = JSON.parse(
    readFileSync('/opt/cursor/artifacts/rpm-multicadence-recommended-model-replay.json', 'utf8'),
  ) as {
    fleets: { tiguan: { rows: { trip: string; tier: string }[] }; audi: { rows: { trip: string; tier: string }[] } };
  };
  for (const fleet of ['tiguan', 'audi'] as const) {
    for (const row of rec.fleets[fleet].rows) fableByPrefix.set(row.trip, row.tier);
  }
} catch {
  fableByPrefix = new Map();
}

for (const trip of allTrips) {
  const expected = fableByPrefix.get(trip.tripIdPrefix);
  if (expected) trip.fableExpectedTier = expected;
}

function tally(trips: RpmCadenceTierFrozenTripFixture[]) {
  const m: Record<string, number> = {};
  for (const t of trips) {
    const r = classifyVsiRpmCadenceTierV1({
      intervalsSec: t.intervalsSec,
      rpmPointCount: t.rpmPointCount,
      tripDurationSeconds: t.tripDurationSeconds,
    });
    m[r.tier] = (m[r.tier] ?? 0) + 1;
  }
  return m;
}

cohort.fixtureInputDigestManifest = {
  schema: 'rpm-cadence-tier-frozen-cohort-input-digest-v1',
  cohortFixtureInputDigest: computeFrozenCohortFixtureInputDigest(allTrips),
  duplicateTimestampCountSemantics:
    'Count of ClickHouse HF rows whose recorded_at duplicates another row in the trip window (rawRows - uniqueTimestamps). Intervals use unique timestamps only.',
  sourceSeriesDigestAttestation: RPM_CADENCE_TIER_SOURCE_SERIES_DIGEST_ATTESTATION,
};

cohort.classifierFrozenAggregates = {
  tiguan: tally(cohort.fleets.tiguan.trips),
  audi: tally(cohort.fleets.audi.trips),
};

cohort.fableDocumentedReferenceAggregates = {
  tiguan: { RPM_1S: 20, RPM_2S: 25, RPM_3S: 6, SPARSE: 5, UNKNOWN: 5 },
  audi: { RPM_1S: 0, RPM_2S: 15, RPM_3S: 7, SPARSE: 33, UNKNOWN: 2 },
};

writeFileSync(fixturePath, JSON.stringify(cohort));
console.log(JSON.stringify(cohort.classifierFrozenAggregates, null, 2));
console.log('cohortFixtureInputDigest', cohort.fixtureInputDigestManifest);
