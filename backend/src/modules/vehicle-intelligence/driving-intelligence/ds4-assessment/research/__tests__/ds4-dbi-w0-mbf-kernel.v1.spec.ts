import { createHash } from 'crypto';
import type { MotionFsmStopEpisode } from '../../../core/kinematics/motion-fsm';
import type { DiV0MotionCoreShadowPayloadV1 } from '../../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import { computeDs4DbiW0MbfFromPayloadV1 } from '../ds4-dbi-w0-mbf-kernel.v1';

describe('ds4-dbi-w0-mbf-kernel.v1', () => {
  const baseContract: DiV0MotionCoreShadowPayloadV1['contract'] = {
    algorithmVersions: {
      c4: 't',
      c5_1: null,
      c5_1ProductionSafety: null,
      c5_1AlgorithmFileSha256: null,
      fsm: 't',
      gapBridgeV1: null,
      fsmAuxBinding: null,
      events: 't',
      bundle: 'TEST_BUNDLE',
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

  function mkDirectStops(baseTimeMs: number): MotionFsmStopEpisode[] {
    const out: MotionFsmStopEpisode[] = [];
    for (let s = 0; s < 4; s += 1) {
      const startMs = baseTimeMs + s * 50_000;
      const endMs = startMs + 5000;
      const startLab = new Date(startMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
      const endLab = new Date(endMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
      out.push({
        trip: s,
        mode: 'RETROSPECTIVE',
        startEarliest: startLab,
        startLatest: startLab,
        endEarliest: endLab,
        endLatest: endLab,
        minDurationS: 5,
        maxDurationS: 5,
        evidenceQuality: 'DIRECT',
        openEnd: false,
        labels: 5,
        directLabels: 5,
        inferredLabels: 0,
        indeterminateLabels: 0,
        observedLabels: 5,
        gapLabels: 0,
        lastEvidenceLabel: endLab,
        observedMinDurationS: 5,
        hysteresisBandLabels: 0,
        firstStationarySource: 'C4_OK',
        firstStationaryC4Quality: 'OK',
      });
    }
    return out;
  }

  function mkMovingSeries(n: number, baseKmh: number): DiV0MotionCoreShadowPayloadV1 {
    const t0 = '2026-01-01T10:00:00Z';
    const t0ms = Date.parse(t0);
    const speeds: DiV0MotionCoreShadowPayloadV1['speeds'] = [];
    const fsm: DiV0MotionCoreShadowPayloadV1['fsmLabels'] = [];
    for (let i = 0; i < n; i += 1) {
      const lab = new Date(t0ms + i * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      speeds.push({
        bucketLabelUtc: lab,
        speedKmh: baseKmh + (i % 3) * 0.1,
        quality: 'OK',
        support: [],
        estimator: 't',
        flags: [],
      });
      fsm.push({
        bucketLabelUtc: lab,
        state: 'MOVING',
        evidenceQuality: 'DIRECT',
        reason: 't',
        flags: [],
      });
    }
    return {
      contract: baseContract,
      speeds,
      fsmLabels: fsm,
      stopEpisodes: mkDirectStops(t0ms),
      events: Array.from({ length: 15 }, (_, j) => ({
        kind: 'ACCELERATION' as const,
        startLabel: new Date(t0ms + (10 + j * 61) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        endLabel: new Date(t0ms + (11 + j * 61) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        startSpeedKmh: 40,
        endSpeedKmh: 41,
        deltaKmh: 1,
        quality: 'OK',
        flags: [],
      })),
      summary: {
        labelCount: n,
        speedNumericCount: n,
        eventCount: 15,
        eventAcceptedCount: 15,
        eventArtefactSuspectCount: 0,
        stopEpisodeCount: 4,
      },
    };
  }

  const meta = {
    tripId: 't1',
    sourceMotionRunId: 'r1',
    speedAuthority: 'C4_ONLY',
    shadowBundleVersion: 'x',
    contentFingerprint: 'a'.repeat(64),
    exposureSecondsEs: 130,
    distanceKm: 2,
  };

  it('E7-style constant speed yields low D5 on strict tier', () => {
    const payload = mkMovingSeries(130, 40);
    const r = computeDs4DbiW0MbfFromPayloadV1({
      payload,
      tripMeta: meta,
      qualityTier: 'STRICT',
      evidenceOrigin: 'SYNTHETIC_CONTROL',
    });
    expect(r.evidenceOrigin).toBe('SYNTHETIC_CONTROL');
    expect(r.realDataValidationPassed).toBe(false);
    expect(r.d5SpeedRoughnessMeanAbsDeltaKmhPerS.status).toBe('KNOWN');
    expect(r.d5SpeedRoughnessMeanAbsDeltaKmhPerS.value).not.toBeNull();
    expect(r.d5SpeedRoughnessMeanAbsDeltaKmhPerS.value!).toBeLessThan(0.5);
  });

  it('H1: global fail-closed strips all D4/D5/D6/D8 numeric fields on fingerprint mismatch', () => {
    const payload = mkMovingSeries(130, 40);
    const r = computeDs4DbiW0MbfFromPayloadV1({
      payload,
      tripMeta: meta,
      qualityTier: 'STRICT',
      expectedContentFingerprint: 'b'.repeat(64),
      evidenceOrigin: 'SYNTHETIC_CONTROL',
    });
    expect(r.d4SpeedVariabilityRobustCv.status).toBe('ABSTAIN');
    expect(r.d4SpeedVariabilityRobustCv.value).toBeNull();
    expect(r.d4SpeedVariabilityRobustCv.n).toBeNull();
    expect(r.d5SpeedRoughnessMeanAbsDeltaKmhPerS.value).toBeNull();
    expect(r.d5SpeedRoughnessMeanAbsDeltaKmhPerS.n).toBeNull();
    expect(r.d6StopStructure.directStopCount).toBeNull();
    expect(r.d6StopStructure.stopsPerKm).toBeNull();
    expect(r.d6StopStructure.medianMovingRunDurationSeconds).toBeNull();
    expect(r.d6StopStructure.sustainedMovementShare).toBeNull();
    expect(r.d8Burstiness.indexOfDispersion).toBeNull();
    expect(r.d8Burstiness.nonEmptyWindowCount).toBeNull();
    expect(r.d8Burstiness.emptyWindowCount).toBeNull();
    expect(r.d4SpeedVariabilityRobustCv.reasonCodes).toContain('MBF_W0_FAIL_CLOSED_CONTENT_FINGERPRINT_MISMATCH');
  });

  it('H4: duplicate speed label timestamp fails closed with null metrics', () => {
    const payload = mkMovingSeries(130, 40);
    const dupLab = payload.speeds[50]!.bucketLabelUtc;
    payload.speeds[51] = { ...payload.speeds[51]!, bucketLabelUtc: dupLab };
    payload.fsmLabels[51] = { ...payload.fsmLabels[51]!, bucketLabelUtc: dupLab };
    const r = computeDs4DbiW0MbfFromPayloadV1({ payload, tripMeta: meta, qualityTier: 'STRICT', evidenceOrigin: 'SYNTHETIC_CONTROL' });
    expect(r.diagnostics.failClosedReasons).toContain('MBF_W0_FAIL_CLOSED_DUPLICATE_SPEED_LABEL');
    expect(r.d4SpeedVariabilityRobustCv.value).toBeNull();
    expect(r.d5SpeedRoughnessMeanAbsDeltaKmhPerS.value).toBeNull();
  });

  it('H4: FSM row missing for a speed label fails closed', () => {
    const payload = mkMovingSeries(130, 40);
    payload.fsmLabels = payload.fsmLabels.slice(0, 129);
    const r = computeDs4DbiW0MbfFromPayloadV1({ payload, tripMeta: meta, qualityTier: 'STRICT', evidenceOrigin: 'SYNTHETIC_CONTROL' });
    expect(r.diagnostics.failClosedReasons).toContain('MBF_W0_FAIL_CLOSED_FSM_MISSING_FOR_SPEED_LABEL');
    expect(r.d4SpeedVariabilityRobustCv.value).toBeNull();
  });

  it('H3: D6 moving runs split on nonconsecutive FSM timestamps', () => {
    const payload = mkMovingSeries(130, 40);
    const g = 10;
    for (let i = g; i < payload.fsmLabels.length; i += 1) {
      const t = Date.parse(payload.fsmLabels[i]!.bucketLabelUtc) + 1000;
      payload.fsmLabels[i] = {
        ...payload.fsmLabels[i]!,
        bucketLabelUtc: new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      };
      payload.speeds[i] = { ...payload.speeds[i]!, bucketLabelUtc: payload.fsmLabels[i]!.bucketLabelUtc };
    }
    const r = computeDs4DbiW0MbfFromPayloadV1({ payload, tripMeta: meta, qualityTier: 'STRICT', evidenceOrigin: 'SYNTHETIC_CONTROL' });
    expect(r.d6StopStructure.movingRunSplitReasonSample).toContain('MBF_W0_GAP_BREAKS_CONSECUTIVE_CHAIN');
  });

  it('recomputing same payload is deterministic', () => {
    const payload = mkMovingSeries(130, 41);
    const a = computeDs4DbiW0MbfFromPayloadV1({ payload, tripMeta: meta, qualityTier: 'STRICT', evidenceOrigin: 'SYNTHETIC_CONTROL' });
    const b = computeDs4DbiW0MbfFromPayloadV1({ payload, tripMeta: meta, qualityTier: 'STRICT', evidenceOrigin: 'SYNTHETIC_CONTROL' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('canonical JSON digest matches sha256 used for expectedContentFingerprint', () => {
    const payload = mkMovingSeries(130, 40);
    const observed = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const r = computeDs4DbiW0MbfFromPayloadV1({
      payload,
      tripMeta: meta,
      qualityTier: 'STRICT',
      expectedContentFingerprint: observed,
      evidenceOrigin: 'SYNTHETIC_CONTROL',
    });
    expect(r.diagnostics.failClosedReasons).not.toContain('MBF_W0_FAIL_CLOSED_CONTENT_FINGERPRINT_MISMATCH');
    expect(r.d4SpeedVariabilityRobustCv.status).toBe('KNOWN');
  });
});
