import { createHash } from 'node:crypto';

/** Frozen replay trip row stored in rpm-multicadence-tier-frozen-cohort-v1.json */
export type RpmCadenceTierFrozenTripFixture = {
  tripId: string;
  tripIdPrefix: string;
  startMs: number;
  endMs: number;
  tripDurationSeconds: number;
  rpmPointCount: number;
  duplicateTimestampCount?: number;
  intervalsSec: readonly number[];
  /** SHA-256 of canonical (recordedAtIso, valueRpm) series at export — not derivable from intervals alone. */
  seriesDigest: string;
  fixtureInputDigest?: string;
  fableExpectedTier?: string;
};

/**
 * Deterministic hash of classifier inputs persisted in the frozen fixture (recomputable offline).
 * Excludes seriesDigest (export-attested only).
 */
export function computeFrozenTripFixtureInputDigest(
  trip: Pick<
    RpmCadenceTierFrozenTripFixture,
    | 'tripId'
    | 'startMs'
    | 'endMs'
    | 'tripDurationSeconds'
    | 'rpmPointCount'
    | 'duplicateTimestampCount'
    | 'intervalsSec'
  >,
): string {
  const payload = {
    schema: 'rpm-cadence-tier-frozen-trip-input-v1',
    tripId: trip.tripId,
    startMs: trip.startMs,
    endMs: trip.endMs,
    tripDurationSeconds: trip.tripDurationSeconds,
    rpmPointCount: trip.rpmPointCount,
    duplicateTimestampCount: trip.duplicateTimestampCount ?? 0,
    intervalsSec: [...trip.intervalsSec],
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function computeFrozenCohortFixtureInputDigest(
  trips: readonly RpmCadenceTierFrozenTripFixture[],
): string {
  const digests = trips
    .map((t) => t.fixtureInputDigest ?? computeFrozenTripFixtureInputDigest(t))
    .sort();
  return createHash('sha256').update(digests.join('\n')).digest('hex');
}

export const RPM_CADENCE_TIER_SOURCE_SERIES_DIGEST_ATTESTATION = {
  algorithm: 'sha256-canonical-rpm-series-v1b',
  fields: ['recordedAtIso', 'valueRpm'],
  note: 'Computed at ClickHouse export from full HF points; not reconstructable from interval-only fixture rows.',
} as const;
