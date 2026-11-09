import {
  DBI_P2C2_EVIDENCE_ADAPTER_CONTRACT_VERSION,
  type DbiP2c2OfflineEvidenceBundleV1,
  type DbiP2c2ProxyCandidateEnvelopeV1,
} from '../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.contract.v1';
import type { DbiP2c3ReconciliationDiagnosticCodeV1 } from './dbi-p2c3-reconciliation.contract.v1';

const CORE_BINDING_KEYS = ['organizationId', 'vehicleId', 'tripId', 'providerSourceLinkId'] as const;

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
    if (part.sourceModule !== plane.participant.sourceModule) {
      codes.push('PARTICIPANT_SOURCE_MODULE_MISMATCH');
    }
    for (const key of CORE_BINDING_KEYS) {
      if (!nonemptyString(part.identity[key])) {
        codes.push('REQUIRED_CORE_BINDING_EMPTY');
      }
    }

    for (const cand of plane.candidates) {
      if (!candidateMatchesParent(cand, part.sourceModule)) {
        codes.push('CANDIDATE_SOURCE_MODULE_MISMATCH');
      }
    }
  }

  return [...new Set(codes)].sort();
}

function nonemptyString(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function candidateMatchesParent(
  cand: DbiP2c2ProxyCandidateEnvelopeV1,
  parentModule: DbiP2c2OfflineEvidenceBundleV1['powertrainProxies'][number]['participant']['sourceModule'],
): boolean {
  return cand.sourceModule === parentModule;
}
