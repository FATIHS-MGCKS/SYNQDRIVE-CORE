import type {
  Ds4RevvingIdleFacetAssessabilityReasonV1,
  Ds4RevvingIdleFacetATripEvidenceClassificationV1,
  Ds4RevvingIdleFacetBTripEvidenceClassificationV1,
  Ds4RevvingIdleFacetCoverageDiagnosticsV1,
} from './ds4-powertrain-demand-research.contract.v1';
import type { Ds4CanonicalMultichannelBucketV1 } from './ds4-powertrain-demand-multichannel-canonicalize.v1';
import type { Ds4MultichannelCanonicalizeResultV1 } from './ds4-powertrain-demand-multichannel-canonicalize.v1';
import { DS4_REVIVING_IDLE_DUAL_FACET_POLICY } from './ds4-powertrain-demand-revving-idle-reference.v1';

export type { Ds4RevvingIdleFacetCoverageDiagnosticsV1 };

const FACET_A = DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetA;
const FACET_B = DS4_REVIVING_IDLE_DUAL_FACET_POLICY.facetB;

export type Ds4RevvingIdleFacetAssessabilityVerdictV1 = {
  assessable: boolean;
  diagnostics: Ds4RevvingIdleFacetCoverageDiagnosticsV1;
};

function coRpmSpeedBuckets(canon: Ds4MultichannelCanonicalizeResultV1): Ds4CanonicalMultichannelBucketV1[] {
  return [...canon.buckets]
    .filter((b) => b.rpm != null && b.speedKmh != null)
    .sort((a, b) => a.recordedAtMs - b.recordedAtMs);
}

type CoherentRun = {
  labelCount: number;
  spanMs: number;
  maxAdjacentGapMs: number;
};

/** Longest chain of rpm+speed co-labelled buckets with adjacent gaps <= maxAdjacentGapMs. */
export function findLongestCoherentCoRpmSpeedRun(
  buckets: readonly Ds4CanonicalMultichannelBucketV1[],
  maxAdjacentGapMs: number,
): CoherentRun {
  if (buckets.length === 0) {
    return { labelCount: 0, spanMs: 0, maxAdjacentGapMs: 0 };
  }

  let best: CoherentRun = { labelCount: 0, spanMs: 0, maxAdjacentGapMs: 0 };
  let runStart = 0;

  const flushRun = (runEnd: number) => {
    const slice = buckets.slice(runStart, runEnd + 1);
    if (slice.length === 0) return;
    let maxGap = 0;
    for (let i = 1; i < slice.length; i += 1) {
      maxGap = Math.max(maxGap, slice[i]!.recordedAtMs - slice[i - 1]!.recordedAtMs);
    }
    const span = slice[slice.length - 1]!.recordedAtMs - slice[0]!.recordedAtMs;
    const candidate: CoherentRun = {
      labelCount: slice.length,
      spanMs: span,
      maxAdjacentGapMs: maxGap,
    };
    const better =
      candidate.labelCount > best.labelCount ||
      (candidate.labelCount === best.labelCount && candidate.spanMs > best.spanMs);
    if (better) best = candidate;
  };

  for (let i = 1; i < buckets.length; i += 1) {
    const gap = buckets[i]!.recordedAtMs - buckets[i - 1]!.recordedAtMs;
    if (gap > maxAdjacentGapMs) {
      flushRun(i - 1);
      runStart = i;
    }
  }
  flushRun(buckets.length - 1);
  return best;
}

function baseDiagnostics(canon: Ds4MultichannelCanonicalizeResultV1): Omit<
  Ds4RevvingIdleFacetCoverageDiagnosticsV1,
  'longestCoherentRunLabelCount' | 'longestCoherentResearchLabelSpanMs' | 'longestCoherentMaxAdjacentGapMs' | 'assessabilityReasonCodes'
> {
  return {
    rpmSpeedCoObservedLabelCount: coRpmSpeedBuckets(canon).length,
    rpmMissingRequiredChannelCount: canon.buckets.filter((b) => b.rpm == null).length,
    speedMissingRequiredChannelCount: canon.buckets.filter((b) => b.speedKmh == null).length,
  };
}

function evaluateFacetOpportunity(input: {
  canon: Ds4MultichannelCanonicalizeResultV1;
  minLabels: number;
  minSpanMs: number;
  maxAdjacentGapMs: number;
}): Ds4RevvingIdleFacetAssessabilityVerdictV1 {
  const base = baseDiagnostics(input.canon);
  const co = coRpmSpeedBuckets(input.canon);
  const reasons: Ds4RevvingIdleFacetAssessabilityReasonV1[] = [];

  if (co.length === 0) {
    reasons.push('RPM_SPEED_CO_OBSERVATION_UNAVAILABLE');
    return {
      assessable: false,
      diagnostics: {
        ...base,
        longestCoherentRunLabelCount: 0,
        longestCoherentResearchLabelSpanMs: 0,
        longestCoherentMaxAdjacentGapMs: 0,
        assessabilityReasonCodes: reasons,
      },
    };
  }

  const longest = findLongestCoherentCoRpmSpeedRun(co, input.maxAdjacentGapMs);
  const diagnostics: Ds4RevvingIdleFacetCoverageDiagnosticsV1 = {
    ...base,
    longestCoherentRunLabelCount: longest.labelCount,
    longestCoherentResearchLabelSpanMs: longest.spanMs,
    longestCoherentMaxAdjacentGapMs: longest.maxAdjacentGapMs,
    assessabilityReasonCodes: [],
  };

  if (longest.labelCount < input.minLabels) {
    reasons.push('INSUFFICIENT_CO_LABEL_COUNT');
  }
  if (longest.spanMs < input.minSpanMs) {
    reasons.push('INSUFFICIENT_LABEL_SPAN_OPPORTUNITY');
  }
  if (longest.labelCount >= 2 && longest.maxAdjacentGapMs > input.maxAdjacentGapMs) {
    reasons.push('INSUFFICIENT_COHERENT_GAP_COVERAGE');
  }

  if (reasons.length > 0) {
    diagnostics.assessabilityReasonCodes = reasons;
    return { assessable: false, diagnostics };
  }

  diagnostics.assessabilityReasonCodes = ['ASSESSABLE'];
  return { assessable: true, diagnostics };
}

export function evaluateRevvingIdleFacetAAssessability(
  canon: Ds4MultichannelCanonicalizeResultV1,
): Ds4RevvingIdleFacetAssessabilityVerdictV1 {
  return evaluateFacetOpportunity({
    canon,
    minLabels: FACET_A.minObservations,
    minSpanMs: FACET_A.minResearchLabelSpanMs,
    maxAdjacentGapMs: FACET_A.maxAdjacentLabelGapMs,
  });
}

export function evaluateRevvingIdleFacetBAssessability(
  canon: Ds4MultichannelCanonicalizeResultV1,
): Ds4RevvingIdleFacetAssessabilityVerdictV1 {
  return evaluateFacetOpportunity({
    canon,
    minLabels: FACET_B.minObservations,
    minSpanMs: FACET_B.minResearchLabelSpanMs,
    maxAdjacentGapMs: FACET_B.maxAdjacentLabelGapMs,
  });
}

export function classifyFacetATripEvidenceAfterDetection(input: {
  assessable: boolean;
  assessabilityReasonCodes: readonly Ds4RevvingIdleFacetAssessabilityReasonV1[];
  candidateCount: number;
  entryLabelCount: number;
  longestRunLabelCount: number;
}): Ds4RevvingIdleFacetATripEvidenceClassificationV1 {
  if (!input.assessable) {
    return 'INSUFFICIENT_OBSERVATIONS';
  }
  if (input.candidateCount > 0) {
    return 'HIGH_RPM_STATIONARY_LIKE_PROXY_CANDIDATE';
  }
  if (input.entryLabelCount === 0) {
    return 'NOT_OBSERVED';
  }
  if (input.longestRunLabelCount >= FACET_A.minObservations) {
    return 'INSUFFICIENT_OBSERVATIONS';
  }
  return 'INSUFFICIENT_OBSERVATIONS';
}

export function classifyFacetBTripEvidenceAfterDetection(input: {
  assessable: boolean;
  candidateCount: number;
  entryLabelCount: number;
  longestRunLabelCount: number;
}): Ds4RevvingIdleFacetBTripEvidenceClassificationV1 {
  if (!input.assessable) {
    return 'INSUFFICIENT_OBSERVATIONS';
  }
  if (input.candidateCount > 0) {
    return 'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY_CANDIDATE';
  }
  if (input.entryLabelCount === 0) {
    return 'NOT_OBSERVED';
  }
  if (input.longestRunLabelCount >= FACET_B.minObservations) {
    return 'INSUFFICIENT_OBSERVATIONS';
  }
  return 'INSUFFICIENT_OBSERVATIONS';
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
