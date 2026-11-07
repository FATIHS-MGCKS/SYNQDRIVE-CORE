import type { DiV0MotionCoreShadowPayloadV1 } from '../../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import {
  buildDs4DbiW0MovingExposureClockEvidenceV1,
  computeDs4DbiW0D8BurstinessTauNativeV1,
  mapUtcMsToMovingExposureTauSecondsV1,
} from '../ds4-dbi-w0-moving-exposure-clock.v1';
import {
  computeDs4DbiW0D8BurstinessFromObservationWindowV1,
  computeDs4DbiW0MbfFromPayloadV1,
} from '../ds4-dbi-w0-mbf-kernel.v1';
import { deriveDs4DrivingExposureV1 } from '../../ds4-assessment-driving-exposure.v1';

function baseContract(): DiV0MotionCoreShadowPayloadV1['contract'] {
  return {
    algorithmVersions: {
      c4: 't',
      c5_1: null,
      c5_1ProductionSafety: null,
      c5_1AlgorithmFileSha256: null,
      fsm: 't',
      gapBridgeV1: null,
      fsmAuxBinding: null,
      events: 't',
      bundle: 'TV_BUNDLE',
    },
    speedAuthority: 'C4_ONLY',
    timeSemantics: {
      processingMode: 'POST_TRIP_RETROSPECTIVE',
      c4ValueSupportForwardS: 1,
      c4FullFinalizationForwardS: 1,
      fsmMode: 'RETROSPECTIVE',
      eventFinalizationNote: 't',
      computedAtUtc: '2026-01-01T00:00:00Z',
    },
    sparse: { channelOutcome: null, comparable: true, sampleCount: 0, samples: [], limitations: [] },
    comparisonHints: {
      artefactSuspectExcludedFromAcceptedManoeuvreCounts: true,
      inferredNeverPromotedToDirect: true,
      unknownNotCountedAsConfirmedStandstill: true,
    },
  };
}

function mkMovingBlock(
  t0ms: number,
  count: number,
  fsm: 'MOVING' | 'STATIONARY' = 'MOVING',
): Pick<DiV0MotionCoreShadowPayloadV1, 'speeds' | 'fsmLabels'> {
  const speeds: DiV0MotionCoreShadowPayloadV1['speeds'] = [];
  const fsmLabels: DiV0MotionCoreShadowPayloadV1['fsmLabels'] = [];
  for (let i = 0; i < count; i += 1) {
    const lab = new Date(t0ms + i * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    speeds.push({
      bucketLabelUtc: lab,
      speedKmh: 40,
      quality: 'OK',
      support: [],
      estimator: 't',
      flags: [],
    });
    fsmLabels.push({
      bucketLabelUtc: lab,
      state: fsm,
      evidenceQuality: 'DIRECT',
      reason: 't',
      flags: [],
    });
  }
  return { speeds, fsmLabels };
}

function concatSeries(
  a: Pick<DiV0MotionCoreShadowPayloadV1, 'speeds' | 'fsmLabels'>,
  b: Pick<DiV0MotionCoreShadowPayloadV1, 'speeds' | 'fsmLabels'>,
): Pick<DiV0MotionCoreShadowPayloadV1, 'speeds' | 'fsmLabels'> {
  return { speeds: [...a.speeds, ...b.speeds], fsmLabels: [...a.fsmLabels, ...b.fsmLabels] };
}

function mkStopEpisodes(t0ms: number) {
  return [
    {
      trip: 0,
      mode: 'RETROSPECTIVE' as const,
      startEarliest: new Date(t0ms).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      startLatest: new Date(t0ms).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      endEarliest: new Date(t0ms + 5000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      endLatest: new Date(t0ms + 5000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      minDurationS: 5,
      maxDurationS: 5,
      evidenceQuality: 'DIRECT' as const,
      openEnd: false,
      labels: 5,
      directLabels: 5,
      inferredLabels: 0,
      indeterminateLabels: 0,
      observedLabels: 5,
      gapLabels: 0,
      lastEvidenceLabel: new Date(t0ms + 5000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      observedMinDurationS: 5,
      hysteresisBandLabels: 0,
      firstStationarySource: 'C4_OK' as const,
      firstStationaryC4Quality: 'OK' as const,
    },
  ];
}

function mkPayload(
  speeds: DiV0MotionCoreShadowPayloadV1['speeds'],
  fsmLabels: DiV0MotionCoreShadowPayloadV1['fsmLabels'],
  events: DiV0MotionCoreShadowPayloadV1['events'] = [],
  t0ms = Date.parse('2026-01-01T10:00:00Z'),
): DiV0MotionCoreShadowPayloadV1 {
  return {
    contract: baseContract(),
    speeds,
    fsmLabels,
    stopEpisodes: mkStopEpisodes(t0ms),
    events,
    summary: {
      labelCount: speeds.length,
      speedNumericCount: speeds.length,
      eventCount: events.length,
      eventAcceptedCount: events.filter((e) => e.quality === 'OK').length,
      eventArtefactSuspectCount: 0,
      stopEpisodeCount: 0,
    },
  };
}

function mkOkEvent(startLabel: string) {
  return {
    kind: 'ACCELERATION' as const,
    startLabel,
    endLabel: startLabel,
    startSpeedKmh: 40,
    endSpeedKmh: 41,
    deltaKmh: 1,
    quality: 'OK' as const,
    flags: [],
  };
}

describe('ds4-dbi-w0 F01 B3 test vectors (TV-F01..TV-F11)', () => {
  const tripMetaBase = {
    tripId: 'tv',
    sourceMotionRunId: 'tv-run',
    speedAuthority: 'C4_ONLY',
    shadowBundleVersion: 'x',
    contentFingerprint: 'a'.repeat(64),
    distanceKm: 1,
  };

  it('TV-F01: 720-label D8 KNOWN with 12 τ bins + 200-label D4/D5 baseline', () => {
    const t0ms = Date.parse('2026-01-01T10:00:00Z');
    const d8Block = mkMovingBlock(t0ms, 720);
    const tauEventLabels = [0, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 660].map(
      (s) => new Date(t0ms + s * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    );
    const d8Payload = mkPayload(
      d8Block.speeds,
      d8Block.fsmLabels,
      tauEventLabels.map((l) => mkOkEvent(l)),
    );
    const eStar = 719;
    const d8 = computeDs4DbiW0D8BurstinessFromObservationWindowV1({
      tripMeta: { ...tripMetaBase, exposureSecondsEs: eStar },
      payload: d8Payload,
    });
    expect(d8.status).toBe('KNOWN');
    expect(d8.totalWindowSlots).toBe(12);
    expect(d8.eventCount).toBe(12);
    expect(d8.nonEmptyWindowCount).toBeGreaterThanOrEqual(10);

    const d4Block = mkMovingBlock(t0ms, 200);
    const d4Payload = mkPayload(d4Block.speeds, d4Block.fsmLabels);
    const d4 = computeDs4DbiW0MbfFromPayloadV1({
      payload: d4Payload,
      tripMeta: { ...tripMetaBase, exposureSecondsEs: 199 },
      qualityTier: 'STRICT',
      evidenceOrigin: 'SYNTHETIC_CONTROL',
    });
    expect(d4.d4SpeedVariabilityRobustCv.status).toBe('KNOWN');
    expect(d4.d5SpeedRoughnessMeanAbsDeltaKmhPerS.status).toBe('KNOWN');
  });

  function mkGapSeries(t0ms: number): Pick<DiV0MotionCoreShadowPayloadV1, 'speeds' | 'fsmLabels'> {
    const first = mkMovingBlock(t0ms, 60);
    const second = mkMovingBlock(t0ms + 61_000, 60);
    return concatSeries(first, second);
  }

  it('TV-F03: missing label gap — E*=118, excludedGapCount>=1, tau jump', () => {
    const t0ms = Date.parse('2026-01-01T10:00:00Z');
    const series = mkGapSeries(t0ms);
    const payload = mkPayload(series.speeds, series.fsmLabels);
    const clock = buildDs4DbiW0MovingExposureClockEvidenceV1({ payload, suppliedExposureSecondsEs: 118 });
    expect(clock.movingExposureSeconds).toBe(118);
    expect(clock.dualTime.excludedGapCount).toBeGreaterThanOrEqual(1);
    const tauBeforeGap = mapUtcMsToMovingExposureTauSecondsV1(t0ms + 58_000, clock.intervals);
    const tauAfterGap = mapUtcMsToMovingExposureTauSecondsV1(t0ms + 61_000, clock.intervals);
    expect(tauBeforeGap).toBe(58);
    expect(tauAfterGap).toBe(59);
    expect(mapUtcMsToMovingExposureTauSecondsV1(t0ms + 59_000, clock.intervals)).toBeNull();
    expect(tauAfterGap! - tauBeforeGap!).toBe(1);
  });

  it('TV-F04: nonmoving onset excluded with reason code', () => {
    const t0ms = Date.parse('2026-01-01T10:00:00Z');
    const moving = mkMovingBlock(t0ms, 120);
    for (let i = 50; i <= 55; i += 1) {
      moving.fsmLabels[i] = { ...moving.fsmLabels[i]!, state: 'STATIONARY' };
    }
    const evLab = new Date(t0ms + 52_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const payload = mkPayload(moving.speeds, moving.fsmLabels, [mkOkEvent(evLab)]);
    const clock = buildDs4DbiW0MovingExposureClockEvidenceV1({ payload, suppliedExposureSecondsEs: 119 });
    expect(clock.dualTime.admittedEventCount).toBe(0);
    expect(clock.dualTime.excludedEventCount).toBe(1);
    expect(clock.dualTime.eventMappingReasonCodes).toContain('MBF_W0_EVENT_START_OUTSIDE_MOVING_DIRECT_SUPPORT');
  });

  it('TV-F06: duplicate OK starts fail-closed and mask numerics', () => {
    const t0ms = Date.parse('2026-01-01T10:00:00Z');
    const block = mkMovingBlock(t0ms, 200);
    const dup = block.speeds[10]!.bucketLabelUtc;
    const payload = mkPayload(block.speeds, block.fsmLabels, [mkOkEvent(dup), mkOkEvent(dup)]);
    const r = computeDs4DbiW0MbfFromPayloadV1({
      payload,
      tripMeta: { ...tripMetaBase, exposureSecondsEs: 199 },
      qualityTier: 'STRICT',
      evidenceOrigin: 'SYNTHETIC_CONTROL',
    });
    expect(r.diagnostics.failClosedReasons).toContain('MBF_W0_FAIL_CLOSED_DUPLICATE_EVENT_START_TIME');
    expect(r.d8Burstiness.indexOfDispersion).toBeNull();
    expect(r.d4SpeedVariabilityRobustCv.value).toBeNull();
  });

  it('TV-F08: E*=44 ABSTAIN observation window', () => {
    const t0ms = Date.parse('2026-01-01T10:00:00Z');
    const block = mkMovingBlock(t0ms, 45);
    const events = Array.from({ length: 12 }, (_, j) =>
      mkOkEvent(new Date(t0ms + j * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')),
    );
    const payload = mkPayload(block.speeds, block.fsmLabels, events);
    const d8 = computeDs4DbiW0D8BurstinessFromObservationWindowV1({
      tripMeta: { ...tripMetaBase, exposureSecondsEs: 44 },
      payload,
    });
    expect(d8.status).toBe('ABSTAIN');
    expect(d8.reasonCodes).toContain('MBF_W0_NOT_EVALUABLE_D8_OBSERVATION_WINDOW');
    expect(d8.observationWindowDurationSeconds).toBe(44);
  });

  it('TV-F10: onset in moving admitted despite end in stationary', () => {
    const t0ms = Date.parse('2026-01-01T10:00:00Z');
    const block = mkMovingBlock(t0ms, 120);
    const startLab = block.speeds[10]!.bucketLabelUtc;
    const endLab = new Date(t0ms + 20_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const payload = mkPayload(block.speeds, block.fsmLabels, [
      { ...mkOkEvent(startLab), endLabel: endLab, endSpeedKmh: 0 },
    ]);
    const clock = buildDs4DbiW0MovingExposureClockEvidenceV1({ payload, suppliedExposureSecondsEs: 119 });
    expect(clock.admitted.length).toBe(1);
    expect(clock.admitted[0]!.tauSeconds).toBe(10);
  });

  it('TV-F02: stop-separated E*=118, event in stop excluded', () => {
    const t0ms = Date.parse('2026-01-01T10:00:00Z');
    const series = concatSeries(
      concatSeries(mkMovingBlock(t0ms, 60), mkMovingBlock(t0ms + 60_000, 30, 'STATIONARY')),
      mkMovingBlock(t0ms + 90_000, 60),
    );
    const evLab = new Date(t0ms + 75_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const payload = mkPayload(series.speeds, series.fsmLabels, [mkOkEvent(evLab)]);
    const clock = buildDs4DbiW0MovingExposureClockEvidenceV1({ payload, suppliedExposureSecondsEs: 118 });
    expect(clock.movingExposureSeconds).toBe(118);
    expect(clock.dualTime.elapsedWallClockSeconds).toBe(149);
    expect(clock.dualTime.excludedEventCount).toBe(1);
  });

  it('TV-F05-A/B: shared boundary admit vs terminal upper exclude', () => {
    const t0ms = Date.parse('2026-01-01T10:00:00Z');
    const block = mkMovingBlock(t0ms, 400);
    const payload = mkPayload(block.speeds, block.fsmLabels);
    const clock = buildDs4DbiW0MovingExposureClockEvidenceV1({ payload, suppliedExposureSecondsEs: 399 });
    const boundaryLab = new Date(t0ms + 300_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const tauShared = mapUtcMsToMovingExposureTauSecondsV1(Date.parse(boundaryLab), clock.intervals);
    expect(tauShared).toBe(300);
    const lastEnd = clock.intervals[clock.intervals.length - 1]!.endMsUtc;
    expect(mapUtcMsToMovingExposureTauSecondsV1(lastEnd, clock.intervals)).toBeNull();
  });

  it('TV-F07: metadata mismatch D8 ABSTAIN without D4 fail-close', () => {
    const t0ms = Date.parse('2026-01-01T10:00:00Z');
    const block = mkMovingBlock(t0ms, 720);
    const payload = mkPayload(block.speeds, block.fsmLabels, [mkOkEvent(block.speeds[0]!.bucketLabelUtc)]);
    const r = computeDs4DbiW0MbfFromPayloadV1({
      payload,
      tripMeta: { ...tripMetaBase, exposureSecondsEs: 518 },
      qualityTier: 'STRICT',
      evidenceOrigin: 'SYNTHETIC_CONTROL',
    });
    expect(r.d8Burstiness.status).toBe('ABSTAIN');
    expect(r.d8Burstiness.reasonCodes).toContain('MBF_W0_MOVING_EXPOSURE_METADATA_MISMATCH');
    expect(r.d4SpeedVariabilityRobustCv.status).toBe('KNOWN');
  });

  it('TV-F09: E*=90 ABSTAIN insufficient windows', () => {
    const t0ms = Date.parse('2026-01-01T10:00:00Z');
    const block = mkMovingBlock(t0ms, 91);
    const events = Array.from({ length: 12 }, (_, j) =>
      mkOkEvent(new Date(t0ms + j * 7 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')),
    );
    const payload = mkPayload(block.speeds, block.fsmLabels, events);
    const d8 = computeDs4DbiW0D8BurstinessFromObservationWindowV1({
      tripMeta: { ...tripMetaBase, exposureSecondsEs: 90 },
      payload,
    });
    expect(d8.status).toBe('ABSTAIN');
    expect(d8.reasonCodes).toContain('MBF_W0_INSUFFICIENT_WINDOWS_FOR_BURSTINESS');
    expect(d8.totalWindowSlots).toBe(2);
  });

  it('TV-F11: partial final bin width 5s at E*=665 with partial-bin onset + IOD oracle', () => {
    const t0ms = Date.parse('2026-01-01T10:00:00Z');
    const block = mkMovingBlock(t0ms, 666);
    const tauList = [0, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 640, 662];
    const events = tauList.map((s) =>
      mkOkEvent(new Date(t0ms + s * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')),
    );
    const payload = mkPayload(block.speeds, block.fsmLabels, events);
    const clock = buildDs4DbiW0MovingExposureClockEvidenceV1({ payload, suppliedExposureSecondsEs: 665 });
    const partialTau = mapUtcMsToMovingExposureTauSecondsV1(t0ms + 662_000, clock.intervals);
    expect(partialTau).toBe(662);
    const d8 = computeDs4DbiW0D8BurstinessTauNativeV1({
      clock,
      tripMetaSuppliedEs: 665,
      failClosedTrip: false,
    });
    expect(d8.status).toBe('KNOWN');
    expect(d8.totalWindowSlots).toBe(12);
    expect(d8.finalBinWidthExposureSeconds).toBeCloseTo(5, 5);
    expect(d8.eventCount).toBe(13);
    const n = 13;
    const k = 12;
    const counts = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2];
    const mean = n / k;
    const sumSq = counts.reduce((a, x) => a + x * x, 0);
    const variance = (sumSq - (n * n) / k) / (k - 1);
    expect(d8.indexOfDispersion).toBeCloseTo(variance / mean, 5);
  });

  it('exposure parity: E* matches deriveDs4DrivingExposureV1', () => {
    const t0ms = Date.parse('2026-01-01T10:00:00Z');
    const block = mkMovingBlock(t0ms, 120);
    const payload = mkPayload(block.speeds, block.fsmLabels);
    const canonical = deriveDs4DrivingExposureV1({ payload, speedAuthority: 'C4_ONLY' });
    const clock = buildDs4DbiW0MovingExposureClockEvidenceV1({ payload, suppliedExposureSecondsEs: canonical.exposureSeconds });
    expect(clock.movingExposureSeconds).toBe(canonical.exposureSeconds);
  });
});
