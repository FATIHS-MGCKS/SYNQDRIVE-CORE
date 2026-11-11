import type { Ds4RpmDynamicsResearchAdjacentDeltaV1 } from '../ds4-rpm-dynamics-research/ds4-rpm-dynamics-research.contract.v1';
import type { Ds4RpmResearchCanonPointV1 } from '../ds4-rpm-research-shared/ds4-rpm-research-point-canon.v1';
import { parseHalfOpenEventWindowMs } from '../ds4-rpm-shadow-correlation/ds4-rpm-shadow-correlation-event-temporal-support.v1';
import type {
  Ds4RpmDynamicsFusionEventLocalDynamicsV1,
  Ds4RpmDynamicsFusionResearchAlignmentOffsetDiagnosticV1,
  Ds4RpmDynamicsFusionResearchContextClassification,
} from './ds4-rpm-dynamics-fusion-research.contract.v1';

function classifyLocalPairs(pairCount: number): Ds4RpmDynamicsFusionResearchContextClassification {
  if (pairCount === 0) return 'UNAVAILABLE';
  if (pairCount === 1) return 'PARTIAL';
  return 'AVAILABLE';
}

export function countEventLocalDirectionReversals(
  deltas: readonly Ds4RpmDynamicsResearchAdjacentDeltaV1[],
): number {
  let lastNonFlat: 'RISE' | 'FALL' | null = null;
  let lastSequenceIndex: number | null = null;
  let reversals = 0;
  for (const d of deltas) {
    if (lastSequenceIndex != null && d.sequenceIndex !== lastSequenceIndex) {
      lastNonFlat = null;
    }
    lastSequenceIndex = d.sequenceIndex;
    if (d.direction === 'FLAT') continue;
    const stepDir = d.direction === 'RISE' ? 'RISE' : 'FALL';
    if (lastNonFlat != null && lastNonFlat !== stepDir) reversals += 1;
    lastNonFlat = stepDir;
  }
  return reversals;
}

export function filterAdjacentDeltasInHalfOpenWindow(input: {
  adjacentDeltas: readonly Ds4RpmDynamicsResearchAdjacentDeltaV1[];
  canonByGlobalIdx: ReadonlyMap<number, Ds4RpmResearchCanonPointV1>;
  startLabel: string;
  endLabel: string;
  offsetSeconds?: number;
}): {
  windowValid: boolean;
  filtered: Ds4RpmDynamicsResearchAdjacentDeltaV1[];
} {
  const window = parseHalfOpenEventWindowMs(input.startLabel, input.endLabel);
  if (window == null) {
    return { windowValid: false, filtered: [] };
  }
  const shiftMs = (input.offsetSeconds ?? 0) * 1000;
  const winStart = window.startMs + shiftMs;
  const winEndExclusive = window.endExclusiveMs + shiftMs;
  const filtered: Ds4RpmDynamicsResearchAdjacentDeltaV1[] = [];
  for (const d of input.adjacentDeltas) {
    const from = input.canonByGlobalIdx.get(d.fromGlobalIdx);
    const to = input.canonByGlobalIdx.get(d.toGlobalIdx);
    if (from == null || to == null) continue;
    if (
      from.recordedAtMs >= winStart &&
      from.recordedAtMs < winEndExclusive &&
      to.recordedAtMs >= winStart &&
      to.recordedAtMs < winEndExclusive
    ) {
      filtered.push(d);
    }
  }
  filtered.sort((a, b) => {
    if (a.sequenceIndex !== b.sequenceIndex) return a.sequenceIndex - b.sequenceIndex;
    if (a.fromGlobalIdx !== b.fromGlobalIdx) return a.fromGlobalIdx - b.fromGlobalIdx;
    return a.toGlobalIdx - b.toGlobalIdx;
  });
  return { windowValid: true, filtered };
}

export function summarizeEventLocalDynamics(
  filtered: readonly Ds4RpmDynamicsResearchAdjacentDeltaV1[],
  tripDynamicsStatus: 'SUPPORTED_DESCRIPTIVE' | 'NOT_ASSESSABLE' | 'NOT_OBSERVED',
): Ds4RpmDynamicsFusionEventLocalDynamicsV1 {
  const dist = { positiveCount: 0, negativeCount: 0, zeroCount: 0 };
  const absMagnitudes: number[] = [];
  const gaps: number[] = [];
  for (const d of filtered) {
    if (d.direction === 'RISE') dist.positiveCount += 1;
    else if (d.direction === 'FALL') dist.negativeCount += 1;
    else dist.zeroCount += 1;
    absMagnitudes.push(Math.abs(d.deltaRpm));
    gaps.push(d.labelGapMs);
  }
  const dynamicsStatus =
    filtered.length > 0 ? 'SUPPORTED_DESCRIPTIVE' : tripDynamicsStatus === 'SUPPORTED_DESCRIPTIVE' ? 'NOT_ASSESSABLE' : tripDynamicsStatus;
  return {
    dynamicsStatus,
    localAdmittedPairCount: filtered.length,
    deltaDistribution: dist,
    observedDirectionReversalCount: countEventLocalDirectionReversals(filtered),
    minAbsDeltaRpm: absMagnitudes.length > 0 ? Math.min(...absMagnitudes) : null,
    maxAbsDeltaRpm: absMagnitudes.length > 0 ? Math.max(...absMagnitudes) : null,
    labelGapMsMin: gaps.length > 0 ? Math.min(...gaps) : null,
    labelGapMsMax: gaps.length > 0 ? Math.max(...gaps) : null,
  };
}

export function buildDynamicsAlignmentSensitivity(input: {
  adjacentDeltas: readonly Ds4RpmDynamicsResearchAdjacentDeltaV1[];
  canonByGlobalIdx: ReadonlyMap<number, Ds4RpmResearchCanonPointV1>;
  startLabel: string;
  endLabel: string;
  offsetSecondsProbed: readonly number[];
}): Ds4RpmDynamicsFusionResearchAlignmentOffsetDiagnosticV1[] {
  return input.offsetSecondsProbed.map((offsetSeconds) => {
    const { windowValid, filtered } = filterAdjacentDeltasInHalfOpenWindow({
      adjacentDeltas: input.adjacentDeltas,
      canonByGlobalIdx: input.canonByGlobalIdx,
      startLabel: input.startLabel,
      endLabel: input.endLabel,
      offsetSeconds,
    });
    const count = windowValid ? filtered.length : 0;
    return {
      offsetSeconds,
      admittedPairCountInWindow: count,
      classification: classifyLocalPairs(count),
      researchDiagnosticOnly: true as const,
    };
  });
}
