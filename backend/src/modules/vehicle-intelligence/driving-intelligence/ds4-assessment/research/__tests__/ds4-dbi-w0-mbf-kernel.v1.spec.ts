import { createHash } from 'crypto';
import type { MotionFsmStopEpisode } from '../../../core/kinematics/motion-fsm';
import type { DiV0MotionCoreShadowPayloadV1 } from '../../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import {
  computeDs4DbiW0D8BurstinessFromObservationWindowV1,
  computeDs4DbiW0MbfFromPayloadV1,
} from '../ds4-dbi-w0-mbf-kernel.v1';
import type { Ds4DbiW0VerifiedSealedRealC4AttestationV1 } from '../ds4-dbi-w0-sealed-real-attestation.v1';

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
    /** B3: supplied Es should match E* (N−1 for N contiguous 1 Hz labels). */
    exposureSecondsEs: 129,
    distanceKm: 2,
  };

  function mk720D8Payload() {
    return mkMovingSeries(720, 40);
  }

  it('numerical oracle: constant speed yields D4 ratio 0 and D5 mean delta 0', () => {
    const payload = mkMovingSeries(130, 40);
    for (let i = 0; i < payload.speeds.length; i += 1) {
      payload.speeds[i] = { ...payload.speeds[i]!, speedKmh: 40 };
    }
    const r = computeDs4DbiW0MbfFromPayloadV1({
      payload,
      tripMeta: meta,
      qualityTier: 'STRICT',
      evidenceOrigin: 'SYNTHETIC_CONTROL',
    });
    expect(r.d4SpeedVariabilityRobustCv.status).toBe('KNOWN');
    expect(r.d4SpeedVariabilityRobustCv.value).toBeCloseTo(0, 10);
    expect(r.d5SpeedRoughnessMeanAbsDeltaKmhPerS.status).toBe('KNOWN');
    expect(r.d5SpeedRoughnessMeanAbsDeltaKmhPerS.value).toBeCloseTo(0, 10);
  });

  it('numerical oracle: D6 direct stop count over distance', () => {
    const payload = mkMovingSeries(130, 40);
    const r = computeDs4DbiW0MbfFromPayloadV1({
      payload,
      tripMeta: meta,
      qualityTier: 'STRICT',
      evidenceOrigin: 'SYNTHETIC_CONTROL',
    });
    expect(r.d6StopStructure.status).toBe('KNOWN');
    expect(r.d6StopStructure.directStopCount).toBe(4);
    expect(r.d6StopStructure.stopsPerKm).toBeCloseTo(2, 5);
  });

  it('numerical oracle: D8 IOD with one event per first ten 60s bins', () => {
    const t0 = '2026-01-01T12:00:00Z';
    const t0ms = Date.parse(t0);
    const esSec = 719;
    const payload = mk720D8Payload();
    for (let i = 0; i < payload.speeds.length; i += 1) {
      payload.speeds[i] = { ...payload.speeds[i]!, speedKmh: 40, bucketLabelUtc: new Date(t0ms + i * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z') };
      payload.fsmLabels[i] = { ...payload.fsmLabels[i]!, bucketLabelUtc: payload.speeds[i]!.bucketLabelUtc };
    }
    const offsets = [
      ...Array.from({ length: 10 }, (_, w) => w * 60_000 + 1000),
      10 * 60_000 + 1000,
      10 * 60_000 + 8000,
    ];
    const events = offsets.map((off) => ({
      kind: 'ACCELERATION' as const,
      startLabel: new Date(t0ms + off).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      endLabel: new Date(t0ms + off + 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      startSpeedKmh: 40,
      endSpeedKmh: 41,
      deltaKmh: 1,
      quality: 'OK' as const,
      flags: [],
    }));
    payload.events = events;
    const d8 = computeDs4DbiW0D8BurstinessFromObservationWindowV1({
      tripMeta: { ...meta, exposureSecondsEs: esSec },
      payload,
      events,
    });
    expect(d8.status).toBe('KNOWN');
    const n = 12;
    const k = 12;
    const mean = n / k;
    const counts = [...Array.from({ length: 10 }, () => 1), 2, 0];
    const sumSq = counts.reduce((a, x) => a + x * x, 0);
    const variance = (sumSq - (n * n) / k) / (k - 1);
    const expectedIod = variance / mean;
    expect(d8.indexOfDispersion).toBeCloseTo(expectedIod, 5);
  });

  it('F04: forged SEALED_REAL_C4 never grants statistical eligibility', () => {
    const payload = mkMovingSeries(130, 40);
    const r = computeDs4DbiW0MbfFromPayloadV1({
      payload,
      tripMeta: meta,
      qualityTier: 'STRICT',
      evidenceOrigin: 'SEALED_REAL_C4',
    });
    expect(r.sealedRealC4StatisticalEligibility).toBe(false);
    expect(r.independentScientificValidationStatus).toBe('NOT_EVALUATED');
    expect(r.diagnostics.failClosedReasons).toContain('MBF_W0_FAIL_CLOSED_UNVERIFIED_SEALED_REAL_C4_CLAIM');
    expect(r.d4SpeedVariabilityRobustCv.value).toBeNull();
  });

  it('F04 adversarial: caller-forged matching attestation still fails closed with no eligibility', () => {
    const payload = mkMovingSeries(130, 40);
    const observed = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const attestation: Ds4DbiW0VerifiedSealedRealC4AttestationV1 = {
      contractVersion: 'ds4-dbi-w0-verified-sealed-real-c4-v1',
      tripId: meta.tripId,
      sourceMotionRunId: meta.sourceMotionRunId,
      shadowBundleVersion: payload.contract.algorithmVersions.bundle,
      payloadContentDigestSha256: observed,
      provenanceManifestSha256: 'd'.repeat(64),
      integrityCheckPassed: true,
    };
    const r = computeDs4DbiW0MbfFromPayloadV1({
      payload,
      tripMeta: { ...meta, shadowBundleVersion: payload.contract.algorithmVersions.bundle },
      qualityTier: 'STRICT',
      evidenceOrigin: 'SEALED_REAL_C4',
      verifiedSealedRealC4Attestation: attestation,
    });
    expect(r.diagnostics.failClosedReasons).toContain('MBF_W0_FAIL_CLOSED_UNVERIFIED_SEALED_REAL_C4_CLAIM');
    expect(r.independentScientificValidationStatus).toBe('NOT_EVALUATED');
    expect(r.sealedRealC4StatisticalEligibility).toBe(false);
    expect(r.d4SpeedVariabilityRobustCv.value).toBeNull();
    expect(r.d5SpeedRoughnessMeanAbsDeltaKmhPerS.value).toBeNull();
    expect(r.d6StopStructure.directStopCount).toBeNull();
    expect(r.d8Burstiness.indexOfDispersion).toBeNull();
  });

  it('F04 adversarial: forged origin on otherwise evaluable synthetic payload strips metrics', () => {
    const payload = mkMovingSeries(130, 40);
    const wouldBeKnown = computeDs4DbiW0MbfFromPayloadV1({
      payload,
      tripMeta: meta,
      qualityTier: 'STRICT',
      evidenceOrigin: 'SYNTHETIC_CONTROL',
    });
    expect(wouldBeKnown.d4SpeedVariabilityRobustCv.status).toBe('KNOWN');
    const forged = computeDs4DbiW0MbfFromPayloadV1({
      payload,
      tripMeta: meta,
      qualityTier: 'STRICT',
      evidenceOrigin: 'SEALED_REAL_C4',
    });
    expect(forged.sealedRealC4StatisticalEligibility).toBe(false);
    expect(forged.d4SpeedVariabilityRobustCv.status).toBe('ABSTAIN');
    expect(forged.d4SpeedVariabilityRobustCv.value).toBeNull();
  });

  it('E7-style constant speed yields low D5 on strict tier', () => {
    const payload = mkMovingSeries(130, 40);
    const r = computeDs4DbiW0MbfFromPayloadV1({
      payload,
      tripMeta: meta,
      qualityTier: 'STRICT',
      evidenceOrigin: 'SYNTHETIC_CONTROL',
    });
    expect(r.evidenceOrigin).toBe('SYNTHETIC_CONTROL');
    expect(r.independentScientificValidationStatus).toBe('NOT_EVALUATED');
    expect(r.sealedRealC4StatisticalEligibility).toBe(false);
    expect(r.d5SpeedRoughnessMeanAbsDeltaKmhPerS.status).toBe('KNOWN');
    expect(r.d5SpeedRoughnessMeanAbsDeltaKmhPerS.value).not.toBeNull();
    expect(r.d5SpeedRoughnessMeanAbsDeltaKmhPerS.value!).toBeLessThan(0.5);
  });

  it('H8: omitting evidenceOrigin defaults to SYNTHETIC_UNSPECIFIED, not sealed real', () => {
    const payload = mkMovingSeries(130, 40);
    const r = computeDs4DbiW0MbfFromPayloadV1({
      payload,
      tripMeta: meta,
      qualityTier: 'STRICT',
    });
    expect(r.evidenceOrigin).toBe('SYNTHETIC_UNSPECIFIED');
    expect(r.sealedRealC4StatisticalEligibility).toBe(false);
    expect(r.independentScientificValidationStatus).toBe('NOT_EVALUATED');
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

  it('H1: bundle mismatch fails closed across metrics', () => {
    const payload = mkMovingSeries(130, 40);
    const r = computeDs4DbiW0MbfFromPayloadV1({
      payload,
      tripMeta: meta,
      qualityTier: 'STRICT',
      expectedShadowBundleVersion: 'WRONG_BUNDLE',
      evidenceOrigin: 'SYNTHETIC_CONTROL',
    });
    expect(r.diagnostics.failClosedReasons).toContain('MBF_W0_FAIL_CLOSED_SOURCE_BUNDLE_MISMATCH');
    expect(r.d4SpeedVariabilityRobustCv.value).toBeNull();
    expect(r.d8Burstiness.indexOfDispersion).toBeNull();
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

  it('H4: duplicate event start times fail closed', () => {
    const payload = mkMovingSeries(130, 40);
    const t = payload.events[0]!.startLabel;
    payload.events[1] = { ...payload.events[1]!, startLabel: t, endLabel: t };
    const r = computeDs4DbiW0MbfFromPayloadV1({ payload, tripMeta: meta, qualityTier: 'STRICT', evidenceOrigin: 'SYNTHETIC_CONTROL' });
    expect(r.diagnostics.failClosedReasons).toContain('MBF_W0_FAIL_CLOSED_DUPLICATE_EVENT_START_TIME');
    expect(r.d8Burstiness.indexOfDispersion).toBeNull();
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

  it('D8 uses moving-exposure horizon E* (B3) with parity-supplied Es', () => {
    const payload = mk720D8Payload();
    const meta720 = { ...meta, exposureSecondsEs: 719 };
    const r = computeDs4DbiW0MbfFromPayloadV1({
      payload,
      tripMeta: meta720,
      qualityTier: 'STRICT',
      evidenceOrigin: 'SYNTHETIC_CONTROL',
    });
    expect(r.dualTimeDomain?.movingExposureSeconds).toBe(719);
    expect(r.d8Burstiness.observationWindowDurationSeconds).toBe(719);
    expect(r.d8Burstiness.status).toBe('KNOWN');
  });

  it('E9: clustered vs regular sensitivity (shareWithin30s; fixed Es window) — scenarios need not both be KNOWN', () => {
    const t0 = '2026-01-01T12:00:00Z';
    const t0ms = Date.parse(t0);
    const esSec = 719;
    const windowMs = 60_000;
    const nEv = 12;
    const payload = mk720D8Payload();
    for (let i = 0; i < payload.speeds.length; i += 1) {
      const lab = new Date(t0ms + i * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      payload.speeds[i] = { ...payload.speeds[i]!, bucketLabelUtc: lab, speedKmh: 40 };
      payload.fsmLabels[i] = { ...payload.fsmLabels[i]!, bucketLabelUtc: lab };
    }
    const mkEv = (offsetsMs: number[]) =>
      offsetsMs.map((off) => ({
        kind: 'ACCELERATION' as const,
        startLabel: new Date(t0ms + off).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        endLabel: new Date(t0ms + off + 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        startSpeedKmh: 40,
        endSpeedKmh: 41,
        deltaKmh: 1,
        quality: 'OK' as const,
        flags: [],
      }));
    const regular = Array.from({ length: nEv }, (_, j) => j * 55_000);
    const rand = (seed: number) => {
      let a = seed >>> 0;
      return () => {
        a += 0x6d2b79f5;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
    /** OCCUPANCY_CONDITIONED_NULL: one Uniform draw per first ten 60s bins — conditions on ≥10 nonempty windows. */
    const rdraw = rand(0xe9beef00);
    const nullOffsets: number[] = [];
    for (let w = 0; w < 10; w += 1) {
      const binStart = w * windowMs;
      const binEnd = Math.min((w + 1) * windowMs, esSec * 1000) - 1000;
      nullOffsets.push(binStart + Math.floor(rdraw() * Math.max(1, binEnd - binStart)));
    }
    nullOffsets.push(600_000 + 1000, 600_000 + 8000);
    /** Two 20s pairs (windows 0–1) + one mid-window event in windows 2–9 → 12 events, 10 non-empty windows, high shareWithin30s vs regular. */
    const clustered: number[] = [
      5000,
      25_000,
      windowMs + 5000,
      windowMs + 25_000,
    ];
    for (let w = 2; w <= 9; w += 1) {
      clustered.push(w * windowMs + 30_000);
    }

    const tripMetaLocal = { ...meta, exposureSecondsEs: esSec };
    const dReg = computeDs4DbiW0D8BurstinessFromObservationWindowV1({
      tripMeta: tripMetaLocal,
      payload,
      events: mkEv(regular),
    });
    const dNull = computeDs4DbiW0D8BurstinessFromObservationWindowV1({
      tripMeta: tripMetaLocal,
      payload,
      events: mkEv(nullOffsets.sort((a, b) => a - b)),
    });
    const dClust = computeDs4DbiW0D8BurstinessFromObservationWindowV1({
      tripMeta: tripMetaLocal,
      payload,
      events: mkEv(clustered.sort((a, b) => a - b)),
    });
    expect(dReg.shareNextEventWithin30s).not.toBeNull();
    expect(dClust.shareNextEventWithin30s).not.toBeNull();
    expect(dClust.shareNextEventWithin30s!).toBeGreaterThan(dReg.shareNextEventWithin30s!);
    expect(dNull.nonEmptyWindowCount).toBeGreaterThanOrEqual(10);
  });

  it('E9: unrestricted uniform null may ABSTAIN under D8 window gate (no scientific failure)', () => {
    const t0 = '2026-01-01T12:00:00Z';
    const t0ms = Date.parse(t0);
    const esSec = 719;
    const nEv = 12;
    const payload = mk720D8Payload();
    for (let i = 0; i < payload.speeds.length; i += 1) {
      const lab = new Date(t0ms + i * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      payload.speeds[i] = { ...payload.speeds[i]!, bucketLabelUtc: lab, speedKmh: 40 };
      payload.fsmLabels[i] = { ...payload.fsmLabels[i]!, bucketLabelUtc: lab };
    }
    /** Deterministic stack in first bin → insufficient nonempty windows under preregistered gate. */
    const unrestrictedOffsets = Array.from({ length: nEv }, (_, i) => i * 1000).sort((a, b) => a - b);
    const mkEv = (offsetsMs: number[]) =>
      offsetsMs.map((off) => ({
        kind: 'ACCELERATION' as const,
        startLabel: new Date(t0ms + off).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        endLabel: new Date(t0ms + off + 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        startSpeedKmh: 40,
        endSpeedKmh: 41,
        deltaKmh: 1,
        quality: 'OK' as const,
        flags: [],
      }));
    const tripMetaLocal = { ...meta, exposureSecondsEs: esSec };
    const dUnres = computeDs4DbiW0D8BurstinessFromObservationWindowV1({
      tripMeta: tripMetaLocal,
      payload,
      events: mkEv(unrestrictedOffsets),
    });
    expect(dUnres.status).toBe('ABSTAIN');
    expect(dUnres.reasonCodes).toContain('MBF_W0_INSUFFICIENT_WINDOWS_FOR_BURSTINESS');
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
