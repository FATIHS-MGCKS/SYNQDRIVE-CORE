import { createHash } from 'crypto';
import type { DiV0MotionCoreShadowPayloadV1 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import type { MotionFsmStopEpisode } from '../../core/kinematics/motion-fsm';
import { parseBucketLabelMs } from '../../core/kinematics/motion-core-grid';
import {
  DS4_DBI_W0_RELAXED_SPEED_QUALITIES,
  DS4_DBI_W0_RESEARCH_THRESHOLDS_V1,
  DS4_DBI_W0_STRICT_SPEED_QUALITIES,
  type Ds4DbiW0EvidenceOriginV1,
  type Ds4DbiW0MbfReasonCodeV1,
  type Ds4DbiW0QualityTierV1,
  type Ds4DbiW0SingleMetricResultV1,
  type Ds4DbiW0TripKernelResultV1,
} from './ds4-dbi-w0-mbf.types.v1';
import type { Ds4DbiW0VerifiedSealedRealC4AttestationV1 } from './ds4-dbi-w0-sealed-real-attestation.v1';
import {
  buildDs4DbiW0MovingExposureClockEvidenceV1,
  computeDs4DbiW0D8BurstinessTauNativeV1,
} from './ds4-dbi-w0-moving-exposure-clock.v1';

export type Ds4DbiW0TripMetaV1 = {
  tripId: string;
  sourceMotionRunId: string;
  speedAuthority: string;
  shadowBundleVersion: string;
  contentFingerprint: string;
  exposureSecondsEs: number;
  distanceKm: number;
};

const FAIL_CLOSED_CODES = new Set<Ds4DbiW0MbfReasonCodeV1>([
  'MBF_W0_FAIL_CLOSED_MIXED_SPEED_AUTHORITY',
  'MBF_W0_FAIL_CLOSED_SOURCE_BUNDLE_MISMATCH',
  'MBF_W0_FAIL_CLOSED_CONTENT_FINGERPRINT_MISMATCH',
  'MBF_W0_FAIL_CLOSED_CORRUPT_LABEL_TIME_ORDER',
  'MBF_W0_FAIL_CLOSED_DUPLICATE_SPEED_LABEL',
  'MBF_W0_FAIL_CLOSED_INVALID_SPEED_VALUE',
  'MBF_W0_FAIL_CLOSED_FSM_DUPLICATE_LABEL',
  'MBF_W0_FAIL_CLOSED_FSM_MISSING_FOR_SPEED_LABEL',
  'MBF_W0_FAIL_CLOSED_DUPLICATE_EVENT_START_TIME',
  'MBF_W0_FAIL_CLOSED_EVENT_VALIDATION',
  'MBF_W0_FAIL_CLOSED_UNVERIFIED_SEALED_REAL_C4_CLAIM',
]);

function fingerprintPayloadV1(payload: DiV0MotionCoreShadowPayloadV1): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function isFailClosed(reasons: ReadonlySet<Ds4DbiW0MbfReasonCodeV1>): boolean {
  for (const c of reasons) {
    if (FAIL_CLOSED_CODES.has(c)) {
      return true;
    }
  }
  return false;
}

function medianSorted(sorted: number[]): number {
  if (sorted.length === 0) {
    return Number.NaN;
  }
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function madFromValues(values: number[]): number {
  if (values.length === 0) {
    return Number.NaN;
  }
  const med = medianSorted([...values].sort((a, b) => a - b));
  const devs = values.map((v) => Math.abs(v - med));
  return medianSorted(devs.sort((a, b) => a - b));
}

function speedQualityAllowed(quality: string, tier: Ds4DbiW0QualityTierV1): boolean {
  return tier === 'STRICT' ? DS4_DBI_W0_STRICT_SPEED_QUALITIES.has(quality) : DS4_DBI_W0_RELAXED_SPEED_QUALITIES.has(quality);
}

function isOneSecondStep(prevLabel: string, nextLabel: string): boolean {
  return parseBucketLabelMs(nextLabel) - parseBucketLabelMs(prevLabel) === 1000;
}

function movingDirectAuthorityLabelV1(row: DiV0MotionCoreShadowPayloadV1['fsmLabels'][number]): boolean {
  return row.state === 'MOVING' && row.evidenceQuality === 'DIRECT';
}

/** Speed + FSM alignment: one FSM row per speed label; validate before sort/dedup. */
function validateSpeedFsmAndBuildSeriesV1(
  payload: DiV0MotionCoreShadowPayloadV1,
  tier: Ds4DbiW0QualityTierV1,
): {
  sortedLabels: string[];
  speedByLabel: ReadonlyMap<string, { speedKmh: number; quality: string }>;
  repairedCount: number;
  movingDirect: ReadonlySet<string>;
  reasons: Ds4DbiW0MbfReasonCodeV1[];
  speedTimeSpanSeconds: number | null;
  consecutiveOneSecondPairsInSeries: number;
  d4EligibleMovingDirectLabels: number;
} {
  const reasons: Ds4DbiW0MbfReasonCodeV1[] = [];
  const labelFirstSeen = new Set<string>();

  for (const row of payload.speeds) {
    if (row.speedKmh == null) {
      continue;
    }
    if (!Number.isFinite(row.speedKmh) || row.speedKmh < 0) {
      reasons.push('MBF_W0_FAIL_CLOSED_INVALID_SPEED_VALUE');
    }
    if (labelFirstSeen.has(row.bucketLabelUtc)) {
      reasons.push('MBF_W0_FAIL_CLOSED_DUPLICATE_SPEED_LABEL');
    }
    labelFirstSeen.add(row.bucketLabelUtc);
  }

  const fsmByLabel = new Map<string, (typeof payload.fsmLabels)[number]>();
  for (const row of payload.fsmLabels) {
    if (fsmByLabel.has(row.bucketLabelUtc)) {
      reasons.push('MBF_W0_FAIL_CLOSED_FSM_DUPLICATE_LABEL');
    }
    fsmByLabel.set(row.bucketLabelUtc, row);
  }

  const speedByLabel = new Map<string, { speedKmh: number; quality: string }>();
  let repairedCount = 0;
  for (const row of payload.speeds) {
    if (row.speedKmh == null) {
      continue;
    }
    if (!speedQualityAllowed(row.quality, tier)) {
      continue;
    }
    if (row.quality === 'REPAIRED') {
      repairedCount += 1;
    }
    speedByLabel.set(row.bucketLabelUtc, { speedKmh: row.speedKmh, quality: row.quality });
  }

  const sortedLabels = [...speedByLabel.keys()].sort((a, b) => parseBucketLabelMs(a) - parseBucketLabelMs(b));

  for (let i = 1; i < sortedLabels.length; i += 1) {
    const prev = parseBucketLabelMs(sortedLabels[i - 1]!);
    const cur = parseBucketLabelMs(sortedLabels[i]!);
    if (cur <= prev) {
      reasons.push(cur === prev ? 'MBF_W0_FAIL_CLOSED_DUPLICATE_SPEED_LABEL' : 'MBF_W0_FAIL_CLOSED_CORRUPT_LABEL_TIME_ORDER');
    }
  }

  const movingDirect = new Set<string>();
  let d4EligibleMovingDirectLabels = 0;
  for (const lab of sortedLabels) {
    const fs = fsmByLabel.get(lab);
    if (!fs) {
      reasons.push('MBF_W0_FAIL_CLOSED_FSM_MISSING_FOR_SPEED_LABEL');
      continue;
    }
    if (movingDirectAuthorityLabelV1(fs)) {
      movingDirect.add(lab);
      d4EligibleMovingDirectLabels += 1;
    }
  }

  let consecutiveOneSecondPairsInSeries = 0;
  for (let i = 1; i < sortedLabels.length; i += 1) {
    const p = sortedLabels[i - 1]!;
    const c = sortedLabels[i]!;
    if (isOneSecondStep(p, c)) {
      consecutiveOneSecondPairsInSeries += 1;
    }
  }

  const speedTimeSpanSeconds =
    sortedLabels.length >= 2
      ? (parseBucketLabelMs(sortedLabels[sortedLabels.length - 1]!) - parseBucketLabelMs(sortedLabels[0]!)) / 1000
      : sortedLabels.length === 1
        ? 0
        : null;

  return {
    sortedLabels,
    speedByLabel,
    repairedCount,
    movingDirect,
    reasons,
    speedTimeSpanSeconds,
    consecutiveOneSecondPairsInSeries,
    d4EligibleMovingDirectLabels,
  };
}

function validateEventsV1(events: DiV0MotionCoreShadowPayloadV1['events']): Ds4DbiW0MbfReasonCodeV1[] {
  const reasons: Ds4DbiW0MbfReasonCodeV1[] = [];
  const admitted = events.filter((e) => e.quality === 'OK');
  const startsMs = admitted.map((e) => parseBucketLabelMs(e.startLabel));
  for (const t of startsMs) {
    if (!Number.isFinite(t)) {
      reasons.push('MBF_W0_FAIL_CLOSED_EVENT_VALIDATION');
    }
  }
  const sorted = [...startsMs].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i]! === sorted[i - 1]!) {
      reasons.push('MBF_W0_FAIL_CLOSED_DUPLICATE_EVENT_START_TIME');
    }
  }
  return reasons;
}

function computeD4V1(input: {
  movingDirect: ReadonlySet<string>;
  sortedLabels: readonly string[];
  speedByLabel: ReadonlyMap<string, { speedKmh: number; quality: string }>;
}): Ds4DbiW0SingleMetricResultV1 {
  const values: number[] = [];
  for (const lab of input.sortedLabels) {
    if (!input.movingDirect.has(lab)) {
      continue;
    }
    const s = input.speedByLabel.get(lab);
    if (!s) {
      continue;
    }
    values.push(s.speedKmh);
  }
  const n = values.length;
  if (n < DS4_DBI_W0_RESEARCH_THRESHOLDS_V1.minMovingDirectLabelsD4) {
    return {
      status: 'ABSTAIN',
      value: null,
      n,
      coverage: null,
      reasonCodes: ['MBF_W0_INSUFFICIENT_MOVING_DIRECT_LABELS'],
    };
  }
  const sortedV = [...values].sort((a, b) => a - b);
  const med = medianSorted(sortedV);
  if (!(med >= DS4_DBI_W0_RESEARCH_THRESHOLDS_V1.minMedianSpeedKmhForVariability)) {
    return {
      status: 'ABSTAIN',
      value: null,
      n,
      coverage: null,
      reasonCodes: ['MBF_W0_LOW_MEDIAN_SPEED_DENOMINATOR_GUARD'],
    };
  }
  const mad = madFromValues(values);
  const ratio = mad / med;
  return {
    status: 'KNOWN',
    value: Number.isFinite(ratio) ? ratio : null,
    n,
    coverage: n / Math.max(input.sortedLabels.length, 1),
    reasonCodes: ['MBF_W0_OK'],
  };
}

function computeD5V1(input: {
  movingDirect: ReadonlySet<string>;
  sortedLabels: readonly string[];
  speedByLabel: ReadonlyMap<string, { speedKmh: number; quality: string }>;
}): Ds4DbiW0SingleMetricResultV1 & { pairCount: number; gapBreaks: boolean } {
  const deltas: number[] = [];
  let gapBreaks = false;
  for (let i = 1; i < input.sortedLabels.length; i += 1) {
    const prev = input.sortedLabels[i - 1]!;
    const cur = input.sortedLabels[i]!;
    if (!isOneSecondStep(prev, cur)) {
      gapBreaks = true;
      continue;
    }
    if (!input.movingDirect.has(prev) || !input.movingDirect.has(cur)) {
      continue;
    }
    const a = input.speedByLabel.get(prev);
    const b = input.speedByLabel.get(cur);
    if (!a || !b) {
      continue;
    }
    deltas.push(Math.abs(b.speedKmh - a.speedKmh));
  }
  const pairCount = deltas.length;
  if (pairCount < DS4_DBI_W0_RESEARCH_THRESHOLDS_V1.minConsecutivePairsD5) {
    return {
      status: 'ABSTAIN',
      value: null,
      n: pairCount,
      coverage: null,
      reasonCodes: [
        'MBF_W0_INSUFFICIENT_CONSECUTIVE_PAIRS',
        ...(gapBreaks ? (['MBF_W0_GAP_BREAKS_CONSECUTIVE_CHAIN'] as const) : []),
      ],
      pairCount,
      gapBreaks,
    };
  }
  const meanAbs = deltas.reduce((s, x) => s + x, 0) / deltas.length;
  return {
    status: 'KNOWN',
    value: meanAbs,
    n: pairCount,
    coverage: pairCount / Math.max(input.sortedLabels.length - 1, 1),
    reasonCodes: [...(gapBreaks ? (['MBF_W0_GAP_BREAKS_CONSECUTIVE_CHAIN'] as const) : []), 'MBF_W0_OK'],
    pairCount,
    gapBreaks,
  };
}

/**
 * Moving runs: only MOVING+DIRECT with consecutive 1s steps; split on gaps or non-authority MOVING rows.
 */
function fsmMovingRunStatsV1(
  fsm: DiV0MotionCoreShadowPayloadV1['fsmLabels'],
): {
  medianMovingRunS: number | null;
  sustainedShare: number | null;
  movingExposureLabelSeconds: number;
  splitReasonSample: Ds4DbiW0MbfReasonCodeV1[];
} {
  const sorted = [...fsm].sort((a, b) => parseBucketLabelMs(a.bucketLabelUtc) - parseBucketLabelMs(b.bucketLabelUtc));
  const splitReasonSample: Ds4DbiW0MbfReasonCodeV1[] = [];
  const runsSeconds: number[] = [];
  let sustainedMovingExposureS = 0;
  let movingExposureLabelSeconds = 0;
  let i = 0;
  while (i < sorted.length) {
    if (!movingDirectAuthorityLabelV1(sorted[i]!)) {
      if (sorted[i]!.state === 'MOVING' && sorted[i]!.evidenceQuality !== 'DIRECT') {
        splitReasonSample.push('MBF_W0_NOT_EVALUABLE_STOP_AUTHORITY_NOT_DIRECT');
      }
      i += 1;
      continue;
    }
    const startIdx = i;
    const startMs = parseBucketLabelMs(sorted[startIdx]!.bucketLabelUtc);
    let runLabels = 1;
    i += 1;
    while (i < sorted.length) {
      const row = sorted[i]!;
      const prev = sorted[i - 1]!;
      if (!movingDirectAuthorityLabelV1(row)) {
        if (row.state === 'MOVING' && row.evidenceQuality !== 'DIRECT') {
          splitReasonSample.push('MBF_W0_NOT_EVALUABLE_STOP_AUTHORITY_NOT_DIRECT');
        }
        break;
      }
      const dt = parseBucketLabelMs(row.bucketLabelUtc) - parseBucketLabelMs(prev.bucketLabelUtc);
      if (dt !== 1000) {
        splitReasonSample.push('MBF_W0_GAP_BREAKS_CONSECUTIVE_CHAIN');
        break;
      }
      runLabels += 1;
      i += 1;
    }
    const endIdx = i - 1;
    const endMs = parseBucketLabelMs(sorted[endIdx]!.bucketLabelUtc);
    movingExposureLabelSeconds += runLabels;
    const durS = (endMs - startMs) / 1000 + 1;
    runsSeconds.push(durS);
    if (durS >= DS4_DBI_W0_RESEARCH_THRESHOLDS_V1.sustainedMovingRunMinSeconds) {
      sustainedMovingExposureS += runLabels;
    }
  }
  if (runsSeconds.length === 0) {
    return { medianMovingRunS: null, sustainedShare: null, movingExposureLabelSeconds: 0, splitReasonSample };
  }
  const med = medianSorted([...runsSeconds].sort((a, b) => a - b));
  return {
    medianMovingRunS: Number.isFinite(med) ? med : null,
    sustainedShare: movingExposureLabelSeconds > 0 ? sustainedMovingExposureS / movingExposureLabelSeconds : null,
    movingExposureLabelSeconds,
    splitReasonSample: [...new Set(splitReasonSample)],
  };
}

function directStopCountV1(stopEpisodes: readonly MotionFsmStopEpisode[]): number {
  let n = 0;
  for (const ep of stopEpisodes) {
    if (ep.evidenceQuality !== 'DIRECT') {
      continue;
    }
    if (ep.minDurationS < DS4_DBI_W0_RESEARCH_THRESHOLDS_V1.minDirectStopDurationSeconds) {
      continue;
    }
    n += 1;
  }
  return n;
}

function computeD6V1(input: {
  tripMeta: Ds4DbiW0TripMetaV1;
  stopEpisodes: readonly MotionFsmStopEpisode[];
  fsm: DiV0MotionCoreShadowPayloadV1['fsmLabels'];
  failClosed: boolean;
}): Ds4DbiW0TripKernelResultV1['d6StopStructure'] {
  const splitSample = fsmMovingRunStatsV1(input.fsm).splitReasonSample;
  if (input.failClosed) {
    return {
      status: 'NOT_AVAILABLE',
      directStopCount: null,
      stopsPerKm: null,
      medianMovingRunDurationSeconds: null,
      sustainedMovementShare: null,
      movingRunSplitReasonSample: splitSample,
      reasonCodes: [],
    };
  }
  const hasDirectAuthority = input.stopEpisodes.some((e) => e.evidenceQuality === 'DIRECT');
  if (!hasDirectAuthority) {
    return {
      status: 'NOT_AVAILABLE',
      directStopCount: null,
      stopsPerKm: null,
      medianMovingRunDurationSeconds: null,
      sustainedMovementShare: null,
      movingRunSplitReasonSample: splitSample,
      reasonCodes: ['MBF_W0_NOT_EVALUABLE_STOP_AUTHORITY_NOT_DIRECT'],
    };
  }

  const runStats = fsmMovingRunStatsV1(input.fsm);
  const directStops = directStopCountV1(input.stopEpisodes);
  const es = input.tripMeta.exposureSecondsEs;
  const dKm = input.tripMeta.distanceKm;

  const meetsStopEvidence =
    directStops >= DS4_DBI_W0_RESEARCH_THRESHOLDS_V1.minStopEpisodesOrEsSecondsD6.minStops ||
    es >= DS4_DBI_W0_RESEARCH_THRESHOLDS_V1.minStopEpisodesOrEsSecondsD6.minEsSeconds;

  if (!meetsStopEvidence) {
    return {
      status: 'ABSTAIN',
      directStopCount: directStops,
      stopsPerKm: null,
      medianMovingRunDurationSeconds: runStats.medianMovingRunS,
      sustainedMovementShare: runStats.sustainedShare,
      movingRunSplitReasonSample: runStats.splitReasonSample,
      reasonCodes: ['MBF_W0_INSUFFICIENT_ES_OR_STOPS_FOR_STOP_STRUCTURE'],
    };
  }

  const stopsPerKm = dKm > 0 && Number.isFinite(dKm) ? directStops / dKm : null;
  if (stopsPerKm == null) {
    return {
      status: 'ABSTAIN',
      directStopCount: directStops,
      stopsPerKm: null,
      medianMovingRunDurationSeconds: runStats.medianMovingRunS,
      sustainedMovementShare: runStats.sustainedShare,
      movingRunSplitReasonSample: runStats.splitReasonSample,
      reasonCodes: ['MBF_W0_NO_DIRECT_STOP_EVIDENCE'],
    };
  }

  return {
    status: 'KNOWN',
    directStopCount: directStops,
    stopsPerKm,
    medianMovingRunDurationSeconds: runStats.medianMovingRunS,
    sustainedMovementShare: runStats.sustainedShare,
    movingRunSplitReasonSample: runStats.splitReasonSample,
    reasonCodes: ['MBF_W0_OK'],
  };
}

type Ds4DbiW0D8BurstinessResultV1 = ReturnType<typeof computeDs4DbiW0D8BurstinessTauNativeV1>;

/** Exported for E9 null-process studies and tests — τ-native B3 D8 (F01). */
export function computeDs4DbiW0D8BurstinessFromObservationWindowV1(input: {
  tripMeta: Ds4DbiW0TripMetaV1 | null;
  payload: DiV0MotionCoreShadowPayloadV1;
  /** @deprecated ignored — use payload.speeds */
  speedLabelsUtc?: readonly string[];
  events?: DiV0MotionCoreShadowPayloadV1['events'];
  failClosedTrip?: boolean;
}): Ds4DbiW0D8BurstinessResultV1 {
  const nEvRaw = (input.events ?? input.payload.events).filter((e) => e.quality === 'OK').length;
  if (!input.tripMeta) {
    return {
      status: 'ABSTAIN',
      indexOfDispersion: null,
      shareNextEventWithin30s: null,
      windowCount: null,
      nonEmptyWindowCount: null,
      emptyWindowCount: null,
      totalWindowSlots: null,
      eventCount: nEvRaw,
      observationWindowStartMsUtc: null,
      observationWindowEndMsUtc: null,
      observationWindowDurationSeconds: null,
      finalBinWidthExposureSeconds: null,
      reasonCodes: ['MBF_W0_NOT_EVALUABLE_NO_TRIP_META', 'MBF_W0_NOT_EVALUABLE_D8_OBSERVATION_WINDOW'],
    };
  }

  const payloadWithEvents: DiV0MotionCoreShadowPayloadV1 = input.events
    ? { ...input.payload, events: input.events }
    : input.payload;

  const clock = buildDs4DbiW0MovingExposureClockEvidenceV1({
    payload: payloadWithEvents,
    suppliedExposureSecondsEs: input.tripMeta.exposureSecondsEs,
  });

  return computeDs4DbiW0D8BurstinessTauNativeV1({
    clock,
    tripMetaSuppliedEs: input.tripMeta.exposureSecondsEs,
    failClosedTrip: input.failClosedTrip ?? false,
  });
}

function computeD8V1(
  payload: DiV0MotionCoreShadowPayloadV1,
  tripMeta: Ds4DbiW0TripMetaV1 | null,
  failClosed: boolean,
  clock: ReturnType<typeof buildDs4DbiW0MovingExposureClockEvidenceV1>,
): Ds4DbiW0TripKernelResultV1['d8Burstiness'] {
  if (failClosed) {
    return {
      status: 'ABSTAIN',
      indexOfDispersion: null,
      shareNextEventWithin30s: null,
      windowCount: null,
      nonEmptyWindowCount: null,
      emptyWindowCount: null,
      totalWindowSlots: null,
      eventCount: null,
      observationWindowStartMsUtc: null,
      observationWindowEndMsUtc: null,
      observationWindowDurationSeconds: null,
      finalBinWidthExposureSeconds: null,
      reasonCodes: [],
    };
  }
  const core = computeDs4DbiW0D8BurstinessTauNativeV1({
    clock,
    tripMetaSuppliedEs: tripMeta?.exposureSecondsEs ?? null,
    failClosedTrip: false,
  });
  return {
    status: core.status,
    indexOfDispersion: core.indexOfDispersion,
    shareNextEventWithin30s: core.shareNextEventWithin30s,
    windowCount: core.windowCount,
    nonEmptyWindowCount: core.nonEmptyWindowCount,
    emptyWindowCount: core.emptyWindowCount,
    totalWindowSlots: core.totalWindowSlots,
    eventCount: core.eventCount,
    observationWindowStartMsUtc: core.observationWindowStartMsUtc,
    observationWindowEndMsUtc: core.observationWindowEndMsUtc,
    observationWindowDurationSeconds: core.observationWindowDurationSeconds,
    finalBinWidthExposureSeconds: core.finalBinWidthExposureSeconds,
    reasonCodes: core.reasonCodes,
  };
}

function emptyTripResultV1(
  input: {
    tripMeta: Ds4DbiW0TripMetaV1 | null;
    qualityTier: Ds4DbiW0QualityTierV1;
    expectedContentFingerprint?: string;
    evidenceOrigin: Ds4DbiW0EvidenceOriginV1;
    sealedReferenceContentFingerprintSha256: string | null;
    reasons: Ds4DbiW0MbfReasonCodeV1[];
  },
): Ds4DbiW0TripKernelResultV1 {
  const merged = [...new Set(input.reasons)];
  const fc = merged.filter((c) => FAIL_CLOSED_CODES.has(c));
  const failClosed = fc.length > 0;
  return {
    contractVersion: 'ds4-dbi-w0-mbf-kernel-v1',
    evidenceOrigin: input.evidenceOrigin,
    implementationWorks: true,
    sealedRealC4StatisticalEligibility: false,
    independentScientificValidationStatus: 'NOT_EVALUATED',
    tripId: input.tripMeta?.tripId ?? 'UNKNOWN',
    sourceMotionRunId: input.tripMeta?.sourceMotionRunId ?? 'UNKNOWN',
    qualityTier: input.qualityTier,
    speedAuthority: null,
    shadowBundleVersion: null,
    contentFingerprintExpected: input.expectedContentFingerprint ?? null,
    contentFingerprintObserved: null,
    sealedReferenceContentFingerprintSha256: input.sealedReferenceContentFingerprintSha256,
    exposureSecondsEs: input.tripMeta?.exposureSecondsEs ?? null,
    distanceKm: input.tripMeta?.distanceKm ?? null,
    coverageDiagnostics: {
      speedLabelsAdmissibleTier: 0,
      speedTimeSpanSeconds: null,
      consecutiveOneSecondPairsInSeries: 0,
      movingDirectLabelSecondsEstimated: 0,
      d4EligibleMovingDirectLabels: null,
      d5EligibleConsecutiveMovingDirectPairs: null,
    },
    d4SpeedVariabilityRobustCv: {
      status: 'ABSTAIN',
      value: null,
      n: null,
      coverage: null,
      reasonCodes: merged,
    },
    d5SpeedRoughnessMeanAbsDeltaKmhPerS: {
      status: 'ABSTAIN',
      value: null,
      n: null,
      coverage: null,
      reasonCodes: merged,
    },
    d6StopStructure: {
      status: 'NOT_AVAILABLE',
      directStopCount: null,
      stopsPerKm: null,
      medianMovingRunDurationSeconds: null,
      sustainedMovementShare: null,
      movingRunSplitReasonSample: [],
      reasonCodes: merged,
    },
    d8Burstiness: {
      status: 'ABSTAIN',
      indexOfDispersion: null,
      shareNextEventWithin30s: null,
      windowCount: null,
      nonEmptyWindowCount: null,
      emptyWindowCount: null,
      totalWindowSlots: null,
      eventCount: null,
      observationWindowStartMsUtc: null,
      observationWindowEndMsUtc: null,
      observationWindowDurationSeconds: null,
      finalBinWidthExposureSeconds: null,
      reasonCodes: merged,
    },
    dualTimeDomain: null,
    diagnostics: {
      speedRowCount: 0,
      fsmRowCount: 0,
      movingDirectLabelCount: 0,
      consecutiveOneSecondPairCount: 0,
      directStopEpisodeCount: 0,
      eventCount: 0,
      repairedSpeedLabelCount: 0,
      inputValidationReasons: merged,
      failClosedReasons: fc,
    },
  };
}

/**
 * Pure W0 MBF kernel — operates on an in-memory shadow payload and optional pinned trip metadata.
 */
export function computeDs4DbiW0MbfFromPayloadV1(input: {
  payload: DiV0MotionCoreShadowPayloadV1 | null;
  tripMeta: Ds4DbiW0TripMetaV1 | null;
  qualityTier: Ds4DbiW0QualityTierV1;
  /** Expected canonical JSON digest of payload (research harness); distinct from sealed CSV fingerprint. */
  expectedContentFingerprint?: string;
  expectedShadowBundleVersion?: string;
  syntheticScenarioTag?: string;
  evidenceOrigin?: Ds4DbiW0EvidenceOriginV1;
  /** Sealed file/content fingerprint from P2 CSV — compare only to JSON digest when using sealed-real semantics. */
  sealedReferenceContentFingerprintSha256?: string | null;
  /**
   * W1 design metadata only in W0 — caller-supplied values do not authenticate provenance
   * and do not affect fail-closed or statistical eligibility.
   */
  verifiedSealedRealC4Attestation?: Ds4DbiW0VerifiedSealedRealC4AttestationV1 | null;
}): Ds4DbiW0TripKernelResultV1 {
  const reasonSet = new Set<Ds4DbiW0MbfReasonCodeV1>();
  const pushReason = (c: Ds4DbiW0MbfReasonCodeV1) => {
    reasonSet.add(c);
  };
  if (input.syntheticScenarioTag) {
    pushReason('MBF_W0_SYNTHETIC_CONTROL_SCENARIO');
  }

  const evidenceOrigin: Ds4DbiW0EvidenceOriginV1 =
    input.evidenceOrigin ?? (input.syntheticScenarioTag ? 'SYNTHETIC_CONTROL' : 'SYNTHETIC_UNSPECIFIED');

  const sealedRef = input.sealedReferenceContentFingerprintSha256 ?? null;

  if (!input.payload) {
    pushReason('MBF_W0_NOT_EVALUABLE_NO_MOTION_PAYLOAD');
    return emptyTripResultV1({
      tripMeta: input.tripMeta,
      qualityTier: input.qualityTier,
      expectedContentFingerprint: input.expectedContentFingerprint,
      evidenceOrigin,
      sealedReferenceContentFingerprintSha256: sealedRef,
      reasons: [...reasonSet],
    });
  }

  const payload = input.payload;
  const observedFp = fingerprintPayloadV1(payload);

  if (input.expectedContentFingerprint && observedFp !== input.expectedContentFingerprint) {
    pushReason('MBF_W0_FAIL_CLOSED_CONTENT_FINGERPRINT_MISMATCH');
  }
  const bundleObs = payload.contract.algorithmVersions.bundle;
  if (input.expectedShadowBundleVersion && bundleObs !== input.expectedShadowBundleVersion) {
    pushReason('MBF_W0_FAIL_CLOSED_SOURCE_BUNDLE_MISMATCH');
  }
  if (evidenceOrigin === 'SEALED_REAL_C4') {
    pushReason('MBF_W0_FAIL_CLOSED_UNVERIFIED_SEALED_REAL_C4_CLAIM');
  }
  if (
    input.tripMeta &&
    input.tripMeta.speedAuthority &&
    payload.contract.speedAuthority &&
    input.tripMeta.speedAuthority !== payload.contract.speedAuthority
  ) {
    pushReason('MBF_W0_FAIL_CLOSED_MIXED_SPEED_AUTHORITY');
  }

  if (payload.speeds.length === 0) {
    pushReason('MBF_W0_NOT_EVALUABLE_MISSING_SPEED_SERIES');
  }
  if (payload.fsmLabels.length === 0) {
    pushReason('MBF_W0_NOT_EVALUABLE_MISSING_FSM_LABELS');
  }
  if (payload.stopEpisodes.length === 0) {
    pushReason('MBF_W0_NOT_EVALUABLE_MISSING_STOP_EPISODES');
  }
  if (payload.events.length === 0) {
    pushReason('MBF_W0_NOT_EVALUABLE_MISSING_EVENTS');
  }

  if (!input.tripMeta) {
    pushReason('MBF_W0_NOT_EVALUABLE_NO_TRIP_META');
  }

  for (const r of validateEventsV1(payload.events)) {
    pushReason(r);
  }

  const series = validateSpeedFsmAndBuildSeriesV1(payload, input.qualityTier);
  for (const r of series.reasons) {
    pushReason(r);
  }

  const mergeReasons = (codes: readonly Ds4DbiW0MbfReasonCodeV1[]): Ds4DbiW0MbfReasonCodeV1[] => [
    ...new Set([...codes, ...reasonSet]),
  ];

  const failClosed = isFailClosed(reasonSet);

  const d5Full = computeD5V1({
    movingDirect: series.movingDirect,
    sortedLabels: series.sortedLabels,
    speedByLabel: series.speedByLabel,
  });

  const d4Full = failClosed
    ? ({
        status: 'ABSTAIN' as const,
        value: null,
        n: null,
        coverage: null,
        reasonCodes: [] as Ds4DbiW0MbfReasonCodeV1[],
      } satisfies Ds4DbiW0SingleMetricResultV1)
    : computeD4V1({ movingDirect: series.movingDirect, sortedLabels: series.sortedLabels, speedByLabel: series.speedByLabel });

  let d6Base: Ds4DbiW0TripKernelResultV1['d6StopStructure'];
  if (failClosed) {
    const split = fsmMovingRunStatsV1(payload.fsmLabels);
    d6Base = {
      status: 'NOT_AVAILABLE',
      directStopCount: null,
      stopsPerKm: null,
      medianMovingRunDurationSeconds: null,
      sustainedMovementShare: null,
      movingRunSplitReasonSample: split.splitReasonSample,
      reasonCodes: [],
    };
  } else if (!input.tripMeta) {
    const split = fsmMovingRunStatsV1(payload.fsmLabels);
    d6Base = {
      status: 'NOT_AVAILABLE',
      directStopCount: null,
      stopsPerKm: null,
      medianMovingRunDurationSeconds: null,
      sustainedMovementShare: null,
      movingRunSplitReasonSample: split.splitReasonSample,
      reasonCodes: ['MBF_W0_NOT_EVALUABLE_NO_TRIP_META'],
    };
  } else if (reasonSet.has('MBF_W0_FAIL_CLOSED_MIXED_SPEED_AUTHORITY')) {
    const split = fsmMovingRunStatsV1(payload.fsmLabels);
    d6Base = {
      status: 'NOT_AVAILABLE',
      directStopCount: null,
      stopsPerKm: null,
      medianMovingRunDurationSeconds: null,
      sustainedMovementShare: null,
      movingRunSplitReasonSample: split.splitReasonSample,
      reasonCodes: ['MBF_W0_FAIL_CLOSED_MIXED_SPEED_AUTHORITY'],
    };
  } else {
    d6Base = computeD6V1({
      tripMeta: input.tripMeta,
      stopEpisodes: payload.stopEpisodes,
      fsm: payload.fsmLabels,
      failClosed: false,
    });
  }

  const movingClock = buildDs4DbiW0MovingExposureClockEvidenceV1({
    payload,
    suppliedExposureSecondsEs: input.tripMeta?.exposureSecondsEs ?? null,
  });
  const d8Full = computeD8V1(payload, input.tripMeta, failClosed, movingClock);

  const d4: Ds4DbiW0SingleMetricResultV1 = {
    status: failClosed ? 'ABSTAIN' : d4Full.status,
    value: failClosed ? null : d4Full.value,
    n: failClosed ? null : d4Full.n,
    coverage: failClosed ? null : d4Full.coverage,
    reasonCodes: mergeReasons(d4Full.reasonCodes),
  };

  const d5: Ds4DbiW0SingleMetricResultV1 = {
    status: failClosed ? 'ABSTAIN' : d5Full.status,
    value: failClosed ? null : d5Full.value,
    n: failClosed ? null : d5Full.n,
    coverage: failClosed ? null : d5Full.coverage,
    reasonCodes: mergeReasons(d5Full.reasonCodes),
  };

  const d6: Ds4DbiW0TripKernelResultV1['d6StopStructure'] = {
    ...d6Base,
    status: failClosed ? 'NOT_AVAILABLE' : d6Base.status,
    directStopCount: failClosed ? null : d6Base.directStopCount,
    stopsPerKm: failClosed ? null : d6Base.stopsPerKm,
    medianMovingRunDurationSeconds: failClosed ? null : d6Base.medianMovingRunDurationSeconds,
    sustainedMovementShare: failClosed ? null : d6Base.sustainedMovementShare,
    reasonCodes: mergeReasons(d6Base.reasonCodes),
  };

  const d8: Ds4DbiW0TripKernelResultV1['d8Burstiness'] = {
    ...d8Full,
    indexOfDispersion: failClosed ? null : d8Full.indexOfDispersion,
    shareNextEventWithin30s: failClosed ? null : d8Full.shareNextEventWithin30s,
    windowCount: failClosed ? null : d8Full.windowCount,
    nonEmptyWindowCount: failClosed ? null : d8Full.nonEmptyWindowCount,
    emptyWindowCount: failClosed ? null : d8Full.emptyWindowCount,
    totalWindowSlots: failClosed ? null : d8Full.totalWindowSlots,
    eventCount: failClosed ? null : d8Full.eventCount,
    finalBinWidthExposureSeconds: failClosed ? null : d8Full.finalBinWidthExposureSeconds,
    status: failClosed ? 'ABSTAIN' : d8Full.status,
    reasonCodes: mergeReasons(d8Full.reasonCodes),
  };

  const directStopEpisodes = payload.stopEpisodes.filter(
    (e) =>
      e.evidenceQuality === 'DIRECT' &&
      e.minDurationS >= DS4_DBI_W0_RESEARCH_THRESHOLDS_V1.minDirectStopDurationSeconds,
  );

  const implementationWorks = true;

  const sealedRealC4StatisticalEligibility = false;

  return {
    contractVersion: 'ds4-dbi-w0-mbf-kernel-v1',
    evidenceOrigin,
    implementationWorks,
    sealedRealC4StatisticalEligibility,
    independentScientificValidationStatus: 'NOT_EVALUATED',
    tripId: input.tripMeta?.tripId ?? 'UNKNOWN',
    sourceMotionRunId: input.tripMeta?.sourceMotionRunId ?? 'UNKNOWN',
    qualityTier: input.qualityTier,
    speedAuthority: payload.contract.speedAuthority,
    shadowBundleVersion: bundleObs,
    contentFingerprintExpected: input.expectedContentFingerprint ?? null,
    contentFingerprintObserved: observedFp,
    sealedReferenceContentFingerprintSha256: sealedRef,
    exposureSecondsEs: input.tripMeta?.exposureSecondsEs ?? null,
    distanceKm: input.tripMeta?.distanceKm ?? null,
    coverageDiagnostics: {
      speedLabelsAdmissibleTier: series.sortedLabels.length,
      speedTimeSpanSeconds: series.speedTimeSpanSeconds,
      consecutiveOneSecondPairsInSeries: series.consecutiveOneSecondPairsInSeries,
      movingDirectLabelSecondsEstimated: series.movingDirect.size,
      d4EligibleMovingDirectLabels: failClosed ? null : series.d4EligibleMovingDirectLabels,
      d5EligibleConsecutiveMovingDirectPairs: failClosed ? null : d5Full.pairCount,
    },
    d4SpeedVariabilityRobustCv: d4,
    d5SpeedRoughnessMeanAbsDeltaKmhPerS: d5,
    d6StopStructure: d6,
    d8Burstiness: d8,
    dualTimeDomain: failClosed ? null : movingClock.dualTime,
    diagnostics: {
      speedRowCount: payload.speeds.length,
      fsmRowCount: payload.fsmLabels.length,
      movingDirectLabelCount: series.movingDirect.size,
      consecutiveOneSecondPairCount: series.consecutiveOneSecondPairsInSeries,
      directStopEpisodeCount: directStopEpisodes.length,
      eventCount: payload.events.length,
      repairedSpeedLabelCount: series.repairedCount,
      inputValidationReasons: [...new Set(series.reasons)],
      failClosedReasons: [...reasonSet].filter((c) => FAIL_CLOSED_CODES.has(c)),
    },
  };
}
