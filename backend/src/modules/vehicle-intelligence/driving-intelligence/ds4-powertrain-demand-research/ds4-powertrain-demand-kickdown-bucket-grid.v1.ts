import {
  confirmIceOperation,
  isPhevFuelType,
} from '../../shadow-detector/detectors/cold-engine-shadow.policy';
import { KICKDOWN_LIKE_SHADOW_POLICY } from '../../shadow-detector/detectors/kickdown-like-shadow.policy';
import type { ShadowDetectorHfSample } from '../../shadow-detector/shadow-detector.types';
import type {
  Ds4CanonicalMultichannelBucketV1,
  Ds4MultichannelCanonicalizeResultV1,
} from './ds4-powertrain-demand-multichannel-canonicalize.v1';
import { splitMultichannelSequences } from './ds4-powertrain-demand-multichannel-canonicalize.v1';
import type {
  Ds4KickdownCandidateClassification,
  Ds4KickdownCandidateSupportTier,
  Ds4KickdownLikeCandidateV1,
} from './ds4-powertrain-demand-research.contract.v1';
import { resolveKickdownCandidateSupportTier } from './ds4-powertrain-demand-movement-coverage.v1';
import { DS4_KICKDOWN_BUCKET_GRID_RESEARCH_POLICY_VERSION } from './ds4-powertrain-demand-research.contract.v1';

/** P38 v1 thresholds — read-only ownership reference. */
const T = {
  prevThrottleMaxPct: KICKDOWN_LIKE_SHADOW_POLICY.prevThrottleMaxPct,
  entryThrottleMinPct: KICKDOWN_LIKE_SHADOW_POLICY.entryThrottleMinPct,
  minThrottleRisePct: KICKDOWN_LIKE_SHADOW_POLICY.minThrottleRisePct,
  minInMotionSpeedKmh: KICKDOWN_LIKE_SHADOW_POLICY.minInMotionSpeedKmh,
  minRpmRise: KICKDOWN_LIKE_SHADOW_POLICY.minRpmRise,
  minSpeedRiseKmh: KICKDOWN_LIKE_SHADOW_POLICY.minSpeedRiseKmh,
  minEngineLoadPct: KICKDOWN_LIKE_SHADOW_POLICY.minEngineLoadPct,
} as const;

export const DS4_KICKDOWN_BUCKET_GRID_POLICY = {
  version: DS4_KICKDOWN_BUCKET_GRID_RESEARCH_POLICY_VERSION,
  ...T,
  minEligibleObservations: 8,
  r1MinRequiredChannelCoverage: 0.7,
  windowBuckets: 3,
} as const;

type RawWindow = {
  startIdx: number;
  endIdx: number;
  peakThrottlePct: number;
  classification: Ds4KickdownCandidateClassification;
  rpmRiseLabelDelta: number | null;
  speedRiseLabelDelta: number | null;
  peakEngineLoadPct: number | null;
  peakThrottleBucketIndexDeltaFromPeakRpm: number | null;
  limitationCodes: string[];
  channelPresence: Record<string, boolean>;
};

function windowBucketsConsecutive(
  seq: readonly Ds4CanonicalMultichannelBucketV1[],
  i: number,
  nominalIntervalMs: number,
): boolean {
  if (i < 2) return false;
  const b0 = seq[i - 2]!;
  const b1 = seq[i - 1]!;
  const b2 = seq[i]!;
  const maxGap = nominalIntervalMs * 1.5;
  if (b1.recordedAtMs - b0.recordedAtMs > maxGap) return false;
  if (b2.recordedAtMs - b1.recordedAtMs > maxGap) return false;
  return true;
}

function bucketsToIceSamples(slice: readonly Ds4CanonicalMultichannelBucketV1[]): ShadowDetectorHfSample[] {
  return slice.map((b) => ({
    timestamp: b.recordedAtIso,
    speedKmh: b.speedKmh,
    coolantC: b.coolantC,
    rpm: b.rpm,
    throttlePct: b.throttlePct,
    loadPct: b.loadPct,
    engineRuntimeSec: null,
    torqueNm: null,
    torquePct: null,
    exteriorTempC: null,
    tractionBatteryPowerKw: null,
    socPct: null,
    tractionBatteryTemperatureC: null,
    altitudeM: null,
    gear: null,
    ignitionOn: null,
  }));
}

function detectRawWindowsInSequence(
  seq: readonly Ds4CanonicalMultichannelBucketV1[],
  nominalIntervalMs: number,
  fuelType: string | null,
): RawWindow[] {
  const out: RawWindow[] = [];
  for (let i = 2; i < seq.length; i += 1) {
    if (!windowBucketsConsecutive(seq, i, nominalIntervalMs)) continue;

    const prev = seq[i - 2]!;
    const cur = seq[i]!;
    const slice = [seq[i - 2]!, seq[i - 1]!, seq[i]!];

    if (isPhevFuelType(fuelType)) {
      const ice = confirmIceOperation(bucketsToIceSamples(slice));
      if (!ice.confirmed) continue;
    }

    const limitations: string[] = [];
    const presence = {
      throttle: slice.every((b) => b.throttlePct != null),
      speed: slice.every((b) => b.speedKmh != null),
      rpm: slice.every((b) => b.rpm != null),
      load: slice.every((b) => b.loadPct != null),
    };

    if (!presence.throttle || !presence.speed) {
      continue;
    }

    const prevThr = prev.throttlePct!;
    const curThr = cur.throttlePct!;
    if (prevThr > T.prevThrottleMaxPct) continue;
    if (curThr < T.entryThrottleMinPct) continue;
    const throttleRise = curThr - prevThr;
    if (throttleRise < T.minThrottleRisePct) continue;
    if ((prev.speedKmh ?? 0) < T.minInMotionSpeedKmh) continue;

    const peakSpeed = Math.max(...slice.map((b) => b.speedKmh ?? 0));
    const speedRise = peakSpeed - (prev.speedKmh ?? 0);
    if (speedRise < T.minSpeedRiseKmh) continue;

    let classification: Ds4KickdownCandidateClassification = 'THROTTLE_STEP_OBSERVED';

    if (!presence.rpm) {
      limitations.push('RPM_CHANNEL_MISSING');
      out.push({
        startIdx: prev.bucketIndex,
        endIdx: cur.bucketIndex,
        peakThrottlePct: Math.max(...slice.map((b) => b.throttlePct ?? 0)),
        classification,
        rpmRiseLabelDelta: null,
        speedRiseLabelDelta: speedRise,
        peakEngineLoadPct: null,
        peakThrottleBucketIndexDeltaFromPeakRpm: null,
        limitationCodes: limitations,
        channelPresence: presence,
      });
      continue;
    }

    const rpmStart = prev.rpm ?? 0;
    const peakRpm = Math.max(...slice.map((b) => b.rpm ?? 0));
    const rpmRise = peakRpm - rpmStart;
    if (rpmRise < T.minRpmRise) continue;

    if (!presence.load) {
      limitations.push('LOAD_CHANNEL_MISSING');
      continue;
    }
    const peakLoad = Math.max(...slice.map((b) => b.loadPct ?? 0));
    if (peakLoad < T.minEngineLoadPct) continue;

    classification = 'KICKDOWN_LIKE_PROXY_CANDIDATE';

    let idxDelta: number | null = null;
    let peakThrLocal = 0;
    let peakThrIdx = 0;
    let peakRpmLocal = 0;
    let peakRpmIdx = 0;
    for (let j = 0; j < slice.length; j += 1) {
      const thr = slice[j]!.throttlePct ?? 0;
      const rpm = slice[j]!.rpm ?? 0;
      if (thr > peakThrLocal) {
        peakThrLocal = thr;
        peakThrIdx = j;
      }
      if (rpm > peakRpmLocal) {
        peakRpmLocal = rpm;
        peakRpmIdx = j;
      }
    }
    idxDelta = Math.abs(peakRpmIdx - peakThrIdx);

    out.push({
      startIdx: prev.bucketIndex,
      endIdx: cur.bucketIndex,
      peakThrottlePct: peakThrLocal,
      classification,
      rpmRiseLabelDelta: rpmRise,
      speedRiseLabelDelta: speedRise,
      peakEngineLoadPct: peakLoad,
      peakThrottleBucketIndexDeltaFromPeakRpm: idxDelta,
      limitationCodes: limitations,
      channelPresence: presence,
    });
  }
  return out;
}

function dedupeByBucketIndex(raw: RawWindow[]): RawWindow[] {
  if (raw.length <= 1) return raw;
  const sorted = [...raw].sort((a, b) => a.startIdx - b.startIdx);
  const out: RawWindow[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = out[out.length - 1]!;
    const cur = sorted[i]!;
    const overlaps = !(prev.endIdx < cur.startIdx || cur.endIdx < prev.startIdx);
    if (overlaps) {
      if (cur.peakThrottlePct > prev.peakThrottlePct) {
        out[out.length - 1] = cur;
      }
    } else {
      out.push(cur);
    }
  }
  return out;
}

export function detectKickdownBucketGridCandidates(input: {
  tripId: string;
  providerSourceLinkId: string;
  canon: Ds4MultichannelCanonicalizeResultV1;
  sequenceMaxGapSeconds: number;
  nominalCadenceMs: number;
  movementObservedCompleteness: number;
  r1HistoricalObdRecordTimeUncertain: boolean;
  fuelType: string | null;
}): {
  rawWindowCount: number;
  candidates: Ds4KickdownLikeCandidateV1[];
} {
  const sequences = splitMultichannelSequences(
    input.canon.buckets,
    input.sequenceMaxGapSeconds,
  );
  const nominalIntervalMs = input.nominalCadenceMs > 0 ? input.nominalCadenceMs : 1000;
  const rawAll: RawWindow[] = [];
  for (const seq of sequences) {
    rawAll.push(...detectRawWindowsInSequence(seq, nominalIntervalMs, input.fuelType));
  }
  const deduped = dedupeByBucketIndex(rawAll);
  const bucketByIndex = new Map(input.canon.buckets.map((b) => [b.bucketIndex, b]));

  const candidates: Ds4KickdownLikeCandidateV1[] = deduped.map((w) => {
    const start = bucketByIndex.get(w.startIdx);
    const end = bucketByIndex.get(w.endIdx);
    const startIso = start?.recordedAtIso ?? '';
    const endIso = end?.recordedAtIso ?? '';
    const episodeKey = [
      input.tripId,
      input.providerSourceLinkId,
      'KICKDOWN_LIKE_PROXY',
      DS4_KICKDOWN_BUCKET_GRID_POLICY.version,
      startIso,
      endIso,
    ].join('|');
    const throttleRise =
      start != null && end != null
        ? (end.throttlePct ?? 0) - (start.throttlePct ?? 0)
        : 0;
    return {
      episodeKey,
      classification: w.classification,
      candidateSupportTier: resolveKickdownCandidateSupportTier({
        classification: w.classification,
        movementObservedCompleteness: input.movementObservedCompleteness,
        r1Historical: input.r1HistoricalObdRecordTimeUncertain,
      }),
      providerBucketLabelStartIso: startIso,
      providerBucketLabelEndIso: endIso,
      startBucketIndex: w.startIdx,
      endBucketIndex: w.endIdx,
      observedBucketSpanCount: w.endIdx - w.startIdx + 1,
      peakThrottlePct: w.peakThrottlePct,
      throttleRisePct: throttleRise,
      rpmRiseLabelDelta: w.rpmRiseLabelDelta,
      speedRiseLabelDelta: w.speedRiseLabelDelta,
      peakEngineLoadPct: w.peakEngineLoadPct,
      requiredChannelPresence: w.channelPresence,
      peakThrottleBucketIndexDeltaFromPeakRpm: w.peakThrottleBucketIndexDeltaFromPeakRpm,
      limitationCodes: w.limitationCodes,
    };
  });

  return { rawWindowCount: rawAll.length, candidates };
}
