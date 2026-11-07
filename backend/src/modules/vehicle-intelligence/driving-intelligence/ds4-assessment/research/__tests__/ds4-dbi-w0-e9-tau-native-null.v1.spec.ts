import {
  buildDs4DbiW0MovingExposureClockEvidenceV1,
  computeDs4DbiW0D8FromTauOnsetsV1,
  exposureBinWidthsSecondsV1,
} from '../ds4-dbi-w0-moving-exposure-clock.v1';
import {
  evaluateD8ViaUtcRoundtripFromTauDrawsV1,
  runE9TauNativeMonteCarloV1,
} from '../ds4-dbi-w0-e9-tau-native-null.v1';
import type { DiV0MotionCoreShadowPayloadV1 } from '../../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleUniformTau(n: number, eStar: number, seed: number): number[] {
  const rand = mulberry32(seed);
  return Array.from({ length: n }, () => rand() * eStar).sort((a, b) => a - b);
}

function mkContinuousMovingPayload(n: number): DiV0MotionCoreShadowPayloadV1 {
  const t0ms = Date.parse('2026-01-01T10:00:00Z');
  const speeds: DiV0MotionCoreShadowPayloadV1['speeds'] = [];
  const fsm: DiV0MotionCoreShadowPayloadV1['fsmLabels'] = [];
  for (let i = 0; i < n; i += 1) {
    const lab = new Date(t0ms + i * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    speeds.push({ bucketLabelUtc: lab, speedKmh: 40, quality: 'OK', support: [], estimator: 't', flags: [] });
    fsm.push({ bucketLabelUtc: lab, state: 'MOVING', evidenceQuality: 'DIRECT', reason: 't', flags: [] });
  }
  return {
    contract: {
      algorithmVersions: {
        c4: 't',
        c5_1: null,
        c5_1ProductionSafety: null,
        c5_1AlgorithmFileSha256: null,
        fsm: 't',
        gapBridgeV1: null,
        fsmAuxBinding: null,
        events: 't',
        bundle: 'E9',
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
    },
    speeds,
    fsmLabels: fsm,
    stopEpisodes: [],
    events: [],
    summary: {
      labelCount: n,
      speedNumericCount: n,
      eventCount: 0,
      eventAcceptedCount: 0,
      eventArtefactSuspectCount: 0,
      stopEpisodeCount: 0,
    },
  };
}

describe('ds4-dbi-w0-e9-tau-native-null.v1', () => {
  const eStar = 719;

  it('preserves event count and seed reproducibility on [0,E*)', () => {
    const tau = sampleUniformTau(12, eStar, 0xabc);
    const a = runE9TauNativeMonteCarloV1({
      movingExposureSeconds: eStar,
      draws: 3,
      seedStrideStart: 100,
      nEv: 12,
      sampleTauSeconds: sampleUniformTau,
    });
    const b = runE9TauNativeMonteCarloV1({
      movingExposureSeconds: eStar,
      draws: 3,
      seedStrideStart: 100,
      nEv: 12,
      sampleTauSeconds: sampleUniformTau,
    });
    expect(a.drawRecords[0]!.tauOnsetsSeconds.length).toBe(12);
    expect(a.drawRecords[0]!.admittedTauOnsetCount).toBe(12);
    expect(tau.every((t) => t >= 0 && t < eStar)).toBe(true);
    expect(JSON.stringify(a.drawRecords)).toBe(JSON.stringify(b.drawRecords));
  });

  it('partial-bin widths sum to E* and include final second support', () => {
    const widths = exposureBinWidthsSecondsV1(665, 60);
    expect(widths[widths.length - 1]).toBeCloseTo(5, 5);
    expect(widths.reduce((a, w) => a + w, 0)).toBeCloseTo(665, 5);
    const tauNearEnd = 664.999;
    const d8 = computeDs4DbiW0D8FromTauOnsetsV1({
      movingExposureSeconds: 665,
      tauOnsetsSeconds: Array.from({ length: 12 }, (_, i) => (i * 55) % 664.5),
    });
    expect(d8.admittedTauOnsetCount).toBe(12);
  });

  it('quantization: direct τ vs UTC ISO roundtrip differs for fractional onsets', () => {
    const payload = mkContinuousMovingPayload(720);
    const clock = buildDs4DbiW0MovingExposureClockEvidenceV1({ payload, suppliedExposureSecondsEs: eStar });
    const fractionalTau = [10.7, 25.3, 100.9, 200.2, 300.4, 400.6, 450.1, 500.8, 550.2, 600.5, 650.3, 700.15];
    const direct = computeDs4DbiW0D8FromTauOnsetsV1({
      movingExposureSeconds: eStar,
      tauOnsetsSeconds: fractionalTau,
    });
    const roundtrip = evaluateD8ViaUtcRoundtripFromTauDrawsV1({
      movingExposureSeconds: eStar,
      tauOnsetsSeconds: fractionalTau,
      intervals: clock.intervals,
    });
    expect(roundtrip.tauDrawCount).toBe(12);
    expect(roundtrip.roundtripTauOnsets.length).toBeLessThanOrEqual(12);
    expect(roundtrip.roundtripTauOnsets.some((t, i) => Math.abs(t - fractionalTau[i]!) > 0.05)).toBe(true);
    expect(direct.admittedTauOnsetCount).toBe(12);
    if (direct.status !== roundtrip.d8.status || direct.eventCount !== roundtrip.d8.eventCount) {
      expect(direct.indexOfDispersion).not.toEqual(roundtrip.d8.indexOfDispersion);
    }
  });
});
