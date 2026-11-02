import {
  assignPointsToFirstTrip,
  collectIntraTripIntervalsSeconds,
  dedupeSortedTimestampsMs,
} from './vsi-profile-cadence-stats.util';
import type {
  VsiRpmCadenceEvidenceInput,
  VsiRpmCadenceTierResolutionV1,
  VsiRpmCadenceTierRollingSummaryV1,
  VsiRpmCadenceTierTripClassificationV1,
  VsiSignalCadenceIntelligenceV2,
} from './vsi-profile-cadence.types';
import {
  selectRollingCadenceTripWindows,
  VSI_ACTIVE_RPM_AGREEMENT_RATIO,
  VSI_ACTIVE_RPM_ROLLING_TRIP_MAX,
  VSI_ACTIVE_RPM_ROLLING_TRIP_MIN,
} from './vsi-active-rpm-profile-resolver.util';
import type { VsiRpmCadenceTierLabel } from './vsi-rpm-cadence-tier.types';
import {
  classifyVsiRpmCadenceTierV1,
} from './vsi-rpm-cadence-tier.util';
import { VSI_RPM_CADENCE_TIER_RESOLUTION_CONTRACT_VERSION } from './vsi-profile-cadence.types';

export type { VsiRpmCadenceTierTripClassificationV1, VsiRpmCadenceTierResolutionV1 };

const ROLLING_TIER_LABELS: readonly VsiRpmCadenceTierLabel[] = [
  'RPM_1S',
  'RPM_2S',
  'RPM_3S',
  'SPARSE',
];

function tripDurationSeconds(trip: { startMs: number; endMs: number }): number {
  return Math.max(0, Math.round((trip.endMs - trip.startMs) / 1000));
}

export function classifySingleTripRpmCadenceTier(input: {
  trip: { tripId: string; startMs: number; endMs: number };
  points: readonly { recordedAtMs: number; value: number }[];
}): VsiRpmCadenceTierTripClassificationV1 {
  const inTrip = assignPointsToFirstTrip(
    input.points.filter((p) => Number.isFinite(p.value)),
    [input.trip],
  );
  const timestamps = dedupeSortedTimestampsMs(inTrip.map((p) => p.recordedAtMs));
  const intervals = collectIntraTripIntervalsSeconds(inTrip, [input.trip]);
  const durationSec = tripDurationSeconds(input.trip);
  const tierResult = classifyVsiRpmCadenceTierV1({
    intervalsSec: intervals,
    rpmPointCount: timestamps.length,
    tripDurationSeconds: durationSec,
  });

  return {
    tripId: input.trip.tripId,
    endMs: input.trip.endMs,
    tier: tierResult.tier,
    cadenceConfidence: tierResult.cadenceConfidence,
    tripCoverageBand: tierResult.tripCoverageBand,
    analysisReadiness: tierResult.analysisReadiness,
    decisionCode: tierResult.decisionCode,
    intervalEvidenceUsed: {
      rpmPointCount: timestamps.length,
      activeIntervalCount: tierResult.activeIntervalCount,
      tripDurationSeconds: durationSec,
    },
    p50ActiveSeconds: tierResult.p50ActiveSeconds,
    p75ActiveSeconds: tierResult.p75ActiveSeconds,
    p90ActiveSeconds: tierResult.p90ActiveSeconds,
    activeSpanRatio: tierResult.activeSpanRatio,
    activeDensityVsTier: tierResult.activeDensityVsTier,
    tierPuritySharePlusOne: tierResult.tierPuritySharePlusOne,
    longestSequenceIntervals: tierResult.longestSequenceIntervals,
  };
}

function resolveRollingTierSummary(
  tripClassifications: readonly VsiRpmCadenceTierTripClassificationV1[],
  windowSize: number,
): VsiRpmCadenceTierRollingSummaryV1 {
  const known = tripClassifications.filter((row) => row.tier !== 'UNKNOWN');
  const requiredKnown = Math.ceil(windowSize * VSI_ACTIVE_RPM_AGREEMENT_RATIO);

  if (known.length < VSI_ACTIVE_RPM_ROLLING_TRIP_MIN) {
    return {
      tier: null,
      agreementRatio: null,
      classificationDecisionCode: 'INSUFFICIENT_KNOWN_TRIPS_IN_WINDOW',
      classificationDecisionSummary: `${known.length}/${windowSize} trips with resolved tier; need at least ${VSI_ACTIVE_RPM_ROLLING_TRIP_MIN} classifiable trips`,
      sufficientEvidence: false,
    };
  }

  if (known.length < requiredKnown) {
    return {
      tier: null,
      agreementRatio: known.length / windowSize,
      classificationDecisionCode: 'INSUFFICIENT_KNOWN_TRIPS_IN_WINDOW',
      classificationDecisionSummary: `${known.length}/${windowSize} trips with resolved tier; need ${requiredKnown} for supermajority`,
      sufficientEvidence: false,
    };
  }

  const counts: Record<VsiRpmCadenceTierLabel, number> = {
    RPM_1S: 0,
    RPM_2S: 0,
    RPM_3S: 0,
    SPARSE: 0,
    UNKNOWN: 0,
  };
  for (const row of known) {
    counts[row.tier] += 1;
  }

  let best: VsiRpmCadenceTierLabel | null = null;
  let bestRatio = 0;
  for (const label of ROLLING_TIER_LABELS) {
    const ratio = counts[label] / known.length;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = label;
    }
  }

  if (best == null || bestRatio < VSI_ACTIVE_RPM_AGREEMENT_RATIO) {
    return {
      tier: null,
      agreementRatio: bestRatio,
      classificationDecisionCode: 'CONTRADICTORY_TRIP_EVIDENCE',
      classificationDecisionSummary: 'No supermajority multi-cadence tier across classifiable trips',
      sufficientEvidence: false,
    };
  }

  return {
    tier: best,
    agreementRatio: bestRatio,
    classificationDecisionCode: 'ROLLING_SUPERMAJORITY',
    classificationDecisionSummary: `${best} supported by ${counts[best]}/${known.length} classifiable trips (${known.length}/${windowSize} in window)`,
    sufficientEvidence: true,
  };
}

function maxEvidenceObservedAtMs(
  rolling: readonly { tripId: string; startMs: number; endMs: number }[],
  points: readonly { recordedAtMs: number; value: number }[],
): number | null {
  const inRolling = assignPointsToFirstTrip(
    points.filter((p) => Number.isFinite(p.value)),
    rolling,
  );
  let max: number | null = null;
  for (const point of inRolling) {
    if (!Number.isFinite(point.recordedAtMs)) continue;
    max = max == null ? point.recordedAtMs : Math.max(max, point.recordedAtMs);
  }
  return max;
}

/**
 * Resolves per-trip multi-cadence tiers and optional rolling vehicle summary
 * for the active provider source link (same rolling window as activeRpmProfile).
 */
export function resolveRpmCadenceTierResolutionV1(
  evidence: VsiRpmCadenceEvidenceInput,
): VsiRpmCadenceTierResolutionV1 | null {
  if (evidence.iceRpmApplicability !== 'APPLICABLE') {
    return null;
  }
  if (evidence.hfReadStatus !== 'SUCCESS' && evidence.points.length === 0) {
    return {
      contractVersion: VSI_RPM_CADENCE_TIER_RESOLUTION_CONTRACT_VERSION,
      evaluatedTripIds: [],
      tripClassifications: [],
      rollingVehicleTierSummary: null,
      provenance: [...evidence.provenance, 'VSI_RPM_CADENCE_TIER_RESOLVER_V1'],
      evidenceObservedAt: null,
    };
  }

  const rolling = selectRollingCadenceTripWindows(
    evidence.tripWindows,
    VSI_ACTIVE_RPM_ROLLING_TRIP_MAX,
  );
  const tripClassifications = rolling.map((trip) =>
    classifySingleTripRpmCadenceTier({ trip, points: evidence.points }),
  );
  const evaluatedTripIds = rolling.map((t) => t.tripId);
  const rollingVehicleTierSummary = resolveRollingTierSummary(
    tripClassifications,
    rolling.length,
  );
  const maxMs = maxEvidenceObservedAtMs(rolling, evidence.points);

  return {
    contractVersion: VSI_RPM_CADENCE_TIER_RESOLUTION_CONTRACT_VERSION,
    evaluatedTripIds,
    tripClassifications,
    rollingVehicleTierSummary,
    provenance: [...evidence.provenance, 'VSI_RPM_CADENCE_TIER_RESOLVER_V1'],
    evidenceObservedAt: maxMs != null ? new Date(maxMs).toISOString() : null,
  };
}

/** Attaches operational tier resolution without changing cadenceSemanticFingerprint. */
export function mergeRpmCadenceTierResolutionOntoEngineRpmCadence(
  cadence: VsiSignalCadenceIntelligenceV2,
  evidence: VsiRpmCadenceEvidenceInput,
): VsiSignalCadenceIntelligenceV2 {
  const rpmCadenceTierResolution = resolveRpmCadenceTierResolutionV1(evidence);
  if (!rpmCadenceTierResolution) {
    return cadence;
  }
  return {
    ...cadence,
    rpmCadenceTierResolution,
  };
}