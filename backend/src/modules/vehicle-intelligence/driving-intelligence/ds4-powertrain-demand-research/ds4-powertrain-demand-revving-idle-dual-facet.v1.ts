import { createHash } from 'crypto';
import { COLD_ENGINE_SHADOW_POLICY } from '../../shadow-detector/detectors/cold-engine-shadow.policy';
import type {
  Ds4ExcessiveStationaryLikeSpanProxyCandidateV1,
  Ds4HighRpmStationaryLikeProxyCandidateV1,
  Ds4RevvingIdleFacetATripEvidenceClassificationV1,
  Ds4RevvingIdleFacetBTripEvidenceClassificationV1,
} from './ds4-powertrain-demand-research.contract.v1';
import type {
  Ds4CanonicalMultichannelBucketV1,
  Ds4MultichannelCanonicalizeResultV1,
} from './ds4-powertrain-demand-multichannel-canonicalize.v1';
import { gapCrossesAdmittedSequenceBoundary } from './ds4-powertrain-demand-multichannel-sequence-boundary.v1';
import {
  classifySustainedLoadPowertrainV1,
  sustainedLoadRequiresSequenceIceRpmConfirmation,
} from './ds4-powertrain-demand-revving-idle-powertrain.v1';
import { DS4_REVIVING_IDLE_DUAL_FACET_POLICY } from './ds4-powertrain-demand-revving-idle-reference.v1';

export { DS4_REVIVING_IDLE_DUAL_FACET_POLICY } from './ds4-powertrain-demand-revving-idle-reference.v1';

const FACET_A = DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetA;
const FACET_B = DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetB;

const BASE_LIMITATIONS = [
  'BUCKET_LABEL_UNVERIFIED',
  'MODE_A',
  'R1_HISTORICAL_OBD_RECORD_TIME_UNCERTAIN',
  'RESEARCH_LABEL_SPAN_NOT_VERIFIED_PHYSICAL_DURATION',
  'MISSING_VALUE_NOT_MEASURED_ZERO',
  'STATIONARY_INFERRED_FROM_SPEED_ONLY',
  'NOT_CONFIRMED_IDLE',
  'NO_MISUSE_INFERENCE',
] as const;

export const DS4_REVIVING_IDLE_SCIENTIFIC_LIMITATION_CODES = [...BASE_LIMITATIONS] as const;

function bucketHasRequiredRpmSpeed(b: Ds4CanonicalMultichannelBucketV1): boolean {
  return b.rpm != null && b.speedKmh != null;
}

function facetAEntry(bucket: Ds4CanonicalMultichannelBucketV1): boolean {
  return (
    bucket.speedKmh! < FACET_A.stationarySpeedMaxKmh &&
    bucket.rpm! >= FACET_A.rpmEntryThreshold
  );
}

function facetAContinues(bucket: Ds4CanonicalMultichannelBucketV1): boolean {
  return (
    bucket.speedKmh! < FACET_A.stationarySpeedMaxKmh &&
    bucket.rpm! >= FACET_A.rpmContinueThreshold
  );
}

function rpmInIdleBandExclusive(rpm: number): boolean {
  return rpm > FACET_B.idleRpmBandMinExclusive && rpm < FACET_B.idleRpmBandMaxExclusive;
}

function facetBEntry(bucket: Ds4CanonicalMultichannelBucketV1): boolean {
  return bucket.speedKmh! < FACET_B.stationarySpeedMaxKmh && rpmInIdleBandExclusive(bucket.rpm!);
}

function facetBContinues(bucket: Ds4CanonicalMultichannelBucketV1): boolean {
  return bucket.speedKmh! < FACET_B.stationarySpeedMaxKmh && rpmInIdleBandExclusive(bucket.rpm!);
}

function resolvePhevIceConfirmedInCandidateSequence(
  slice: readonly Ds4CanonicalMultichannelBucketV1[],
): boolean {
  let rpmIceSamples = 0;
  for (const b of slice) {
    if (b.rpm != null && b.rpm >= COLD_ENGINE_SHADOW_POLICY.iceRpmMin) {
      rpmIceSamples += 1;
    }
  }
  return rpmIceSamples >= COLD_ENGINE_SHADOW_POLICY.iceConfirmationMinSamples;
}

type ActiveSequence = {
  buckets: Ds4CanonicalMultichannelBucketV1[];
};

function sequenceMeetsFacetAAdmission(
  slice: ActiveSequence,
  powertrainClass: ReturnType<typeof classifySustainedLoadPowertrainV1>['powertrainClass'],
): { ok: boolean; maxGapMs: number; peakRpm: number } {
  const buckets = slice.buckets;
  if (buckets.length < FACET_A.minObservations) {
    return { ok: false, maxGapMs: 0, peakRpm: 0 };
  }
  const span = buckets[buckets.length - 1]!.recordedAtMs - buckets[0]!.recordedAtMs;
  if (span < FACET_A.minResearchLabelSpanMs) {
    return { ok: false, maxGapMs: 0, peakRpm: 0 };
  }
  let maxGapMs = 0;
  for (let i = 1; i < buckets.length; i += 1) {
    const gap = buckets[i]!.recordedAtMs - buckets[i - 1]!.recordedAtMs;
    maxGapMs = Math.max(maxGapMs, gap);
    if (gap > FACET_A.maxAdjacentLabelGapMs) {
      return { ok: false, maxGapMs, peakRpm: 0 };
    }
  }
  if (
    sustainedLoadRequiresSequenceIceRpmConfirmation(powertrainClass) &&
    !resolvePhevIceConfirmedInCandidateSequence(buckets)
  ) {
    return { ok: false, maxGapMs, peakRpm: 0 };
  }
  const peakRpm = Math.max(...buckets.map((b) => b.rpm ?? 0));
  return { ok: true, maxGapMs, peakRpm };
}

function sequenceMeetsFacetBAdmission(
  slice: ActiveSequence,
  powertrainClass: ReturnType<typeof classifySustainedLoadPowertrainV1>['powertrainClass'],
): { ok: boolean; maxGapMs: number; meanRpm: number | null } {
  const buckets = slice.buckets;
  if (buckets.length < FACET_B.minObservations) {
    return { ok: false, maxGapMs: 0, meanRpm: null };
  }
  const span = buckets[buckets.length - 1]!.recordedAtMs - buckets[0]!.recordedAtMs;
  if (
    span < FACET_B.minResearchLabelSpanMs ||
    span <= FACET_B.shortIdleMaxResearchLabelSpanMs
  ) {
    return { ok: false, maxGapMs: 0, meanRpm: null };
  }
  let maxGapMs = 0;
  for (let i = 1; i < buckets.length; i += 1) {
    const gap = buckets[i]!.recordedAtMs - buckets[i - 1]!.recordedAtMs;
    maxGapMs = Math.max(maxGapMs, gap);
    if (gap > FACET_B.maxAdjacentLabelGapMs) {
      return { ok: false, maxGapMs, meanRpm: null };
    }
  }
  if (
    sustainedLoadRequiresSequenceIceRpmConfirmation(powertrainClass) &&
    !resolvePhevIceConfirmedInCandidateSequence(buckets)
  ) {
    return { ok: false, maxGapMs, meanRpm: null };
  }
  const rpmValues = buckets.map((b) => b.rpm!).filter((v) => Number.isFinite(v));
  const meanRpm =
    rpmValues.length > 0 ? rpmValues.reduce((a, b) => a + b, 0) / rpmValues.length : null;
  return { ok: true, maxGapMs, meanRpm };
}

export type Ds4RevvingIdleDualFacetDetectResultV1 = {
  facetA: {
    candidates: Ds4HighRpmStationaryLikeProxyCandidateV1[];
    entryLabelCount: number;
    longestRunLabelCount: number;
  };
  facetB: {
    candidates: Ds4ExcessiveStationaryLikeSpanProxyCandidateV1[];
    entryLabelCount: number;
    longestRunLabelCount: number;
  };
};

function detectFacetA(input: {
  tripId: string;
  providerSourceLinkId: string;
  powertrainClass: ReturnType<typeof classifySustainedLoadPowertrainV1>['powertrainClass'];
  sorted: readonly Ds4CanonicalMultichannelBucketV1[];
  sequenceMaxGapSeconds: number;
}): Ds4RevvingIdleDualFacetDetectResultV1['facetA'] {
  const countedEntryMs = new Set<number>();
  let entryLabelCount = 0;
  const candidates: Ds4HighRpmStationaryLikeProxyCandidateV1[] = [];
  let longestRunLabelCount = 0;
  let active: ActiveSequence | null = null;

  const countEntry = (bucket: Ds4CanonicalMultichannelBucketV1): boolean => {
    if (!facetAEntry(bucket)) return false;
    if (!countedEntryMs.has(bucket.recordedAtMs)) {
      countedEntryMs.add(bucket.recordedAtMs);
      entryLabelCount += 1;
    }
    return true;
  };

  const flush = () => {
    if (!active?.buckets.length) {
      active = null;
      return;
    }
    longestRunLabelCount = Math.max(longestRunLabelCount, active.buckets.length);
    const admission = sequenceMeetsFacetAAdmission(active, input.powertrainClass);
    if (admission.ok) {
      const start = active.buckets[0]!;
      const end = active.buckets[active.buckets.length - 1]!;
      const episodeKey = createHash('sha256')
        .update(`${input.tripId}|${input.providerSourceLinkId}|A|${start.recordedAtMs}|${end.recordedAtMs}`)
        .digest('hex')
        .slice(0, 32);
      candidates.push({
        episodeKey,
        classification: 'HIGH_RPM_STATIONARY_LIKE_PROXY_CANDIDATE',
        startProviderBucketLabelIso: start.recordedAtIso,
        endProviderBucketLabelIso: end.recordedAtIso,
        observedLabelCount: active.buckets.length,
        researchLabelSpanMs: end.recordedAtMs - start.recordedAtMs,
        maxObservedLabelGapMs: admission.maxGapMs,
        peakObservedRpm: admission.peakRpm,
        limitationCodes: [...BASE_LIMITATIONS],
        requiredChannelPresence: {
          speedKmh: true,
          rpm: true,
          throttlePct: active.buckets.some((b) => b.throttlePct != null),
          loadPct: active.buckets.some((b) => b.loadPct != null),
          coolantC: active.buckets.some((b) => b.coolantC != null),
        },
      });
    }
    active = null;
  };

  for (const bucket of input.sorted) {
    if (!bucketHasRequiredRpmSpeed(bucket)) {
      flush();
      continue;
    }

    if (active) {
      const prev = active.buckets[active.buckets.length - 1]!;
      const gap = bucket.recordedAtMs - prev.recordedAtMs;
      const sequenceBoundary = gapCrossesAdmittedSequenceBoundary({
        labelGapMs: gap,
        sequenceMaxGapSeconds: input.sequenceMaxGapSeconds,
        maxAdjacentLabelGapMs: FACET_A.maxAdjacentLabelGapMs,
      });
      if (gap > FACET_A.maxAdjacentLabelGapMs || sequenceBoundary || !facetAContinues(bucket)) {
        flush();
      } else {
        active.buckets.push(bucket);
        countEntry(bucket);
        continue;
      }
    }

    if (facetAEntry(bucket)) {
      active = { buckets: [bucket] };
      countEntry(bucket);
    }
  }
  flush();

  return { candidates, entryLabelCount, longestRunLabelCount };
}

function detectFacetB(input: {
  tripId: string;
  providerSourceLinkId: string;
  powertrainClass: ReturnType<typeof classifySustainedLoadPowertrainV1>['powertrainClass'];
  sorted: readonly Ds4CanonicalMultichannelBucketV1[];
  sequenceMaxGapSeconds: number;
}): Ds4RevvingIdleDualFacetDetectResultV1['facetB'] {
  const countedEntryMs = new Set<number>();
  let entryLabelCount = 0;
  const candidates: Ds4ExcessiveStationaryLikeSpanProxyCandidateV1[] = [];
  let longestRunLabelCount = 0;
  let active: ActiveSequence | null = null;

  const countEntry = (bucket: Ds4CanonicalMultichannelBucketV1): boolean => {
    if (!facetBEntry(bucket)) return false;
    if (!countedEntryMs.has(bucket.recordedAtMs)) {
      countedEntryMs.add(bucket.recordedAtMs);
      entryLabelCount += 1;
    }
    return true;
  };

  const flush = () => {
    if (!active?.buckets.length) {
      active = null;
      return;
    }
    longestRunLabelCount = Math.max(longestRunLabelCount, active.buckets.length);
    const admission = sequenceMeetsFacetBAdmission(active, input.powertrainClass);
    if (admission.ok) {
      const start = active.buckets[0]!;
      const end = active.buckets[active.buckets.length - 1]!;
      const episodeKey = createHash('sha256')
        .update(`${input.tripId}|${input.providerSourceLinkId}|B|${start.recordedAtMs}|${end.recordedAtMs}`)
        .digest('hex')
        .slice(0, 32);
      candidates.push({
        episodeKey,
        classification: 'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY_CANDIDATE',
        startProviderBucketLabelIso: start.recordedAtIso,
        endProviderBucketLabelIso: end.recordedAtIso,
        observedLabelCount: active.buckets.length,
        researchLabelSpanMs: end.recordedAtMs - start.recordedAtMs,
        maxObservedLabelGapMs: admission.maxGapMs,
        meanObservedRpmInBand: admission.meanRpm,
        limitationCodes: [...BASE_LIMITATIONS, 'EXCESSIVE_IDLE_BAND_CONTINUATION_STRICT_UPPER_BOUND'],
        requiredChannelPresence: {
          speedKmh: true,
          rpm: true,
          throttlePct: active.buckets.some((b) => b.throttlePct != null),
          loadPct: active.buckets.some((b) => b.loadPct != null),
          coolantC: active.buckets.some((b) => b.coolantC != null),
        },
      });
    }
    active = null;
  };

  for (const bucket of input.sorted) {
    if (!bucketHasRequiredRpmSpeed(bucket)) {
      flush();
      continue;
    }

    if (active) {
      const prev = active.buckets[active.buckets.length - 1]!;
      const gap = bucket.recordedAtMs - prev.recordedAtMs;
      const sequenceBoundary = gapCrossesAdmittedSequenceBoundary({
        labelGapMs: gap,
        sequenceMaxGapSeconds: input.sequenceMaxGapSeconds,
        maxAdjacentLabelGapMs: FACET_B.maxAdjacentLabelGapMs,
      });
      if (gap > FACET_B.maxAdjacentLabelGapMs || sequenceBoundary || !facetBContinues(bucket)) {
        flush();
      } else {
        active.buckets.push(bucket);
        countEntry(bucket);
        continue;
      }
    }

    if (facetBEntry(bucket)) {
      active = { buckets: [bucket] };
      countEntry(bucket);
    }
  }
  flush();

  return { candidates, entryLabelCount, longestRunLabelCount };
}

export function detectRevvingIdleDualFacetCandidates(input: {
  tripId: string;
  providerSourceLinkId: string;
  fuelType: string | null;
  isEvPowertrain: boolean;
  canon: Ds4MultichannelCanonicalizeResultV1;
  sequenceMaxGapSeconds: number;
  runFacetA?: boolean;
  runFacetB?: boolean;
}): Ds4RevvingIdleDualFacetDetectResultV1 {
  const { powertrainClass, contradictoryEvIceClaim } = classifySustainedLoadPowertrainV1(
    input.fuelType,
    input.isEvPowertrain,
  );
  const emptyA = { candidates: [], entryLabelCount: 0, longestRunLabelCount: 0 };
  const emptyB = { candidates: [], entryLabelCount: 0, longestRunLabelCount: 0 };
  if (contradictoryEvIceClaim || powertrainClass === 'BEV' || powertrainClass === 'UNKNOWN') {
    return { facetA: emptyA, facetB: emptyB };
  }

  const sorted = [...input.canon.buckets].sort((a, b) => a.recordedAtMs - b.recordedAtMs);
  const ctx = {
    tripId: input.tripId,
    providerSourceLinkId: input.providerSourceLinkId,
    powertrainClass,
    sorted,
    sequenceMaxGapSeconds: input.sequenceMaxGapSeconds,
  };
  const runA = input.runFacetA !== false;
  const runB = input.runFacetB !== false;
  return {
    facetA: runA ? detectFacetA(ctx) : emptyA,
    facetB: runB ? detectFacetB(ctx) : emptyB,
  };
}

export function classifyRevvingIdleFacetATripEvidence(input: {
  entryLabelCount: number;
  candidateCount: number;
  longestRunLabelCount: number;
}): Ds4RevvingIdleFacetATripEvidenceClassificationV1 {
  if (input.candidateCount > 0) {
    return 'HIGH_RPM_STATIONARY_LIKE_PROXY_CANDIDATE';
  }
  if (input.entryLabelCount === 0) {
    return 'NOT_OBSERVED';
  }
  if (input.longestRunLabelCount >= FACET_A.minObservations) {
    return 'INSUFFICIENT_OBSERVATIONS';
  }
  return 'INSUFFICIENT_OBSERVATIONS';
}

export function classifyRevvingIdleFacetBTripEvidence(input: {
  entryLabelCount: number;
  candidateCount: number;
  longestRunLabelCount: number;
}): Ds4RevvingIdleFacetBTripEvidenceClassificationV1 {
  if (input.candidateCount > 0) {
    return 'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY_CANDIDATE';
  }
  if (input.entryLabelCount === 0) {
    return 'NOT_OBSERVED';
  }
  if (input.longestRunLabelCount >= FACET_B.minObservations) {
    return 'INSUFFICIENT_OBSERVATIONS';
  }
  return 'INSUFFICIENT_OBSERVATIONS';
}
