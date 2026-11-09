import type {
  DbiP2c2A1EvidenceParticipantV1,
  DbiP2c2B3EvidenceParticipantV1,
  DbiP2c2B4EvidenceParticipantV1,
  DbiP2c2OfflineEvidenceBundleV1,
} from '../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.contract.v1';
import type { Ds4RpmEpisodeResearchEpisodeCategoryStatus } from '../ds4-rpm-episode-research/ds4-rpm-episode-research.contract.v1';
import type {
  Ds4RevvingIdleFacetATripEvidenceClassificationV1,
  Ds4RevvingIdleFacetBTripEvidenceClassificationV1,
  Ds4SustainedLoadTripEvidenceClassificationV1,
} from '../ds4-powertrain-demand-research/ds4-powertrain-demand-research.contract.v1';
import type { DbiP2c3ReconciliationDiagnosticCodeV1 } from './dbi-p2c3-reconciliation.contract.v1';

const A1_HIGH_EPISODES_STATUSES = new Set<Ds4RpmEpisodeResearchEpisodeCategoryStatus>([
  'SUPPORTED_DESCRIPTIVE',
  'NOT_OBSERVED',
  'NOT_ASSESSABLE',
]);

const B3_TRIP_EVIDENCE_CLASSES = new Set<Ds4SustainedLoadTripEvidenceClassificationV1>([
  'NOT_ASSESSABLE',
  'INSUFFICIENT_OBSERVATIONS',
  'NOT_OBSERVED',
  'SINGLE_HIGH_LOAD_ENTRY_LABEL',
  'MULTI_LABEL_HIGH_LOAD_RUN',
  'GAP_AWARE_SUSTAINED_PROXY_CANDIDATE',
]);

const B4_FACET_A_CLASSES = new Set<Ds4RevvingIdleFacetATripEvidenceClassificationV1>([
  'NOT_ASSESSABLE',
  'INSUFFICIENT_OBSERVATIONS',
  'NOT_OBSERVED',
  'HIGH_RPM_STATIONARY_LIKE_PROXY_CANDIDATE',
]);

const B4_FACET_B_CLASSES = new Set<Ds4RevvingIdleFacetBTripEvidenceClassificationV1>([
  'NOT_ASSESSABLE',
  'INSUFFICIENT_OBSERVATIONS',
  'NOT_OBSERVED',
  'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY_CANDIDATE',
]);

export function validateParticipantRuntimeEnums(
  bundle: DbiP2c2OfflineEvidenceBundleV1,
): readonly DbiP2c3ReconciliationDiagnosticCodeV1[] {
  const codes: DbiP2c3ReconciliationDiagnosticCodeV1[] = [];

  if (bundle.descriptive) {
    const part = bundle.descriptive.participant as DbiP2c2A1EvidenceParticipantV1;
    if (!A1_HIGH_EPISODES_STATUSES.has(part.moduleAssessability.highEpisodesStatus)) {
      codes.push('PARTICIPANT_ENUM_VALUE_INVALID');
    }
    if (!A1_HIGH_EPISODES_STATUSES.has(part.highEpisodesMeta.status)) {
      codes.push('PARTICIPANT_ENUM_VALUE_INVALID');
    }
  }

  for (const plane of bundle.powertrainProxies) {
    const module = plane.participant.sourceModule;
    if (module === 'P2-B3') {
      const part = plane.participant as DbiP2c2B3EvidenceParticipantV1;
      if (!B3_TRIP_EVIDENCE_CLASSES.has(part.tripEvidenceClassification)) {
        codes.push('PARTICIPANT_ENUM_VALUE_INVALID');
      }
    }
    if (module === 'P2-B4') {
      const part = plane.participant as DbiP2c2B4EvidenceParticipantV1;
      const facetAClass = part.facetA.tripEvidenceClassification as Ds4RevvingIdleFacetATripEvidenceClassificationV1;
      const facetBClass = part.facetB.tripEvidenceClassification as Ds4RevvingIdleFacetBTripEvidenceClassificationV1;
      if (!B4_FACET_A_CLASSES.has(facetAClass)) {
        codes.push('PARTICIPANT_ENUM_VALUE_INVALID');
      }
      if (!B4_FACET_B_CLASSES.has(facetBClass)) {
        codes.push('PARTICIPANT_ENUM_VALUE_INVALID');
      }
    }
  }

  return [...new Set(codes)].sort();
}
