import {
  hasUncertainHistoricalObdRecordTime,
  resolveTelemetrySourceFamily,
} from '../../telemetry-source-family';
import { DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-scientific-claims.v1';
import { validateDs4RpmEpisodeResearchInputBinding } from '../ds4-rpm-episode-research/ds4-rpm-episode-research.input-binding.v1';
import {
  DS4_RPM_EPISODE_RESEARCH_CONTRACT_VERSION,
  type Ds4RpmEpisodeResearchBindingAbstainReason,
} from '../ds4-rpm-episode-research/ds4-rpm-episode-research.contract.v1';
import {
  canonicalizeDs4RpmResearchPoints,
  splitDs4RpmResearchSequences,
  type Ds4RpmResearchCanonPointV1,
} from '../ds4-rpm-research-shared/ds4-rpm-research-point-canon.v1';
import {
  DS4_RPM_DYNAMICS_RESEARCH_CONTRACT_VERSION,
  DS4_RPM_DYNAMICS_RESEARCH_KERNEL_VERSION,
  type Ds4RpmDynamicsResearchAdjacentDeltaV1,
  type Ds4RpmDynamicsResearchDynamicsStatus,
  type Ds4RpmDynamicsResearchInputV1,
  type Ds4RpmDynamicsResearchMonotonicRunKindV1,
  type Ds4RpmDynamicsResearchMonotonicRunV1,
  type Ds4RpmDynamicsResearchObservedDeltaDirectionV1,
  type Ds4RpmDynamicsResearchResultV1,
  type Ds4RpmDynamicsResearchSemanticGuardV1,
} from './ds4-rpm-dynamics-research.contract.v1';

const SEMANTIC_GUARDS: Ds4RpmDynamicsResearchSemanticGuardV1 = {
  bucketGridSpanIsNotPhysicalDuration: true,
  labelsNotForCrossDomainJoin: true,
  observedDeltaIsNotPhysicalDrpmDt: true,
  observedTrendIsNotGearShift: true,
  observedTrendIsNotEngineLoad: true,
  observedTrendIsNotMisuse: true,
  notEvidenceCandidate: true,
  misuseEligibility: 'NOT_EVALUATED_BY_DESIGN',
};

function classifyDelta(deltaRpm: number): Ds4RpmDynamicsResearchObservedDeltaDirectionV1 {
  if (deltaRpm > 0) return 'RISE';
  if (deltaRpm < 0) return 'FALL';
  return 'FLAT';
}

function stepDirection(
  from: Ds4RpmResearchCanonPointV1,
  to: Ds4RpmResearchCanonPointV1,
): Ds4RpmDynamicsResearchObservedDeltaDirectionV1 {
  return classifyDelta(to.valueRpm - from.valueRpm);
}

function runKindFromStep(dir: Ds4RpmDynamicsResearchObservedDeltaDirectionV1): Ds4RpmDynamicsResearchMonotonicRunKindV1 {
  if (dir === 'RISE') return 'RISING';
  if (dir === 'FALL') return 'FALLING';
  return 'FLAT';
}

function buildAdjacentDeltas(
  sequences: Ds4RpmResearchCanonPointV1[][],
): Ds4RpmDynamicsResearchAdjacentDeltaV1[] {
  const deltas: Ds4RpmDynamicsResearchAdjacentDeltaV1[] = [];
  for (let sequenceIndex = 0; sequenceIndex < sequences.length; sequenceIndex += 1) {
    const seq = sequences[sequenceIndex]!;
    for (let i = 1; i < seq.length; i += 1) {
      const from = seq[i - 1]!;
      const to = seq[i]!;
      const deltaRpm = to.valueRpm - from.valueRpm;
      deltas.push({
        sequenceIndex,
        fromGlobalIdx: from.globalIdx,
        toGlobalIdx: to.globalIdx,
        fromRpm: from.valueRpm,
        toRpm: to.valueRpm,
        deltaRpm,
        labelGapMs: to.recordedAtMs - from.recordedAtMs,
        direction: classifyDelta(deltaRpm),
      });
    }
  }
  deltas.sort((a, b) => {
    if (a.sequenceIndex !== b.sequenceIndex) return a.sequenceIndex - b.sequenceIndex;
    if (a.fromGlobalIdx !== b.fromGlobalIdx) return a.fromGlobalIdx - b.fromGlobalIdx;
    return a.toGlobalIdx - b.toGlobalIdx;
  });
  return deltas;
}

/** Contiguous step-sign runs on observed labels (no interpolation). */
function buildMonotonicRuns(sequences: Ds4RpmResearchCanonPointV1[][]): Ds4RpmDynamicsResearchMonotonicRunV1[] {
  const runs: Ds4RpmDynamicsResearchMonotonicRunV1[] = [];
  for (let sequenceIndex = 0; sequenceIndex < sequences.length; sequenceIndex += 1) {
    const seq = sequences[sequenceIndex]!;
    if (seq.length === 0) continue;
    if (seq.length < 2) {
      continue;
    }
    let start = 0;
    let activeStep = stepDirection(seq[0]!, seq[1]!);
  const pushRun = (end: number, step: Ds4RpmDynamicsResearchObservedDeltaDirectionV1) => {
      const startP = seq[start]!;
      const endP = seq[end]!;
      runs.push({
        sequenceIndex,
        kind: runKindFromStep(step),
        startGlobalIdx: startP.globalIdx,
        endGlobalIdx: endP.globalIdx,
        pointCount: end - start + 1,
        netDeltaRpm: endP.valueRpm - startP.valueRpm,
      });
    };
    for (let i = 1; i < seq.length; i += 1) {
      const step = stepDirection(seq[i - 1]!, seq[i]!);
      if (step !== activeStep) {
        pushRun(i - 1, activeStep);
        start = i - 1;
        activeStep = step;
      }
    }
    pushRun(seq.length - 1, activeStep);
  }
  runs.sort((a, b) => {
    if (a.sequenceIndex !== b.sequenceIndex) return a.sequenceIndex - b.sequenceIndex;
    if (a.startGlobalIdx !== b.startGlobalIdx) return a.startGlobalIdx - b.startGlobalIdx;
    return a.endGlobalIdx - b.endGlobalIdx;
  });
  return runs;
}

/**
 * Consecutive non-FLAT trend kind changes within each admitted sequence only.
 * Intervening FLAT step-sign runs do not reset the prior trend.
 */
function countReversals(runs: readonly Ds4RpmDynamicsResearchMonotonicRunV1[]): number {
  const bySequence = new Map<number, Ds4RpmDynamicsResearchMonotonicRunV1[]>();
  for (const run of runs) {
    const bucket = bySequence.get(run.sequenceIndex) ?? [];
    bucket.push(run);
    bySequence.set(run.sequenceIndex, bucket);
  }
  let reversals = 0;
  for (const seqRuns of bySequence.values()) {
    let lastNonFlat: Ds4RpmDynamicsResearchMonotonicRunKindV1 | null = null;
    for (const run of seqRuns) {
      if (run.kind === 'FLAT') continue;
      if (lastNonFlat != null && lastNonFlat !== run.kind) reversals += 1;
      lastNonFlat = run.kind;
    }
  }
  return reversals;
}

function resolveDynamicsStatus(adjacentPairCount: number): Ds4RpmDynamicsResearchDynamicsStatus {
  if (adjacentPairCount > 0) return 'SUPPORTED_DESCRIPTIVE';
  return 'NOT_ASSESSABLE';
}

type Ds4RpmDynamicsResearchAbstainReasonV1 =
  | Ds4RpmEpisodeResearchBindingAbstainReason
  | 'CONFLICTING_RPM_LABELS_AT_SHARED_TIMESTAMP';

function buildAbstainedResult(
  input: Ds4RpmDynamicsResearchInputV1,
  abstainReasons: readonly Ds4RpmDynamicsResearchAbstainReasonV1[],
  family: ReturnType<typeof resolveTelemetrySourceFamily> | null,
): Ds4RpmDynamicsResearchResultV1 {
  return {
    contractVersion: DS4_RPM_DYNAMICS_RESEARCH_CONTRACT_VERSION,
    kernelVersion: DS4_RPM_DYNAMICS_RESEARCH_KERNEL_VERSION,
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
      sequenceMaxGapSeconds: null,
      nominalCadenceSeconds: null,
    },
    timeAuthority: 'BUCKET_LABEL_UNVERIFIED',
    status: 'ABSTAINED',
    abstainReasons,
    denominators: {
      observedUniqueLabelCount: 0,
      eligibleSequencePointCount: 0,
      continuousSequenceCount: 0,
      adjacentObservedPairCount: 0,
      identicalDuplicateCollapsedCount: 0,
      conflictingDuplicateLabelCount: 0,
      invalidTimestampOrRpmCount: 0,
      negativeOrNonFiniteRpmExcludedCount: 0,
    },
    observedDynamics: {
      status: 'NOT_ASSESSABLE',
      deltaDistribution: { positiveCount: 0, negativeCount: 0, zeroCount: 0 },
      adjacentDeltas: [],
      monotonicRuns: [],
      observedDirectionReversalCount: 0,
    },
    semanticGuards: SEMANTIC_GUARDS,
    unsupportedScientificClaims: [...DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS],
    r1HistoricalObdRecordTimeUncertain: family != null && hasUncertainHistoricalObdRecordTime(family),
  };
}

export function computeDs4RpmDynamicsResearchV1(
  input: Ds4RpmDynamicsResearchInputV1,
): Ds4RpmDynamicsResearchResultV1 {
  const familyPreview = resolveTelemetrySourceFamily(input.dimoVehicleRawJson);
  const binding = validateDs4RpmEpisodeResearchInputBinding({
    ...input,
    contractVersion: DS4_RPM_EPISODE_RESEARCH_CONTRACT_VERSION,
  });
  if (!binding.ok) {
    return buildAbstainedResult(input, binding.reasonCodes, familyPreview);
  }

  const { telemetrySourceFamily, recomputedFingerprint } = binding;
  const cadenceProfile = binding.cadenceProfile!;
  const canon = canonicalizeDs4RpmResearchPoints(input.tripInput.rpmPoints);
  if (canon.hasConflictingDuplicates) {
    return buildAbstainedResult(
      input,
      ['CONFLICTING_RPM_LABELS_AT_SHARED_TIMESTAMP'],
      telemetrySourceFamily,
    );
  }

  const sequences = splitDs4RpmResearchSequences(canon.points, cadenceProfile.sequenceMaxGapSeconds);
  const adjacentDeltas = buildAdjacentDeltas(sequences);
  const monotonicRuns = buildMonotonicRuns(sequences);
  const reversalCount = countReversals(monotonicRuns);

  const dist = { positiveCount: 0, negativeCount: 0, zeroCount: 0 };
  for (const d of adjacentDeltas) {
    if (d.direction === 'RISE') dist.positiveCount += 1;
    else if (d.direction === 'FALL') dist.negativeCount += 1;
    else dist.zeroCount += 1;
  }

  return {
    contractVersion: DS4_RPM_DYNAMICS_RESEARCH_CONTRACT_VERSION,
    kernelVersion: DS4_RPM_DYNAMICS_RESEARCH_KERNEL_VERSION,
    researchOnly: true,
    evidenceOrigin: input.evidenceOrigin,
    bindings: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      providerSourceLinkId: input.providerSourceLinkId,
      v1bInputFingerprint: recomputedFingerprint,
      v1bEngineVersion: input.v1bResult!.engineVersion,
      sourceBundleId: input.sourceBundleId,
      telemetrySourceFamily,
      cadenceTier: input.v1bResult!.tierEvidence?.tier ?? null,
      analysisMode: input.v1bResult!.tierEvidence?.analysisMode ?? null,
      sequenceMaxGapSeconds: cadenceProfile.sequenceMaxGapSeconds,
      nominalCadenceSeconds: cadenceProfile.nominalCadenceSeconds,
    },
    timeAuthority: 'BUCKET_LABEL_UNVERIFIED',
    status: 'COMPUTED',
    abstainReasons: [],
    denominators: {
      observedUniqueLabelCount: canon.points.length,
      eligibleSequencePointCount: sequences.reduce((n, s) => n + s.length, 0),
      continuousSequenceCount: sequences.length,
      adjacentObservedPairCount: adjacentDeltas.length,
      identicalDuplicateCollapsedCount: canon.identicalDuplicateCollapsedCount,
      conflictingDuplicateLabelCount: canon.conflictingDuplicateLabelCount,
      invalidTimestampOrRpmCount: canon.invalidTimestampOrRpmCount,
      negativeOrNonFiniteRpmExcludedCount: canon.negativeOrNonFiniteRpmExcludedCount,
    },
    observedDynamics: {
      status: resolveDynamicsStatus(adjacentDeltas.length),
      deltaDistribution: dist,
      adjacentDeltas,
      monotonicRuns,
      observedDirectionReversalCount: reversalCount,
    },
    semanticGuards: SEMANTIC_GUARDS,
    unsupportedScientificClaims: [...DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS],
    r1HistoricalObdRecordTimeUncertain:
      binding.telemetrySourceFamily != null &&
      hasUncertainHistoricalObdRecordTime(binding.telemetrySourceFamily),
  };
}
