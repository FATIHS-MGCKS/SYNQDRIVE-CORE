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
import type { MotionFsmStopEpisode } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/kinematics/motion-fsm';
import { bucketLabelPlusSeconds, parseBucketLabelMs } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/kinematics/motion-core-grid';
import { buildE9NullDistributionSelectionBlockV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-dbi-w0-e9-null-selection-report.v1';
import { enrichSyntheticPayloadForW0V1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-dbi-w0-synthetic-enrichment.v1';

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
 * E9 — OCCUPANCY_CONDITIONED_NULL: one independent Uniform draw in each of the first 10 × 60s bins (conditions on ≥10 occupied bins),
 * then additional independent Uniform draws on [0, maxOff) until n unique start offsets. Not an unrestricted homogeneous Poisson/uniform null.
 */
function sampleE9OccupancyConditionedNullOffsetsV1(n: number, horizonMs: number, seed: number): number[] {
  const windowMs = 60_000;
  const rand = mulberry32(seed);
  const maxOff = Math.max(1, horizonMs - 1000);
  const uniq = new Set<number>();
  const numBins = Math.floor(horizonMs / windowMs);
  for (let w = 0; w < Math.min(10, numBins); w += 1) {
    const binStart = w * windowMs;
    const binEnd = Math.min((w + 1) * windowMs, horizonMs) - 1000;
    uniq.add(binStart + Math.floor(rand() * Math.max(1, binEnd - binStart)));
  }
  let guard = 0;
  while (uniq.size < n && guard < n * 100_000) {
    guard += 1;
    uniq.add(Math.floor(rand() * maxOff));
  }
  return [...uniq].sort((a, b) => a - b).slice(0, n);
}

/** E9 — unrestricted independent Uniform(start offsets) on [0, maxOff); allows empty 60s bins; may produce duplicate offsets (same-window stacking). */
function sampleE9UnrestrictedUniformOffsetsV1(n: number, horizonMs: number, seed: number): number[] {
  const rand = mulberry32(seed);
  const maxOff = Math.max(1, horizonMs - 1000);
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push(Math.floor(rand() * maxOff));
  }
  return out.sort((a, b) => a - b);
}

type E9NullMonteCarloDrawRecordV1 = {
  seed: number;
  d8Status: 'KNOWN' | 'ABSTAIN';
  d8ReasonCodes: string[];
  indexOfDispersion: number | null;
};

function runE9NullMonteCarloV1(input: {
  draws: number;
  seedStrideStart: number;
  nEv: number;
  horizonMs: number;
  t0ms: number;
  sampleOffsets: (n: number, horizonMs: number, seed: number) => number[];
  speedLabelsUtc: readonly string[];
  tripMeta: {
    tripId: string;
    sourceMotionRunId: string;
    speedAuthority: string;
    shadowBundleVersion: string;
    contentFingerprint: string;
    exposureSecondsEs: number;
    distanceKm: number;
  };
}): {
  acceptedIOD: number[];
  acceptedCount: number;
  abstainedCount: number;
  drawRecords: E9NullMonteCarloDrawRecordV1[];
  meanIod: number | null;
} {
  const records: E9NullMonteCarloDrawRecordV1[] = [];
  const acceptedIOD: number[] = [];
  let acceptedCount = 0;
  let abstainedCount = 0;
  for (let k = 0; k < input.draws; k += 1) {
    const seed = input.seedStrideStart + k;
    const offs = input.sampleOffsets(input.nEv, input.horizonMs, seed);
    const rr = computeDs4DbiW0D8BurstinessFromObservationWindowV1({
      tripMeta: input.tripMeta,
      speedLabelsUtc: input.speedLabelsUtc,
      events: offs.map((off) => ({
        kind: 'ACCELERATION' as const,
        startLabel: msToIsoLabelZ(input.t0ms + off),
        endLabel: msToIsoLabelZ(input.t0ms + off + 1000),
        startSpeedKmh: 40,
        endSpeedKmh: 41,
        deltaKmh: 1,
        quality: 'OK' as const,
        flags: [],
      })),
    });
    records.push({
      seed,
      d8Status: rr.status,
      d8ReasonCodes: [...rr.reasonCodes],
      indexOfDispersion: rr.indexOfDispersion,
    });
    if (rr.status === 'KNOWN' && rr.indexOfDispersion != null && Number.isFinite(rr.indexOfDispersion)) {
      acceptedIOD.push(rr.indexOfDispersion);
      acceptedCount += 1;
    } else {
      abstainedCount += 1;
    }
  }
  const meanIod = acceptedIOD.length > 0 ? acceptedIOD.reduce((a, b) => a + b, 0) / acceptedIOD.length : null;
  return { acceptedIOD, acceptedCount, abstainedCount, drawRecords: records, meanIod };
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
      name: 'regular_spacing' | 'clustered' | 'occupancy_conditioned_null' | 'unrestricted_uniform_null_primary';
      nullModel: 'STRUCTURED' | 'OCCUPANCY_CONDITIONED_NULL' | 'UNRESTRICTED_UNIFORM_ON_EXPOSURE';
      description: string;
      seed: number;
      d8: ReturnType<typeof computeDs4DbiW0D8BurstinessFromObservationWindowV1>;
    }[];
    scientificInterpretation: {
      summary: string;
      monteCarloDoesNotImplyValidation: string;
      d8SupportGate: string;
    };
    nullDistributions: {
      occupancyConditionedNull: {
        model: 'OCCUPANCY_CONDITIONED_NULL';
        selectionLimitation: string;
        draws: number;
        totalDraws: number;
        seedStrideStart: number;
        acceptedCount: number;
        abstainedCount: number;
        empiricalEligibilityRate: number;
        abstentionReasonCounts: Record<string, number>;
        selectionHazard: ReturnType<typeof buildE9NullDistributionSelectionBlockV1>['selectionHazard'];
        interpretationLimitation: string;
        constructionSemantics: string;
        iodValuesAcceptedOnly: number[];
        meanIodAcceptedOnly: number | null;
        drawRecords: E9NullMonteCarloDrawRecordV1[];
      };
      unrestrictedUniformNull: {
        model: 'UNRESTRICTED_UNIFORM_ON_EXPOSURE';
        selectionLimitation: string;
        draws: number;
        totalDraws: number;
        seedStrideStart: number;
        acceptedCount: number;
        abstainedCount: number;
        empiricalEligibilityRate: number;
        abstentionReasonCounts: Record<string, number>;
        selectionHazard: ReturnType<typeof buildE9NullDistributionSelectionBlockV1>['selectionHazard'];
        interpretationLimitation: string;
        constructionSemantics: string;
        externalEligibilityScaleEvidence?: {
          source: string;
          totalTrials: number;
          estimatedEligibilityRateApprox: number;
          methodologyNote: string;
        };
        iodValuesAcceptedOnly: number[];
        meanIodAcceptedOnly: number | null;
        drawRecords: E9NullMonteCarloDrawRecordV1[];
      };
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

  // E9: structured baselines + two null models (occupancy-conditioned vs unrestricted uniform on exposure); Monte Carlo records all D8 outcomes.
  const e9BaseSeed = 0xe9d00142;
  const speedLabsE9 = noisy.speeds.map((s) => s.bucketLabelUtc);
  const eventOffsetsOccupancyNull = sampleE9OccupancyConditionedNullOffsetsV1(nEv, horizonMs, e9BaseSeed);
  const eventOffsetsUnrestrictedPrimary = sampleE9UnrestrictedUniformOffsetsV1(nEv, horizonMs, e9BaseSeed);
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
  const d8OccupancyNullPrimary = computeDs4DbiW0D8BurstinessFromObservationWindowV1({
    tripMeta: meta,
    speedLabelsUtc: speedLabsE9,
    events: eventsFromOffsets(eventOffsetsOccupancyNull),
  });
  const d8UnrestrictedPrimary = computeDs4DbiW0D8BurstinessFromObservationWindowV1({
    tripMeta: meta,
    speedLabelsUtc: speedLabsE9,
    events: eventsFromOffsets(eventOffsetsUnrestrictedPrimary),
  });
  const nullDraws = 50;
  const conditionedMc = runE9NullMonteCarloV1({
    draws: nullDraws,
    seedStrideStart: e9BaseSeed + 1,
    nEv,
    horizonMs,
    t0ms,
    sampleOffsets: sampleE9OccupancyConditionedNullOffsetsV1,
    speedLabelsUtc: speedLabsE9,
    tripMeta: meta,
  });
  const unrestrictedMc = runE9NullMonteCarloV1({
    draws: nullDraws,
    seedStrideStart: e9BaseSeed + 1 + nullDraws,
    nEv,
    horizonMs,
    t0ms,
    sampleOffsets: sampleE9UnrestrictedUniformOffsetsV1,
    speedLabelsUtc: speedLabsE9,
    tripMeta: meta,
  });

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
        {
          name: 'regular_spacing',
          nullModel: 'STRUCTURED',
          description: 'Deterministic wide spacing (methodological structured baseline; not a probabilistic null).',
          seed: e9BaseSeed,
          d8: d8Regular,
        },
        {
          name: 'clustered',
          nullModel: 'STRUCTURED',
          description: 'Deterministic clustering in early windows (sensitivity to burst timing; not a null).',
          seed: e9BaseSeed,
          d8: d8Clustered,
        },
        {
          name: 'occupancy_conditioned_null',
          nullModel: 'OCCUPANCY_CONDITIONED_NULL',
          description:
            'Occupancy-enforcing construction: one Uniform draw per first ten 60s bins, then unique-offset fill to n — not an exact IID-uniform-on-exposure conditional nor an unrestricted uniform-time null.',
          seed: e9BaseSeed,
          d8: d8OccupancyNullPrimary,
        },
        {
          name: 'unrestricted_uniform_null_primary',
          nullModel: 'UNRESTRICTED_UNIFORM_ON_EXPOSURE',
          description:
            'Twelve independent Uniform draws of event start offset on [0, Es−1s); empty 60s bins allowed; duplicates allowed (D8 bins stack).',
          seed: e9BaseSeed,
          d8: d8UnrestrictedPrimary,
        },
      ],
      scientificInterpretation: {
        summary:
          'Compare structured layouts to two distinct null constructions: OCCUPANCY_CONDITIONED_NULL (occupancy-enforcing in early bins; not an exact conditional-IID-uniform reference) vs UNRESTRICTED_UNIFORM_ON_EXPOSURE (no empty-window forcing; censored by the same D8 support gate). Monte Carlo lists every draw; IOD summaries use D8-accepted draws only.',
        monteCarloDoesNotImplyValidation:
          'Finite synthetic IOD values from this harness do not constitute scientific validation of E9 or W0; research-only reporting.',
        d8SupportGate:
          'D8 may ABSTAIN per preregistered gates (e.g. MBF_W0_INSUFFICIENT_WINDOWS_FOR_BURSTINESS); abstentions are reported per draw, not silently dropped without record. Unrestricted uniform draws evaluated through D8 yield a censored reference — empiricalEligibilityRate is from this batch; see externalEligibilityScaleEvidence for a separate large-trial scale estimate.',
      },
      nullDistributions: {
        occupancyConditionedNull: {
          model: 'OCCUPANCY_CONDITIONED_NULL',
          selectionLimitation:
            'Occupancy-enforcing (nonempty first ten 60s bins by construction); biases toward spread occupancy vs unrestricted uniform — not identical to a formal conditional IID-uniform distribution on the full support.',
          draws: nullDraws,
          ...buildE9NullDistributionSelectionBlockV1({
            model: 'OCCUPANCY_CONDITIONED_NULL',
            totalDraws: nullDraws,
            mc: conditionedMc,
            interpretationLimitation:
              'Accepted-only IOD here reflects D8-eligible draws under this construction; the sampler enforces early-bin occupancy rather than sampling from a fully explicit conditional IID-uniform law.',
            constructionSemantics:
              'OCCUPANCY_CONDITIONED_NULL: one independent Uniform draw in each of the first ten 60s bins, then additional Uniform draws on [0, Es−1s) until n unique start offsets — an occupancy-enforcing recipe, not an exact conditional IID-uniform on exposure.',
            includeExternalEligibilityEvidence: false,
          }),
          seedStrideStart: e9BaseSeed + 1,
          iodValuesAcceptedOnly: conditionedMc.acceptedIOD,
          meanIodAcceptedOnly: conditionedMc.meanIod,
          drawRecords: conditionedMc.drawRecords,
        },
        unrestrictedUniformNull: {
          model: 'UNRESTRICTED_UNIFORM_ON_EXPOSURE',
          selectionLimitation:
            'Independent uniform start times on [0, Es−1s) with replacement; duplicate offsets stack in D8 bins. D8 support-gate censoring is severe for (Es=660s, n=12, minNonemptyWindows=10) — accepted-only IOD is not the full marginal unrestricted law.',
          draws: nullDraws,
          ...buildE9NullDistributionSelectionBlockV1({
            model: 'UNRESTRICTED_UNIFORM_ON_EXPOSURE',
            totalDraws: nullDraws,
            mc: unrestrictedMc,
            interpretationLimitation:
              'D8 preregistered support gate (min events + min nonempty 60s windows) censors most unrestricted draws; empiricalEligibilityRate is the observed acceptance in this batch only (0 accepted does not imply true eligibility is zero). externalEligibilityScaleEvidence records a separate audited large-MC scale rate.',
            constructionSemantics:
              'UNRESTRICTED_UNIFORM_ON_EXPOSURE: n independent Uniform draws of event start offset on [0, Es−1s); empty 60s bins allowed; duplicates allowed (D8 counts stack in-bin).',
            includeExternalEligibilityEvidence: true,
          }),
          seedStrideStart: e9BaseSeed + 1 + nullDraws,
          iodValuesAcceptedOnly: unrestrictedMc.acceptedIOD,
          meanIodAcceptedOnly: unrestrictedMc.meanIod,
          drawRecords: unrestrictedMc.drawRecords,
        },
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
      'evidenceOrigin=SYNTHETIC_P2_ENRICHMENT: 1Hz speeds/FSM/stops are synthetic from sealed P2 timing (not raw sealed C4 gzip). P2 index-placeholder events (1970-01-01) are stripped from payload.events before kernel evaluation. sealedReferenceContentFingerprintSha256 is CSV attestation metadata only — never compared to JSON.stringify(payload) digest unless explicit verified SEALED_REAL_C4 attestation exists. independentScientificValidationStatus is always NOT_EVALUATED until a verified sealed-real loader exists. sealedRealC4StatisticalEligibility is always false in W0 — any caller SEALED_REAL_C4 label or userland attestation object fails closed; trusted loader deferred to W1. D8 uses fixed trip exposureSecondsEs as observation horizon from min(first speed, first event start). E9 syntheticControls distinguishes OCCUPANCY_CONDITIONED_NULL from UNRESTRICTED_UNIFORM_ON_EXPOSURE; OCCUPANCY_CONDITIONED_NULL is an occupancy-enforcing construction (not an exact conditional IID-uniform reference). E9 nullDistributions report empiricalEligibilityRate from the batch and abstentionReasonCounts; unrestricted reference distributions are censored by the D8 support gate — use externalEligibilityScaleEvidence for a separate large-trial scale estimate, not a substitute for empirical batch rates. Monte Carlo records every draw including D8 ABSTAIN — finite accepted IOD summaries are not validation. D4–D8 thresholds are preregistered candidates.',
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
