import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { DiV0MotionCoreShadowPayloadV1 } from '../../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import { decodeMotionCoreShadowPayloadGzipV1 } from '../../export/ds4-layer2-p2-offline-reconstruction.v1';
import { deriveDs4DrivingExposureV1 } from '../../ds4-assessment-driving-exposure.v1';
import {
  buildDs4DbiW0MovingExposureClockEvidenceV1,
  resolveW0SpeedAuthorityPartitionV1,
} from '../ds4-dbi-w0-moving-exposure-clock.v1';
import { computeDs4DbiW0MbfFromPayloadV1 } from '../ds4-dbi-w0-mbf-kernel.v1';
import type { Ds4DbiW0TripMetaV1 } from '../ds4-dbi-w0-mbf-kernel.v1';
import { loadDs4DbiW0HistoricalMotionFixtureV1 } from '../ds4-dbi-w0-historical-replay.loader.v1';
import { projectDs4DbiW1cTripAssessmentFromW0KernelV1 } from '../ds4-dbi-w1c-trip-assessment-projector.v1';
import { loadDs4DbiW1b1LocalEvidenceV1 } from '../ds4-dbi-w1b1-local-evidence.loader.v1';
import { computeCanonicalPayloadDigestV1 } from '../ds4-dbi-w1b1-digest-semantics.v1';
import {
  buildGreenwoodConditionalNullReferenceV1,
  computeDs4DbiD8V2FromW0ContextV1,
  DS4_DBI_D8_V2_NULL_MC_SEED_V1,
  DS4_DBI_D8_V2_RESEARCH_NMIN_V1,
  greenwoodNormalizedSpacingsV1,
  greenwoodNullExpectationV1,
  mulberry32D8V2,
  sampleGreenwoodNullDrawV1,
} from '../ds4-dbi-d8-v2-event-intelligence.research.v1';

const REPO_ROOT = join(__dirname, '../../../../../../../..');
const TESLA_ARTIFACT = '/opt/cursor/artifacts/dbi-tesla-20261107-payload.json.gz';

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

function mkUniformMovingPayload(input: {
  eStarSeconds: number;
  eventTauSeconds: number[];
  speedAuthority?: 'C4_ONLY' | 'C5_1_PREFERRED';
  degradeCoverage?: boolean;
  allNoPosition?: boolean;
}): DiV0MotionCoreShadowPayloadV1 {
  const t0 = Date.parse('2026-01-01T00:00:00Z');
  const speeds: DiV0MotionCoreShadowPayloadV1['speeds'] = [];
  const fsmLabels: DiV0MotionCoreShadowPayloadV1['fsmLabels'] = [];
  for (let i = 0; i < input.eStarSeconds; i += 1) {
    const lab = new Date(t0 + i * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const q = input.allNoPosition ? 'NO_POSITION' : input.degradeCoverage && i % 5 === 0 ? 'NO_POSITION' : 'OK';
    speeds.push({
      bucketLabelUtc: lab,
      speedKmh: 50,
      quality: q,
      support: [],
      estimator: 't',
      flags: [],
    });
    fsmLabels.push({
      bucketLabelUtc: lab,
      state: 'MOVING',
      evidenceQuality: 'DIRECT',
      reason: 't',
      flags: [],
    });
  }
  const events = input.eventTauSeconds.map((tau, idx) => {
    const start = new Date(t0 + tau * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const end = new Date(t0 + (tau + 2) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    return {
      kind: idx % 2 === 0 ? ('ACCELERATION' as const) : ('DECELERATION' as const),
      startLabel: start,
      endLabel: end,
      startSpeedKmh: 40,
      endSpeedKmh: 45,
      deltaKmh: 5,
      quality: 'OK' as const,
      flags: ['L3_DIRECT'],
      intensity: {
        meanAccelMps2: 1.2,
        durationS: 2,
        steps: 2,
        coverageRatio: 1,
        startUncertaintyS: '±1 s',
        endUncertaintyS: '±1 s',
      },
    };
  });
  return {
    contract: {
      ...baseContract(),
      speedAuthority: input.speedAuthority ?? 'C4_ONLY',
      sparse: input.degradeCoverage
        ? {
            channelOutcome: 'SPARSE',
            comparable: true,
            sampleCount: 0,
            samples: [],
            limitations: ['TEST_SPARSE'],
          }
        : baseContract().sparse,
    },
    speeds,
    fsmLabels,
    stopEpisodes: [],
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

function runKernelAndV2(
  payload: DiV0MotionCoreShadowPayloadV1,
  _eStarHint: number,
  opts?: { nullDraws?: number; kernelPatch?: (k: ReturnType<typeof computeDs4DbiW0MbfFromPayloadV1>) => void },
) {
  const speedAuthority = resolveW0SpeedAuthorityPartitionV1(payload);
  const exposure = deriveDs4DrivingExposureV1({ payload, speedAuthority });
  const tripMeta: Ds4DbiW0TripMetaV1 = {
    tripId: 'test-trip',
    sourceMotionRunId: 'test-run',
    speedAuthority: payload.contract.speedAuthority ?? 'C4_ONLY',
    shadowBundleVersion: 'TV',
    contentFingerprint: '00',
    exposureSecondsEs: exposure.exposureSeconds,
    distanceKm: 10,
  };
  let kernel = computeDs4DbiW0MbfFromPayloadV1({
    payload,
    tripMeta,
    qualityTier: 'STRICT',
    evidenceOrigin: 'SYNTHETIC_CONTROL',
  });
  opts?.kernelPatch?.(kernel);
  const v2 = computeDs4DbiD8V2FromW0ContextV1({
    kernel,
    payload,
    tripMeta,
    nullDraws: opts?.nullDraws ?? 20_000,
    seed: DS4_DBI_D8_V2_NULL_MC_SEED_V1,
  });
  return { kernel, v2, w1c: projectDs4DbiW1cTripAssessmentFromW0KernelV1(kernel) };
}

describe('ds4-dbi-d8-v2-event-intelligence', () => {
  it('greenwood null expectation matches 2/(n+2)', () => {
    for (const n of [0, 1, 4, 8, 10, 15, 30]) {
      expect(greenwoodNullExpectationV1(n)).toBeCloseTo(2 / (n + 2), 10);
    }
  });

  it('seeded null MC is reproducible', () => {
    const a = buildGreenwoodConditionalNullReferenceV1({ eventCount: 10, nullDraws: 1000, seed: 42 });
    const b = buildGreenwoodConditionalNullReferenceV1({ eventCount: 10, nullDraws: 1000, seed: 42 });
    expect(a.nullQuantiles.p95).toBe(b.nullQuantiles.p95);
    expect(a.samples[0]).toBe(b.samples[0]);
  });

  it('type-I error on unconditional null stays near alpha (tolerance)', () => {
    const n = 15;
    const draws = 8_000;
    const nullRef = buildGreenwoodConditionalNullReferenceV1({ eventCount: n, nullDraws: draws, seed: 99 });
    const rand = mulberry32D8V2(12345);
    let reject = 0;
    const trials = 400;
    for (let t = 0; t < trials; t += 1) {
      const pts: number[] = [];
      for (let i = 0; i < n; i += 1) {
        pts.push(rand());
      }
      const g = greenwoodNormalizedSpacingsV1(pts);
      if (g >= nullRef.nullQuantiles.p95) {
        reject += 1;
      }
    }
    const rate = reject / trials;
    expect(rate).toBeLessThanOrEqual(0.08);
    expect(rate).toBeGreaterThanOrEqual(0.02);
  });

  it('four events (Tesla-like tau pattern) → descriptive + insufficient inference', () => {
    const payload = mkUniformMovingPayload({
      eStarSeconds: 850,
      eventTauSeconds: [],
      speedAuthority: 'C5_1_PREFERRED',
    });
    payload.contract.sparse = {
      ...payload.contract.sparse,
      limitations: ['SYNTHETIC_SPARSE_HINT'],
    };
    const taus = [194, 257, 326, 808];
    const t0 = Date.parse('2026-01-01T00:00:00Z');
    const kinds: Array<'ACCELERATION' | 'DECELERATION'> = [
      'ACCELERATION',
      'DECELERATION',
      'DECELERATION',
      'DECELERATION',
    ];
    payload.events = taus.map((tau, idx) => ({
      kind: kinds[idx]!,
      startLabel: new Date(t0 + tau * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      endLabel: new Date(t0 + (tau + 2) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      startSpeedKmh: 40,
      endSpeedKmh: 45,
      deltaKmh: 5,
      quality: 'OK' as const,
      flags: ['L3_DIRECT'],
      intensity: {
        meanAccelMps2: 1.2,
        durationS: 2,
        steps: 2,
        coverageRatio: 1,
        startUncertaintyS: '±1 s',
        endUncertaintyS: '±1 s',
      },
    }));
    const { kernel, v2, w1c } = runKernelAndV2(payload, 832);
    expect(kernel.d8Burstiness.status).toBe('ABSTAIN');
    expect(w1c.ok && w1c.summary.tripOutcome).toBe('PARTIAL');
    expect(v2.descriptive.status).toBe('DESCRIPTIVE_RESULT_AVAILABLE');
    expect(v2.descriptive.admittedEventCount).toBe(4);
    expect(v2.descriptive.accelerationCount).toBe(1);
    expect(v2.descriptive.brakingCount).toBe(3);
    expect(v2.descriptive.interEventGapsTauSeconds).toEqual([63, 69, 482]);
    expect(v2.descriptive.ratePerMovingMinute).toBeCloseTo(
      4 / ((v2.descriptive.movingExposureSeconds ?? 1) / 60),
      3,
    );
    const cluster3 = v2.descriptive.clusters.find((c) => c.eventCount === 3);
    expect(cluster3).toBeDefined();
    expect(cluster3!.endTauSeconds - cluster3!.startTauSeconds).toBe(132);
    expect(v2.inference.status).toBe('INSUFFICIENT_INFORMATION');
    expect(v2.inference.observedGreenwoodG).not.toBeNull();
    expect(v2.inference.pValueUpper).toBeGreaterThan(0.05);
    expect(v2.v1Reference.status).toBe('ABSTAIN');
  });

  it('zero events with full coverage → NO_EVENTS_OBSERVED', () => {
    const payload = mkUniformMovingPayload({ eStarSeconds: 600, eventTauSeconds: [] });
    const { v2 } = runKernelAndV2(payload, 600);
    expect(v2.descriptive.status).toBe('NO_EVENTS_OBSERVED');
    expect(v2.descriptive.ratePerMovingMinute).toBe(0);
    expect(v2.descriptive.rateCi95?.hi).not.toBeNull();
    expect(v2.inference.status).toBe('INSUFFICIENT_INFORMATION');
  });

  it('zero events with degraded coverage → NOT_EVALUABLE descriptive', () => {
    const payload = mkUniformMovingPayload({
      eStarSeconds: 600,
      eventTauSeconds: [],
      allNoPosition: true,
    });
    const { v2 } = runKernelAndV2(payload, 600);
    expect(v2.descriptive.status).toBe('NOT_EVALUABLE');
    expect(v2.inference.status).toBe('NOT_EVALUABLE');
  });

  it('one event → descriptive only', () => {
    const payload = mkUniformMovingPayload({ eStarSeconds: 500, eventTauSeconds: [120] });
    const { v2 } = runKernelAndV2(payload, 500);
    expect(v2.descriptive.status).toBe('DESCRIPTIVE_RESULT_AVAILABLE');
    expect(v2.descriptive.interEventGapsTauSeconds).toHaveLength(0);
    expect(v2.inference.status).toBe('INSUFFICIENT_INFORMATION');
  });

  it('ten clustered events → statistical inference (V1 may abstain on windows)', () => {
    const clustered = [100, 102, 104, 106, 108, 200, 202, 204, 206, 208];
    const payload = mkUniformMovingPayload({ eStarSeconds: 900, eventTauSeconds: clustered });
    const { kernel, v2 } = runKernelAndV2(payload, 900);
    expect(v2.descriptive.admittedEventCount).toBe(10);
    expect(v2.inference.status).toBe('STATISTICAL_RESULT_AVAILABLE');
    expect(v2.inference.observedGreenwoodG).not.toBeNull();
    expect(kernel.d8Burstiness.status).toBe('ABSTAIN');
  });

  it('fifteen evenly distributed events → statistical inference', () => {
    const evenly = Array.from({ length: 15 }, (_, i) => 40 + i * 50);
    const payload = mkUniformMovingPayload({ eStarSeconds: 1200, eventTauSeconds: evenly });
    const { v2, kernel } = runKernelAndV2(payload, 1200);
    expect(v2.inference.status).toBe('STATISTICAL_RESULT_AVAILABLE');
    expect(kernel.d8Burstiness.status).toBe('KNOWN');
  });

  it('non-OK events excluded from admission', () => {
    const payload = mkUniformMovingPayload({ eStarSeconds: 400, eventTauSeconds: [50, 150, 250] });
    payload.events.push({
      kind: 'DECELERATION',
      startLabel: payload.events[0]!.startLabel,
      endLabel: payload.events[0]!.endLabel,
      startSpeedKmh: 10,
      endSpeedKmh: 5,
      deltaKmh: 5,
      quality: 'ARTEFACT_SUSPECT',
      flags: [],
      intensity: {
        meanAccelMps2: 1,
        durationS: 1,
        steps: 1,
        coverageRatio: 1,
        startUncertaintyS: '±1 s',
        endUncertaintyS: '±1 s',
      },
    });
    const { v2 } = runKernelAndV2(payload, 400);
    expect(v2.descriptive.totalEventCount).toBe(4);
    expect(v2.descriptive.admittedEventCount).toBe(3);
    expect(v2.descriptive.excludedEventCount).toBeGreaterThanOrEqual(1);
  });

  it('TIG22 / TIG22_V4 / W1B1 synthetic replay preserves V1 d8 and adds V2', () => {
    for (const fixtureId of ['TIG22', 'TIG22_V4'] as const) {
      const load = loadDs4DbiW0HistoricalMotionFixtureV1({
        fixtureId,
        bindingTier: 'RELAXED',
        repositoryRoot: REPO_ROOT,
      });
      if (!load.ok) {
        throw new Error(`fixture ${fixtureId}: ${load.detail}`);
      }
      const canonicalDigest = computeCanonicalPayloadDigestV1(load.payload);
      const kernel = computeDs4DbiW0MbfFromPayloadV1({
        payload: load.payload,
        tripMeta: load.tripMeta,
        qualityTier: 'STRICT',
        expectedContentFingerprint: canonicalDigest,
        expectedShadowBundleVersion: load.tripMeta.shadowBundleVersion,
        evidenceOrigin: 'HISTORICAL_RESEARCH_RECORDING',
      });
      const v2 = computeDs4DbiD8V2FromW0ContextV1({
        kernel,
        payload: load.payload,
        tripMeta: load.tripMeta,
        researchSpeedAuthorityPartitionOverride: load.speedAuthorityBinding.partition,
        nullDraws: 10_000,
      });
      expect(v2.w0TripFailClosed).toBe(false);
      expect(v2.v1Reference.status).toBe(kernel.d8Burstiness.status);
      expect(v2.v1Reference.indexOfDispersion).toBe(kernel.d8Burstiness.indexOfDispersion);
      expect(v2.contractVersion).toBe('ds4-dbi-d8-v2-research-v1');
    }

    const w1b1Load = loadDs4DbiW1b1LocalEvidenceV1({ fixtureId: 'W1B1_SYNTHETIC_POSITIVE', repositoryRoot: REPO_ROOT });
    expect(w1b1Load.ok).toBe(true);
    if (w1b1Load.ok) {
      const kernel = computeDs4DbiW0MbfFromPayloadV1({
        payload: w1b1Load.payload,
        tripMeta: w1b1Load.tripMeta,
        qualityTier: 'STRICT',
        expectedContentFingerprint: w1b1Load.tripMeta.contentFingerprint,
        expectedShadowBundleVersion: w1b1Load.tripMeta.shadowBundleVersion,
        evidenceOrigin: 'SYNTHETIC_CONTROL',
      });
      const v2 = computeDs4DbiD8V2FromW0ContextV1({
        kernel,
        payload: w1b1Load.payload,
        tripMeta: w1b1Load.tripMeta,
        nullDraws: 10_000,
      });
      expect(v2.inference.nMinInference).toBe(DS4_DBI_D8_V2_RESEARCH_NMIN_V1);
      expect(v2.v1Reference.status).toBe(kernel.d8Burstiness.status);
    }
  });

  it('optional Tesla artifact when present on disk', () => {
    if (!existsSync(TESLA_ARTIFACT)) {
      return;
    }
    const gzip = readFileSync(TESLA_ARTIFACT);
    const { payload } = decodeMotionCoreShadowPayloadGzipV1(gzip);
    expect(payload).toBeTruthy();
    const observedCanonical = computeCanonicalPayloadDigestV1(payload!);
    const bundleObs = payload!.contract.algorithmVersions.bundle;
    const tripMeta: Ds4DbiW0TripMetaV1 = {
      tripId: '0bf6fa50-5f0e-4bc4-9a75-777711d66063',
      sourceMotionRunId: '316cddb2-372d-4084-ab2d-25d456470eab',
      speedAuthority: payload!.contract.speedAuthority ?? 'C5_1_PREFERRED',
      shadowBundleVersion: bundleObs,
      contentFingerprint: observedCanonical,
      exposureSecondsEs: 832,
      distanceKm: 15.4,
    };
    const kernel = computeDs4DbiW0MbfFromPayloadV1({
      payload: payload!,
      tripMeta,
      qualityTier: 'STRICT',
      expectedContentFingerprint: observedCanonical,
      expectedShadowBundleVersion: bundleObs,
      evidenceOrigin: 'HISTORICAL_RESEARCH_RECORDING',
    });
    const w1c = projectDs4DbiW1cTripAssessmentFromW0KernelV1(kernel);
    const v2 = computeDs4DbiD8V2FromW0ContextV1({
      kernel,
      payload: payload!,
      tripMeta,
      nullDraws: 50_000,
    });
    expect(v2.w0TripFailClosed).toBe(false);
    expect(kernel.d8Burstiness.status).toBe('ABSTAIN');
    expect(w1c.ok && w1c.summary.tripOutcome).toBe('PARTIAL');
    expect(v2.descriptive.status).toBe('DESCRIPTIVE_RESULT_AVAILABLE');
    expect(v2.descriptive.admittedEventCount).toBe(4);
    expect(v2.descriptive.accelerationCount).toBe(1);
    expect(v2.descriptive.brakingCount).toBe(3);
    expect(v2.inference.observedGreenwoodG).toBeCloseTo(0.4034, 2);
    expect(v2.inference.status).toBe('INSUFFICIENT_INFORMATION');
  });

  it('V1 d8 kernel path unchanged when V2 computed (regression)', () => {
    const payload = mkUniformMovingPayload({
      eStarSeconds: 660,
      eventTauSeconds: Array.from({ length: 12 }, (_, i) => 20 + i * 45),
    });
    const tripMeta: Ds4DbiW0TripMetaV1 = {
      tripId: 't',
      sourceMotionRunId: 'r',
      speedAuthority: 'C4_ONLY',
      shadowBundleVersion: 'b',
      contentFingerprint: 'c',
      exposureSecondsEs: 660,
      distanceKm: 12,
    };
    const k1 = computeDs4DbiW0MbfFromPayloadV1({
      payload,
      tripMeta,
      qualityTier: 'STRICT',
      evidenceOrigin: 'SYNTHETIC_CONTROL',
    });
    computeDs4DbiD8V2FromW0ContextV1({ kernel: k1, payload, tripMeta });
    const k2 = computeDs4DbiW0MbfFromPayloadV1({
      payload,
      tripMeta,
      qualityTier: 'STRICT',
      evidenceOrigin: 'SYNTHETIC_CONTROL',
    });
    expect(k2.d8Burstiness).toEqual(k1.d8Burstiness);
  });

  it('TIG22_V4: raw file SHA and canonical digest are distinct and both verifiable', () => {
    const load = loadDs4DbiW0HistoricalMotionFixtureV1({
      fixtureId: 'TIG22_V4',
      bindingTier: 'RELAXED',
      repositoryRoot: REPO_ROOT,
    });
    expect(load.ok).toBe(true);
    if (!load.ok) {
      return;
    }
    expect(load.payloadFileSha256).toBe('ddcf32cd111ef21859e7df9f20915190efbe89aa416a22132e02c7d658712ccd');
    const canonical = computeCanonicalPayloadDigestV1(load.payload);
    expect(canonical).not.toBe(load.payloadFileSha256);
    expect(canonical).toMatch(/^[a-f0-9]{64}$/);
    const kernel = computeDs4DbiW0MbfFromPayloadV1({
      payload: load.payload,
      tripMeta: load.tripMeta,
      qualityTier: 'STRICT',
      expectedContentFingerprint: canonical,
      expectedShadowBundleVersion: load.tripMeta.shadowBundleVersion,
      evidenceOrigin: 'HISTORICAL_RESEARCH_RECORDING',
    });
    expect(kernel.diagnostics.failClosedReasons).not.toContain('MBF_W0_FAIL_CLOSED_CONTENT_FINGERPRINT_MISMATCH');
    expect(kernel.d8Burstiness.status).toBe('ABSTAIN');
    const v2 = computeDs4DbiD8V2FromW0ContextV1({
      kernel,
      payload: load.payload,
      tripMeta: load.tripMeta,
      researchSpeedAuthorityPartitionOverride: load.speedAuthorityBinding.partition,
      nullDraws: 8000,
    });
    expect(v2.w0TripFailClosed).toBe(false);
    expect(v2.descriptive.status).toBe('DESCRIPTIVE_RESULT_AVAILABLE');
    expect(v2.inference.status).toBe('STATISTICAL_RESULT_AVAILABLE');
    const w1c = projectDs4DbiW1cTripAssessmentFromW0KernelV1(kernel);
    expect(w1c.ok && w1c.summary.tripOutcome).toBe('PARTIAL');
  });

  it('adversarial: wrong canonical fingerprint forces W0 fail-closed and V2 NOT_EVALUABLE', () => {
    const payload = mkUniformMovingPayload({
      eStarSeconds: 400,
      eventTauSeconds: [40, 80, 120, 160, 200, 240, 280, 320, 360, 400],
    });
    const { kernel, v2, w1c } = runKernelAndV2(payload, 400);
    const tripMeta: Ds4DbiW0TripMetaV1 = {
      tripId: 't',
      sourceMotionRunId: 'r',
      speedAuthority: 'C4_ONLY',
      shadowBundleVersion: payload.contract.algorithmVersions.bundle,
      contentFingerprint: '00',
      exposureSecondsEs: 400,
      distanceKm: 5,
    };
    const failKernel = computeDs4DbiW0MbfFromPayloadV1({
      payload,
      tripMeta,
      qualityTier: 'STRICT',
      expectedContentFingerprint: 'f'.repeat(64),
      evidenceOrigin: 'SYNTHETIC_CONTROL',
    });
    const failV2 = computeDs4DbiD8V2FromW0ContextV1({ kernel: failKernel, payload, tripMeta });
    expect(failKernel.diagnostics.failClosedReasons).toContain('MBF_W0_FAIL_CLOSED_CONTENT_FINGERPRINT_MISMATCH');
    expect(failV2.w0TripFailClosed).toBe(true);
    expect(failV2.descriptive.status).toBe('NOT_EVALUABLE');
    expect(failV2.inference.status).toBe('NOT_EVALUABLE');
    expect(failV2.descriptive.ratePerMovingMinute).toBeNull();
    expect(failV2.inference.observedGreenwoodG).toBeNull();
    const failW1c = projectDs4DbiW1cTripAssessmentFromW0KernelV1(failKernel);
    expect(failW1c.ok && failW1c.summary.tripOutcome).toBe('NOT_EVALUABLE');
    expect(kernel.diagnostics.failClosedReasons).toHaveLength(0);
    expect(v2.descriptive.status).toBe('DESCRIPTIVE_RESULT_AVAILABLE');
    expect(w1c.ok && w1c.summary.tripOutcome).not.toBe('NOT_EVALUABLE');
  });

  it('adversarial: TIG22_V4 raw-SHA-as-canonical fail-closed blocks V2 statistics', () => {
    const load = loadDs4DbiW0HistoricalMotionFixtureV1({
      fixtureId: 'TIG22_V4',
      bindingTier: 'RELAXED',
      repositoryRoot: REPO_ROOT,
    });
    if (!load.ok) {
      throw new Error(load.detail);
    }
    const wrongKernel = computeDs4DbiW0MbfFromPayloadV1({
      payload: load.payload,
      tripMeta: load.tripMeta,
      qualityTier: 'STRICT',
      expectedContentFingerprint: load.payloadFileSha256,
      expectedShadowBundleVersion: load.tripMeta.shadowBundleVersion,
      evidenceOrigin: 'HISTORICAL_RESEARCH_RECORDING',
    });
    const wrongV2 = computeDs4DbiD8V2FromW0ContextV1({ kernel: wrongKernel, payload: load.payload, tripMeta: load.tripMeta });
    expect(wrongV2.w0TripFailClosed).toBe(true);
    expect(wrongV2.descriptive.status).toBe('NOT_EVALUABLE');
    expect(wrongV2.inference.status).toBe('NOT_EVALUABLE');
  });

  it('adversarial: bundle mismatch and duplicate speed label fail-closed', () => {
    const payload = mkUniformMovingPayload({ eStarSeconds: 300, eventTauSeconds: [50, 150] });
    const tripMeta: Ds4DbiW0TripMetaV1 = {
      tripId: 't',
      sourceMotionRunId: 'r',
      speedAuthority: 'C4_ONLY',
      shadowBundleVersion: payload.contract.algorithmVersions.bundle,
      contentFingerprint: computeCanonicalPayloadDigestV1(payload),
      exposureSecondsEs: 300,
      distanceKm: 3,
    };
    const bundleBad = computeDs4DbiW0MbfFromPayloadV1({
      payload,
      tripMeta,
      qualityTier: 'STRICT',
      expectedShadowBundleVersion: 'NOT_A_REAL_BUNDLE',
      evidenceOrigin: 'SYNTHETIC_CONTROL',
    });
    const bundleV2 = computeDs4DbiD8V2FromW0ContextV1({ kernel: bundleBad, payload, tripMeta });
    expect(bundleV2.w0TripFailClosed).toBe(true);
    expect(bundleV2.descriptive.status).toBe('NOT_EVALUABLE');

    const dupPayload = mkUniformMovingPayload({ eStarSeconds: 300, eventTauSeconds: [50] });
    dupPayload.speeds = [...dupPayload.speeds, { ...dupPayload.speeds[0]! }];
    const dupKernel = computeDs4DbiW0MbfFromPayloadV1({
      payload: dupPayload,
      tripMeta: { ...tripMeta, contentFingerprint: computeCanonicalPayloadDigestV1(dupPayload) },
      qualityTier: 'STRICT',
      evidenceOrigin: 'SYNTHETIC_CONTROL',
    });
    const dupV2 = computeDs4DbiD8V2FromW0ContextV1({
      kernel: dupKernel,
      payload: dupPayload,
      tripMeta,
    });
    expect(dupV2.w0TripFailClosed).toBe(true);
    expect(dupV2.w0TripFailClosedReasonCodes).toContain('MBF_W0_FAIL_CLOSED_DUPLICATE_SPEED_LABEL');
  });
});

describe('ds4-dbi-d8-v2 greenwood primitives', () => {
  it('power sensitivity increases with n (research table sanity)', () => {
    const n = 10;
    const nullRef = buildGreenwoodConditionalNullReferenceV1({ eventCount: n, nullDraws: 5000, seed: 7 });
    const rand = mulberry32D8V2(777);
    let hits = 0;
    for (let i = 0; i < 2000; i += 1) {
      const pts: number[] = [];
      const center = rand();
      for (let k = 0; k < n; k += 1) {
        pts.push(center + (rand() - 0.5) * 0.1);
      }
      if (greenwoodNormalizedSpacingsV1(pts) >= nullRef.nullQuantiles.p95) {
        hits += 1;
      }
    }
    expect(hits / 2000).toBeGreaterThan(0.5);
  });
});
