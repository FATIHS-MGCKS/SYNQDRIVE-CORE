/**
 * W1A — Trusted real DS4 evidence contracts (foundation only).
 *
 * W1A validates structure and file integrity bindings. It never promotes
 * SOURCE_AUTHENTICATED or SCIENTIFICALLY_ELIGIBLE — those require W1B+ owner-approved
 * independent verification and an armed F04 gate (not implemented here).
 */

import type { Ds4SpeedAuthorityPartitionV1 } from '../ds4-trip-assessment-v1.contract';
import { DS4_DBI_W0_TRUSTED_SEALED_REAL_LOADER_ACTIVE_V1 } from './ds4-dbi-w0-sealed-real-attestation.v1';

export const DS4_DBI_W1A_CONTRACT_VERSION = 'ds4-dbi-w1a-trusted-evidence-v1' as const;

/** Trust planes are not equivalent — never collapse in UI or APIs. */
export type Ds4DbiW1EvidenceTrustPlaneV1 =
  | 'FILE_INTEGRITY_VERIFIED'
  | 'STRUCTURALLY_BOUND'
  | 'SOURCE_AUTHENTICATED'
  | 'SCIENTIFICALLY_ELIGIBLE';

export type Ds4DbiW1OriginalRecordingClassificationV1 =
  | 'SEALED_PRODUCTION_SHADOW'
  | 'HISTORICAL_RESEARCH_EXPORT'
  | 'SYNTHETIC'
  | 'UNSPECIFIED';

export type Ds4DbiW1TrustAnchorKindV1 =
  | 'OWNER_APPROVED_INDEPENDENT_MANIFEST'
  | 'REPOSITORY_PINNED_MANIFEST'
  | 'CALLER_ATTESTATION_UNTRUSTED';

export type Ds4DbiW1TrustedEvidenceManifestV1 = {
  contractVersion: typeof DS4_DBI_W1A_CONTRACT_VERSION;
  /** SHA-256 of raw on-disk bytes (reproducibility). */
  sourceFileSha256: string;
  /** Canonical digest used by MBF kernel (JSON.stringify payload semantics). */
  canonicalPayloadContentDigestSha256: string;
  /** SHA-256 of this manifest document at owner-approved anchor (not self-referential hash alone). */
  provenanceManifestSha256: string;
  /** Independent anchor — must not equal provenanceManifestSha256 alone. */
  independentTrustAnchorSha256: string;
  independentTrustAnchorKind: Ds4DbiW1TrustAnchorKindV1;
  organizationId: string;
  vehicleId: string;
  tripId: string;
  sourceMotionRunId: string;
  shadowBundleVersion: string;
  /** Required on trusted manifests — never inferred from estimators. */
  speedAuthority: Ds4SpeedAuthorityPartitionV1;
  pinnedS4EvidenceIdentity: string;
  tripStartUtc: string;
  tripEndUtc: string;
  algorithmVersions: {
    c4: string;
    fsm: string;
    events: string;
    bundle: string;
  };
  recordingClassification: Ds4DbiW1OriginalRecordingClassificationV1;
  /**
   * When set, marks same physical trip reprocessed — not an independent validation sample.
   * Must equal prior run id, not trip id.
   */
  sameTripShadowRerunOfRunId: string | null;
};

export type Ds4DbiW1aManifestValidationFailureCodeV1 =
  | 'INVALID_CONTRACT_VERSION'
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_SHA256_FORMAT'
  | 'MANIFEST_SELF_HASH_ONLY_NOT_INDEPENDENT_ANCHOR'
  | 'CALLER_ATTESTATION_NOT_TRUST_ANCHOR'
  | 'MISSING_SPEED_AUTHORITY'
  | 'INFERRED_SPEED_AUTHORITY_NOT_ALLOWED'
  | 'FILE_AND_CANONICAL_DIGEST_IDENTICAL_SEMANTICS_COLLAPSED'
  | 'MOTION_RUN_EQUALS_TRIP_ID'
  | 'SAME_TRIP_RERUN_CONFUSION'
  | 'FABRICATED_CALLER_ATTESTATION_REJECTED'
  | 'OBSERVED_SOURCE_FILE_SHA_MISMATCH'
  | 'OBSERVED_CANONICAL_DIGEST_MISMATCH'
  | 'PROVENANCE_MANIFEST_BINDING_MISMATCH'
  | 'W1A_NEVER_SOURCE_AUTHENTICATED'
  | 'TRUSTED_LOADER_NOT_ARMED';

export type Ds4DbiW1aManifestValidationSuccessV1 = {
  ok: true;
  trustPlaneAchieved: 'FILE_INTEGRITY_VERIFIED' | 'STRUCTURALLY_BOUND';
  manifest: Ds4DbiW1TrustedEvidenceManifestV1;
  limitations: string[];
};

export type Ds4DbiW1aManifestValidationFailureV1 = {
  ok: false;
  codes: Ds4DbiW1aManifestValidationFailureCodeV1[];
  detail: string;
};

export type Ds4DbiW1aManifestValidationResultV1 =
  | Ds4DbiW1aManifestValidationSuccessV1
  | Ds4DbiW1aManifestValidationFailureV1;

const SHA256_RE = /^[a-f0-9]{64}$/i;

function isSha256(s: string | undefined | null): boolean {
  return typeof s === 'string' && SHA256_RE.test(s);
}

export type Ds4DbiW1TrustedEvidenceLoaderBindingV1 = {
  observedSourceFileSha256: string;
  observedCanonicalPayloadDigestSha256: string;
  observedProvenanceManifestSha256: string;
};

/** Future W1B loader — no implementation in W1A. */
export interface Ds4DbiW1TrustedEvidenceLoaderV1 {
  readonly loaderContractVersion: 'ds4-dbi-w1-trusted-evidence-loader-v1';
  loadTrustedManifest(input: {
    manifest: Ds4DbiW1TrustedEvidenceManifestV1;
    binding: Ds4DbiW1TrustedEvidenceLoaderBindingV1;
  }): Promise<Ds4DbiW1aManifestValidationResultV1>;
}

export function validateDs4DbiW1TrustedEvidenceManifestV1(
  manifest: Ds4DbiW1TrustedEvidenceManifestV1,
  binding?: Ds4DbiW1TrustedEvidenceLoaderBindingV1,
): Ds4DbiW1aManifestValidationResultV1 {
  const codes: Ds4DbiW1aManifestValidationFailureCodeV1[] = [];

  if (manifest.contractVersion !== DS4_DBI_W1A_CONTRACT_VERSION) {
    codes.push('INVALID_CONTRACT_VERSION');
  }

  const requiredStrings: Array<[string, unknown]> = [
    ['sourceFileSha256', manifest.sourceFileSha256],
    ['canonicalPayloadContentDigestSha256', manifest.canonicalPayloadContentDigestSha256],
    ['provenanceManifestSha256', manifest.provenanceManifestSha256],
    ['independentTrustAnchorSha256', manifest.independentTrustAnchorSha256],
    ['organizationId', manifest.organizationId],
    ['vehicleId', manifest.vehicleId],
    ['tripId', manifest.tripId],
    ['sourceMotionRunId', manifest.sourceMotionRunId],
    ['shadowBundleVersion', manifest.shadowBundleVersion],
    ['speedAuthority', manifest.speedAuthority],
    ['pinnedS4EvidenceIdentity', manifest.pinnedS4EvidenceIdentity],
    ['tripStartUtc', manifest.tripStartUtc],
    ['tripEndUtc', manifest.tripEndUtc],
  ];
  for (const [, v] of requiredStrings) {
    if (v == null || v === '') {
      codes.push('MISSING_REQUIRED_FIELD');
      break;
    }
  }

  if (
    !isSha256(manifest.sourceFileSha256) ||
    !isSha256(manifest.canonicalPayloadContentDigestSha256) ||
    !isSha256(manifest.provenanceManifestSha256) ||
    !isSha256(manifest.independentTrustAnchorSha256)
  ) {
    codes.push('INVALID_SHA256_FORMAT');
  }

  if (manifest.sourceFileSha256 === manifest.canonicalPayloadContentDigestSha256) {
    codes.push('FILE_AND_CANONICAL_DIGEST_IDENTICAL_SEMANTICS_COLLAPSED');
  }

  if (manifest.independentTrustAnchorSha256 === manifest.provenanceManifestSha256) {
    codes.push('MANIFEST_SELF_HASH_ONLY_NOT_INDEPENDENT_ANCHOR');
  }

  if (manifest.independentTrustAnchorKind === 'CALLER_ATTESTATION_UNTRUSTED') {
    codes.push('CALLER_ATTESTATION_NOT_TRUST_ANCHOR');
    codes.push('FABRICATED_CALLER_ATTESTATION_REJECTED');
  }

  if (!manifest.speedAuthority) {
    codes.push('MISSING_SPEED_AUTHORITY');
  }

  if (manifest.sourceMotionRunId === manifest.tripId) {
    codes.push('MOTION_RUN_EQUALS_TRIP_ID');
  }

  if (manifest.sameTripShadowRerunOfRunId === manifest.tripId) {
    codes.push('SAME_TRIP_RERUN_CONFUSION');
  }

  if (binding) {
    if (binding.observedSourceFileSha256 !== manifest.sourceFileSha256) {
      codes.push('OBSERVED_SOURCE_FILE_SHA_MISMATCH');
    }
    if (binding.observedCanonicalPayloadDigestSha256 !== manifest.canonicalPayloadContentDigestSha256) {
      codes.push('OBSERVED_CANONICAL_DIGEST_MISMATCH');
    }
    if (binding.observedProvenanceManifestSha256 !== manifest.provenanceManifestSha256) {
      codes.push('PROVENANCE_MANIFEST_BINDING_MISMATCH');
    }
  }

  if (!DS4_DBI_W0_TRUSTED_SEALED_REAL_LOADER_ACTIVE_V1) {
    // Expected in W1A — documented limitation, not a hard validation failure.
  }

  if (codes.length > 0) {
    return {
      ok: false,
      codes: [...new Set(codes)],
      detail: 'W1A manifest rejected',
    };
  }

  const limitations = [
    'W1A_MAX_TRUST_PLANE_IS_STRUCTURALLY_BOUND',
    'SOURCE_AUTHENTICATED_REQUIRES_W1B_LOADER',
    'SCIENTIFICALLY_ELIGIBLE_REQUIRES_W1D_PROTOCOL',
    'F04_TRUST_GATE_REMAINS_FALSE',
  ];
  if (!DS4_DBI_W0_TRUSTED_SEALED_REAL_LOADER_ACTIVE_V1) {
    limitations.push('TRUSTED_LOADER_NOT_ARMED');
  }

  return {
    ok: true,
    trustPlaneAchieved: binding
      ? 'STRUCTURALLY_BOUND'
      : 'FILE_INTEGRITY_VERIFIED',
    manifest,
    limitations,
  };
}

/** W1A guard — callers must never claim authenticated/scientific planes from W1A alone. */
export function assertW1aTrustPlaneCapV1(plane: Ds4DbiW1EvidenceTrustPlaneV1): Ds4DbiW1EvidenceTrustPlaneV1 {
  if (plane === 'SOURCE_AUTHENTICATED' || plane === 'SCIENTIFICALLY_ELIGIBLE') {
    throw new Error('W1A_NEVER_SOURCE_AUTHENTICATED');
  }
  return plane;
}
