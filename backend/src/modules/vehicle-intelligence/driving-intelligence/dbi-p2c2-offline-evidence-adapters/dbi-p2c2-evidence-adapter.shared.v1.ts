import type {
  Ds4PowertrainDemandProvenanceVerdictV1,
  Ds4PowertrainDemandTripStatus,
} from '../ds4-powertrain-demand-research/ds4-powertrain-demand-research.contract.v1';
import {
  DBI_P2C2_NOT_REPORTED,
  type DbiP2c2AdapterDiagnosticCodeV1,
  type DbiP2c2ProvenanceProjectionV1,
  type DbiP2c2TriStateProvenanceFlag,
} from './dbi-p2c2-evidence-adapter.contract.v1';

export function isValidProviderBucketLabelIso(label: string): boolean {
  if (!label || typeof label !== 'string') return false;
  const ms = Date.parse(label);
  return Number.isFinite(ms);
}

export function collectInvalidBucketLabels(labels: readonly string[]): DbiP2c2AdapterDiagnosticCodeV1[] {
  const invalid = labels.filter((l) => !isValidProviderBucketLabelIso(l));
  return invalid.length > 0 ? ['INVALID_PROVIDER_BUCKET_LABEL'] : [];
}

export function projectPowertrainProvenance(
  provenance: Ds4PowertrainDemandProvenanceVerdictV1,
): DbiP2c2ProvenanceProjectionV1 {
  return {
    contentConsistencyVerified: provenance.contentConsistencyVerified,
    sourceProvenanceVerified: provenance.sourceProvenanceVerified,
    independentFieldValidation: provenance.independentFieldValidation,
  };
}

export function projectA1ProvenanceNotReported(): DbiP2c2ProvenanceProjectionV1 {
  const notReported: DbiP2c2TriStateProvenanceFlag = DBI_P2C2_NOT_REPORTED;
  return {
    contentConsistencyVerified: notReported,
    sourceProvenanceVerified: notReported,
    independentFieldValidation: notReported,
  };
}

export function powertrainStatusBlocksPositiveEvidence(status: Ds4PowertrainDemandTripStatus): boolean {
  return status === 'ABSTAINED';
}

const POSITIVE_PROXY_CLASSIFICATION_MARKERS = [
  'PROXY_CANDIDATE',
  'KICKDOWN_LIKE_PROXY_CANDIDATE',
  'GAP_AWARE_SUSTAINED_PROXY_CANDIDATE',
  'HIGH_RPM_STATIONARY_LIKE_PROXY_CANDIDATE',
  'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY_CANDIDATE',
  'COLD_ENGINE_HIGH_LOAD_PROXY_CANDIDATE',
  'COLD_ENGINE_HIGH_RPM_PROXY_CANDIDATE',
  'COLD_ENGINE_FULL_THROTTLE_PROXY_CANDIDATE',
] as const;

export function classificationIsPositiveProxy(classification: string): boolean {
  return POSITIVE_PROXY_CLASSIFICATION_MARKERS.some((marker) => classification === marker);
}

export function computeAdapterClaimsPositiveEvidence(input: {
  tripStatus: Ds4PowertrainDemandTripStatus;
  classifications: readonly string[];
  extraBlock?: boolean;
}): boolean {
  if (powertrainStatusBlocksPositiveEvidence(input.tripStatus)) return false;
  if (input.extraBlock) return false;
  return input.classifications.some(classificationIsPositiveProxy);
}

export function buildOrderingDigest(keys: readonly string[]): string {
  return [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join('|');
}

export function buildA1AdapterLocalReference(sequenceIndex: number): string {
  return `dbi-p2c2:a1-descriptive/seq=${sequenceIndex}`;
}
