/**
 * E9 τ-native null Monte Carlo — research only (F01 B3 / U5).
 * Evaluates D8 directly from sampled τ onsets without UTC label quantization.
 */

import {
  computeDs4DbiW0D8FromTauOnsetsV1,
  exposureBinWidthsSecondsV1,
  mapMovingExposureTauSecondsToUtcMsV1,
  mapUtcMsToMovingExposureTauSecondsV1,
  type Ds4DbiW0D8TauNativeStatisticalResultV1,
} from './ds4-dbi-w0-moving-exposure-clock.v1';
import type { Ds4EligibleExposureHalfOpenIntervalV1 } from '../ds4-assessment-driving-exposure.v1';

export type E9TauNativeDrawRecordV1 = {
  seed: number;
  tauOnsetsSeconds: number[];
  admittedTauOnsetCount: number;
  d8Status: 'KNOWN' | 'ABSTAIN';
  d8ReasonCodes: readonly string[];
  indexOfDispersion: number | null;
};

export type E9TauNativeMonteCarloResultV1 = {
  movingExposureSeconds: number;
  exposureBinWidthsSeconds: number[];
  totalDraws: number;
  acceptedCount: number;
  abstainedCount: number;
  drawRecords: E9TauNativeDrawRecordV1[];
  acceptedIOD: number[];
  meanIodAcceptedOnly: number | null;
};

export function runE9TauNativeMonteCarloV1(input: {
  movingExposureSeconds: number;
  draws: number;
  seedStrideStart: number;
  nEv: number;
  sampleTauSeconds: (n: number, eStar: number, seed: number) => number[];
  metadataMismatch?: boolean;
}): E9TauNativeMonteCarloResultV1 {
  const binWidths = exposureBinWidthsSecondsV1(input.movingExposureSeconds, 60);
  const records: E9TauNativeDrawRecordV1[] = [];
  const acceptedIOD: number[] = [];
  let acceptedCount = 0;
  let abstainedCount = 0;

  for (let k = 0; k < input.draws; k += 1) {
    const seed = input.seedStrideStart + k;
    const tauOnsets = input.sampleTauSeconds(input.nEv, input.movingExposureSeconds, seed);
    const d8 = computeDs4DbiW0D8FromTauOnsetsV1({
      movingExposureSeconds: input.movingExposureSeconds,
      tauOnsetsSeconds: tauOnsets,
      derivable: input.movingExposureSeconds > 0,
      metadataMismatch: input.metadataMismatch ?? false,
    });
    records.push({
      seed,
      tauOnsetsSeconds: [...tauOnsets],
      admittedTauOnsetCount: d8.admittedTauOnsetCount,
      d8Status: d8.status,
      d8ReasonCodes: [...d8.reasonCodes],
      indexOfDispersion: d8.indexOfDispersion,
    });
    if (d8.status === 'KNOWN' && d8.indexOfDispersion != null && Number.isFinite(d8.indexOfDispersion)) {
      acceptedIOD.push(d8.indexOfDispersion);
      acceptedCount += 1;
    } else {
      abstainedCount += 1;
    }
  }

  return {
    movingExposureSeconds: input.movingExposureSeconds,
    exposureBinWidthsSeconds: binWidths,
    totalDraws: input.draws,
    acceptedCount,
    abstainedCount,
    drawRecords: records,
    acceptedIOD,
    meanIodAcceptedOnly: acceptedIOD.length > 0 ? acceptedIOD.reduce((a, b) => a + b, 0) / acceptedIOD.length : null,
  };
}

/** Legacy UTC roundtrip path for contrast tests only (quantizes via 1 Hz labels). */
export function evaluateD8ViaUtcRoundtripFromTauDrawsV1(input: {
  movingExposureSeconds: number;
  tauOnsetsSeconds: readonly number[];
  intervals: readonly Ds4EligibleExposureHalfOpenIntervalV1[];
  metadataMismatch?: boolean;
}): {
  d8: Ds4DbiW0D8TauNativeStatisticalResultV1;
  roundtripTauOnsets: number[];
  tauDrawCount: number;
} {
  const roundtripTauOnsets: number[] = [];
  for (const tau of input.tauOnsetsSeconds) {
    const ms = mapMovingExposureTauSecondsToUtcMsV1(tau, input.intervals, input.movingExposureSeconds);
    if (ms == null) {
      continue;
    }
    const iso = new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const ms2 = Date.parse(iso);
    const tau2 = mapUtcMsToMovingExposureTauSecondsV1(ms2, input.intervals);
    if (tau2 != null) {
      roundtripTauOnsets.push(tau2);
    }
  }
  const d8 = computeDs4DbiW0D8FromTauOnsetsV1({
    movingExposureSeconds: input.movingExposureSeconds,
    tauOnsetsSeconds: roundtripTauOnsets,
    metadataMismatch: input.metadataMismatch ?? false,
  });
  return {
    d8,
    roundtripTauOnsets,
    tauDrawCount: input.tauOnsetsSeconds.length,
  };
}

export function buildE9B3ReferenceSnapshotV1(input: {
  eStar: number;
  seed: number;
  nEv: number;
  sampleTauSeconds: (n: number, eStar: number, seed: number) => number[];
}): {
  referenceSeed: number;
  tauOnsetsSeconds: number[];
  d8: Ds4DbiW0D8TauNativeStatisticalResultV1;
  binWidthsSeconds: number[];
  note: string;
} {
  const tauOnsets = input.sampleTauSeconds(input.nEv, input.eStar, input.seed);
  const d8 = computeDs4DbiW0D8FromTauOnsetsV1({
    movingExposureSeconds: input.eStar,
    tauOnsetsSeconds: tauOnsets,
  });
  return {
    referenceSeed: input.seed,
    tauOnsetsSeconds: tauOnsets,
    d8,
    binWidthsSeconds: exposureBinWidthsSecondsV1(input.eStar, 60),
    note: 'Reproducible B3 τ-native reference for reporting only — not scientific validation.',
  };
}
