import {
  DBI_P2C2_EVIDENCE_ADAPTER_CONTRACT_VERSION,
  type DbiP2c2OfflineEvidenceBundleV1,
  type DbiP2c2ProxyCandidateEnvelopeV1,
  type DbiP2c2SourceModuleV1,
} from '../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.contract.v1';
import type { Ds4KickdownCandidateSupportTier } from '../ds4-powertrain-demand-research/ds4-powertrain-demand-research.contract.v1';
import type { DbiP2c3ReconciliationDiagnosticCodeV1 } from './dbi-p2c3-reconciliation.contract.v1';
import { tryBuildCandidateEnvelopeIdentityPayload } from './dbi-p2c3-reconciliation.canonical.v1';
import { validateParticipantIdentityShape } from './dbi-p2c3-reconciliation.identity-canon.v1';

const B4_FACET_A_CLASSIFICATION = 'HIGH_RPM_STATIONARY_LIKE_PROXY_CANDIDATE' as const;
const B4_FACET_B_CLASSIFICATION = 'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY_CANDIDATE' as const;

const CORE_BINDING_KEYS = ['organizationId', 'vehicleId', 'tripId', 'providerSourceLinkId'] as const;

const ALLOWED_POWERTRAIN_MODULES: readonly DbiP2c2SourceModuleV1[] = [
  'P2-B1',
  'P2-B2',
  'P2-B3',
  'P2-B4',
] as const;

const B1_CANDIDATE_SUPPORT_TIERS = new Set<Ds4KickdownCandidateSupportTier>(['STRONG', 'MODERATE', 'WEAK']);

export function validateBundleAndParticipants(
  bundle: DbiP2c2OfflineEvidenceBundleV1,
): readonly DbiP2c3ReconciliationDiagnosticCodeV1[] {
  const codes: DbiP2c3ReconciliationDiagnosticCodeV1[] = [];
  if (bundle.contractVersion !== DBI_P2C2_EVIDENCE_ADAPTER_CONTRACT_VERSION) {
    codes.push('INVALID_BUNDLE_CONTRACT_VERSION');
  }

  if (bundle.descriptive) {
    const part = bundle.descriptive.participant;
    if (bundle.descriptive.evidencePlane !== 'DESCRIPTIVE_RPM_EPISODES') {
      codes.push('INVALID_PARTICIPANT_PLANE');
    }
    if (!part || part.sourceModule !== 'P2-A1') {
      codes.push('MISSING_PARTICIPANT_HEADER', 'INVALID_PARTICIPANT_PLANE');
    } else {
      if (!part.researchOnly) codes.push('PARTICIPANT_NOT_RESEARCH_ONLY');
      if (!part.moduleAssessability.semanticGuards.notEvidenceCandidate) {
        codes.push('A1_DESCRIPTIVE_AUTHORITY_VIOLATION');
      }
      if (!part.moduleAssessability.semanticGuards.labelsNotForCrossDomainJoin) {
        codes.push('A1_DESCRIPTIVE_AUTHORITY_VIOLATION');
      }
      if (part.adapterClaimsPositiveEvidence) {
        codes.push('A1_DESCRIPTIVE_AUTHORITY_VIOLATION');
      }
      for (const key of CORE_BINDING_KEYS) {
        if (!nonemptyString(part.identity[key])) {
          codes.push('REQUIRED_CORE_BINDING_EMPTY');
        }
      }
      validateParticipantIdentityShape(part.identity, codes);
    }
  }

  for (const plane of bundle.powertrainProxies) {
    if (plane.evidencePlane !== 'POWERTRAIN_PROXY_CANDIDATES') {
      codes.push('INVALID_PARTICIPANT_PLANE');
      continue;
    }
    const part = plane.participant;
    if (!part?.sourceModule || !part.identity) {
      codes.push('MISSING_PARTICIPANT_HEADER', 'INVALID_PARTICIPANT_PLANE');
      continue;
    }
    if (!part.researchOnly) codes.push('PARTICIPANT_NOT_RESEARCH_ONLY');
    const runtimeSourceModule = part.sourceModule as string;
    if (runtimeSourceModule === 'P2-A1') {
      codes.push('A1_IN_POWERTRAIN_PROXY_PLANE');
      continue;
    }
    if (!ALLOWED_POWERTRAIN_MODULES.includes(part.sourceModule)) {
      codes.push('PROXY_PLANE_INVALID_SOURCE_MODULE');
      continue;
    }
    for (const key of CORE_BINDING_KEYS) {
      if (!nonemptyString(part.identity[key])) {
        codes.push('REQUIRED_CORE_BINDING_EMPTY');
      }
    }
    validateParticipantIdentityShape(part.identity, codes);

    for (const cand of plane.candidates) {
      if (cand.sourceModule !== part.sourceModule) {
        codes.push('CANDIDATE_SOURCE_MODULE_MISMATCH');
      }
      if (cand.sourceModule === 'P2-B1' && !b1CandidateSupportTiersValid(cand)) {
        codes.push('B1_CANDIDATE_SUPPORT_TIER_INVALID');
      } else if (!candidateEnvelopeCoherent(cand)) {
        codes.push('CANDIDATE_ENVELOPE_INCOHERENT');
      }
      if (!tryBuildCandidateEnvelopeIdentityPayload(cand).ok) {
        codes.push('CANDIDATE_PAYLOAD_CANONICAL_INVALID');
      }
    }
  }

  return [...new Set(codes)].sort();
}

function nonemptyString(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isAuthorizedB1SupportTier(value: unknown): value is Ds4KickdownCandidateSupportTier {
  return typeof value === 'string' && B1_CANDIDATE_SUPPORT_TIERS.has(value as Ds4KickdownCandidateSupportTier);
}

function b1CandidateSupportTiersValid(
  cand: Extract<DbiP2c2ProxyCandidateEnvelopeV1, { sourceModule: 'P2-B1' }>,
): boolean {
  return (
    isAuthorizedB1SupportTier(cand.originalCandidateSupportTier) &&
    isAuthorizedB1SupportTier(cand.originalCandidate.candidateSupportTier)
  );
}

function candidateEnvelopeCoherent(cand: DbiP2c2ProxyCandidateEnvelopeV1): boolean {
  if (cand.originalCandidate.episodeKey !== cand.sourceEpisodeKey) {
    return false;
  }
  if (cand.originalClassification !== cand.originalCandidate.classification) {
    return false;
  }
  switch (cand.sourceModule) {
    case 'P2-B1': {
      const b1 = cand as Extract<DbiP2c2ProxyCandidateEnvelopeV1, { sourceModule: 'P2-B1' }>;
      if (!b1CandidateSupportTiersValid(b1)) return false;
      return b1.originalCandidateSupportTier === b1.originalCandidate.candidateSupportTier;
    }
    case 'P2-B2':
      return cand.proxyKind === cand.originalCandidate.proxyKind;
    case 'P2-B3':
      return true;
    case 'P2-B4': {
      if (cand.facet === 'HIGH_RPM_STATIONARY_LIKE_PROXY') {
        return (
          'peakObservedRpm' in cand.originalCandidate &&
          !('meanObservedRpmInBand' in cand.originalCandidate) &&
          cand.originalCandidate.classification === B4_FACET_A_CLASSIFICATION &&
          cand.originalClassification === B4_FACET_A_CLASSIFICATION
        );
      }
      if (cand.facet === 'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY') {
        return (
          'meanObservedRpmInBand' in cand.originalCandidate &&
          !('peakObservedRpm' in cand.originalCandidate) &&
          cand.originalCandidate.classification === B4_FACET_B_CLASSIFICATION &&
          cand.originalClassification === B4_FACET_B_CLASSIFICATION
        );
      }
      return false;
    }
    default:
      return false;
  }
}
