/**
 * One-off analysis: compare frozen fixture classifier vs FABLE recommended replay rows.
 * Run: cd backend && npx ts-node --transpile-only scripts/analyze-rpm-tier-fable-delta.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyVsiRpmCadenceTierV1 } from '../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-rpm-cadence-tier.util';
import { medianSeconds } from '../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-profile-cadence-stats.util';

type FableRow = {
  trip: string;
  tier: string;
  conf: string | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  points: number;
  activeIntervals: number;
  le1: number;
  le2: number;
  le3: number;
};

type FrozenTrip = {
  tripIdPrefix: string;
  rpmPointCount: number;
  intervalsSec: number[];
  tripDurationSeconds: number;
  duplicateTimestampCount?: number;
  seriesDigest?: string;
};

function fablePct(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))] ?? null;
}

function featuresFromFixture(t: FrozenTrip) {
  const act = t.intervalsSec.filter((x) => x <= 8).sort((a, b) => a - b);
  return {
    p50: medianSeconds(act),
    p75: fablePct(act, 75),
    p90: fablePct(act, 90),
    activeIntervals: act.length,
    points: t.rpmPointCount,
  };
}

function categorizeDelta(
  f: ReturnType<typeof featuresFromFixture>,
  row: FableRow,
  gotTier: string,
): string {
  if (f.points !== row.points) return 'INPUT_REVISION_OR_POINT_COUNT';
  if (f.activeIntervals !== row.activeIntervals) return 'TIMESTAMP_OR_DEDUP_OR_RAW_DATA';
  if (f.p50 !== row.p50 || f.p75 !== row.p75) {
    if (f.p50 !== row.p50 && Math.abs((f.p50 ?? 0) - (row.p50 ?? 0)) < 0.01)
      return 'PERCENTILE_OR_ROUNDING';
    return 'TIMESTAMP_OR_DEDUP_OR_RAW_DATA';
  }
  if (gotTier !== row.tier) return 'CALCULATION_OR_CONFIDENCE_RULE';
  return 'MATCH';
}

const rec = JSON.parse(
  readFileSync('/opt/cursor/artifacts/rpm-multicadence-recommended-model-replay.json', 'utf8'),
) as {
  fleets: { tiguan: { rows: FableRow[] }; audi: { rows: FableRow[] } };
};

const cohort = JSON.parse(
  readFileSync(
    join(__dirname, '../src/modules/vehicle-intelligence/vehicle-signal-intelligence/fixtures/rpm-multicadence-tier-frozen-cohort-v1.json'),
    'utf8',
  ),
) as { fleets: { tiguan: { trips: FrozenTrip[] }; audi: { trips: FrozenTrip[] } } };

const fableByPrefix = new Map<string, FableRow>();
for (const fleet of ['tiguan', 'audi'] as const) {
  for (const r of rec.fleets[fleet].rows) fableByPrefix.set(r.trip, r);
}

const diffs: object[] = [];
for (const fleet of ['tiguan', 'audi'] as const) {
  for (const t of cohort.fleets[fleet].trips) {
    const row = fableByPrefix.get(t.tripIdPrefix)!;
    const got = classifyVsiRpmCadenceTierV1({
      intervalsSec: t.intervalsSec,
      rpmPointCount: t.rpmPointCount,
      tripDurationSeconds: t.tripDurationSeconds,
    });
    const f = featuresFromFixture(t);
    if (got.tier !== row.tier) {
      diffs.push({
        trip: t.tripIdPrefix,
        fleet,
        fableTier: row.tier,
        composerTier: got.tier,
        fableP50: row.p50,
        fixtureP50: f.p50,
        fableP75: row.p75,
        fixtureP75: f.p75,
        fablePoints: row.points,
        fixturePoints: f.points,
        fableActiveIntervals: row.activeIntervals,
        fixtureActiveIntervals: f.activeIntervals,
        category: categorizeDelta(f, row, got.tier),
        duplicateTimestampCount: t.duplicateTimestampCount ?? null,
      });
    }
  }
}

const dupTrips = [...cohort.fleets.tiguan.trips, ...cohort.fleets.audi.trips].filter(
  (t) => (t.duplicateTimestampCount ?? 0) > 0,
);

console.log(JSON.stringify({ diffCount: diffs.length, diffs, duplicateTimestampTrips: dupTrips.map((t) => ({
  trip: t.tripIdPrefix,
  duplicateTimestampCount: t.duplicateTimestampCount,
  rpmPointCount: t.rpmPointCount,
  intervalCount: t.intervalsSec.length,
})) }, null, 2));
