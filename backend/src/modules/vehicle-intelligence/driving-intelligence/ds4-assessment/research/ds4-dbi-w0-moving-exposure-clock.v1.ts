/**
 * DS4 DBI W0 — B3 moving-exposure clock + event admission (research only).
 * Contract: DS4_DBI_W0_F01_B3_MOVING_EXPOSURE_CLOCK_CONTRACT_V1 (v1.1)
 */

import type { DiV0MotionCoreShadowPayloadV1 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import { parseBucketLabelMs } from '../../core/kinematics/motion-core-grid';
import {
  buildDs4EligibleExposureTimelineV1,
  ds4MovingExposureMetadataEpsilonV1,
  type Ds4EligibleExposureHalfOpenIntervalV1,
} from '../ds4-assessment-driving-exposure.v1';
import type { Ds4SpeedAuthorityPartitionV1 } from '../ds4-trip-assessment-v1.contract';
import {
  DS4_ASSESSMENT_DRIVING_EXPOSURE_PROVENANCE_V2,
} from '../ds4-assessment-driving-exposure.v1';
import {
  DS4_DBI_W0_RESEARCH_THRESHOLDS_V1,
  type Ds4DbiW0DualTimeDomainDiagnosticsV1,
  type Ds4DbiW0MbfReasonCodeV1,
} from './ds4-dbi-w0-mbf.types.v1';

export type Ds4DbiW0EventMappingExclusionReasonV1 =
  | 'MBF_W0_EVENT_QUALITY_NOT_OK_FOR_D8'
  | 'MBF_W0_EVENT_START_OUTSIDE_MOVING_DIRECT_SUPPORT'
  | 'MBF_W0_EVENT_START_IN_EXCLUDED_GAP'
  | 'MBF_W0_EVENT_START_ON_INTERVAL_UPPER_BOUNDARY'
  | 'MBF_W0_EVENT_START_OUTSIDE_MOVING_EXPOSURE_HORIZON'
  | 'MBF_W0_FAIL_CLOSED_EVENT_VALIDATION';

export type Ds4DbiW0AdmittedEventOnsetV1 = {
  startLabel: string;
  startMsUtc: number;
  tauSeconds: number;
};

export function resolveW0SpeedAuthorityPartitionV1(
  payload: DiV0MotionCoreShadowPayloadV1,
): Ds4SpeedAuthorityPartitionV1 | null {
  const s = payload.contract.speedAuthority;
  if (s === 'C4_ONLY' || s === 'C5_1_PREFERRED') {
    return s;
  }
  return null;
}

export function mapUtcMsToMovingExposureTauSecondsV1(
  tMs: number,
  intervals: readonly Ds4EligibleExposureHalfOpenIntervalV1[],
): number | null {
  if (!Number.isFinite(tMs)) {
    return null;
  }
  for (const iv of intervals) {
    if (tMs >= iv.startMsUtc && tMs < iv.endMsUtc) {
      return iv.tauStartSeconds + (tMs - iv.startMsUtc) / 1000;
    }
  }
  return null;
}

export function mapMovingExposureTauSecondsToUtcMsV1(
  tauSeconds: number,
  intervals: readonly Ds4EligibleExposureHalfOpenIntervalV1[],
  movingExposureSeconds: number,
): number | null {
  if (!Number.isFinite(tauSeconds) || tauSeconds < 0 || tauSeconds >= movingExposureSeconds) {
    return null;
  }
  for (const iv of intervals) {
    const tauEnd = iv.tauStartSeconds + iv.durationSeconds;
    if (tauSeconds >= iv.tauStartSeconds && tauSeconds < tauEnd) {
      const dt = tauSeconds - iv.tauStartSeconds;
      return iv.startMsUtc + Math.round(dt * 1000);
    }
  }
  return null;
}

function msToIsoZ(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function buildDs4DbiW0MovingExposureClockEvidenceV1(input: {
  payload: DiV0MotionCoreShadowPayloadV1;
  suppliedExposureSecondsEs: number | null;
  /**
   * Research-only override when historical bytes omit `contract.speedAuthority`.
   * Production W0 kernel must never pass this; canonical MBF keeps fail-closed D8.
   */
  researchSpeedAuthorityPartitionOverride?: Ds4SpeedAuthorityPartitionV1 | null;
}): {
  dualTime: Ds4DbiW0DualTimeDomainDiagnosticsV1;
  intervals: Ds4EligibleExposureHalfOpenIntervalV1[];
  movingExposureSeconds: number;
  derivable: boolean;
  metadataMismatch: boolean;
  admitted: Ds4DbiW0AdmittedEventOnsetV1[];
} {
  const speedAuthority =
    input.researchSpeedAuthorityPartitionOverride !== undefined
      ? input.researchSpeedAuthorityPartitionOverride
      : resolveW0SpeedAuthorityPartitionV1(input.payload);
  const { exposure, intervals, acceptedSpeedLabelsUtc } = buildDs4EligibleExposureTimelineV1({
    payload: input.payload,
    speedAuthority,
  });

  const eStar = exposure.derivable ? exposure.exposureSeconds : 0;
  const supplied = input.suppliedExposureSecondsEs;
  const epsilon =
    supplied != null && Number.isFinite(supplied)
      ? ds4MovingExposureMetadataEpsilonV1(eStar, supplied)
      : 0;
  const metadataMismatch =
    exposure.derivable &&
    supplied != null &&
    Number.isFinite(supplied) &&
    Math.abs(eStar - supplied) > epsilon;

  let wallStart: string | null = null;
  let wallEnd: string | null = null;
  let elapsedWall: number | null = null;
  if (acceptedSpeedLabelsUtc.length >= 1) {
    const t0 = parseBucketLabelMs(acceptedSpeedLabelsUtc[0]!);
    const tN = parseBucketLabelMs(acceptedSpeedLabelsUtc[acceptedSpeedLabelsUtc.length - 1]!);
    wallStart = msToIsoZ(t0);
    wallEnd = msToIsoZ(tN);
    elapsedWall = (tN - t0) / 1000;
  }

  const exclusionCodes: string[] = [];
  const admitted: Ds4DbiW0AdmittedEventOnsetV1[] = [];
  let excludedCount = 0;

  for (const ev of input.payload.events) {
    if (ev.quality !== 'OK') {
      excludedCount += 1;
      if (!exclusionCodes.includes('MBF_W0_EVENT_QUALITY_NOT_OK_FOR_D8')) {
        exclusionCodes.push('MBF_W0_EVENT_QUALITY_NOT_OK_FOR_D8');
      }
      continue;
    }
    const tMs = parseBucketLabelMs(ev.startLabel);
    if (!Number.isFinite(tMs)) {
      excludedCount += 1;
      exclusionCodes.push('MBF_W0_FAIL_CLOSED_EVENT_VALIDATION');
      continue;
    }
    const tau = mapUtcMsToMovingExposureTauSecondsV1(tMs, intervals);
    if (tau == null) {
      excludedCount += 1;
      const last = intervals[intervals.length - 1];
      if (last && tMs === last.endMsUtc) {
        if (!exclusionCodes.includes('MBF_W0_EVENT_START_ON_INTERVAL_UPPER_BOUNDARY')) {
          exclusionCodes.push('MBF_W0_EVENT_START_ON_INTERVAL_UPPER_BOUNDARY');
        }
      } else if (!exclusionCodes.includes('MBF_W0_EVENT_START_OUTSIDE_MOVING_DIRECT_SUPPORT')) {
        exclusionCodes.push('MBF_W0_EVENT_START_OUTSIDE_MOVING_DIRECT_SUPPORT');
      }
      continue;
    }
    if (tau < 0 || tau >= eStar) {
      excludedCount += 1;
      if (!exclusionCodes.includes('MBF_W0_EVENT_START_OUTSIDE_MOVING_EXPOSURE_HORIZON')) {
        exclusionCodes.push('MBF_W0_EVENT_START_OUTSIDE_MOVING_EXPOSURE_HORIZON');
      }
      continue;
    }
    admitted.push({ startLabel: ev.startLabel, startMsUtc: tMs, tauSeconds: tau });
  }

  const dualTime: Ds4DbiW0DualTimeDomainDiagnosticsV1 = {
    clockDomain: 'MOVING_EXPOSURE_PRIMARY',
    wallClockStartUtc: wallStart,
    wallClockEndUtc: wallEnd,
    elapsedWallClockSeconds: elapsedWall,
    movingExposureSeconds: eStar,
    movingExposureSecondsRecomputed: eStar,
    movingExposureMetadataSupplied: supplied,
    movingExposureMetadataMismatch: metadataMismatch,
    qualifyingIntervalCount: exposure.provenance.qualifyingIntervalCount,
    excludedGapCount: exposure.provenance.excludedGapIntervalCount,
    admittedEventCount: admitted.length,
    excludedEventCount: excludedCount,
    eventMappingReasonCodes: exclusionCodes,
    exposureProvenanceVersion: DS4_ASSESSMENT_DRIVING_EXPOSURE_PROVENANCE_V2,
  };

  return {
    dualTime,
    intervals,
    movingExposureSeconds: eStar,
    derivable: exposure.derivable,
    metadataMismatch,
    admitted,
  };
}

export type Ds4DbiW0D8TauNativeStatisticalResultV1 = {
  status: 'KNOWN' | 'ABSTAIN';
  indexOfDispersion: number | null;
  shareNextEventWithin30s: number | null;
  windowCount: number | null;
  nonEmptyWindowCount: number | null;
  emptyWindowCount: number | null;
  totalWindowSlots: number | null;
  eventCount: number | null;
  observationWindowStartMsUtc: number | null;
  observationWindowEndMsUtc: number | null;
  observationWindowDurationSeconds: number | null;
  finalBinWidthExposureSeconds: number | null;
  reasonCodes: Ds4DbiW0MbfReasonCodeV1[];
  admittedTauOnsetCount: number;
};

/**
 * Pure τ-native D8 statistical core (E9 / contract U5). No UTC labels required.
 */
export function computeDs4DbiW0D8FromTauOnsetsV1(input: {
  movingExposureSeconds: number;
  tauOnsetsSeconds: readonly number[];
  derivable?: boolean;
  metadataMismatch?: boolean;
  failClosedTrip?: boolean;
}): Ds4DbiW0D8TauNativeStatisticalResultV1 {
  if (input.failClosedTrip) {
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
      admittedTauOnsetCount: 0,
    };
  }

  const eStar = input.movingExposureSeconds;
  const admittedTau = input.tauOnsetsSeconds.filter(
    (tau) => Number.isFinite(tau) && tau >= 0 && tau < eStar,
  );
  const nAdm = admittedTau.length;
  const windowS = DS4_DBI_W0_RESEARCH_THRESHOLDS_V1.burstWindowSeconds;
  const reasonCodes: Ds4DbiW0MbfReasonCodeV1[] = [];
  const derivable = input.derivable !== false;

  if (!derivable || eStar <= 0) {
    const r = abstainD8(reasonCodes, ['MBF_W0_NOT_EVALUABLE_D8_OBSERVATION_WINDOW'], nAdm, null, null, null);
    return { ...r, admittedTauOnsetCount: nAdm };
  }

  if (input.metadataMismatch) {
    const r = abstainD8(reasonCodes, ['MBF_W0_MOVING_EXPOSURE_METADATA_MISMATCH'], nAdm, null, eStar, null);
    return { ...r, admittedTauOnsetCount: nAdm };
  }

  if (eStar < windowS) {
    const r = abstainD8(reasonCodes, ['MBF_W0_NOT_EVALUABLE_D8_OBSERVATION_WINDOW'], nAdm, null, eStar, null);
    return { ...r, admittedTauOnsetCount: nAdm };
  }

  if (nAdm < DS4_DBI_W0_RESEARCH_THRESHOLDS_V1.minEventsD8) {
    const r = abstainD8(reasonCodes, ['MBF_W0_INSUFFICIENT_EVENTS_FOR_BURSTINESS'], nAdm, null, eStar, null);
    return { ...r, admittedTauOnsetCount: nAdm };
  }

  const totalWindowSlots = Math.max(1, Math.ceil(eStar / windowS));
  const finalBinWidth = eStar - (totalWindowSlots - 1) * windowS;
  const counts = new Array<number>(totalWindowSlots).fill(0);

  for (const tau of admittedTau) {
    const w = Math.floor(tau / windowS);
    const wi = Math.min(Math.max(w, 0), totalWindowSlots - 1);
    counts[wi]! += 1;
  }

  const nonEmpty = counts.filter((c) => c > 0).length;
  const emptyWindowCount = counts.filter((c) => c === 0).length;

  if (nonEmpty < DS4_DBI_W0_RESEARCH_THRESHOLDS_V1.minNonEmptyWindowsD8) {
    return {
      status: 'ABSTAIN',
      indexOfDispersion: null,
      shareNextEventWithin30s: null,
      windowCount: nonEmpty,
      nonEmptyWindowCount: nonEmpty,
      emptyWindowCount,
      totalWindowSlots,
      eventCount: nAdm,
      observationWindowStartMsUtc: 0,
      observationWindowEndMsUtc: null,
      observationWindowDurationSeconds: eStar,
      finalBinWidthExposureSeconds: finalBinWidth,
      reasonCodes: ['MBF_W0_INSUFFICIENT_WINDOWS_FOR_BURSTINESS'],
      admittedTauOnsetCount: nAdm,
    };
  }

  let sumSq = 0;
  for (const c of counts) {
    sumSq += c * c;
  }
  const mean = nAdm / totalWindowSlots;
  const variance =
    totalWindowSlots > 1 ? (sumSq - (nAdm * nAdm) / totalWindowSlots) / (totalWindowSlots - 1) : 0;
  const iod = mean > 0 ? variance / mean : null;

  const sortedTau = [...admittedTau].sort((a, b) => a - b);
  const shareThresholdTau = DS4_DBI_W0_RESEARCH_THRESHOLDS_V1.burstNextEventMaxSeconds;
  let within = 0;
  for (let i = 1; i < sortedTau.length; i += 1) {
    if (sortedTau[i]! - sortedTau[i - 1]! <= shareThresholdTau) {
      within += 1;
    }
  }
  const shareNext = sortedTau.length > 1 ? within / (sortedTau.length - 1) : null;

  return {
    status: 'KNOWN',
    indexOfDispersion: iod,
    shareNextEventWithin30s: shareNext,
    windowCount: totalWindowSlots,
    nonEmptyWindowCount: nonEmpty,
    emptyWindowCount,
    totalWindowSlots,
    eventCount: nAdm,
    observationWindowStartMsUtc: 0,
    observationWindowEndMsUtc: null,
    observationWindowDurationSeconds: eStar,
    finalBinWidthExposureSeconds: finalBinWidth,
    reasonCodes: ['MBF_W0_OK'],
    admittedTauOnsetCount: nAdm,
  };
}

export function computeDs4DbiW0D8BurstinessTauNativeV1(input: {
  clock: ReturnType<typeof buildDs4DbiW0MovingExposureClockEvidenceV1>;
  tripMetaSuppliedEs: number | null;
  failClosedTrip: boolean;
}): Ds4DbiW0D8TauNativeStatisticalResultV1 {
  const core = computeDs4DbiW0D8FromTauOnsetsV1({
    movingExposureSeconds: input.clock.movingExposureSeconds,
    tauOnsetsSeconds: input.clock.admitted.map((a) => a.tauSeconds),
    derivable: input.clock.derivable,
    metadataMismatch: input.clock.metadataMismatch,
    failClosedTrip: input.failClosedTrip,
  });
  const wallStart =
    input.clock.dualTime.wallClockStartUtc != null
      ? parseBucketLabelMs(input.clock.dualTime.wallClockStartUtc)
      : null;
  return { ...core, observationWindowStartMsUtc: wallStart };
}

function abstainD8(
  reasonCodes: Ds4DbiW0MbfReasonCodeV1[],
  add: Ds4DbiW0MbfReasonCodeV1[],
  nAdm: number,
  totalWindowSlots: number | null,
  eStar: number | null,
  finalBin: number | null,
) {
  return {
    status: 'ABSTAIN' as const,
    indexOfDispersion: null,
    shareNextEventWithin30s: null,
    windowCount: null,
    nonEmptyWindowCount: null,
    emptyWindowCount: null,
    totalWindowSlots,
    eventCount: nAdm,
    observationWindowStartMsUtc: null,
    observationWindowEndMsUtc: null,
    observationWindowDurationSeconds: eStar,
    finalBinWidthExposureSeconds: finalBin,
    reasonCodes: [...reasonCodes, ...add],
  };
}

export function exposureBinWidthsSecondsV1(eStar: number, windowS = 60): number[] {
  const k = Math.max(1, Math.ceil(eStar / windowS));
  const widths: number[] = [];
  for (let i = 0; i < k; i += 1) {
    if (i < k - 1) {
      widths.push(windowS);
    } else {
      widths.push(eStar - (k - 1) * windowS);
    }
  }
  return widths;
}
