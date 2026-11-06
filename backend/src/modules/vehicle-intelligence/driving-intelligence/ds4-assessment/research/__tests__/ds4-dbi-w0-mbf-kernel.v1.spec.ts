import { createHash } from 'crypto';
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

  function mkMovingSeries(n: number, baseKmh: number): DiV0MotionCoreShadowPayloadV1 {
    const t0 = '2026-01-01T10:00:00Z';
    const speeds: DiV0MotionCoreShadowPayloadV1['speeds'] = [];
    const fsm: DiV0MotionCoreShadowPayloadV1['fsmLabels'] = [];
    for (let i = 0; i < n; i += 1) {
      const lab = new Date(Date.parse(t0) + i * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
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
      stopEpisodes: [],
      events: Array.from({ length: 15 }, (_, j) => ({
        kind: 'ACCELERATION' as const,
        startLabel: new Date(Date.parse(t0) + (10 + j * 8) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        endLabel: new Date(Date.parse(t0) + (11 + j * 8) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
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
        stopEpisodeCount: 0,
      },
    };
  }

  it('E7-style constant speed yields low D5 on strict tier', () => {
    const payload = mkMovingSeries(130, 40);
    const meta = {
      tripId: 't1',
      sourceMotionRunId: 'r1',
      speedAuthority: 'C4_ONLY',
      shadowBundleVersion: 'x',
      contentFingerprint: 'a'.repeat(64),
      exposureSecondsEs: 130,
      distanceKm: 2,
    };
    const r = computeDs4DbiW0MbfFromPayloadV1({ payload, tripMeta: meta, qualityTier: 'STRICT' });
    expect(r.d5SpeedRoughnessMeanAbsDeltaKmhPerS.status).toBe('KNOWN');
    expect(r.d5SpeedRoughnessMeanAbsDeltaKmhPerS.value).not.toBeNull();
    expect(r.d5SpeedRoughnessMeanAbsDeltaKmhPerS.value!).toBeLessThan(0.5);
  });

  it('E10 fingerprint mismatch fails closed', () => {
    const payload = mkMovingSeries(130, 40);
    const meta = {
      tripId: 't1',
      sourceMotionRunId: 'r1',
      speedAuthority: 'C4_ONLY',
      shadowBundleVersion: 'x',
      contentFingerprint: 'a'.repeat(64),
      exposureSecondsEs: 130,
      distanceKm: 2,
    };
    const observed = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const r = computeDs4DbiW0MbfFromPayloadV1({
      payload,
      tripMeta: meta,
      qualityTier: 'STRICT',
      expectedContentFingerprint: 'b'.repeat(64),
    });
    expect(observed).not.toBe('b'.repeat(64));
    expect(r.d4SpeedVariabilityRobustCv.status).toBe('ABSTAIN');
    expect(r.d4SpeedVariabilityRobustCv.reasonCodes).toContain('MBF_W0_FAIL_CLOSED_CONTENT_FINGERPRINT_MISMATCH');
  });

  it('recomputing same payload is deterministic', () => {
    const payload = mkMovingSeries(130, 41);
    const meta = {
      tripId: 't1',
      sourceMotionRunId: 'r1',
      speedAuthority: 'C4_ONLY',
      shadowBundleVersion: 'x',
      contentFingerprint: 'a'.repeat(64),
      exposureSecondsEs: 130,
      distanceKm: 2,
    };
    const a = computeDs4DbiW0MbfFromPayloadV1({ payload, tripMeta: meta, qualityTier: 'STRICT' });
    const b = computeDs4DbiW0MbfFromPayloadV1({ payload, tripMeta: meta, qualityTier: 'STRICT' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
