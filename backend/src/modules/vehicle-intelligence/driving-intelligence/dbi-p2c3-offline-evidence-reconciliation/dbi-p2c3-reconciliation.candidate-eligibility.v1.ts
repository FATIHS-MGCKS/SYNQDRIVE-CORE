import type {
  DbiP2c2OfflineEvidenceBundleV1,
  DbiP2c2ProxyCandidateEnvelopeV1,
} from '../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.contract.v1';
import type { Ds4ColdEngineProxyKindV1 } from '../ds4-powertrain-demand-research/ds4-powertrain-demand-research.contract.v1';
import type { Ds4KickdownCandidateClassification } from '../ds4-powertrain-demand-research/ds4-powertrain-demand-research.contract.v1';
import { classificationIsPositiveProxy } from '../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.shared.v1';
import type { DbiP2c3ReconciliationDiagnosticCodeV1 } from './dbi-p2c3-reconciliation.contract.v1';

const B1_CLASSIFICATIONS = new Set<Ds4KickdownCandidateClassification>([
  'THROTTLE_STEP_OBSERVED',
  'KICKDOWN_LIKE_PROXY_CANDIDATE',
  'NOT_ASSESSABLE',
]);

const B2_CLASSIFICATIONS = new Set([
  'COLD_ENGINE_HIGH_LOAD_PROXY_CANDIDATE',
  'COLD_ENGINE_HIGH_RPM_PROXY_CANDIDATE',
  'COLD_ENGINE_FULL_THROTTLE_PROXY_CANDIDATE',
  'NOT_ASSESSABLE',
]);

const B3_CLASSIFICATIONS = new Set(['GAP_AWARE_SUSTAINED_PROXY_CANDIDATE']);

const B4_FACET_A_CLASSIFICATION = 'HIGH_RPM_STATIONARY_LIKE_PROXY_CANDIDATE';
const B4_FACET_B_CLASSIFICATION = 'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY_CANDIDATE';

const B2_POSITIVE_CLASS_BY_PROXY_KIND: Record<Ds4ColdEngineProxyKindV1, string> = {
  COLD_ENGINE_HIGH_LOAD: 'COLD_ENGINE_HIGH_LOAD_PROXY_CANDIDATE',
  COLD_ENGINE_HIGH_RPM: 'COLD_ENGINE_HIGH_RPM_PROXY_CANDIDATE',
  COLD_ENGINE_FULL_THROTTLE: 'COLD_ENGINE_FULL_THROTTLE_PROXY_CANDIDATE',
};

function isKnownModuleClassification(cand: DbiP2c2ProxyCandidateEnvelopeV1): boolean {
  const cls = cand.originalClassification;
  switch (cand.sourceModule) {
    case 'P2-B1':
      return B1_CLASSIFICATIONS.has(cls as Ds4KickdownCandidateClassification);
    case 'P2-B2':
      return B2_CLASSIFICATIONS.has(cls);
    case 'P2-B3':
      return B3_CLASSIFICATIONS.has(cls);
    case 'P2-B4':
      if (cand.facet === 'HIGH_RPM_STATIONARY_LIKE_PROXY') {
        return cls === B4_FACET_A_CLASSIFICATION;
      }
      if (cand.facet === 'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY') {
        return cls === B4_FACET_B_CLASSIFICATION;
      }
      return false;
    default:
      return false;
  }
}

function validateB2ProxyKindParity(cand: DbiP2c2ProxyCandidateEnvelopeV1): DbiP2c3ReconciliationDiagnosticCodeV1 | null {
  if (cand.sourceModule !== 'P2-B2') return null;
  const expected = B2_POSITIVE_CLASS_BY_PROXY_KIND[cand.proxyKind];
  if (classificationIsPositiveProxy(cand.originalClassification)) {
    if (cand.originalClassification !== expected) {
      return 'B2_CANDIDATE_CLASSIFICATION_PROXY_KIND_MISMATCH';
    }
  }
  return null;
}

export function validateCandidateInventoryEligibility(
  bundle: DbiP2c2OfflineEvidenceBundleV1,
): readonly DbiP2c3ReconciliationDiagnosticCodeV1[] {
  const codes: DbiP2c3ReconciliationDiagnosticCodeV1[] = [];

  for (const plane of bundle.powertrainProxies) {
    for (const cand of plane.candidates) {
      if (!isKnownModuleClassification(cand)) {
        codes.push('CANDIDATE_CLASSIFICATION_INVALID');
      }
      const parity = validateB2ProxyKindParity(cand);
      if (parity) codes.push(parity);
    }
  }

  return [...new Set(codes)].sort();
}
