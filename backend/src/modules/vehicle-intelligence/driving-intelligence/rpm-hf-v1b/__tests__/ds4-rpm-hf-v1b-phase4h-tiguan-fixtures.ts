/**
 * Phase 4H/4I Tiguan-canary shaped fixtures (synthetic HF layout matching production coverage ratios).
 */
import {
  buildRpmPointsEverySeconds,
  buildTierTripClassification,
  buildTierTripInput,
} from './ds4-rpm-hf-v1b-tier-fixtures';

export const PHASE4H_TRIP_A = {
  tripId: 'c33c2b78-a3f2-4e51-95ce-0e0199f09cdf',
  tripStartIso: '2026-10-29T22:04:00.000Z',
  tripEndIso: '2026-10-29T22:25:45.157Z',
  expectedCoverageRatio: 0.3224,
  hfPointCount: 421,
  leadingOffsetSec: 63,
} as const;

export const PHASE4H_TRIP_B = {
  tripId: '419633a0-a84f-4b0d-821d-f209312a0acd',
  tripStartIso: '2026-10-30T06:28:00.000Z',
  tripEndIso: '2026-10-30T06:31:14.210Z',
  expectedCoverageRatio: 0.2513,
  hfPointCount: 49,
  leadingOffsetSec: 46,
} as const;

function buildPhase4hRpmPoints(input: {
  tripStartIso: string;
  leadingOffsetSec: number;
  count: number;
}): Array<{ recordedAtIso: string; valueRpm: number }> {
  const startMs = Date.parse(input.tripStartIso);
  return Array.from({ length: input.count }, (_, i) => ({
    recordedAtIso: new Date(startMs + (input.leadingOffsetSec + i) * 1000).toISOString(),
    valueRpm: 1500 + (i % 50),
  }));
}

export function buildPhase4hTripAInput() {
  const rpmPoints = buildPhase4hRpmPoints({
    tripStartIso: PHASE4H_TRIP_A.tripStartIso,
    leadingOffsetSec: PHASE4H_TRIP_A.leadingOffsetSec,
    count: PHASE4H_TRIP_A.hfPointCount,
  });
  const tierRow = buildTierTripClassification({
    tier: 'RPM_1S',
    cadenceConfidence: 'HIGH',
    tripCoverageBand: 'FULL_SPAN',
    analysisReadiness: 'TIER_ANALYTICS_OK',
    activeSpanRatio: 0.5678160919540229,
    endMs: Date.parse(PHASE4H_TRIP_A.tripEndIso),
    intervalEvidenceUsed: {
      rpmPointCount: 421,
      activeIntervalCount: 406,
      tripDurationSeconds: 1305,
    },
  });
  const tripInput = buildTierTripInput({
    tripId: PHASE4H_TRIP_A.tripId,
    rpmPoints,
    tierRow,
  });
  return {
    ...tripInput,
    tripStartIso: PHASE4H_TRIP_A.tripStartIso,
    tripEndIso: PHASE4H_TRIP_A.tripEndIso,
  };
}

export function buildPhase4hTripBInput() {
  const rpmPoints = buildPhase4hRpmPoints({
    tripStartIso: PHASE4H_TRIP_B.tripStartIso,
    leadingOffsetSec: PHASE4H_TRIP_B.leadingOffsetSec,
    count: PHASE4H_TRIP_B.hfPointCount,
  });
  const tierRow = buildTierTripClassification({
    tier: 'RPM_1S',
    cadenceConfidence: 'HIGH',
    tripCoverageBand: 'PARTIAL_SPAN',
    analysisReadiness: 'LIMITED_TRIP',
    activeSpanRatio: 0.3969072164948453,
    endMs: Date.parse(PHASE4H_TRIP_B.tripEndIso),
    intervalEvidenceUsed: {
      rpmPointCount: 49,
      activeIntervalCount: 40,
      tripDurationSeconds: 194,
    },
  });
  const tripInput = buildTierTripInput({
    tripId: PHASE4H_TRIP_B.tripId,
    rpmPoints,
    tierRow,
  });
  return {
    ...tripInput,
    tripStartIso: PHASE4H_TRIP_B.tripStartIso,
    tripEndIso: PHASE4H_TRIP_B.tripEndIso,
  };
}

/** Dense 1s grid for generic tier tests (unchanged cadence). */
export function buildDense1sRpmPoints(count: number) {
  return buildRpmPointsEverySeconds('2026-01-01T10:00:00.000Z', count, 1);
}
