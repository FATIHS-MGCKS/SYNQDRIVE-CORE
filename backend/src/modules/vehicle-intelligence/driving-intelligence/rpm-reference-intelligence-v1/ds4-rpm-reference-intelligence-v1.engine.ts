import { resolveDs4RpmReferenceIntelligenceV1SequenceMaxGap } from './ds4-rpm-reference-intelligence-v1-v1b-temporal-binding';
import {
  DS4_RPM_REF_INTEL_REASON,
  DS4_RPM_REFERENCE_INTELLIGENCE_V1_CONTRACT_VERSION,
  type Ds4RpmReferenceIntelligenceV1Availability,
  type Ds4RpmReferenceIntelligenceV1ComputeInput,
  type Ds4RpmReferenceIntelligenceV1MetricsV1,
  type Ds4RpmReferenceIntelligenceV1ReasonCode,
  type Ds4RpmReferenceIntelligenceV1ReferenceQualityV1,
  type Ds4RpmReferenceIntelligenceV1Result,
  type Ds4RpmReferenceOperatingBandId,
} from './ds4-rpm-reference-intelligence-v1.contract';

/** Normalized position below this is classified as idle proximity (not engine-off inference). */
export const DS4_RPM_REF_INTEL_IDLE_PROXIMITY_NORMALIZED_MAX = 0.12;

export const DS4_RPM_REF_INTEL_DEFAULT_MIN_ELIGIBLE_WEIGHTED_SECONDS = 3;

const BAND_THRESHOLDS: ReadonlyArray<{ band: Ds4RpmReferenceOperatingBandId; min: number; max: number }> =
  [
    { band: 'IDLE_PROXIMITY', min: 0, max: DS4_RPM_REF_INTEL_IDLE_PROXIMITY_NORMALIZED_MAX },
    { band: 'LOW', min: DS4_RPM_REF_INTEL_IDLE_PROXIMITY_NORMALIZED_MAX, max: 0.35 },
    { band: 'MID', min: 0.35, max: 0.65 },
    { band: 'HIGH', min: 0.65, max: 0.9 },
    { band: 'NEAR_MAX', min: 0.9, max: 1.0 },
  ];

type ParsedPoint = { recordedAtMs: number; valueRpm: number };

function uniqueReasons(codes: Ds4RpmReferenceIntelligenceV1ReasonCode[]): Ds4RpmReferenceIntelligenceV1ReasonCode[] {
  return [...new Set(codes)];
}

function resolveReferenceTrustTier(
  reference: Ds4RpmReferenceIntelligenceV1ComputeInput['reference'],
  pairConsistent: boolean,
): Ds4RpmReferenceIntelligenceV1ReferenceQualityV1['referenceTrustTier'] {
  if (reference.idleRpm == null || reference.maxRpm == null || !pairConsistent) {
    return 'UNAVAILABLE';
  }
  if (
    reference.idleRpmProvenance === 'USER_CONFIRMED' &&
    reference.maxRpmProvenance === 'USER_CONFIRMED'
  ) {
    return 'OEM_USER_CONFIRMED';
  }
  if (
    reference.idleRpmProvenance === 'MISSING' ||
    reference.maxRpmProvenance === 'MISSING'
  ) {
    return 'UNAVAILABLE';
  }
  return 'DOWNGRADED_ESTIMATE';
}

function buildReferenceQuality(
  input: Ds4RpmReferenceIntelligenceV1ComputeInput,
  pairConsistent: boolean,
): Ds4RpmReferenceIntelligenceV1ReferenceQualityV1 {
  return {
    contractVersion: 'ds4-rpm-reference-spec-quality-v1',
    idleRpmProvenance: input.reference.idleRpmProvenance,
    maxRpmProvenance: input.reference.maxRpmProvenance,
    pairConsistent,
    iceRpmApplicability: input.reference.iceRpmApplicability,
    referenceTrustTier: resolveReferenceTrustTier(input.reference, pairConsistent),
  };
}

function parseTripWindow(input: Ds4RpmReferenceIntelligenceV1ComputeInput): {
  tripStartMs: number | null;
  tripEndMs: number | null;
  tripWindowDurationSeconds: number | null;
} {
  if (!input.tripStartIso || !input.tripEndIso) {
    return { tripStartMs: null, tripEndMs: null, tripWindowDurationSeconds: null };
  }
  const tripStartMs = Date.parse(input.tripStartIso);
  const tripEndMs = Date.parse(input.tripEndIso);
  if (!Number.isFinite(tripStartMs) || !Number.isFinite(tripEndMs) || tripEndMs < tripStartMs) {
    return { tripStartMs: null, tripEndMs: null, tripWindowDurationSeconds: null };
  }
  return {
    tripStartMs,
    tripEndMs,
    tripWindowDurationSeconds: (tripEndMs - tripStartMs) / 1000,
  };
}

function parsePoints(
  input: Ds4RpmReferenceIntelligenceV1ComputeInput,
  tripStartMs: number | null,
  tripEndMs: number | null,
): ParsedPoint[] {
  const sorted = [...input.hf.points]
    .map((p) => ({
      recordedAtMs: Date.parse(p.recordedAtIso),
      valueRpm: p.valueRpm,
    }))
    .filter((p) => Number.isFinite(p.recordedAtMs) && Number.isFinite(p.valueRpm))
    .sort((a, b) => a.recordedAtMs - b.recordedAtMs);

  if (tripStartMs == null || tripEndMs == null) return sorted;
  return sorted.filter((p) => p.recordedAtMs >= tripStartMs && p.recordedAtMs <= tripEndMs);
}

function splitContinuousSequences(
  points: ParsedPoint[],
  sequenceMaxGapSeconds: number,
): ParsedPoint[][] {
  if (points.length === 0) return [];
  const sequences: ParsedPoint[][] = [];
  let current: ParsedPoint[] = [points[0]!];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const gapSec = (curr.recordedAtMs - prev.recordedAtMs) / 1000;
    if (gapSec > sequenceMaxGapSeconds) {
      sequences.push(current);
      current = [curr];
    } else {
      current.push(curr);
    }
  }
  sequences.push(current);
  return sequences;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function classifyBand(normalized: number): Ds4RpmReferenceOperatingBandId {
  if (normalized < 0) return 'BELOW_IDLE_REFERENCE';
  if (normalized > 1) return 'ABOVE_MAX_REFERENCE';
  for (const t of BAND_THRESHOLDS) {
    if (t.band === 'NEAR_MAX') {
      if (normalized >= t.min && normalized <= t.max) return t.band;
      continue;
    }
    if (normalized >= t.min && normalized < t.max) return t.band;
  }
  return 'ABOVE_MAX_REFERENCE';
}

function computeMetrics(input: {
  computeInput: Ds4RpmReferenceIntelligenceV1ComputeInput;
  eligibleSequences: ParsedPoint[][];
  referenceSpan: number;
  idleRpm: number;
  maxRpm: number;
  tripWindowDurationSeconds: number | null;
  minEligibleWeightedSeconds: number;
}): {
  metrics: Ds4RpmReferenceIntelligenceV1MetricsV1;
  reasonCodes: Ds4RpmReferenceIntelligenceV1ReasonCode[];
  normalizedAvailable: boolean;
} {
  const reasonCodes: Ds4RpmReferenceIntelligenceV1ReasonCode[] = [];
  const eligibleSamples: ParsedPoint[] = input.eligibleSequences.flat();
  const rpmValues = eligibleSamples.map((p) => p.valueRpm);

  const bandWeights: Partial<Record<Ds4RpmReferenceOperatingBandId, number>> = {};
  let totalEligibleWeightedSeconds = 0;
  let nearIdleWeightedSeconds = 0;

  const rawNormalizedValues: number[] = [];
  let belowIdleCount = 0;
  let aboveMaxCount = 0;

  for (const sequence of input.eligibleSequences) {
    for (let i = 0; i < sequence.length; i += 1) {
      const point = sequence[i]!;
      const next = sequence[i + 1];
      const intervalSec =
        next != null
          ? Math.max(0, (next.recordedAtMs - point.recordedAtMs) / 1000)
          : 0;
      if (intervalSec <= 0 && next != null) continue;

      const weightSec = next != null ? intervalSec : 0;
      if (weightSec > 0) {
        totalEligibleWeightedSeconds += weightSec;
      }

      const rawNorm = (point.valueRpm - input.idleRpm) / input.referenceSpan;
      rawNormalizedValues.push(rawNorm);
      if (point.valueRpm < input.idleRpm) belowIdleCount += 1;
      if (point.valueRpm > input.maxRpm) aboveMaxCount += 1;
      if (rawNorm < 0 || rawNorm > 1) {
        if (!reasonCodes.includes(DS4_RPM_REF_INTEL_REASON.NORMALIZED_OUT_OF_RANGE_OBSERVED)) {
          reasonCodes.push(DS4_RPM_REF_INTEL_REASON.NORMALIZED_OUT_OF_RANGE_OBSERVED);
        }
      }

      if (weightSec > 0) {
        const band = classifyBand(rawNorm);
        bandWeights[band] = (bandWeights[band] ?? 0) + weightSec;
        if (band === 'IDLE_PROXIMITY' || band === 'BELOW_IDLE_REFERENCE') {
          nearIdleWeightedSeconds += weightSec;
        }
      }
    }
  }

  if (totalEligibleWeightedSeconds < input.minEligibleWeightedSeconds) {
    reasonCodes.push(DS4_RPM_REF_INTEL_REASON.INSUFFICIENT_ELIGIBLE_OBSERVATION);
  }

  const timeShareByBand: Partial<Record<Ds4RpmReferenceOperatingBandId, number>> = {};
  if (totalEligibleWeightedSeconds > 0) {
    for (const [band, mass] of Object.entries(bandWeights) as [Ds4RpmReferenceOperatingBandId, number][]) {
      timeShareByBand[band] = mass / totalEligibleWeightedSeconds;
    }
  }

  const rawMedian = median(rawNormalizedValues);
  const normalizedPosition =
    rawNormalizedValues.length > 0
      ? {
          rawNormalizedMin: Math.min(...rawNormalizedValues),
          rawNormalizedMax: Math.max(...rawNormalizedValues),
          rawNormalizedMedian: rawMedian,
          observedSampleCount: rawNormalizedValues.length,
          belowReferenceIdleCount: belowIdleCount,
          aboveReferenceMaxCount: aboveMaxCount,
          clampedNormalizedMedian: rawMedian == null ? null : clamp01(rawMedian),
        }
      : null;

  const minAbsRpmFromIdle =
    rpmValues.length > 0
      ? Math.min(...rpmValues.map((v) => Math.abs(v - input.idleRpm)))
      : null;
  const minRawNormalizedFromIdle =
    rawNormalizedValues.length > 0
      ? Math.min(...rawNormalizedValues.map((v) => Math.abs(v)))
      : null;

  const idleProximity =
    rawNormalizedValues.length > 0
      ? {
          minAbsRpmFromIdle,
          minRawNormalizedFromIdle,
          timeShareNearIdle:
            totalEligibleWeightedSeconds > 0
              ? nearIdleWeightedSeconds / totalEligibleWeightedSeconds
              : null,
        }
      : null;

  const uncoveredTripMassRatio =
    input.tripWindowDurationSeconds != null && input.tripWindowDurationSeconds > 0
      ? Math.max(
          0,
          1 - totalEligibleWeightedSeconds / input.tripWindowDurationSeconds,
        )
      : null;

  return {
    metrics: {
      normalizedPosition,
      idleProximity,
      operatingBands: {
        observedRpmMin: rpmValues.length > 0 ? Math.min(...rpmValues) : null,
        observedRpmMedian: median(rpmValues),
        observedRpmMax: rpmValues.length > 0 ? Math.max(...rpmValues) : null,
        timeShareByBand,
        totalEligibleWeightedSeconds,
      },
      timeWeightedExposure: {
        totalEligibleWeightedSeconds,
        tripWindowDurationSeconds: input.tripWindowDurationSeconds,
        uncoveredTripMassRatio,
        impliesFullTripCoverage: false,
      },
    },
    reasonCodes,
    normalizedAvailable: normalizedPosition != null,
  };
}

function resolveAvailability(input: {
  reasonCodes: Ds4RpmReferenceIntelligenceV1ReasonCode[];
  hasMetrics: boolean;
  normalizedAvailable: boolean;
  referenceNormalizedEligible: boolean;
}): Ds4RpmReferenceIntelligenceV1Availability {
  if (!input.hasMetrics) return 'UNKNOWN';
  const blockingCodes: Ds4RpmReferenceIntelligenceV1ReasonCode[] = [
    DS4_RPM_REF_INTEL_REASON.HF_TELEMETRY_MISSING,
    DS4_RPM_REF_INTEL_REASON.HF_ADMISSION_NOT_ELIGIBLE,
    DS4_RPM_REF_INTEL_REASON.ICE_RPM_NOT_APPLICABLE,
    DS4_RPM_REF_INTEL_REASON.V1B_TEMPORAL_PROFILE_UNAVAILABLE,
  ];
  const blocking = input.reasonCodes.filter((c) => blockingCodes.includes(c));
  if (blocking.length > 0) return 'UNKNOWN';
  if (!input.referenceNormalizedEligible && !input.normalizedAvailable) return 'PARTIAL';
  if (
    input.reasonCodes.includes(DS4_RPM_REF_INTEL_REASON.INSUFFICIENT_ELIGIBLE_OBSERVATION) ||
    input.reasonCodes.includes(DS4_RPM_REF_INTEL_REASON.REFERENCE_SPEC_UNAVAILABLE) ||
    input.reasonCodes.includes(DS4_RPM_REF_INTEL_REASON.VSI_TIER_ANALYTICS_NOT_READY) ||
    input.reasonCodes.includes(DS4_RPM_REF_INTEL_REASON.REFERENCE_PROVENANCE_UNKNOWN) ||
    input.reasonCodes.includes(DS4_RPM_REF_INTEL_REASON.REFERENCE_PROVENANCE_DOWNGRADED)
  ) {
    return 'PARTIAL';
  }
  return 'KNOWN';
}

/**
 * Deterministic pure RPM Reference Intelligence V1 calculation.
 * Does not mutate inputs, interpolate across HF gaps, or infer engine load.
 */
export function computeDs4RpmReferenceIntelligenceV1(
  input: Ds4RpmReferenceIntelligenceV1ComputeInput,
): Ds4RpmReferenceIntelligenceV1Result {
  const reasonCodes: Ds4RpmReferenceIntelligenceV1ReasonCode[] = [];
  const minEligibleWeightedSeconds =
    input.minEligibleWeightedSecondsForKnown ??
    DS4_RPM_REF_INTEL_DEFAULT_MIN_ELIGIBLE_WEIGHTED_SECONDS;

  const gapResolution = resolveDs4RpmReferenceIntelligenceV1SequenceMaxGap({
    authoritativeV1bTemporal: input.hf.authoritativeV1bTemporal,
    qualityExposure: input.hf.qualityExposure,
  });
  const sequenceMaxGapSeconds = gapResolution.sequenceMaxGapSeconds;

  const pairConsistent =
    input.reference.idleRpm == null ||
    input.reference.maxRpm == null ||
    input.reference.maxRpm > input.reference.idleRpm;

  if (!pairConsistent) {
    reasonCodes.push(DS4_RPM_REF_INTEL_REASON.REFERENCE_PAIR_INCONSISTENT);
  }

  if (input.reference.iceRpmApplicability === 'NOT_APPLICABLE') {
    reasonCodes.push(DS4_RPM_REF_INTEL_REASON.ICE_RPM_NOT_APPLICABLE);
  }

  if (
    input.reference.idleRpmProvenance === 'AI_ESTIMATED' ||
    input.reference.idleRpmProvenance === 'KNOWLEDGE_ONLY' ||
    input.reference.maxRpmProvenance === 'AI_ESTIMATED' ||
    input.reference.maxRpmProvenance === 'KNOWLEDGE_ONLY'
  ) {
    reasonCodes.push(DS4_RPM_REF_INTEL_REASON.REFERENCE_PROVENANCE_DOWNGRADED);
  }

  if (
    input.reference.idleRpmProvenance === 'UNKNOWN' ||
    input.reference.maxRpmProvenance === 'UNKNOWN'
  ) {
    reasonCodes.push(DS4_RPM_REF_INTEL_REASON.REFERENCE_PROVENANCE_UNKNOWN);
  }

  if (input.reference.idleRpm == null || input.reference.maxRpm == null) {
    reasonCodes.push(DS4_RPM_REF_INTEL_REASON.REFERENCE_SPEC_UNAVAILABLE);
  }

  if (!input.hf.admission.processingAllowed) {
    reasonCodes.push(DS4_RPM_REF_INTEL_REASON.HF_ADMISSION_NOT_ELIGIBLE);
  }

  const qualityExposure = input.hf.qualityExposure ?? null;
  if (qualityExposure && !qualityExposure.tierAnalyticsReady) {
    reasonCodes.push(DS4_RPM_REF_INTEL_REASON.VSI_TIER_ANALYTICS_NOT_READY);
  }

  const { tripStartMs, tripEndMs, tripWindowDurationSeconds } = parseTripWindow(input);
  const inWindowPoints = parsePoints(input, tripStartMs, tripEndMs);

  if (inWindowPoints.length === 0) {
    reasonCodes.push(DS4_RPM_REF_INTEL_REASON.HF_TELEMETRY_MISSING);
  }

  const needsAuthoritativeTemporalGap =
    input.hf.admission.processingAllowed &&
    inWindowPoints.length > 0 &&
    input.reference.iceRpmApplicability !== 'NOT_APPLICABLE';

  if (needsAuthoritativeTemporalGap && sequenceMaxGapSeconds == null) {
    reasonCodes.push(DS4_RPM_REF_INTEL_REASON.V1B_TEMPORAL_PROFILE_UNAVAILABLE);
  }

  const referenceSpan =
    input.reference.idleRpm != null &&
    input.reference.maxRpm != null &&
    input.reference.maxRpm > input.reference.idleRpm
      ? input.reference.maxRpm - input.reference.idleRpm
      : null;

  const referenceNormalizedEligible =
    referenceSpan != null &&
    pairConsistent &&
    input.reference.iceRpmApplicability === 'APPLICABLE' &&
    input.hf.admission.processingAllowed;

  const eligibleSequences =
    input.hf.admission.processingAllowed &&
    inWindowPoints.length > 0 &&
    sequenceMaxGapSeconds != null
      ? splitContinuousSequences(inWindowPoints, sequenceMaxGapSeconds)
      : [];

  const hfQuality = {
    contractVersion: 'ds4-rpm-reference-hf-quality-v1' as const,
    qualityExposure,
    observedPointCount: inWindowPoints.length,
    eligibleContinuousSequenceCount: eligibleSequences.length,
    eligibleObservedDurationSeconds: eligibleSequences.reduce((acc, seq) => {
      if (seq.length < 2) return acc;
      return acc + (seq[seq.length - 1]!.recordedAtMs - seq[0]!.recordedAtMs) / 1000;
    }, 0),
    authoritativeSequenceMaxGapSeconds: sequenceMaxGapSeconds,
    authoritativeCadenceTier: gapResolution.cadenceTier,
  };

  let metrics: Ds4RpmReferenceIntelligenceV1MetricsV1 | null = null;
  let normalizedAvailable = false;

  if (
    inWindowPoints.length > 0 &&
    input.hf.admission.processingAllowed &&
    input.reference.iceRpmApplicability !== 'NOT_APPLICABLE' &&
    sequenceMaxGapSeconds != null
  ) {
    if (referenceSpan != null && referenceNormalizedEligible) {
      const computed = computeMetrics({
        computeInput: input,
        eligibleSequences,
        referenceSpan,
        idleRpm: input.reference.idleRpm!,
        maxRpm: input.reference.maxRpm!,
        tripWindowDurationSeconds,
        minEligibleWeightedSeconds,
      });
      metrics = computed.metrics;
      normalizedAvailable = computed.normalizedAvailable;
      reasonCodes.push(...computed.reasonCodes);
    } else if (referenceSpan == null) {
      const rpmValues = eligibleSequences.flat().map((p) => p.valueRpm);
      metrics = {
        normalizedPosition: null,
        idleProximity: null,
        operatingBands: {
          observedRpmMin: rpmValues.length > 0 ? Math.min(...rpmValues) : null,
          observedRpmMedian: median(rpmValues),
          observedRpmMax: rpmValues.length > 0 ? Math.max(...rpmValues) : null,
          timeShareByBand: {},
          totalEligibleWeightedSeconds: 0,
        },
        timeWeightedExposure: {
          totalEligibleWeightedSeconds: 0,
          tripWindowDurationSeconds,
          uncoveredTripMassRatio:
            tripWindowDurationSeconds != null && tripWindowDurationSeconds > 0 ? 1 : null,
          impliesFullTripCoverage: false,
        },
      };
    }
  }

  const availability = resolveAvailability({
    reasonCodes: uniqueReasons(reasonCodes),
    hasMetrics: metrics != null,
    normalizedAvailable,
    referenceNormalizedEligible,
  });

  return {
    contractVersion: DS4_RPM_REFERENCE_INTELLIGENCE_V1_CONTRACT_VERSION,
    semanticGuard: {
      normalizedRpmIsEngineLoadProxy: false,
      referenceMetadataDoesNotSubstituteHfTelemetry: true,
    },
    availability,
    reasonCodes: uniqueReasons(reasonCodes),
    referenceQuality: buildReferenceQuality(input, pairConsistent),
    hfQuality,
    referenceSnapshot: {
      idleRpm: input.reference.idleRpm,
      maxRpm: input.reference.maxRpm,
      referenceSpanRpm: referenceSpan,
    },
    metrics,
  };
}
