import { createHash } from 'crypto';
import type { DiV0MotionCoreShadowPayloadV1 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import type { MotionFsmStopEpisode } from '../../core/kinematics/motion-fsm';
import { parseBucketLabelMs } from '../../core/kinematics/motion-core-grid';
import {
  DS4_DBI_W0_RELAXED_SPEED_QUALITIES,
  DS4_DBI_W0_RESEARCH_THRESHOLDS_V1,
  DS4_DBI_W0_STRICT_SPEED_QUALITIES,
  type Ds4DbiW0MbfReasonCodeV1,
  type Ds4DbiW0QualityTierV1,
  type Ds4DbiW0SingleMetricResultV1,
  type Ds4DbiW0TripKernelResultV1,
} from './ds4-dbi-w0-mbf.types.v1';

export type Ds4DbiW0TripMetaV1 = {
  tripId: string;
  sourceMotionRunId: string;
  speedAuthority: string;
  shadowBundleVersion: string;
  contentFingerprint: string;
  exposureSecondsEs: number;
  distanceKm: number;
};

function fingerprintPayloadV1(payload: DiV0MotionCoreShadowPayloadV1): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
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

function movingDirectLabelSetV1(
  fsm: DiV0MotionCoreShadowPayloadV1['fsmLabels'],
): ReadonlySet<string> {
  const s = new Set<string>();
  for (const row of fsm) {
    if (row.state === 'MOVING' && row.evidenceQuality === 'DIRECT') {
      s.add(row.bucketLabelUtc);
    }
  }
  return s;
}

function isOneSecondStep(prevLabel: string, nextLabel: string): boolean {
  return parseBucketLabelMs(nextLabel) - parseBucketLabelMs(prevLabel) === 1000;
}

function collectSpeedSeriesForTier(
  payload: DiV0MotionCoreShadowPayloadV1,
  tier: Ds4DbiW0QualityTierV1,
): {
  sortedLabels: string[];
  speedByLabel: ReadonlyMap<string, { speedKmh: number; quality: string }>;
  repairedCount: number;
} {
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
  return { sortedLabels, speedByLabel, repairedCount };
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
    coverage: null,
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
    coverage: null,
    reasonCodes: [...(gapBreaks ? (['MBF_W0_GAP_BREAKS_CONSECUTIVE_CHAIN'] as const) : []), 'MBF_W0_OK'],
    pairCount,
    gapBreaks,
  };
}

function fsmMovingRunStatsV1(
  fsm: DiV0MotionCoreShadowPayloadV1['fsmLabels'],
): { medianMovingRunS: number | null; sustainedShare: number | null; movingExposureLabelSeconds: number } {
  const sorted = [...fsm].sort((a, b) => parseBucketLabelMs(a.bucketLabelUtc) - parseBucketLabelMs(b.bucketLabelUtc));
  const runsSeconds: number[] = [];
  let sustainedMovingExposureS = 0;
  let movingExposureLabelSeconds = 0;
  let i = 0;
  while (i < sorted.length) {
    if (sorted[i]!.state !== 'MOVING') {
      i += 1;
      continue;
    }
    const startIdx = i;
    const startLab = sorted[startIdx]!.bucketLabelUtc;
    while (i < sorted.length && sorted[i]!.state === 'MOVING') {
      i += 1;
    }
    const endIdx = i - 1;
    const endLab = sorted[endIdx]!.bucketLabelUtc;
    const spanLabels = endIdx - startIdx + 1;
    movingExposureLabelSeconds += spanLabels;
    const durS = (parseBucketLabelMs(endLab) - parseBucketLabelMs(startLab)) / 1000 + 1;
    runsSeconds.push(durS);
    if (durS >= DS4_DBI_W0_RESEARCH_THRESHOLDS_V1.sustainedMovingRunMinSeconds) {
      sustainedMovingExposureS += spanLabels;
    }
  }
  if (runsSeconds.length === 0) {
    return { medianMovingRunS: null, sustainedShare: null, movingExposureLabelSeconds: 0 };
  }
  const med = medianSorted([...runsSeconds].sort((a, b) => a - b));
  return {
    medianMovingRunS: Number.isFinite(med) ? med : null,
    sustainedShare:
      movingExposureLabelSeconds > 0 ? sustainedMovingExposureS / movingExposureLabelSeconds : null,
    movingExposureLabelSeconds,
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
}): Ds4DbiW0TripKernelResultV1['d6StopStructure'] {
  const hasDirectAuthority = input.stopEpisodes.some((e) => e.evidenceQuality === 'DIRECT');
  if (!hasDirectAuthority) {
    return {
      status: 'NOT_AVAILABLE',
      directStopCount: null,
      stopsPerKm: null,
      medianMovingRunDurationSeconds: null,
      sustainedMovementShare: null,
      reasonCodes: ['MBF_W0_NOT_EVALUABLE_STOP_AUTHORITY_NOT_DIRECT'],
    };
  }

  const directStops = directStopCountV1(input.stopEpisodes);
  const { medianMovingRunS, sustainedShare } = fsmMovingRunStatsV1(input.fsm);
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
      medianMovingRunDurationSeconds: medianMovingRunS,
      sustainedMovementShare: sustainedShare,
      reasonCodes: ['MBF_W0_INSUFFICIENT_ES_OR_STOPS_FOR_STOP_STRUCTURE'],
    };
  }

  const stopsPerKm =
    dKm > 0 && Number.isFinite(dKm) ? directStops / dKm : null;
  if (stopsPerKm == null) {
    return {
      status: 'ABSTAIN',
      directStopCount: directStops,
      stopsPerKm: null,
      medianMovingRunDurationSeconds: medianMovingRunS,
      sustainedMovementShare: sustainedShare,
      reasonCodes: ['MBF_W0_NO_DIRECT_STOP_EVIDENCE'],
    };
  }

  return {
    status: 'KNOWN',
    directStopCount: directStops,
    stopsPerKm,
    medianMovingRunDurationSeconds: medianMovingRunS,
    sustainedMovementShare: sustainedShare,
    reasonCodes: ['MBF_W0_OK'],
  };
}

function eventStartMsV1(e: DiV0MotionCoreShadowPayloadV1['events'][number]): number {
  return parseBucketLabelMs(e.startLabel);
}

function computeD8V1(events: DiV0MotionCoreShadowPayloadV1['events']): Ds4DbiW0TripKernelResultV1['d8Burstiness'] {
  const admitted = events.filter((e) => e.quality === 'OK');
  const nEv = admitted.length;
  if (nEv < DS4_DBI_W0_RESEARCH_THRESHOLDS_V1.minEventsD8) {
    return {
      status: 'ABSTAIN',
      indexOfDispersion: null,
      shareNextEventWithin30s: null,
      windowCount: null,
      eventCount: nEv,
      reasonCodes: ['MBF_W0_INSUFFICIENT_EVENTS_FOR_BURSTINESS'],
    };
  }
  const starts = admitted.map((e) => eventStartMsV1(e)).sort((a, b) => a - b);
  const t0 = starts[0]!;
  const windowMs = DS4_DBI_W0_RESEARCH_THRESHOLDS_V1.burstWindowSeconds * 1000;
  const countsByWindow = new Map<number, number>();
  for (const t of starts) {
    const w = Math.floor((t - t0) / windowMs);
    countsByWindow.set(w, (countsByWindow.get(w) ?? 0) + 1);
  }
  const counts = [...countsByWindow.values()];
  const nonEmpty = counts.filter((c) => c > 0).length;
  if (nonEmpty < DS4_DBI_W0_RESEARCH_THRESHOLDS_V1.minNonEmptyWindowsD8) {
    return {
      status: 'ABSTAIN',
      indexOfDispersion: null,
      shareNextEventWithin30s: null,
      windowCount: nonEmpty,
      eventCount: nEv,
      reasonCodes: ['MBF_W0_INSUFFICIENT_WINDOWS_FOR_BURSTINESS'],
    };
  }
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance =
    counts.reduce((acc, c) => acc + (c - mean) * (c - mean), 0) / Math.max(counts.length - 1, 1);
  const iod = mean > 0 ? variance / mean : null;

  let within = 0;
  for (let i = 1; i < starts.length; i += 1) {
    if (starts[i]! - starts[i - 1]! <= DS4_DBI_W0_RESEARCH_THRESHOLDS_V1.burstNextEventMaxSeconds * 1000) {
      within += 1;
    }
  }
  const shareNext = starts.length > 1 ? within / (starts.length - 1) : null;

  return {
    status: 'KNOWN',
    indexOfDispersion: iod,
    shareNextEventWithin30s: shareNext,
    windowCount: counts.length,
    eventCount: nEv,
    reasonCodes: ['MBF_W0_OK'],
  };
}

/**
 * Pure W0 MBF kernel — operates on an in-memory shadow payload and optional pinned trip metadata.
 */
export function computeDs4DbiW0MbfFromPayloadV1(input: {
  payload: DiV0MotionCoreShadowPayloadV1 | null;
  tripMeta: Ds4DbiW0TripMetaV1 | null;
  qualityTier: Ds4DbiW0QualityTierV1;
  expectedContentFingerprint?: string;
  expectedShadowBundleVersion?: string;
  syntheticScenarioTag?: string;
}): Ds4DbiW0TripKernelResultV1 {
  const reasonSet = new Set<Ds4DbiW0MbfReasonCodeV1>();
  const pushReason = (c: Ds4DbiW0MbfReasonCodeV1) => {
    reasonSet.add(c);
  };
  if (input.syntheticScenarioTag) {
    pushReason('MBF_W0_SYNTHETIC_CONTROL_SCENARIO');
  }

  if (!input.payload) {
    pushReason('MBF_W0_NOT_EVALUABLE_NO_MOTION_PAYLOAD');
    const absent = [...reasonSet];
    return {
      contractVersion: 'ds4-dbi-w0-mbf-kernel-v1',
      tripId: input.tripMeta?.tripId ?? 'UNKNOWN',
      sourceMotionRunId: input.tripMeta?.sourceMotionRunId ?? 'UNKNOWN',
      qualityTier: input.qualityTier,
      speedAuthority: null,
      shadowBundleVersion: null,
      contentFingerprintExpected: input.expectedContentFingerprint ?? null,
      contentFingerprintObserved: null,
      exposureSecondsEs: input.tripMeta?.exposureSecondsEs ?? null,
      distanceKm: input.tripMeta?.distanceKm ?? null,
      d4SpeedVariabilityRobustCv: {
        status: 'ABSTAIN',
        value: null,
        n: null,
        coverage: null,
        reasonCodes: absent,
      },
      d5SpeedRoughnessMeanAbsDeltaKmhPerS: {
        status: 'ABSTAIN',
        value: null,
        n: null,
        coverage: null,
        reasonCodes: absent,
      },
      d6StopStructure: {
        status: 'NOT_AVAILABLE',
        directStopCount: null,
        stopsPerKm: null,
        medianMovingRunDurationSeconds: null,
        sustainedMovementShare: null,
        reasonCodes: absent,
      },
      d8Burstiness: {
        status: 'ABSTAIN',
        indexOfDispersion: null,
        shareNextEventWithin30s: null,
        windowCount: null,
        eventCount: null,
        reasonCodes: absent,
      },
      diagnostics: {
        speedRowCount: 0,
        fsmRowCount: 0,
        movingDirectLabelCount: 0,
        consecutiveOneSecondPairCount: 0,
        directStopEpisodeCount: 0,
        eventCount: 0,
        repairedSpeedLabelCount: 0,
      },
    };
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

  const movingDirect = movingDirectLabelSetV1(payload.fsmLabels);
  const { sortedLabels, speedByLabel, repairedCount } = collectSpeedSeriesForTier(payload, input.qualityTier);

  let corruptTimeOrder = false;
  for (let i = 1; i < sortedLabels.length; i += 1) {
    if (parseBucketLabelMs(sortedLabels[i]!) <= parseBucketLabelMs(sortedLabels[i - 1]!)) {
      corruptTimeOrder = true;
      break;
    }
  }
  if (corruptTimeOrder) {
    pushReason('MBF_W0_FAIL_CLOSED_CORRUPT_LABEL_TIME_ORDER');
  }

  let consecutivePairs = 0;
  for (let i = 1; i < sortedLabels.length; i += 1) {
    const p = sortedLabels[i - 1]!;
    const c = sortedLabels[i]!;
    if (isOneSecondStep(p, c)) {
      consecutivePairs += 1;
    }
  }

  const d4 = computeD4V1({ movingDirect, sortedLabels, speedByLabel });
  const d5 = computeD5V1({ movingDirect, sortedLabels, speedByLabel });

  const directStopEpisodes = payload.stopEpisodes.filter(
    (e) =>
      e.evidenceQuality === 'DIRECT' &&
      e.minDurationS >= DS4_DBI_W0_RESEARCH_THRESHOLDS_V1.minDirectStopDurationSeconds,
  );

  const d6 =
    input.tripMeta && !reasonSet.has('MBF_W0_FAIL_CLOSED_MIXED_SPEED_AUTHORITY')
      ? computeD6V1({ tripMeta: input.tripMeta, stopEpisodes: payload.stopEpisodes, fsm: payload.fsmLabels })
      : ({
          status: 'NOT_AVAILABLE' as const,
          directStopCount: null,
          stopsPerKm: null,
          medianMovingRunDurationSeconds: null,
          sustainedMovementShare: null,
          reasonCodes: ['MBF_W0_NOT_EVALUABLE_NO_TRIP_META'] as const,
        });

  const d8 = computeD8V1(payload.events);

  const mergeReasons = (codes: readonly Ds4DbiW0MbfReasonCodeV1[]): Ds4DbiW0MbfReasonCodeV1[] => [
    ...new Set([...codes, ...reasonSet]),
  ];

  const applyFail = (r: Ds4DbiW0SingleMetricResultV1): Ds4DbiW0SingleMetricResultV1 => ({
    ...r,
    reasonCodes: mergeReasons(r.reasonCodes),
  });

  return {
    contractVersion: 'ds4-dbi-w0-mbf-kernel-v1',
    tripId: input.tripMeta?.tripId ?? 'UNKNOWN',
    sourceMotionRunId: input.tripMeta?.sourceMotionRunId ?? 'UNKNOWN',
    qualityTier: input.qualityTier,
    speedAuthority: payload.contract.speedAuthority,
    shadowBundleVersion: bundleObs,
    contentFingerprintExpected: input.expectedContentFingerprint ?? null,
    contentFingerprintObserved: observedFp,
    exposureSecondsEs: input.tripMeta?.exposureSecondsEs ?? null,
    distanceKm: input.tripMeta?.distanceKm ?? null,
    d4SpeedVariabilityRobustCv:
      corruptTimeOrder || reasonSet.has('MBF_W0_FAIL_CLOSED_CONTENT_FINGERPRINT_MISMATCH')
        ? { status: 'ABSTAIN', value: null, n: d4.n, coverage: null, reasonCodes: mergeReasons(d4.reasonCodes) }
        : applyFail(d4),
    d5SpeedRoughnessMeanAbsDeltaKmhPerS:
      corruptTimeOrder || reasonSet.has('MBF_W0_FAIL_CLOSED_CONTENT_FINGERPRINT_MISMATCH')
        ? {
            status: 'ABSTAIN',
            value: null,
            n: d5.n,
            coverage: null,
            reasonCodes: mergeReasons(d5.reasonCodes),
          }
        : applyFail(d5),
    d6StopStructure: {
      ...d6,
      reasonCodes: mergeReasons(d6.reasonCodes as Ds4DbiW0MbfReasonCodeV1[]),
    },
    d8Burstiness: {
      ...d8,
      reasonCodes: mergeReasons(d8.reasonCodes as Ds4DbiW0MbfReasonCodeV1[]),
    },
    diagnostics: {
      speedRowCount: payload.speeds.length,
      fsmRowCount: payload.fsmLabels.length,
      movingDirectLabelCount: movingDirect.size,
      consecutiveOneSecondPairCount: consecutivePairs,
      directStopEpisodeCount: directStopEpisodes.length,
      eventCount: payload.events.length,
      repairedSpeedLabelCount: repairedCount,
    },
  };
}
