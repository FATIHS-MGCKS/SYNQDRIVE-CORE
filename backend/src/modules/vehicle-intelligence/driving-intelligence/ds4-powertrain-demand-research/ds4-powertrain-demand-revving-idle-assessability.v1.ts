import type {
  Ds4RevvingIdleFacetAssessabilityReasonV1,
  Ds4RevvingIdleFacetATripEvidenceClassificationV1,
  Ds4RevvingIdleFacetBTripEvidenceClassificationV1,
  Ds4RevvingIdleFacetCoverageDiagnosticsV1,
} from './ds4-powertrain-demand-research.contract.v1';
import type { Ds4CanonicalMultichannelBucketV1 } from './ds4-powertrain-demand-multichannel-canonicalize.v1';
import type { Ds4MultichannelCanonicalizeResultV1 } from './ds4-powertrain-demand-multichannel-canonicalize.v1';
import { splitBucketsAtAdmittedSequenceBoundaries } from './ds4-powertrain-demand-multichannel-sequence-boundary.v1';
import { DS4_REVIVING_IDLE_DUAL_FACET_POLICY } from './ds4-powertrain-demand-revving-idle-reference.v1';

export type { Ds4RevvingIdleFacetCoverageDiagnosticsV1 };

const FACET_A = DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetA;
const FACET_B = DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetB;

export type Ds4RevvingIdleFacetAssessabilityVerdictV1 = {
  assessable: boolean;
  diagnostics: Ds4RevvingIdleFacetCoverageDiagnosticsV1;
};

type CoherentRun = {
  labelCount: number;
  spanMs: number;
  maxAdjacentGapMs: number;
};

function sortedCanonicalBuckets(canon: Ds4MultichannelCanonicalizeResultV1): Ds4CanonicalMultichannelBucketV1[] {
  return [...canon.buckets].sort((a, b) => a.recordedAtMs - b.recordedAtMs);
}

/**
 * Walk the full chronological canonical grid. Missing rpm or speed flushes the active run
 * (no interpolation or bridging across invalid buckets).
 */
export function enumerateCoherentCoRpmSpeedRuns(
  sortedGridBuckets: readonly Ds4CanonicalMultichannelBucketV1[],
  maxAdjacentGapMs: number,
): CoherentRun[] {
  const runs: CoherentRun[] = [];
  let active: Ds4CanonicalMultichannelBucketV1[] = [];

  const flush = () => {
    if (active.length === 0) return;
    let maxGap = 0;
    for (let i = 1; i < active.length; i += 1) {
      maxGap = Math.max(maxGap, active[i]!.recordedAtMs - active[i - 1]!.recordedAtMs);
    }
    const span = active[active.length - 1]!.recordedAtMs - active[0]!.recordedAtMs;
    runs.push({
      labelCount: active.length,
      spanMs: span,
      maxAdjacentGapMs: maxGap,
    });
    active = [];
  };

  for (const bucket of sortedGridBuckets) {
    if (bucket.rpm == null || bucket.speedKmh == null) {
      flush();
      continue;
    }
    if (active.length > 0) {
      const gap = bucket.recordedAtMs - active[active.length - 1]!.recordedAtMs;
      if (gap > maxAdjacentGapMs) {
        flush();
      }
    }
    active.push(bucket);
  }
  flush();
  return runs;
}

function runWithMaxSpan(runs: readonly CoherentRun[]): CoherentRun | null {
  if (runs.length === 0) return null;
  return runs.reduce((best, run) => (run.spanMs > best.spanMs ? run : best));
}

function runWithMaxLabelCount(runs: readonly CoherentRun[]): CoherentRun | null {
  if (runs.length === 0) return null;
  return runs.reduce((best, run) => (run.labelCount > best.labelCount ? run : best));
}

function baseDiagnostics(canon: Ds4MultichannelCanonicalizeResultV1): Pick<
  Ds4RevvingIdleFacetCoverageDiagnosticsV1,
  'rpmSpeedCoObservedLabelCount' | 'rpmMissingRequiredChannelCount' | 'speedMissingRequiredChannelCount'
> {
  return {
    rpmSpeedCoObservedLabelCount: canon.buckets.filter((b) => b.rpm != null && b.speedKmh != null).length,
    rpmMissingRequiredChannelCount: canon.buckets.filter((b) => b.rpm == null).length,
    speedMissingRequiredChannelCount: canon.buckets.filter((b) => b.speedKmh == null).length,
  };
}

const EMPTY_PAIRED_DIAGNOSTICS = {
  longestCoherentRunLabelCount: 0,
  longestCoherentResearchLabelSpanMs: 0,
  longestCoherentMaxAdjacentGapMs: 0,
  maxQualifyingCoherentResearchLabelSpanMs: 0,
  labelsInMaxSpanRun: 0,
  spanMsInMaxLabelCountRun: 0,
};

function evaluateFacetOpportunity(input: {
  canon: Ds4MultichannelCanonicalizeResultV1;
  sequenceMaxGapSeconds: number;
  minLabels: number;
  minSpanMs: number;
  maxAdjacentGapMs: number;
}): Ds4RevvingIdleFacetAssessabilityVerdictV1 {
  const base = baseDiagnostics(input.canon);
  const sorted = sortedCanonicalBuckets(input.canon);
  const reasons: Ds4RevvingIdleFacetAssessabilityReasonV1[] = [];

  if (base.rpmSpeedCoObservedLabelCount === 0) {
    reasons.push('RPM_SPEED_CO_OBSERVATION_UNAVAILABLE');
    return {
      assessable: false,
      diagnostics: {
        ...base,
        ...EMPTY_PAIRED_DIAGNOSTICS,
        assessabilityReasonCodes: reasons,
      },
    };
  }

  const admittedGroups = splitBucketsAtAdmittedSequenceBoundaries(sorted, input.sequenceMaxGapSeconds);
  const runs = admittedGroups.flatMap((group) =>
    enumerateCoherentCoRpmSpeedRuns(group, input.maxAdjacentGapMs),
  );
  const qualifying = runs.filter((r) => r.labelCount >= input.minLabels && r.spanMs >= input.minSpanMs);
  const maxLabelCount = runs.reduce((m, r) => Math.max(m, r.labelCount), 0);
  const maxSpan = runs.reduce((m, r) => Math.max(m, r.spanMs), 0);
  const maxQualifyingSpan = qualifying.reduce((m, r) => Math.max(m, r.spanMs), 0);
  const spanChampion = runWithMaxSpan(runs);
  const labelChampion = runWithMaxLabelCount(runs);

  const diagnostics: Ds4RevvingIdleFacetCoverageDiagnosticsV1 = {
    ...base,
    longestCoherentRunLabelCount: maxLabelCount,
    longestCoherentResearchLabelSpanMs: maxSpan,
    longestCoherentMaxAdjacentGapMs: spanChampion?.maxAdjacentGapMs ?? 0,
    maxQualifyingCoherentResearchLabelSpanMs: maxQualifyingSpan,
    labelsInMaxSpanRun: spanChampion?.labelCount ?? 0,
    spanMsInMaxLabelCountRun: labelChampion?.spanMs ?? 0,
    assessabilityReasonCodes: [],
  };

  if (qualifying.length === 0) {
    if (maxLabelCount < input.minLabels) {
      reasons.push('INSUFFICIENT_CO_LABEL_COUNT');
    }
    if (maxSpan < input.minSpanMs) {
      reasons.push('INSUFFICIENT_LABEL_SPAN_OPPORTUNITY');
    }
    if (reasons.length === 0) {
      reasons.push('NO_SINGLE_COHERENT_RUN_MEETS_LABEL_AND_SPAN');
    }
    diagnostics.assessabilityReasonCodes = reasons;
    return { assessable: false, diagnostics };
  }

  diagnostics.assessabilityReasonCodes = ['ASSESSABLE'];
  return { assessable: true, diagnostics };
}

export function evaluateRevvingIdleFacetAAssessability(
  canon: Ds4MultichannelCanonicalizeResultV1,
  sequenceMaxGapSeconds: number,
): Ds4RevvingIdleFacetAssessabilityVerdictV1 {
  return evaluateFacetOpportunity({
    canon,
    sequenceMaxGapSeconds,
    minLabels: FACET_A.minObservations,
    minSpanMs: FACET_A.minResearchLabelSpanMs,
    maxAdjacentGapMs: FACET_A.maxAdjacentLabelGapMs,
  });
}

export function evaluateRevvingIdleFacetBAssessability(
  canon: Ds4MultichannelCanonicalizeResultV1,
  sequenceMaxGapSeconds: number,
): Ds4RevvingIdleFacetAssessabilityVerdictV1 {
  return evaluateFacetOpportunity({
    canon,
    sequenceMaxGapSeconds,
    minLabels: FACET_B.minObservations,
    minSpanMs: FACET_B.minResearchLabelSpanMs,
    maxAdjacentGapMs: FACET_B.maxAdjacentLabelGapMs,
  });
}

function classifyNotAssessableTripEvidence(
  assessabilityReasonCodes: readonly Ds4RevvingIdleFacetAssessabilityReasonV1[],
): 'NOT_ASSESSABLE' | 'INSUFFICIENT_OBSERVATIONS' {
  if (assessabilityReasonCodes.includes('INTEGRITY_NOT_ADMITTED')) {
    return 'NOT_ASSESSABLE';
  }
  if (assessabilityReasonCodes.includes('RPM_SPEED_CO_OBSERVATION_UNAVAILABLE')) {
    return 'NOT_ASSESSABLE';
  }
  return 'INSUFFICIENT_OBSERVATIONS';
}

export function classifyFacetATripEvidenceAfterDetection(input: {
  assessable: boolean;
  candidateCount: number;
  assessabilityReasonCodes: readonly Ds4RevvingIdleFacetAssessabilityReasonV1[];
}): Ds4RevvingIdleFacetATripEvidenceClassificationV1 {
  if (!input.assessable) {
    return classifyNotAssessableTripEvidence(input.assessabilityReasonCodes);
  }
  if (input.candidateCount > 0) {
    return 'HIGH_RPM_STATIONARY_LIKE_PROXY_CANDIDATE';
  }
  return 'NOT_OBSERVED';
}

export function classifyFacetBTripEvidenceAfterDetection(input: {
  assessable: boolean;
  candidateCount: number;
  assessabilityReasonCodes: readonly Ds4RevvingIdleFacetAssessabilityReasonV1[];
}): Ds4RevvingIdleFacetBTripEvidenceClassificationV1 {
  if (!input.assessable) {
    return classifyNotAssessableTripEvidence(input.assessabilityReasonCodes);
  }
  if (input.candidateCount > 0) {
    return 'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY_CANDIDATE';
  }
  return 'NOT_OBSERVED';
}

export function resolveRevvingIdleTripStatus(input: {
  globalAbstained: boolean;
  facetATripEvidence: Ds4RevvingIdleFacetATripEvidenceClassificationV1;
  facetBTripEvidence: Ds4RevvingIdleFacetBTripEvidenceClassificationV1;
}): 'ABSTAINED' | 'NOT_OBSERVED' | 'COMPUTED' {
  if (input.globalAbstained) return 'ABSTAINED';
  const bothNotObserved =
    input.facetATripEvidence === 'NOT_OBSERVED' && input.facetBTripEvidence === 'NOT_OBSERVED';
  if (bothNotObserved) return 'NOT_OBSERVED';
  return 'COMPUTED';
}
