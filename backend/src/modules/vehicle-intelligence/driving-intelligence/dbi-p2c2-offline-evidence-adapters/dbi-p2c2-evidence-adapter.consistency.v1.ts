import type {
  Ds4PowertrainDemandColdEngineResultV1,
  Ds4PowertrainDemandRevvingIdleResultV1,
  Ds4PowertrainDemandTripStatus,
} from '../ds4-powertrain-demand-research/ds4-powertrain-demand-research.contract.v1';
import type { Ds4RpmEpisodeResearchResultV1 } from '../ds4-rpm-episode-research/ds4-rpm-episode-research.contract.v1';
import type { DbiP2c2AdapterDiagnosticCodeV1 } from './dbi-p2c2-evidence-adapter.contract.v1';
import { classificationIsPositiveProxy } from './dbi-p2c2-evidence-adapter.shared.v1';

export function positiveClassifications(classifications: readonly string[]): string[] {
  return classifications.filter(classificationIsPositiveProxy);
}

export function checkNotObservedWithPositiveCandidates(
  status: Ds4PowertrainDemandTripStatus,
  classifications: readonly string[],
): DbiP2c2AdapterDiagnosticCodeV1 | null {
  if (status === 'NOT_OBSERVED' && positiveClassifications(classifications).length > 0) {
    return 'CONTRADICTORY_POSITIVE_CANDIDATES_UNDER_NOT_OBSERVED';
  }
  return null;
}

export function checkAbstainedWithPositiveCandidates(
  status: Ds4PowertrainDemandTripStatus,
  classifications: readonly string[],
): DbiP2c2AdapterDiagnosticCodeV1 | null {
  if (status === 'ABSTAINED' && positiveClassifications(classifications).length > 0) {
    return 'CONTRADICTORY_POSITIVE_CANDIDATES_UNDER_ABSTAIN';
  }
  return null;
}

export function checkA1DescriptiveEpisodeConsistency(
  source: Ds4RpmEpisodeResearchResultV1,
): DbiP2c2AdapterDiagnosticCodeV1[] {
  if (source.highEpisodes.items.length === 0) return [];
  const codes: DbiP2c2AdapterDiagnosticCodeV1[] = [];
  if (source.status === 'ABSTAINED') {
    codes.push('A1_CONTRADICTORY_DESCRIPTIVE_EPISODES_UNDER_ABSTAIN');
  }
  if (source.highEpisodes.status === 'NOT_ASSESSABLE') {
    codes.push('A1_CONTRADICTORY_DESCRIPTIVE_EPISODES_UNDER_NOT_ASSESSABLE');
  }
  if (source.highEpisodes.status === 'NOT_OBSERVED' && source.highEpisodes.items.length > 0) {
    codes.push('A1_CONTRADICTORY_DESCRIPTIVE_EPISODES_UNDER_NOT_OBSERVED');
  }
  if (source.highEpisodes.status !== 'SUPPORTED_DESCRIPTIVE' && source.highEpisodes.items.length > 0) {
    codes.push('A1_CONTRADICTORY_DESCRIPTIVE_EPISODES_STATUS');
  }
  return codes;
}

const FACET_A_POSITIVE_CLASS = 'HIGH_RPM_STATIONARY_LIKE_PROXY_CANDIDATE' as const;
const FACET_B_POSITIVE_CLASS = 'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY_CANDIDATE' as const;

export function checkB2ColdEngineSubtypeConsistency(
  source: Ds4PowertrainDemandColdEngineResultV1,
): DbiP2c2AdapterDiagnosticCodeV1[] {
  const codes: DbiP2c2AdapterDiagnosticCodeV1[] = [];
  for (const candidate of source.coldEngine.candidates) {
    if (!classificationIsPositiveProxy(candidate.classification)) continue;
    const subtype = source.coldEngine.subtypeAssessability[candidate.proxyKind];
    if (subtype?.status === 'NOT_ASSESSABLE') {
      codes.push('B2_CONTRADICTORY_POSITIVE_UNDER_NOT_ASSESSABLE_SUBTYPE');
    }
  }
  return codes;
}

export function checkB4RevvingIdleConsistency(source: Ds4PowertrainDemandRevvingIdleResultV1): DbiP2c2AdapterDiagnosticCodeV1[] {
  const codes: DbiP2c2AdapterDiagnosticCodeV1[] = [];
  const facetAPositive = source.revvingIdle.facetA.candidates.filter((c) =>
    classificationIsPositiveProxy(c.classification),
  );
  const facetBPositive = source.revvingIdle.facetB.candidates.filter((c) =>
    classificationIsPositiveProxy(c.classification),
  );
  const anyPositiveClassifications = [
    ...source.revvingIdle.facetA.candidates.map((c) => c.classification),
    ...source.revvingIdle.facetB.candidates.map((c) => c.classification),
  ];

  const abstained = checkAbstainedWithPositiveCandidates(source.status, anyPositiveClassifications);
  if (abstained) codes.push(abstained);
  const notObserved = checkNotObservedWithPositiveCandidates(source.status, anyPositiveClassifications);
  if (notObserved) codes.push(notObserved);

  if (
    source.revvingIdle.facetA.assessability === 'NOT_ASSESSABLE' &&
    source.revvingIdle.facetB.assessability === 'NOT_ASSESSABLE' &&
    (facetAPositive.length > 0 || facetBPositive.length > 0)
  ) {
    codes.push('B4_CONTRADICTORY_POSITIVE_UNDER_DUAL_NOT_ASSESSABLE');
  }

  if (source.revvingIdle.facetA.assessability === 'NOT_ASSESSABLE' && facetAPositive.length > 0) {
    codes.push('B4_CONTRADICTORY_POSITIVE_UNDER_UNASSESSABLE_FACET_A');
  }
  if (source.revvingIdle.facetB.assessability === 'NOT_ASSESSABLE' && facetBPositive.length > 0) {
    codes.push('B4_CONTRADICTORY_POSITIVE_UNDER_UNASSESSABLE_FACET_B');
  }

  for (const c of facetAPositive) {
    if (c.classification !== FACET_A_POSITIVE_CLASS) {
      codes.push('B4_CONTRADICTORY_FACET_A_CANDIDATE_CLASSIFICATION');
    }
  }
  for (const c of facetBPositive) {
    if (c.classification !== FACET_B_POSITIVE_CLASS) {
      codes.push('B4_CONTRADICTORY_FACET_B_CANDIDATE_CLASSIFICATION');
    }
  }

  const aClass = source.revvingIdle.facetA.tripEvidenceClassification;
  const bClass = source.revvingIdle.facetB.tripEvidenceClassification;

  if (aClass === 'NOT_OBSERVED' && facetAPositive.length > 0) {
    codes.push('B4_CONTRADICTORY_FACET_A_TRIP_CLASSIFICATION');
  }
  if (aClass === FACET_A_POSITIVE_CLASS && facetAPositive.length === 0) {
    codes.push('B4_CONTRADICTORY_FACET_A_TRIP_CLASSIFICATION');
  }
  if (aClass === 'NOT_ASSESSABLE' && facetAPositive.length > 0) {
    codes.push('B4_CONTRADICTORY_FACET_A_TRIP_CLASSIFICATION');
  }
  if (bClass === 'NOT_OBSERVED' && facetBPositive.length > 0) {
    codes.push('B4_CONTRADICTORY_FACET_B_TRIP_CLASSIFICATION');
  }
  if (bClass === FACET_B_POSITIVE_CLASS && facetBPositive.length === 0) {
    codes.push('B4_CONTRADICTORY_FACET_B_TRIP_CLASSIFICATION');
  }
  if (bClass === 'NOT_ASSESSABLE' && facetBPositive.length > 0) {
    codes.push('B4_CONTRADICTORY_FACET_B_TRIP_CLASSIFICATION');
  }

  return codes;
}
