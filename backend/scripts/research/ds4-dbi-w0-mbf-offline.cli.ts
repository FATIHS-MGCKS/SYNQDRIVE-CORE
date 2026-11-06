/**
 * DS4 Driving Behavior Intelligence W0 — offline MBF kernel harness (research only).
 *
 * Usage (from backend/):
 *   npx ts-node scripts/research/ds4-dbi-w0-mbf-offline.cli.ts --json
 *
 * Uses pinned Layer-2 P2 CSV metadata + synthetic motion payloads (same pattern as P4B test harness).
 * Does not load production DB or network.
 */

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseDs4Layer2P2PinnedCsvV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p2-pinned-11-fixture-loader.v1';
import {
  DS4_LAYER2_P2_PINNED_11_EVALUATION_CODE_SHA_V1,
  DS4_LAYER2_P2_PINNED_11_FILE_CHECKSUMS_SHA256_V1,
  DS4_LAYER2_P2_PINNED_11_MANIFEST_CHECKSUM_SHA256_V1,
  DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p2-pinned-11.attestation.v1';
import type { Ds4Layer2P4bP2AdmissibleEventRowV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p4b-event-kinematics-evidence.v1.contract';
import { buildDs4Layer2P4bSyntheticPayloadsFromP2EventsV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p4b-test-payload-synth.v1';
import {
  computeDs4DbiW0D8BurstinessFromObservationWindowV1,
  computeDs4DbiW0MbfFromPayloadV1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-dbi-w0-mbf-kernel.v1';
import type {
  Ds4DbiW0QualityTierV1,
  Ds4DbiW0TripKernelResultV1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-dbi-w0-mbf.types.v1';
import type { DiV0MotionCoreShadowPayloadV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import type { MotionFsmState, MotionFsmStopEpisode } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/kinematics/motion-fsm';
import { bucketLabelPlusSeconds, parseBucketLabelMs } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/kinematics/motion-core-grid';

/** Deterministic PRNG for E9 (LCG-style; research control only). */
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

function msToIsoLabelZ(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * E9 null-process: one independent Uniform draw in each of the first 10 six-minute bins (guarantees ≥10 non‑empty windows),
 * then additional independent draws until n unique event times (same count n, not multiset-preserving vs regular).
 */
function sampleE9UniformNullOffsetsV1(n: number, horizonMs: number, seed: number): number[] {
  const windowMs = 60_000;
  const rand = mulberry32(seed);
  const uniq = new Set<number>();
  const numBins = Math.floor(horizonMs / windowMs);
  for (let w = 0; w < Math.min(10, numBins); w += 1) {
    const binStart = w * windowMs;
    const binEnd = Math.min((w + 1) * windowMs, horizonMs) - 2000;
    uniq.add(binStart + Math.floor(rand() * Math.max(1, binEnd - binStart)));
  }
  let guard = 0;
  while (uniq.size < n && guard < n * 100_000) {
    guard += 1;
    uniq.add(Math.floor(rand() * Math.max(1, horizonMs - 2000)));
  }
  return [...uniq].sort((a, b) => a - b).slice(0, n);
}

const fixtureDir = join(
  __dirname,
  '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/fixtures/ds4-layer2-p2-pinned-11',
);

function parseArgs(): { json: boolean } {
  return { json: process.argv.includes('--json') };
}

function admissibleRowsFromLongitudinalCsvV1(vehicleIdByTripId: ReadonlyMap<string, string>): Ds4Layer2P4bP2AdmissibleEventRowV1[] {
  const text = readFileSync(join(fixtureDir, 'p2_longitudinal_events.csv'), 'utf8');
  const rows = parseDs4Layer2P2PinnedCsvV1(text);
  const out: Ds4Layer2P4bP2AdmissibleEventRowV1[] = [];
  for (const r of rows) {
    const cls = r.eligibility_classification ?? '';
    if (!cls.startsWith('ADMISSIBLE')) {
      continue;
    }
    const tripId = r.trip_id!;
    out.push({
      offlineReconstructionKey: r.offline_reconstruction_key!,
      tripId,
      vehicleId: vehicleIdByTripId.get(tripId) ?? 'UNKNOWN_VEHICLE',
      sourceMotionRunId: r.source_motion_run_id!,
      eventIndex: Number(r.event_index),
      eventKind: r.event_kind!,
      startLabelUtc: r.start_label_utc!,
      endLabelUtc: r.end_label_utc!,
      durationS: Number(r.duration_s),
      steps: Number(r.steps),
      coverageRatio: r.coverage_ratio === '' ? null : Number(r.coverage_ratio),
      durationTier: r.duration_tier!,
      eligibilityClassification: r.eligibility_classification!,
      speedAuthority: r.speed_authority!,
    });
  }
  return out;
}

function reconstructedTripRowsV1() {
  const text = readFileSync(join(fixtureDir, 'p2_reconstructed_assessments.csv'), 'utf8');
  return parseDs4Layer2P2PinnedCsvV1(text);
}

/**
 * Rich-enough synthetic payload for W0 D4/D5/D6: consecutive 1s labels on MOVING_DIRECT intersection,
 * DIRECT stop episodes, and FSM timeline.
 */
function enrichSyntheticPayloadForW0V1(
  _tripId: string,
  base: DiV0MotionCoreShadowPayloadV1,
  tripMeta: {
    exposureSecondsEs: number;
  },
): DiV0MotionCoreShadowPayloadV1 {
  /** P2 synth inserts placeholder events at missing indices (1970-01-01…) — exclude from temporal span. */
  const YEAR_2000_MS = 946684800000;
  const admitted = base.events.filter(
    (e) => e.quality === 'OK' && parseBucketLabelMs(e.startLabel) >= YEAR_2000_MS && parseBucketLabelMs(e.endLabel) >= YEAR_2000_MS,
  );
  const eventEdgesMs =
    admitted.length > 0
      ? admitted.flatMap((e) => [parseBucketLabelMs(e.startLabel), parseBucketLabelMs(e.endLabel)])
      : [parseBucketLabelMs('2026-10-28T00:00:00Z')];
  const tEventMin = Math.min(...eventEdgesMs);
  const tEventMax = Math.max(...eventEdgesMs);
  const padStartMs = tEventMin - 120_000;
  const esSeconds = Math.max(
    1,
    Math.round(tripMeta.exposureSecondsEs),
    admitted.length > 0 ? Math.ceil((tEventMax - tEventMin) / 1000) + 240 : Math.round(tripMeta.exposureSecondsEs),
  );

  const stopWindows: { startMs: number; endMs: number }[] = [];
  for (const e of admitted) {
    if (e.kind !== 'DECELERATION') {
      continue;
    }
    const stopStartMs = parseBucketLabelMs(e.endLabel) + 1000;
    const stopEndMs = stopStartMs + 4000;
    stopWindows.push({ startMs: stopStartMs, endMs: stopEndMs });
  }

  const speeds: DiV0MotionCoreShadowPayloadV1['speeds'] = [];
  const fsmLabels: DiV0MotionCoreShadowPayloadV1['fsmLabels'] = [];
  for (let s = 0; s < esSeconds; s += 1) {
    const t = padStartMs + s * 1000;
    const label = new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');

    const inStop = stopWindows.some((w) => t >= w.startMs && t <= w.endMs);
    const inManeuvre = admitted.some((e) => {
      const a = parseBucketLabelMs(e.startLabel);
      const b = parseBucketLabelMs(e.endLabel);
      return t >= a && t <= b;
    });

    let speedKmh = 32 + (s % 5);
    let state: MotionFsmState = 'MOVING';
    let evidenceQuality: 'DIRECT' | 'INFERRED' = 'DIRECT';
    if (inStop) {
      speedKmh = 0;
      state = 'STATIONARY';
      evidenceQuality = 'DIRECT';
    } else if (inManeuvre) {
      state = 'MOVING';
      speedKmh = 30 + ((s % 11) - 5);
      evidenceQuality = 'DIRECT';
    } else {
      state = 'MOVING';
      speedKmh = 36 + (s % 4);
      evidenceQuality = 'DIRECT';
    }

    speeds.push({
      bucketLabelUtc: label,
      speedKmh,
      quality: 'OK',
      support: [],
      estimator: 'W0_SYNTH',
      flags: [],
    });
    fsmLabels.push({
      bucketLabelUtc: label,
      state,
      evidenceQuality,
      reason: 'W0_SYNTH',
      flags: [],
    });
  }

  const stopEpisodes: MotionFsmStopEpisode[] = [];
  let tripCounter = 0;
  for (const w of stopWindows) {
    const startLab = new Date(w.startMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const endLab = new Date(w.endMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
    stopEpisodes.push({
      trip: tripCounter,
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
    tripCounter += 1;
  }

  return {
    ...base,
    speeds,
    fsmLabels,
    stopEpisodes,
    summary: {
      ...base.summary,
      labelCount: speeds.length,
      speedNumericCount: speeds.length,
      stopEpisodeCount: stopEpisodes.length,
    },
  };
}

function runSyntheticControlsV1(): {
  e7: { scenario: string; d5Rough: number | null; reasonSample: string[] }[];
  e9: {
    observationWindow: {
      durationSeconds: number;
      startLabelUtc: string;
      endLabelUtc: string;
    };
    eventCount: number;
    baseSeed: number;
    scenarios: {
      name: 'regular_spacing' | 'clustered' | 'uniform_random_null';
      seed: number;
      d8: ReturnType<typeof computeDs4DbiW0D8BurstinessFromObservationWindowV1>;
    }[];
    nullDistribution: {
      draws: number;
      seedStrideStart: number;
      iodValues: number[];
      meanIod: number | null;
    };
  };
  e10: { scenario: string; d4Status: string; reasons: string[]; observedFingerprintPrefix: string }[];
} {
  const baseTime = '2026-01-01T12:00:00Z';
  const mkPayload = (overrides: Partial<DiV0MotionCoreShadowPayloadV1>): DiV0MotionCoreShadowPayloadV1 => {
    /** 720s of 1Hz labels ≥ trip exposure (660s) used for D8 window anchoring. */
    const labelSeconds = 720;
    const speeds: DiV0MotionCoreShadowPayloadV1['speeds'] = [];
    const fsm: DiV0MotionCoreShadowPayloadV1['fsmLabels'] = [];
    const stopEpisodes: MotionFsmStopEpisode[] = [];
    for (let s = 0; s < 3; s += 1) {
      const startOff = 20 + s * 50;
      const startLab = bucketLabelPlusSeconds(baseTime, startOff);
      const endLab = bucketLabelPlusSeconds(baseTime, startOff + 4);
      stopEpisodes.push({
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
    for (let i = 0; i < labelSeconds; i += 1) {
      const lab = bucketLabelPlusSeconds(baseTime, i);
      speeds.push({
        bucketLabelUtc: lab,
        speedKmh: 40,
        quality: 'OK',
        support: [],
        estimator: 'CTRL',
        flags: [],
      });
      fsm.push({
        bucketLabelUtc: lab,
        state: 'MOVING',
        evidenceQuality: 'DIRECT',
        reason: 'CTRL',
        flags: [],
      });
    }
    const contract: DiV0MotionCoreShadowPayloadV1['contract'] = {
      algorithmVersions: {
        c4: 'ctrl',
        c5_1: null,
        c5_1ProductionSafety: null,
        c5_1AlgorithmFileSha256: null,
        fsm: 'ctrl',
        gapBridgeV1: null,
        fsmAuxBinding: null,
        events: 'ctrl',
        bundle: 'CTRL_BUNDLE',
      },
      speedAuthority: 'C4_ONLY',
      timeSemantics: {
        processingMode: 'POST_TRIP_RETROSPECTIVE',
        c4ValueSupportForwardS: 1,
        c4FullFinalizationForwardS: 1,
        fsmMode: 'RETROSPECTIVE',
        eventFinalizationNote: 'ctrl',
        computedAtUtc: '2026-01-01T12:00:00Z',
      },
      sparse: { channelOutcome: null, comparable: true, sampleCount: 0, samples: [], limitations: [] },
      comparisonHints: {
        artefactSuspectExcludedFromAcceptedManoeuvreCounts: true,
        inferredNeverPromotedToDirect: true,
        unknownNotCountedAsConfirmedStandstill: true,
      },
    };
    return {
      contract,
      speeds,
      fsmLabels: fsm,
      stopEpisodes,
      events: [],
      summary: {
        labelCount: speeds.length,
        speedNumericCount: speeds.length,
        eventCount: 0,
        eventAcceptedCount: 0,
        eventArtefactSuspectCount: 0,
        stopEpisodeCount: stopEpisodes.length,
      },
      ...overrides,
    };
  };

  const meta = {
    tripId: 'ctrl-trip',
    sourceMotionRunId: 'ctrl-run',
    speedAuthority: 'C4_ONLY',
    shadowBundleVersion: 'CTRL',
    contentFingerprint: 'a'.repeat(64),
    /** Grounds D8 in [t0, t0+660s) including empty trailing windows vs event-only span. */
    exposureSecondsEs: 660,
    distanceKm: 1,
  };

  // E7: constant speed + small noise
  const noisy = mkPayload({});
  for (let i = 0; i < noisy.speeds.length; i += 1) {
    noisy.speeds[i] = {
      ...noisy.speeds[i]!,
      speedKmh: 40 + (i % 3 === 0 ? 0.2 : i % 3 === 1 ? -0.15 : 0),
    };
  }
  const t0ms = parseBucketLabelMs(bucketLabelPlusSeconds(baseTime, 0));
  const horizonMs = meta.exposureSecondsEs * 1000;
  const nEv = 12;
  const windowMs = 60_000;
  const eventOffsetsRegular = Array.from({ length: nEv }, (_, j) => Math.min(horizonMs - 2000, j * 55_000));
  const eventOffsetsClustered: number[] = [5000, 25_000, windowMs + 5000, windowMs + 25_000];
  for (let w = 2; w <= 9; w += 1) {
    eventOffsetsClustered.push(w * windowMs + 30_000);
  }
  const eventsFromOffsets = (offsets: number[]): DiV0MotionCoreShadowPayloadV1['events'] =>
    offsets.map((off) => ({
      kind: 'ACCELERATION' as const,
      startLabel: msToIsoLabelZ(t0ms + off),
      endLabel: msToIsoLabelZ(t0ms + off + 1000),
      startSpeedKmh: 40,
      endSpeedKmh: 41,
      deltaKmh: 1,
      quality: 'OK' as const,
      flags: [],
    }));
  noisy.events = eventsFromOffsets(eventOffsetsRegular);
  const rNoise = computeDs4DbiW0MbfFromPayloadV1({
    payload: noisy,
    tripMeta: meta,
    qualityTier: 'STRICT',
    syntheticScenarioTag: 'E7_NOISE',
    evidenceOrigin: 'SYNTHETIC_CONTROL',
  });

  // E7: stationary-only (no MOVING_DIRECT overlap)
  const stat = mkPayload({});
  for (const row of stat.fsmLabels) {
    row.state = 'STATIONARY';
    row.evidenceQuality = 'DIRECT';
  }
  const rStat = computeDs4DbiW0MbfFromPayloadV1({
    payload: stat,
    tripMeta: meta,
    qualityTier: 'STRICT',
    syntheticScenarioTag: 'E7_STATIONARY',
    evidenceOrigin: 'SYNTHETIC_CONTROL',
  });

  // E7: short trip
  const shortPay = mkPayload({});
  shortPay.speeds = shortPay.speeds.slice(0, 30);
  shortPay.fsmLabels = shortPay.fsmLabels.slice(0, 30);
  shortPay.summary.labelCount = shortPay.speeds.length;
  shortPay.summary.speedNumericCount = shortPay.speeds.length;
  const rShort = computeDs4DbiW0MbfFromPayloadV1({
    payload: shortPay,
    tripMeta: { ...meta, exposureSecondsEs: 30 },
    qualityTier: 'STRICT',
    syntheticScenarioTag: 'E7_SHORT',
    evidenceOrigin: 'SYNTHETIC_CONTROL',
  });

  // E9: point-process null — same n, fixed exposure window, independent Uniform draws; compare to regular/clustered
  const e9BaseSeed = 0xe9d00142;
  const speedLabsE9 = noisy.speeds.map((s) => s.bucketLabelUtc);
  const eventOffsetsRandom = sampleE9UniformNullOffsetsV1(nEv, horizonMs, e9BaseSeed);
  const d8Regular = computeDs4DbiW0D8BurstinessFromObservationWindowV1({
    tripMeta: meta,
    speedLabelsUtc: speedLabsE9,
    events: eventsFromOffsets(eventOffsetsRegular),
  });
  const d8Clustered = computeDs4DbiW0D8BurstinessFromObservationWindowV1({
    tripMeta: meta,
    speedLabelsUtc: speedLabsE9,
    events: eventsFromOffsets(eventOffsetsClustered),
  });
  const d8RandomPrimary = computeDs4DbiW0D8BurstinessFromObservationWindowV1({
    tripMeta: meta,
    speedLabelsUtc: speedLabsE9,
    events: eventsFromOffsets(eventOffsetsRandom),
  });
  const nullIods: number[] = [];
  const nullDraws = 50;
  for (let k = 1; k <= nullDraws; k += 1) {
    const offs = sampleE9UniformNullOffsetsV1(nEv, horizonMs, e9BaseSeed + k);
    const rr = computeDs4DbiW0D8BurstinessFromObservationWindowV1({
      tripMeta: meta,
      speedLabelsUtc: speedLabsE9,
      events: eventsFromOffsets(offs),
    });
    if (rr.indexOfDispersion != null && Number.isFinite(rr.indexOfDispersion)) {
      nullIods.push(rr.indexOfDispersion);
    }
  }
  const meanNullIod = nullIods.length > 0 ? nullIods.reduce((a, b) => a + b, 0) / nullIods.length : null;

  // E10: fingerprint mismatch
  const observedFp = createHash('sha256').update(JSON.stringify(noisy)).digest('hex');
  const rFp = computeDs4DbiW0MbfFromPayloadV1({
    payload: noisy,
    tripMeta: meta,
    qualityTier: 'STRICT',
    expectedContentFingerprint: 'b'.repeat(64),
    syntheticScenarioTag: 'E10_FP',
    evidenceOrigin: 'SYNTHETIC_CONTROL',
  });

  return {
    e7: [
      {
        scenario: 'constant_speed_noise',
        d5Rough: rNoise.d5SpeedRoughnessMeanAbsDeltaKmhPerS.value,
        reasonSample: rNoise.d5SpeedRoughnessMeanAbsDeltaKmhPerS.reasonCodes.slice(0, 3),
      },
      {
        scenario: 'stationary_only',
        d5Rough: rStat.d5SpeedRoughnessMeanAbsDeltaKmhPerS.value,
        reasonSample: rStat.d4SpeedVariabilityRobustCv.reasonCodes.slice(0, 4),
      },
      { scenario: 'short_sparse', d5Rough: rShort.d5SpeedRoughnessMeanAbsDeltaKmhPerS.value, reasonSample: rShort.d4SpeedVariabilityRobustCv.reasonCodes.slice(0, 4) },
    ],
    e9: {
      observationWindow: {
        durationSeconds: meta.exposureSecondsEs,
        startLabelUtc: msToIsoLabelZ(t0ms),
        endLabelUtc: msToIsoLabelZ(t0ms + horizonMs),
      },
      eventCount: nEv,
      baseSeed: e9BaseSeed,
      scenarios: [
        { name: 'regular_spacing', seed: e9BaseSeed, d8: d8Regular },
        { name: 'clustered', seed: e9BaseSeed, d8: d8Clustered },
        { name: 'uniform_random_null', seed: e9BaseSeed, d8: d8RandomPrimary },
      ],
      nullDistribution: {
        draws: nullDraws,
        seedStrideStart: e9BaseSeed + 1,
        iodValues: nullIods,
        meanIod: meanNullIod,
      },
    },
    e10: [
      {
        scenario: 'fingerprint_mismatch',
        d4Status: rFp.d4SpeedVariabilityRobustCv.status,
        reasons: rFp.d4SpeedVariabilityRobustCv.reasonCodes,
        observedFingerprintPrefix: observedFp.slice(0, 12),
      },
    ],
  };
}

function feasibilityMatrixV1(
  trips: Ds4DbiW0TripKernelResultV1[],
  tripRows: Record<string, string>[],
): Record<
  string,
  {
    hasP2Meta: boolean;
    hasSyntheticMotionPayload: boolean;
    consecutive1sSpeedSeries: boolean;
    fsmLabels: boolean;
    stopEpisodesDirect: boolean;
    eventsOk: boolean;
    exposureDistance: boolean;
    sealedContentFingerprintInP2Meta: boolean;
    syntheticPayloadContentFingerprint: string | null;
    d4Evaluable: boolean;
    d5Evaluable: boolean;
    d6Evaluable: boolean;
    d8Evaluable: boolean;
  }
> {
  const byTrip = new Map(trips.map((t) => [t.tripId, t]));
  const out: ReturnType<typeof feasibilityMatrixV1> = {};
  for (const r of tripRows) {
    const tripId = r.trip_id!;
    const t = byTrip.get(tripId)!;
    const consecutive =
      t.diagnostics.speedRowCount > 1 &&
      t.diagnostics.consecutiveOneSecondPairCount >= Math.min(120, t.diagnostics.speedRowCount - 1);
    out[tripId] = {
      hasP2Meta: true,
      hasSyntheticMotionPayload: true,
      consecutive1sSpeedSeries: consecutive,
      fsmLabels: t.diagnostics.fsmRowCount > 0,
      stopEpisodesDirect: t.diagnostics.directStopEpisodeCount > 0,
      eventsOk: t.diagnostics.eventCount > 0,
      exposureDistance: Number(r.exposure_seconds_Es) > 0 && Number(r.distance_km_D) > 0,
      sealedContentFingerprintInP2Meta: Boolean(r.content_fingerprint),
      syntheticPayloadContentFingerprint: t.contentFingerprintObserved,
      d4Evaluable: t.d4SpeedVariabilityRobustCv.status === 'KNOWN',
      d5Evaluable: t.d5SpeedRoughnessMeanAbsDeltaKmhPerS.status === 'KNOWN',
      d6Evaluable: t.d6StopStructure.status === 'KNOWN',
      d8Evaluable: t.d8Burstiness.status === 'KNOWN',
    };
  }
  return out;
}

async function main(): Promise<void> {
  const { json } = parseArgs();
  const tripRows = reconstructedTripRowsV1();
  const vehicleIdByTripId = new Map<string, string>();
  for (const row of tripRows) {
    vehicleIdByTripId.set(row.trip_id!, row.vehicle_id!);
  }
  const admissible = admissibleRowsFromLongitudinalCsvV1(vehicleIdByTripId);
  const basePayloads = buildDs4Layer2P4bSyntheticPayloadsFromP2EventsV1(admissible, {
    includeWindowSpeedSamples: true,
    linearInWindowSpeedSamples: true,
    boundarySpeedKmh: 40,
  });

  const results: Ds4DbiW0TripKernelResultV1[] = [];
  for (const row of tripRows) {
    const tripId = row.trip_id!;
    const runId = row.source_motion_run_id!;
    const loaded = basePayloads.get(runId);
    if (!loaded) {
      results.push(
        computeDs4DbiW0MbfFromPayloadV1({
          payload: null,
          tripMeta: {
            tripId,
            sourceMotionRunId: runId,
            speedAuthority: row.speed_authority!,
            shadowBundleVersion: row.shadow_bundle_version!,
            contentFingerprint: row.content_fingerprint!,
            exposureSecondsEs: Number(row.exposure_seconds_Es),
            distanceKm: Number(row.distance_km_D),
          },
          qualityTier: 'STRICT',
          evidenceOrigin: 'SYNTHETIC_P2_ENRICHMENT',
          sealedReferenceContentFingerprintSha256: row.content_fingerprint!,
        }),
      );
      continue;
    }
    const enriched = enrichSyntheticPayloadForW0V1(tripId, loaded.payload, {
      exposureSecondsEs: Number(row.exposure_seconds_Es),
    });
    const tripMeta = {
      tripId,
      sourceMotionRunId: runId,
      speedAuthority: row.speed_authority!,
      shadowBundleVersion: row.shadow_bundle_version!,
      contentFingerprint: row.content_fingerprint!,
      exposureSecondsEs: Number(row.exposure_seconds_Es),
      distanceKm: Number(row.distance_km_D),
    };
    const strict = computeDs4DbiW0MbfFromPayloadV1({
      payload: enriched,
      tripMeta,
      qualityTier: 'STRICT' as Ds4DbiW0QualityTierV1,
      evidenceOrigin: 'SYNTHETIC_P2_ENRICHMENT',
      sealedReferenceContentFingerprintSha256: row.content_fingerprint!,
    });
    results.push(strict);
  }

  const matrix = feasibilityMatrixV1(results, tripRows);
  const controls = runSyntheticControlsV1();

  const report = {
    operation: 'DS4_DBI_W0_OFFLINE_BEHAVIOR_RESEARCH',
    evaluationCodeSha: DS4_LAYER2_P2_PINNED_11_EVALUATION_CODE_SHA_V1,
    organizationId: DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
    pinnedEvidenceHashes: {
      manifestSha256: DS4_LAYER2_P2_PINNED_11_MANIFEST_CHECKSUM_SHA256_V1,
      fileChecksumsSha256: DS4_LAYER2_P2_PINNED_11_FILE_CHECKSUMS_SHA256_V1,
    },
    inputFeasibilityMatrix: matrix,
    tripResultsStrict: results,
    syntheticControls: controls,
    scientificNote:
      'evidenceOrigin=SYNTHETIC_P2_ENRICHMENT: 1Hz speeds/FSM/stops are synthetic from sealed P2 timing (not raw sealed C4 gzip). sealedReferenceContentFingerprintSha256 is CSV attestation metadata only — never compared to JSON.stringify(payload) digest unless explicit SEALED_REAL_C4 contract exists. independentScientificValidationStatus is always NOT_EVALUATED until a verified sealed-real loader exists. sealedRealC4StatisticalEligibility is false for synthetic paths. D8 uses fixed trip exposureSecondsEs as observation horizon from min(first speed, first event start). D4–D8 thresholds are preregistered candidates.',
    realVsSyntheticBoundary:
      'SYNTHETIC_CONTROL / SYNTHETIC_P2_ENRICHMENT: speed-based metrics are methodological only. SEALED_REAL_C4 reserved for future unmodified shadow exports.',
  };

  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`Trips evaluated: ${results.length}\n`);
    process.stdout.write(`See --json for full machine-readable report.\n`);
  }
}

void main();
