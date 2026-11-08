import { parseHfRpmValueFloat } from '@modules/clickhouse/hf-rpm-value-parse.util';
import { R1_OBD_RECORD_TIME_UNCERTAIN } from '../../r1-temporal-containment';
import {
  hasUncertainHistoricalObdRecordTime,
  resolveTelemetrySourceFamily,
} from '../../telemetry-source-family';
import { DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-scientific-claims.v1';
import { computeDs4RpmReferenceIntelligenceV1 } from '../rpm-reference-intelligence-v1/ds4-rpm-reference-intelligence-v1.engine';
import { buildDs4RpmHfV1bAdmissionQualityExposure } from '../rpm-hf-v1b/ds4-rpm-hf-v1b-quality-exposure';
import type { Ds4RpmHfV1bTemporalCadenceProfile } from '../rpm-hf-v1b/ds4-rpm-hf-v1b-temporal.engine';
import type { Ds4RpmRealDataOfflineInputBundleV1 } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-replay.contract.v1';
import {
  DS4_RPM_EPISODE_RESEARCH_CONTRACT_VERSION,
  DS4_RPM_EPISODE_RESEARCH_EXCEEDANCE_GRID_MAX_THRESHOLDS,
  DS4_RPM_EPISODE_RESEARCH_EXCEEDANCE_GRID_RPM,
  type Ds4RpmEpisodeResearchHighCoreAboveReferenceMaxStatus,
  DS4_RPM_EPISODE_RESEARCH_HIGH_ENTRY_U,
  DS4_RPM_EPISODE_RESEARCH_HIGH_EXIT_U,
  DS4_RPM_EPISODE_RESEARCH_ICE_RPM_ROTATING_MIN,
  DS4_RPM_EPISODE_RESEARCH_KERNEL_VERSION,
  DS4_RPM_EPISODE_RESEARCH_MIN_CORE_POINTS,
  DS4_RPM_EPISODE_RESEARCH_MIN_ROTATING_LABELS,
  DS4_RPM_EPISODE_RESEARCH_NEAR_MAX_ENTRY_U,
  DS4_RPM_EPISODE_RESEARCH_NEAR_MAX_EXIT_U,
  DS4_RPM_EPISODE_RESEARCH_REFERENCE_CONFLICT_MIN_LABELS_ABOVE_MAX,
  type Ds4RpmEpisodeResearchInputV1,
  type Ds4RpmEpisodeResearchMassAccountingV1,
  type Ds4RpmEpisodeResearchEpisodeItemV1,
  type Ds4RpmEpisodeResearchResultV1,
  type Ds4RpmEpisodeResearchSemanticGuardV1,
} from './ds4-rpm-episode-research.contract.v1';
import { validateDs4RpmEpisodeResearchInputBinding } from './ds4-rpm-episode-research.input-binding.v1';

type CanonPoint = {
  recordedAtIso: string;
  recordedAtMs: number;
  valueRpm: number;
  globalIdx: number;
};

type EpisodeRun = {
  sequenceIndex: number;
  startIdx: number;
  endIdx: number;
  pointCount: number;
  corePointCount: number;
  peakU: number;
  peakRpm: number;
  leftCensored: boolean;
  rightCensored: boolean;
  admitted: boolean;
  nearMaxSubEpisodeCount: number;
};

const SEMANTIC_GUARDS: Ds4RpmEpisodeResearchSemanticGuardV1 = {
  bucketGridSpanIsNotPhysicalDuration: true,
  labelsNotForCrossDomainJoin: true,
  highRpmIsNotEngineLoad: true,
  nearMaxReferenceIsNotOverRevving: true,
  episodeIsNotMisuse: true,
  notEvidenceCandidate: true,
  misuseEligibility: 'NOT_EVALUATED_BY_DESIGN',
};

function nearestRankQuantile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.ceil(p * sorted.length);
  const idx = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[idx]!;
}

function buildAbstainedResult(
  input: Ds4RpmEpisodeResearchInputV1,
  abstainReasons: readonly string[],
  family: ReturnType<typeof resolveTelemetrySourceFamily> | null,
): Ds4RpmEpisodeResearchResultV1 {
  return {
    contractVersion: DS4_RPM_EPISODE_RESEARCH_CONTRACT_VERSION,
    kernelVersion: DS4_RPM_EPISODE_RESEARCH_KERNEL_VERSION,
    researchOnly: true,
    evidenceOrigin: input.evidenceOrigin,
    bindings: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      providerSourceLinkId: input.providerSourceLinkId,
      v1bInputFingerprint: input.v1bResult?.inputFingerprint ?? null,
      v1bEngineVersion: input.v1bResult?.engineVersion ?? null,
      sourceBundleId: input.sourceBundleId,
      telemetrySourceFamily: family,
      cadenceTier: input.v1bResult?.tierEvidence?.tier ?? null,
      analysisMode: input.v1bResult?.tierEvidence?.analysisMode ?? null,
    },
    timeAuthority: 'BUCKET_LABEL_UNVERIFIED',
    status: 'ABSTAINED',
    abstainReasons,
    denominators: {
      observedUniqueLabelCount: 0,
      eligibleSequencePointCount: 0,
      runningLabelCount: 0,
      engineNotRotatingLabelCount: 0,
      identicalDuplicateCollapsedCount: 0,
      conflictingDuplicateLabelCount: 0,
      invalidTimestampOrRpmCount: 0,
      negativeOrNonFiniteRpmExcludedCount: 0,
      echoes: {
        tripWindowDurationSeconds: null,
        labelHoldSecondsEcho: null,
        v1bObservedBucketCoverageRatioEcho: null,
        internalMissingBucketCountEcho: null,
      },
    },
    absoluteDistribution: {
      status: 'NOT_AVAILABLE',
      countWeightedQuantiles: {
        q05: null,
        q50: null,
        q90: null,
        q95: null,
        q99: null,
        max: null,
      },
      exceedanceCounts250: [],
      exceedanceGridMaxThresholds: DS4_RPM_EPISODE_RESEARCH_EXCEEDANCE_GRID_MAX_THRESHOLDS,
      exceedanceGridTruncated: false,
      exceedanceGridTruncationReason: null,
      ambiguousLabelsExcluded: false,
    },
    referenceContext: {
      trustTier: null,
      idleRpmProvenance: input.reference.idleRpmProvenance,
      maxRpmProvenance: input.reference.maxRpmProvenance,
      normalizedEpisodesEligible: false,
      referenceObservationConflict: false,
      riAvailability: null,
      riReasonCodes: [],
    },
    highEpisodes: {
      status: 'NOT_ASSESSABLE',
      thresholds: {
        highEntryU: DS4_RPM_EPISODE_RESEARCH_HIGH_ENTRY_U,
        highExitU: DS4_RPM_EPISODE_RESEARCH_HIGH_EXIT_U,
        nearMaxEntryU: DS4_RPM_EPISODE_RESEARCH_NEAR_MAX_ENTRY_U,
        nearMaxExitU: DS4_RPM_EPISODE_RESEARCH_NEAR_MAX_EXIT_U,
      },
      countRange: { min: 0, max: 0 },
      rejectedCandidateCount: 0,
      items: [],
      massAccounting: null,
    },
    semanticGuards: SEMANTIC_GUARDS,
    unsupportedScientificClaims: [...DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS],
    r1HistoricalObdRecordTimeUncertain: family != null && hasUncertainHistoricalObdRecordTime(family),
  };
}

function canonicalizePoints(
  raw: ReadonlyArray<{ recordedAtIso: string; valueRpm: number }>,
): {
  points: CanonPoint[];
  identicalDuplicateCollapsedCount: number;
  conflictingDuplicateLabelCount: number;
  invalidTimestampOrRpmCount: number;
  negativeOrNonFiniteRpmExcludedCount: number;
  hasConflictingDuplicates: boolean;
} {
  let invalidTimestampOrRpmCount = 0;
  let negativeOrNonFiniteRpmExcludedCount = 0;
  const valid: { valueRpm: number; recordedAtMs: number }[] = [];
  for (const p of raw) {
    const ms = Date.parse(p.recordedAtIso);
    if (!Number.isFinite(ms)) {
      invalidTimestampOrRpmCount += 1;
      continue;
    }
    const rpm = parseHfRpmValueFloat(p.valueRpm);
    if (rpm == null) {
      if (typeof p.valueRpm === 'number' && p.valueRpm < 0) {
        negativeOrNonFiniteRpmExcludedCount += 1;
      } else {
        invalidTimestampOrRpmCount += 1;
      }
      continue;
    }
    valid.push({ valueRpm: rpm, recordedAtMs: ms });
  }

  valid.sort((a, b) => {
    if (a.recordedAtMs !== b.recordedAtMs) return a.recordedAtMs - b.recordedAtMs;
    return a.valueRpm - b.valueRpm;
  });

  const byEpoch = new Map<number, number[]>();
  for (const p of valid) {
    const arr = byEpoch.get(p.recordedAtMs) ?? [];
    arr.push(p.valueRpm);
    byEpoch.set(p.recordedAtMs, arr);
  }

  let identicalDuplicateCollapsedCount = 0;
  let conflictingDuplicateLabelCount = 0;
  let hasConflictingDuplicates = false;
  const points: CanonPoint[] = [];
  let globalIdx = 0;
  const epochs = [...byEpoch.keys()].sort((a, b) => a - b);
  for (const recordedAtMs of epochs) {
    const values = byEpoch.get(recordedAtMs)!;
    const unique = [...new Set(values)];
    if (unique.length > 1) {
      conflictingDuplicateLabelCount += 1;
      hasConflictingDuplicates = true;
      continue;
    }
    if (values.length > 1) {
      identicalDuplicateCollapsedCount += values.length - 1;
    }
    const rpm = unique[0]!;
    points.push({
      recordedAtIso: new Date(recordedAtMs).toISOString(),
      recordedAtMs,
      valueRpm: rpm,
      globalIdx: globalIdx++,
    });
  }

  return {
    points,
    identicalDuplicateCollapsedCount,
    conflictingDuplicateLabelCount,
    invalidTimestampOrRpmCount,
    negativeOrNonFiniteRpmExcludedCount,
    hasConflictingDuplicates,
  };
}

function lowerBound(sorted: number[], value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function buildBoundedExceedanceCounts(sorted: number[]): {
  exceedanceCounts250: { thresholdRpm: number; labelCount: number }[];
  exceedanceGridTruncated: boolean;
  exceedanceGridTruncationReason: string | null;
} {
  if (sorted.length === 0) {
    return { exceedanceCounts250: [], exceedanceGridTruncated: false, exceedanceGridTruncationReason: null };
  }
  const maxRpm = sorted[sorted.length - 1]!;
  const step = DS4_RPM_EPISODE_RESEARCH_EXCEEDANCE_GRID_RPM;
  const cap = DS4_RPM_EPISODE_RESEARCH_EXCEEDANCE_GRID_MAX_THRESHOLDS;
  const exceedanceCounts250: { thresholdRpm: number; labelCount: number }[] = [];
  const maxRepresentableThreshold = cap * step;
  let exceedanceGridTruncated = false;
  let exceedanceGridTruncationReason: string | null = null;

  for (let i = 1; i <= cap; i += 1) {
    const t = i * step;
    if (t > maxRpm + step) break;
    const count = sorted.length - lowerBound(sorted, t);
    exceedanceCounts250.push({ thresholdRpm: t, labelCount: count });
  }

  if (maxRpm > maxRepresentableThreshold) {
    exceedanceGridTruncated = true;
    exceedanceGridTruncationReason = 'OBSERVED_MAX_RPM_EXCEEDS_EXCEEDANCE_GRID_CAP';
  }

  return { exceedanceCounts250, exceedanceGridTruncated, exceedanceGridTruncationReason };
}

function resolveHighCoreAboveReferenceMaxStatus(input: {
  labelsAboveMax: number;
  eligibleHighCore: number;
}): Ds4RpmEpisodeResearchHighCoreAboveReferenceMaxStatus {
  if (input.labelsAboveMax <= 0) return 'NOT_APPLICABLE';
  return input.eligibleHighCore >= input.labelsAboveMax ? 'SATISFIED' : 'VIOLATED';
}

function verifyHighEpisodeIndexDisjointness(runs: EpisodeRun[]): boolean {
  const admitted = runs.filter((r) => r.admitted);
  for (let i = 0; i < admitted.length; i += 1) {
    for (let j = i + 1; j < admitted.length; j += 1) {
      const a = admitted[i]!;
      const b = admitted[j]!;
      if (a.sequenceIndex !== b.sequenceIndex) continue;
      if (!(a.endIdx < b.startIdx || b.endIdx < a.startIdx)) return false;
    }
  }
  return true;
}

function splitSequences(
  points: CanonPoint[],
  sequenceMaxGapSeconds: number,
): CanonPoint[][] {
  if (points.length === 0) return [];
  const sequences: CanonPoint[][] = [];
  let current: CanonPoint[] = [points[0]!];
  for (let i = 1; i < points.length; i += 1) {
    const gap = (points[i]!.recordedAtMs - points[i - 1]!.recordedAtMs) / 1000;
    if (gap > sequenceMaxGapSeconds) {
      sequences.push(current);
      current = [points[i]!];
    } else {
      current.push(points[i]!);
    }
  }
  sequences.push(current);
  return sequences;
}

function computeU(rpm: number, idle: number, span: number): number {
  return (rpm - idle) / span;
}

type Thresholds = { entryU: number; exitU: number };

function detectEpisodesInSequence(
  seq: CanonPoint[],
  sequenceIndex: number,
  thresholds: Thresholds,
  idle: number,
  span: number,
): EpisodeRun[] {
  const runs: EpisodeRun[] = [];
  let i = 0;
  while (i < seq.length) {
    const u = computeU(seq[i]!.valueRpm, idle, span);
    if (u < thresholds.entryU) {
      i += 1;
      continue;
    }
    const start = i;
    let peakU = u;
    let peakRpm = seq[i]!.valueRpm;
    i += 1;
    while (i < seq.length) {
      const ui = computeU(seq[i]!.valueRpm, idle, span);
      if (ui >= peakU) {
        peakU = ui;
        peakRpm = seq[i]!.valueRpm;
      }
      if (ui < thresholds.exitU) break;
      i += 1;
    }
    const end = i - 1;
    let corePointCount = 0;
    for (let j = start; j <= end; j += 1) {
      if (computeU(seq[j]!.valueRpm, idle, span) >= thresholds.entryU) {
        corePointCount += 1;
      }
    }
    const pointCount = end - start + 1;
    runs.push({
      sequenceIndex,
      startIdx: seq[start]!.globalIdx,
      endIdx: seq[end]!.globalIdx,
      pointCount,
      corePointCount,
      peakU,
      peakRpm,
      leftCensored: start === 0,
      rightCensored: end === seq.length - 1,
      admitted: corePointCount >= DS4_RPM_EPISODE_RESEARCH_MIN_CORE_POINTS,
      nearMaxSubEpisodeCount: 0,
    });
    i = end + 1;
  }
  return runs;
}

function countNearMaxSubEpisodes(
  seq: CanonPoint[],
  startLocal: number,
  endLocal: number,
  idle: number,
  span: number,
): number {
  const slice = seq.slice(startLocal, endLocal + 1);
  const runs = detectEpisodesInSequence(slice, 0, {
    entryU: DS4_RPM_EPISODE_RESEARCH_NEAR_MAX_ENTRY_U,
    exitU: DS4_RPM_EPISODE_RESEARCH_NEAR_MAX_EXIT_U,
  }, idle, span);
  return runs.filter((r) => r.admitted).length;
}

function localIndices(seq: CanonPoint[], globalIdx: number): number {
  return seq.findIndex((p) => p.globalIdx === globalIdx);
}

function computeMassAccounting(
  sequences: CanonPoint[][],
  highRuns: EpisodeRun[],
  nearRuns: EpisodeRun[],
  idle: number,
  span: number,
): Ds4RpmEpisodeResearchMassAccountingV1 {
  const flat = sequences.flat();
  const uValues = flat.map((p) => computeU(p.valueRpm, idle, span));

  const eligibleHighCore = uValues.filter((u) => u >= DS4_RPM_EPISODE_RESEARCH_HIGH_ENTRY_U).length;
  const admittedHighCore = highRuns.filter((r) => r.admitted).reduce((s, r) => s + r.corePointCount, 0);
  const rejectedHighCore = highRuns.filter((r) => !r.admitted).reduce((s, r) => s + r.corePointCount, 0);
  const highTail = highRuns.filter((r) => r.admitted).reduce((s, r) => s + r.pointCount, 0);
  const pointsAtHighExit = uValues.filter((u) => u >= DS4_RPM_EPISODE_RESEARCH_HIGH_EXIT_U).length;

  const eligibleNearCore = uValues.filter((u) => u >= DS4_RPM_EPISODE_RESEARCH_NEAR_MAX_ENTRY_U).length;
  const admittedNearCore = nearRuns.filter((r) => r.admitted).reduce((s, r) => s + r.corePointCount, 0);
  const rejectedNearCore = nearRuns.filter((r) => !r.admitted).reduce((s, r) => s + r.corePointCount, 0);
  const nearTail = nearRuns.filter((r) => r.admitted).reduce((s, r) => s + r.pointCount, 0);
  const pointsAtNearExit = uValues.filter((u) => u >= DS4_RPM_EPISODE_RESEARCH_NEAR_MAX_EXIT_U).length;

  const nearMaxCoreIndices = new Set<number>();
  for (const r of nearRuns) {
    if (r.corePointCount < 1) continue;
    for (let g = r.startIdx; g <= r.endIdx; g += 1) {
      const p = flat.find((x) => x.globalIdx === g);
      if (p && computeU(p.valueRpm, idle, span) >= DS4_RPM_EPISODE_RESEARCH_NEAR_MAX_ENTRY_U) {
        nearMaxCoreIndices.add(g);
      }
    }
  }

  let uncoveredNearCore = 0;
  for (const g of nearMaxCoreIndices) {
    const covered = highRuns.some((h) => g >= h.startIdx && g <= h.endIdx);
    if (!covered) uncoveredNearCore += 1;
  }

  const labelsAboveMax = uValues.filter((u) => u > 1).length;

  return {
    high: {
      eligibleCorePointCount: eligibleHighCore,
      admittedCorePointCount: admittedHighCore,
      rejectedCorePointCount: rejectedHighCore,
      admittedCorePlusTailPointCount: highTail,
      pointsAtOrAboveExitThreshold: pointsAtHighExit,
      i1Satisfied: eligibleHighCore === admittedHighCore + rejectedHighCore,
      i2Satisfied: highTail <= pointsAtHighExit,
    },
    nearMax: {
      eligibleCorePointCount: eligibleNearCore,
      admittedCorePointCount: admittedNearCore,
      rejectedCorePointCount: rejectedNearCore,
      admittedCorePlusTailPointCount: nearTail,
      pointsAtOrAboveExitThreshold: pointsAtNearExit,
      i1Satisfied: eligibleNearCore === admittedNearCore + rejectedNearCore,
      i2Satisfied: nearTail <= pointsAtNearExit,
    },
    nearMaxCorePointsWithoutHighCandidate: uncoveredNearCore,
    i4Satisfied: uncoveredNearCore === 0,
    highCoreAboveReferenceMaxStatus: resolveHighCoreAboveReferenceMaxStatus({
      labelsAboveMax,
      eligibleHighCore,
    }),
    i3SameCategoryEpisodeRangesDisjoint: verifyHighEpisodeIndexDisjointness(highRuns),
  };
}

function mergeCensoredCountRange(admitted: EpisodeRun[], sequences: CanonPoint[][]): { min: number; max: number } {
  const max = admitted.length;
  let merges = 0;
  for (let s = 0; s < sequences.length - 1; s += 1) {
    const inSeq = admitted.filter((r) => r.sequenceIndex === s);
    const nextSeq = admitted.filter((r) => r.sequenceIndex === s + 1);
    const last = inSeq[inSeq.length - 1];
    const first = nextSeq[0];
    if (last?.rightCensored && first?.leftCensored) merges += 1;
  }
  return { min: Math.max(0, max - merges), max };
}

function buildNotApplicableResult(
  input: Ds4RpmEpisodeResearchInputV1,
  binding: Extract<
    ReturnType<typeof validateDs4RpmEpisodeResearchInputBinding>,
    { ok: true }
  >,
): Ds4RpmEpisodeResearchResultV1 {
  const v1b = input.v1bResult!;
  return {
    ...buildAbstainedResult(input, ['ICE_RPM_NOT_APPLICABLE'], binding.telemetrySourceFamily),
    status: 'NOT_APPLICABLE',
    abstainReasons: ['ICE_RPM_NOT_APPLICABLE'],
    bindings: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      providerSourceLinkId: input.providerSourceLinkId,
      v1bInputFingerprint: binding.recomputedFingerprint,
      v1bEngineVersion: v1b.engineVersion,
      sourceBundleId: input.sourceBundleId,
      telemetrySourceFamily: binding.telemetrySourceFamily,
      cadenceTier: v1b.tierEvidence?.tier ?? null,
      analysisMode: v1b.tierEvidence?.analysisMode ?? null,
    },
  };
}

export function projectDs4RpmEpisodeResearchInputFromB2Bundle(
  bundle: Ds4RpmRealDataOfflineInputBundleV1,
  reference: Ds4RpmEpisodeResearchInputV1['reference'],
): Ds4RpmEpisodeResearchInputV1 {
  return {
    contractVersion: DS4_RPM_EPISODE_RESEARCH_CONTRACT_VERSION,
    evidenceOrigin: 'OFFLINE_SEALED_BUNDLE',
    sourceBundleId: bundle.bundleId,
    organizationId: bundle.organizationId,
    vehicleId: bundle.vehicleId,
    tripId: bundle.tripId,
    providerSourceLinkId: bundle.providerSourceLinkId,
    dimoVehicleRawJson: bundle.dimoVehicleRawJson,
    tripInput: bundle.tripInput,
    v1bResult: bundle.v1bResult,
    reference,
  };
}

export function computeDs4RpmEpisodeResearchV1(
  input: Ds4RpmEpisodeResearchInputV1,
): Ds4RpmEpisodeResearchResultV1 {
  const familyPreview = resolveTelemetrySourceFamily(input.dimoVehicleRawJson);

  const binding = validateDs4RpmEpisodeResearchInputBinding(input);
  if (!binding.ok) {
    return buildAbstainedResult(input, binding.reasonCodes, familyPreview);
  }

  if (input.reference.iceRpmApplicability === 'NOT_APPLICABLE') {
    return buildNotApplicableResult(input, binding);
  }

  const { telemetrySourceFamily, cadenceProfile, recomputedFingerprint } = binding;
  const v1b = input.v1bResult!;

  const cadence = cadenceProfile!;

  const canon = canonicalizePoints(input.tripInput.rpmPoints);
  const sequences = splitSequences(canon.points, cadence.sequenceMaxGapSeconds);
  const eligibleSequencePointCount = sequences.flat().length;

  const runningLabelCount = canon.points.filter(
    (p) => p.valueRpm >= DS4_RPM_EPISODE_RESEARCH_ICE_RPM_ROTATING_MIN,
  ).length;
  const engineNotRotatingLabelCount = canon.points.filter(
    (p) => p.valueRpm < DS4_RPM_EPISODE_RESEARCH_ICE_RPM_ROTATING_MIN,
  ).length;

  const tripDuration =
    (Date.parse(input.tripInput.tripEndIso) - Date.parse(input.tripInput.tripStartIso)) / 1000;

  const distributionRpms = canon.points.map((p) => p.valueRpm).sort((a, b) => a - b);
  const ambiguousLabelsExcluded = canon.hasConflictingDuplicates;
  const absStatus = distributionRpms.length === 0
    ? 'NOT_AVAILABLE'
    : ambiguousLabelsExcluded
      ? 'PARTIAL'
      : 'COMPLETE';

  const exceedanceResult = buildBoundedExceedanceCounts(distributionRpms);

  const qualityExposure = buildDs4RpmHfV1bAdmissionQualityExposure({
    shadowVariant: 'tier-aware',
    temporalCoverage: v1b.temporalCoverage,
    tierEvidence: v1b.tierEvidence,
  });

  const ri = computeDs4RpmReferenceIntelligenceV1({
    tripStartIso: input.tripInput.tripStartIso,
    tripEndIso: input.tripInput.tripEndIso,
    reference: input.reference,
    hf: {
      points: canon.points.map((p) => ({ recordedAtIso: p.recordedAtIso, valueRpm: p.valueRpm })),
      admission: {
        processingAllowed: input.tripInput.admission.processingAllowed,
        iceRpmApplicability: input.tripInput.admission.iceRpmApplicability,
      },
      qualityExposure,
      authoritativeV1bTemporal: {
        cadenceTier: v1b.tierEvidence?.tier ?? null,
        temporalCadenceProfile: cadence,
      },
    },
  });

  const idle = input.reference.idleRpm;
  const max = input.reference.maxRpm;
  const pairOk =
    idle != null && max != null && max > idle;
  const userConfirmed =
    input.reference.idleRpmProvenance === 'USER_CONFIRMED' &&
    input.reference.maxRpmProvenance === 'USER_CONFIRMED' &&
    pairOk;

  let referenceObservationConflict = false;
  if (userConfirmed && pairOk) {
    const span = max! - idle!;
    const aboveMaxLabels = canon.points.filter((p) => computeU(p.valueRpm, idle!, span) > 1).length;
    referenceObservationConflict =
      aboveMaxLabels >= DS4_RPM_EPISODE_RESEARCH_REFERENCE_CONFLICT_MIN_LABELS_ABOVE_MAX;
  }

  const iceUnproven = runningLabelCount < DS4_RPM_EPISODE_RESEARCH_MIN_ROTATING_LABELS;
  const normalizedEligible =
    userConfirmed &&
    input.reference.iceRpmApplicability === 'APPLICABLE' &&
    !referenceObservationConflict &&
    !canon.hasConflictingDuplicates &&
    !iceUnproven &&
    pairOk;

  let episodeItems: Ds4RpmEpisodeResearchEpisodeItemV1[] = [];
  let rejected = 0;
  let episodeStatus: Ds4RpmEpisodeResearchResultV1['highEpisodes']['status'] = 'NOT_ASSESSABLE';
  let mass: Ds4RpmEpisodeResearchMassAccountingV1 | null = null;
  let countRange = { min: 0, max: 0 };

  if (normalizedEligible && idle != null && max != null) {
    const span = max - idle;
    const allHighRuns: EpisodeRun[] = [];
    const allNearRuns: EpisodeRun[] = [];
    for (let si = 0; si < sequences.length; si += 1) {
      const highRuns = detectEpisodesInSequence(
        sequences[si]!,
        si,
        { entryU: DS4_RPM_EPISODE_RESEARCH_HIGH_ENTRY_U, exitU: DS4_RPM_EPISODE_RESEARCH_HIGH_EXIT_U },
        idle,
        span,
      );
      for (const r of highRuns) {
        const startLocal = localIndices(sequences[si]!, r.startIdx);
        const endLocal = localIndices(sequences[si]!, r.endIdx);
        if (startLocal >= 0 && endLocal >= 0) {
          r.nearMaxSubEpisodeCount = countNearMaxSubEpisodes(sequences[si]!, startLocal, endLocal, idle, span);
        }
      }
      allHighRuns.push(...highRuns);
      allNearRuns.push(
        ...detectEpisodesInSequence(
          sequences[si]!,
          si,
          {
            entryU: DS4_RPM_EPISODE_RESEARCH_NEAR_MAX_ENTRY_U,
            exitU: DS4_RPM_EPISODE_RESEARCH_NEAR_MAX_EXIT_U,
          },
          idle,
          span,
        ),
      );
    }
    rejected = allHighRuns.filter((r) => !r.admitted).length;
    const admitted = allHighRuns.filter((r) => r.admitted);
    episodeItems = admitted.map((r) => {
      const startP = canon.points.find((p) => p.globalIdx === r.startIdx)!;
      const endP = canon.points.find((p) => p.globalIdx === r.endIdx)!;
      return {
        sequenceIndex: r.sequenceIndex,
        startIdx: r.startIdx,
        endIdx: r.endIdx,
        providerBucketLabelStartIso: startP.recordedAtIso,
        providerBucketLabelEndIso: endP.recordedAtIso,
        pointCount: r.pointCount,
        corePointCount: r.corePointCount,
        peakU: r.peakU,
        peakRpm: r.peakRpm,
        leftCensored: r.leftCensored,
        rightCensored: r.rightCensored,
        nearMaxSubEpisodeCount: r.nearMaxSubEpisodeCount,
      };
    });
    mass = computeMassAccounting(sequences, allHighRuns, allNearRuns, idle, span);
    countRange = mergeCensoredCountRange(admitted, sequences);
    episodeStatus =
      admitted.length > 0 ? 'SUPPORTED_DESCRIPTIVE' : rejected > 0 || allHighRuns.length === 0 ? 'NOT_OBSERVED' : 'NOT_OBSERVED';
    if (allHighRuns.length === 0 && canon.points.length > 0) {
      episodeStatus = 'NOT_OBSERVED';
    }
  } else if (canon.hasConflictingDuplicates || iceUnproven || referenceObservationConflict || !userConfirmed) {
    episodeStatus = 'NOT_ASSESSABLE';
  }

  const claims: string[] = [...DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS];
  if (input.evidenceOrigin === 'SYNTHETIC_FIXTURE') {
    claims.push('SYNTHETIC_FIXTURE_SUCCESS_NOT_FIELD_VALIDATION');
  }
  if (hasUncertainHistoricalObdRecordTime(telemetrySourceFamily)) {
    claims.push(R1_OBD_RECORD_TIME_UNCERTAIN);
  }

  return {
    contractVersion: DS4_RPM_EPISODE_RESEARCH_CONTRACT_VERSION,
    kernelVersion: DS4_RPM_EPISODE_RESEARCH_KERNEL_VERSION,
    researchOnly: true,
    evidenceOrigin: input.evidenceOrigin,
    bindings: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      providerSourceLinkId: input.providerSourceLinkId,
      v1bInputFingerprint: recomputedFingerprint,
      v1bEngineVersion: v1b.engineVersion,
      sourceBundleId: input.sourceBundleId,
      telemetrySourceFamily,
      cadenceTier: v1b.tierEvidence?.tier ?? null,
      analysisMode: v1b.tierEvidence?.analysisMode ?? null,
    },
    timeAuthority: 'BUCKET_LABEL_UNVERIFIED',
    status: 'COMPUTED',
    abstainReasons: [],
    denominators: {
      observedUniqueLabelCount: canon.points.length,
      eligibleSequencePointCount,
      runningLabelCount,
      engineNotRotatingLabelCount,
      identicalDuplicateCollapsedCount: canon.identicalDuplicateCollapsedCount,
      conflictingDuplicateLabelCount: canon.conflictingDuplicateLabelCount,
      invalidTimestampOrRpmCount: canon.invalidTimestampOrRpmCount,
      negativeOrNonFiniteRpmExcludedCount: canon.negativeOrNonFiniteRpmExcludedCount,
      echoes: {
        tripWindowDurationSeconds: Number.isFinite(tripDuration) ? tripDuration : null,
        labelHoldSecondsEcho: ri.metrics?.timeWeightedExposure.totalEligibleWeightedSeconds ?? null,
        v1bObservedBucketCoverageRatioEcho: v1b.temporalCoverage.observedBucketCoverageRatio,
        internalMissingBucketCountEcho: v1b.temporalCoverage.internalMissingBucketCount,
      },
    },
    absoluteDistribution: {
      status: absStatus,
      countWeightedQuantiles: {
        q05: nearestRankQuantile(distributionRpms, 0.05),
        q50: nearestRankQuantile(distributionRpms, 0.5),
        q90: nearestRankQuantile(distributionRpms, 0.9),
        q95: nearestRankQuantile(distributionRpms, 0.95),
        q99: nearestRankQuantile(distributionRpms, 0.99),
        max: distributionRpms.length > 0 ? distributionRpms[distributionRpms.length - 1]! : null,
      },
      exceedanceCounts250: exceedanceResult.exceedanceCounts250,
      exceedanceGridMaxThresholds: DS4_RPM_EPISODE_RESEARCH_EXCEEDANCE_GRID_MAX_THRESHOLDS,
      exceedanceGridTruncated: exceedanceResult.exceedanceGridTruncated,
      exceedanceGridTruncationReason: exceedanceResult.exceedanceGridTruncationReason,
      ambiguousLabelsExcluded,
    },
    referenceContext: {
      trustTier: ri.referenceQuality.referenceTrustTier,
      idleRpmProvenance: input.reference.idleRpmProvenance,
      maxRpmProvenance: input.reference.maxRpmProvenance,
      normalizedEpisodesEligible: normalizedEligible,
      referenceObservationConflict,
      riAvailability: ri.availability,
      riReasonCodes: ri.reasonCodes,
    },
    highEpisodes: {
      status: episodeStatus,
      thresholds: {
        highEntryU: DS4_RPM_EPISODE_RESEARCH_HIGH_ENTRY_U,
        highExitU: DS4_RPM_EPISODE_RESEARCH_HIGH_EXIT_U,
        nearMaxEntryU: DS4_RPM_EPISODE_RESEARCH_NEAR_MAX_ENTRY_U,
        nearMaxExitU: DS4_RPM_EPISODE_RESEARCH_NEAR_MAX_EXIT_U,
      },
      countRange,
      rejectedCandidateCount: rejected,
      items: episodeItems,
      massAccounting: mass,
    },
    semanticGuards: SEMANTIC_GUARDS,
    unsupportedScientificClaims: claims,
    r1HistoricalObdRecordTimeUncertain: hasUncertainHistoricalObdRecordTime(telemetrySourceFamily),
  };
}
