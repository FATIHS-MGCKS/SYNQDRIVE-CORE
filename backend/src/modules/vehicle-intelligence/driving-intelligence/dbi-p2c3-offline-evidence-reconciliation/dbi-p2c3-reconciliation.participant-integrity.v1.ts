import {
  DBI_P2C2_NOT_REPORTED,
  type DbiP2c2A1EvidenceParticipantV1,
  type DbiP2c2B2EvidenceParticipantV1,
  type DbiP2c2B3EvidenceParticipantV1,
  type DbiP2c2B4EvidenceParticipantV1,
  type DbiP2c2DescriptiveRpmEpisodesPlaneV1,
  type DbiP2c2OfflineEvidenceBundleV1,
  type DbiP2c2PowertrainProxyCandidatesPlaneV1,
  type DbiP2c2PowertrainProxyParticipantV1,
  type DbiP2c2ProxyCandidateEnvelopeV1,
} from '../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.contract.v1';
import {
  checkAbstainedWithPositiveCandidates,
  checkNotObservedWithPositiveCandidates,
} from '../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.consistency.v1';
import {
  classificationIsPositiveProxy,
  computeAdapterClaimsPositiveEvidence,
} from '../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.shared.v1';
import type { Ds4PowertrainDemandTripStatus } from '../ds4-powertrain-demand-research/ds4-powertrain-demand-research.contract.v1';
import type { DbiP2c3ReconciliationDiagnosticCodeV1 } from './dbi-p2c3-reconciliation.contract.v1';
import { canonicalJsonStringify } from './dbi-p2c3-reconciliation.canonical-json.v1';
import {
  isKnownPowertrainKernelStatus,
  validateA1KernelStatus,
  validatePowertrainKernelStatus,
} from './dbi-p2c3-reconciliation.kernel-status.v1';

const FACET_A_POSITIVE_CLASS = 'HIGH_RPM_STATIONARY_LIKE_PROXY_CANDIDATE' as const;
const FACET_B_POSITIVE_CLASS = 'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY_CANDIDATE' as const;
const B3_POSITIVE_CLASS = 'GAP_AWARE_SUSTAINED_PROXY_CANDIDATE' as const;

function classificationsFromCandidates(candidates: readonly DbiP2c2ProxyCandidateEnvelopeV1[]): string[] {
  return candidates.map((c) => c.originalClassification);
}

function tripStatus(participant: DbiP2c2PowertrainProxyParticipantV1): Ds4PowertrainDemandTripStatus | null {
  if (!isKnownPowertrainKernelStatus(participant.originalKernelStatus)) return null;
  return participant.originalKernelStatus;
}

function mapAdapterConsistencyCode(
  code: string | null,
): DbiP2c3ReconciliationDiagnosticCodeV1 | null {
  if (!code) return null;
  if (code === 'CONTRADICTORY_POSITIVE_CANDIDATES_UNDER_ABSTAIN') {
    return 'PARTICIPANT_CONTRADICTORY_POSITIVE_UNDER_ABSTAIN';
  }
  if (code === 'CONTRADICTORY_POSITIVE_CANDIDATES_UNDER_NOT_OBSERVED') {
    return 'PARTICIPANT_CONTRADICTORY_POSITIVE_UNDER_NOT_OBSERVED';
  }
  return null;
}

function validateSharedPowertrainParticipant(
  participant: DbiP2c2PowertrainProxyParticipantV1,
  candidates: readonly DbiP2c2ProxyCandidateEnvelopeV1[],
): DbiP2c3ReconciliationDiagnosticCodeV1[] {
  const codes: DbiP2c3ReconciliationDiagnosticCodeV1[] = [];
  const classifications = classificationsFromCandidates(candidates);
  const status = tripStatus(participant);
  if (status === null) {
    return codes;
  }

  const abstained = mapAdapterConsistencyCode(checkAbstainedWithPositiveCandidates(status, classifications));
  if (abstained) codes.push(abstained);
  const notObserved = mapAdapterConsistencyCode(checkNotObservedWithPositiveCandidates(status, classifications));
  if (notObserved) codes.push(notObserved);

  let extraBlock = false;
  if (participant.sourceModule === 'P2-B4') {
    const b4 = participant as DbiP2c2B4EvidenceParticipantV1;
    extraBlock =
      b4.facetA.assessability === 'NOT_ASSESSABLE' && b4.facetB.assessability === 'NOT_ASSESSABLE';
  }

  const expectedClaim = computeAdapterClaimsPositiveEvidence({
    tripStatus: status,
    classifications,
    extraBlock,
  });
  if (participant.adapterClaimsPositiveEvidence !== expectedClaim) {
    codes.push('PARTICIPANT_ADAPTER_POSITIVE_CLAIM_CONTRADICTION');
  }

  return codes;
}

function validateB2Plane(plane: DbiP2c2PowertrainProxyCandidatesPlaneV1): DbiP2c3ReconciliationDiagnosticCodeV1[] {
  const participant = plane.participant as DbiP2c2B2EvidenceParticipantV1;
  const codes = validateSharedPowertrainParticipant(participant, plane.candidates);
  for (const cand of plane.candidates) {
    if (cand.sourceModule !== 'P2-B2' || !('proxyKind' in cand)) continue;
    if (!classificationIsPositiveProxy(cand.originalClassification)) continue;
    const subtype = participant.subtypeAssessability[cand.proxyKind];
    if (subtype?.status === 'NOT_ASSESSABLE') {
      codes.push('B2_PARTICIPANT_SUBTYPE_ASSESSABILITY_CONTRADICTION');
    }
  }
  return codes;
}

function validateB3Plane(plane: DbiP2c2PowertrainProxyCandidatesPlaneV1): DbiP2c3ReconciliationDiagnosticCodeV1[] {
  const participant = plane.participant as DbiP2c2B3EvidenceParticipantV1;
  const codes = validateSharedPowertrainParticipant(participant, plane.candidates);
  const positives = plane.candidates.filter((c) => classificationIsPositiveProxy(c.originalClassification));
  const tripClass = participant.tripEvidenceClassification;

  if (tripClass === 'NOT_OBSERVED' && positives.length > 0) {
    codes.push('B3_PARTICIPANT_TRIP_CLASSIFICATION_CONTRADICTION');
  }
  if (tripClass === 'NOT_ASSESSABLE' && positives.length > 0) {
    codes.push('B3_PARTICIPANT_TRIP_CLASSIFICATION_CONTRADICTION');
  }
  if (tripClass === 'INSUFFICIENT_OBSERVATIONS' && positives.length > 0) {
    codes.push('B3_PARTICIPANT_TRIP_CLASSIFICATION_CONTRADICTION');
  }
  if (tripClass === B3_POSITIVE_CLASS && positives.length === 0) {
    codes.push('B3_PARTICIPANT_TRIP_CLASSIFICATION_CONTRADICTION');
  }
  return codes;
}

function validateB4Plane(plane: DbiP2c2PowertrainProxyCandidatesPlaneV1): DbiP2c3ReconciliationDiagnosticCodeV1[] {
  const participant = plane.participant as DbiP2c2B4EvidenceParticipantV1;
  const codes = validateSharedPowertrainParticipant(participant, plane.candidates);

  const facetA = plane.candidates.filter(
    (c) => c.sourceModule === 'P2-B4' && 'facet' in c && c.facet === 'HIGH_RPM_STATIONARY_LIKE_PROXY',
  );
  const facetB = plane.candidates.filter(
    (c) => c.sourceModule === 'P2-B4' && 'facet' in c && c.facet === 'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY',
  );
  const facetAPositive = facetA.filter((c) => classificationIsPositiveProxy(c.originalClassification));
  const facetBPositive = facetB.filter((c) => classificationIsPositiveProxy(c.originalClassification));

  if (
    participant.facetA.assessability === 'NOT_ASSESSABLE' &&
    participant.facetB.assessability === 'NOT_ASSESSABLE' &&
    (facetAPositive.length > 0 || facetBPositive.length > 0)
  ) {
    codes.push('B4_PARTICIPANT_FACET_CONSISTENCY_CONTRADICTION');
  }
  if (participant.facetA.assessability === 'NOT_ASSESSABLE' && facetAPositive.length > 0) {
    codes.push('B4_PARTICIPANT_FACET_CONSISTENCY_CONTRADICTION');
  }
  if (participant.facetB.assessability === 'NOT_ASSESSABLE' && facetBPositive.length > 0) {
    codes.push('B4_PARTICIPANT_FACET_CONSISTENCY_CONTRADICTION');
  }

  const aClass = participant.facetA.tripEvidenceClassification;
  const bClass = participant.facetB.tripEvidenceClassification;
  if (aClass === 'NOT_OBSERVED' && facetAPositive.length > 0) {
    codes.push('B4_PARTICIPANT_FACET_CONSISTENCY_CONTRADICTION');
  }
  if (aClass === FACET_A_POSITIVE_CLASS && facetAPositive.length === 0) {
    codes.push('B4_PARTICIPANT_FACET_CONSISTENCY_CONTRADICTION');
  }
  if (aClass === 'NOT_ASSESSABLE' && facetAPositive.length > 0) {
    codes.push('B4_PARTICIPANT_FACET_CONSISTENCY_CONTRADICTION');
  }
  if (aClass === 'INSUFFICIENT_OBSERVATIONS' && facetAPositive.length > 0) {
    codes.push('B4_PARTICIPANT_FACET_CONSISTENCY_CONTRADICTION');
  }
  if (bClass === 'NOT_OBSERVED' && facetBPositive.length > 0) {
    codes.push('B4_PARTICIPANT_FACET_CONSISTENCY_CONTRADICTION');
  }
  if (bClass === FACET_B_POSITIVE_CLASS && facetBPositive.length === 0) {
    codes.push('B4_PARTICIPANT_FACET_CONSISTENCY_CONTRADICTION');
  }
  if (bClass === 'NOT_ASSESSABLE' && facetBPositive.length > 0) {
    codes.push('B4_PARTICIPANT_FACET_CONSISTENCY_CONTRADICTION');
  }
  if (bClass === 'INSUFFICIENT_OBSERVATIONS' && facetBPositive.length > 0) {
    codes.push('B4_PARTICIPANT_FACET_CONSISTENCY_CONTRADICTION');
  }

  for (const c of facetAPositive) {
    if (c.originalClassification !== FACET_A_POSITIVE_CLASS) {
      codes.push('B4_PARTICIPANT_FACET_CONSISTENCY_CONTRADICTION');
    }
  }
  for (const c of facetBPositive) {
    if (c.originalClassification !== FACET_B_POSITIVE_CLASS) {
      codes.push('B4_PARTICIPANT_FACET_CONSISTENCY_CONTRADICTION');
    }
  }

  return codes;
}

function validateB4FacetInventoryCounts(
  plane: DbiP2c2PowertrainProxyCandidatesPlaneV1,
): DbiP2c3ReconciliationDiagnosticCodeV1[] {
  const participant = plane.participant;
  if (participant.sourceModule !== 'P2-B4') return [];
  const b4 = participant as DbiP2c2B4EvidenceParticipantV1;
  const codes: DbiP2c3ReconciliationDiagnosticCodeV1[] = [];
  const facetACount = plane.candidates.filter(
    (c) => c.sourceModule === 'P2-B4' && 'facet' in c && c.facet === 'HIGH_RPM_STATIONARY_LIKE_PROXY',
  ).length;
  const facetBCount = plane.candidates.filter(
    (c) => c.sourceModule === 'P2-B4' && 'facet' in c && c.facet === 'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY',
  ).length;
  if (facetACount !== b4.facetA.deduplicatedCandidateCount) {
    codes.push('B4_FACET_CANDIDATE_COUNT_MISMATCH');
  }
  if (facetBCount !== b4.facetB.deduplicatedCandidateCount) {
    codes.push('B4_FACET_CANDIDATE_COUNT_MISMATCH');
  }
  return codes;
}

function validateA1Descriptive(descriptive: DbiP2c2DescriptiveRpmEpisodesPlaneV1): DbiP2c3ReconciliationDiagnosticCodeV1[] {
  const codes: DbiP2c3ReconciliationDiagnosticCodeV1[] = [];
  const part = descriptive.participant as DbiP2c2A1EvidenceParticipantV1;
  const episodeCount = descriptive.episodes.length;

  codes.push(...validateA1KernelStatus(part));
  if (part.highEpisodesMeta.status !== part.moduleAssessability.highEpisodesStatus) {
    codes.push('A1_METADATA_STATUS_MISMATCH');
  }

  if (episodeCount > 0 && part.originalKernelStatus === 'ABSTAINED') {
    codes.push('A1_PARTICIPANT_DESCRIPTIVE_INVENTORY_CONTRADICTION');
  }
  if (episodeCount > 0 && part.moduleAssessability.highEpisodesStatus === 'NOT_ASSESSABLE') {
    codes.push('A1_PARTICIPANT_DESCRIPTIVE_INVENTORY_CONTRADICTION');
  }
  if (episodeCount > 0 && part.highEpisodesMeta.status === 'NOT_OBSERVED') {
    codes.push('A1_PARTICIPANT_DESCRIPTIVE_INVENTORY_CONTRADICTION');
  }
  if (
    episodeCount > 0 &&
    part.highEpisodesMeta.status !== 'SUPPORTED_DESCRIPTIVE' &&
    part.moduleAssessability.highEpisodesStatus !== 'SUPPORTED_DESCRIPTIVE'
  ) {
    codes.push('A1_PARTICIPANT_DESCRIPTIVE_INVENTORY_CONTRADICTION');
  }
  return codes;
}

function validateA1ProxyBindingCoherence(bundle: DbiP2c2OfflineEvidenceBundleV1): DbiP2c3ReconciliationDiagnosticCodeV1[] {
  if (!bundle.descriptive) return [];
  const a1 = bundle.descriptive.participant;
  const codes: DbiP2c3ReconciliationDiagnosticCodeV1[] = [];

  for (const plane of bundle.powertrainProxies) {
    const proxyId = plane.participant.identity;
    if (typeof a1.identity.providerSourceLinkId === 'string' && a1.identity.providerSourceLinkId.trim().length > 0) {
      if (proxyId.providerSourceLinkId !== a1.identity.providerSourceLinkId) {
        codes.push('A1_PROXY_PROVIDER_SOURCE_LINK_CONTRADICTION');
      }
    }

    const a1V1b = a1.identity.v1bInputFingerprint;
    if (typeof a1V1b === 'string' && a1V1b.trim().length > 0) {
      if (proxyId.v1bInputFingerprint !== a1V1b) {
        codes.push('A1_PROXY_V1B_FINGERPRINT_CONTRADICTION');
      }
    }
  }

  return codes;
}

function participantPlaneIdentityKey(plane: DbiP2c2PowertrainProxyCandidatesPlaneV1): string {
  const part = plane.participant;
  return canonicalJsonStringify({
    sourceModule: part.sourceModule,
    identity: part.identity,
  });
}

function validateDuplicateParticipantPlanes(
  bundle: DbiP2c2OfflineEvidenceBundleV1,
): DbiP2c3ReconciliationDiagnosticCodeV1[] {
  const seen = new Set<string>();
  const codes: DbiP2c3ReconciliationDiagnosticCodeV1[] = [];
  for (const plane of bundle.powertrainProxies) {
    const key = participantPlaneIdentityKey(plane);
    if (seen.has(key)) {
      codes.push('DUPLICATE_PARTICIPANT_PLANE_IDENTITY');
    }
    seen.add(key);
  }
  return codes;
}

export function validateParticipantEvidenceIntegrity(
  bundle: DbiP2c2OfflineEvidenceBundleV1,
): readonly DbiP2c3ReconciliationDiagnosticCodeV1[] {
  const codes: DbiP2c3ReconciliationDiagnosticCodeV1[] = [];

  if (bundle.descriptive) {
    codes.push(...validateA1Descriptive(bundle.descriptive));
  }
  codes.push(...validateA1ProxyBindingCoherence(bundle));
  codes.push(...validateDuplicateParticipantPlanes(bundle));

  for (const plane of bundle.powertrainProxies) {
    const module = plane.participant.sourceModule;
    codes.push(...validatePowertrainKernelStatus(plane.participant));
    const shared = validateSharedPowertrainParticipant(plane.participant, plane.candidates);
    codes.push(...shared);

    switch (module) {
      case 'P2-B1':
        break;
      case 'P2-B2':
        codes.push(...validateB2Plane(plane));
        break;
      case 'P2-B3':
        codes.push(...validateB3Plane(plane));
        break;
      case 'P2-B4':
        codes.push(...validateB4Plane(plane));
        codes.push(...validateB4FacetInventoryCounts(plane));
        break;
      default:
        break;
    }

  }

  return [...new Set(codes)].sort();
}
