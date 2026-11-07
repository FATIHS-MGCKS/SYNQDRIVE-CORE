/**
 * W1A — Trusted real DS4 evidence contracts (foundation only).
 *
 * W1A validates manifest structure and (when provided) byte-inspection proofs from a
 * future loader. It never promotes SOURCE_AUTHENTICATED or SCIENTIFICALLY_ELIGIBLE.
 */

import type { Ds4SpeedAuthorityPartitionV1 } from '../ds4-trip-assessment-v1.contract';
import { DS4_DBI_W0_TRUSTED_SEALED_REAL_LOADER_ACTIVE_V1 } from './ds4-dbi-w0-sealed-real-attestation.v1';

export const DS4_DBI_W1A_CONTRACT_VERSION = 'ds4-dbi-w1a-trusted-evidence-v1' as const;

const SPEED_AUTHORITY_VALUES: ReadonlySet<Ds4SpeedAuthorityPartitionV1> = new Set(['C4_ONLY', 'C5_1_PREFERRED']);

const RECORDING_CLASSIFICATION_VALUES: ReadonlySet<Ds4DbiW1OriginalRecordingClassificationV1> = new Set([
  'SEALED_PRODUCTION_SHADOW',
  'HISTORICAL_RESEARCH_EXPORT',
  'SYNTHETIC',
  'UNSPECIFIED',
]);

/** Trust planes are not equivalent — never collapse in UI or APIs. */
export type Ds4DbiW1EvidenceTrustPlaneV1 =
  | 'STRUCTURE_VALID'
  | 'FILE_BYTES_INTEGRITY_VERIFIED'
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

/**
 * Manifest body references digests; the detached manifest digest is computed from canonical
 * manifest JSON bytes **excluding** the detached digest field (offline owner workflow).
 */
export type Ds4DbiW1TrustedEvidenceManifestV1 = {
  contractVersion: typeof DS4_DBI_W1A_CONTRACT_VERSION;
  /** Expected SHA-256 of raw on-disk payload bytes. */
  sourceFileSha256: string;
  /** Expected canonical digest (kernel JSON.stringify semantics). Semantics differ from file SHA; values may match. */
  canonicalPayloadContentDigestSha256: string;
  detachedProvenanceManifestDigestSha256: string;
  /** Declared only in W1A — never verified as independently obtained until W1B. */
  declaredIndependentTrustAnchorSha256: string;
  independentTrustAnchorKind: Ds4DbiW1TrustAnchorKindV1;
  organizationId: string;
  vehicleId: string;
  tripId: string;
  sourceMotionRunId: string;
  shadowBundleVersion: string;
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
  sameTripShadowRerunOfRunId: string | null;
};

export type Ds4DbiW1aManifestValidationFailureCodeV1 =
  | 'INVALID_CONTRACT_VERSION'
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_SHA256_FORMAT'
  | 'MANIFEST_SELF_DIGEST_INLINE_FORBIDDEN'
  | 'CALLER_ATTESTATION_NOT_TRUST_ANCHOR'
  | 'MISSING_SPEED_AUTHORITY'
  | 'INVALID_SPEED_AUTHORITY_ENUM'
  | 'INVALID_TRIP_UTC_BOUNDARY'
  | 'TRIP_END_NOT_AFTER_START'
  | 'SHADOW_BUNDLE_ALGORITHM_MISMATCH'
  | 'INVALID_RECORDING_CLASSIFICATION'
  | 'INVALID_IDENTITY_UUID'
  | 'MOTION_RUN_EQUALS_TRIP_ID'
  | 'SAME_TRIP_RERUN_CONFUSION'
  | 'SAME_TRIP_RERUN_EQUALS_MOTION_RUN'
  | 'FABRICATED_CALLER_ATTESTATION_REJECTED'
  | 'CALLER_DIGEST_CLAIM_NOT_BYTE_PROOF'
  | 'OBSERVED_SOURCE_FILE_SHA_MISMATCH'
  | 'OBSERVED_CANONICAL_DIGEST_MISMATCH'
  | 'DETACHED_MANIFEST_DIGEST_MISMATCH'
  | 'INDEPENDENT_ANCHOR_NOT_VERIFIED_IN_W1A'
  | 'W1A_NEVER_SOURCE_AUTHENTICATED'
  | 'TRUSTED_LOADER_NOT_ARMED';

export type Ds4DbiW1aManifestValidationSuccessV1 = {
  ok: true;
  trustPlaneAchieved: 'STRUCTURE_VALID' | 'FILE_BYTES_INTEGRITY_VERIFIED' | 'STRUCTURALLY_BOUND';
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
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isSha256(s: string | undefined | null): boolean {
  return typeof s === 'string' && SHA256_RE.test(s);
}

function parseUtcInstant(s: string): number | null {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/** @deprecated W1A does not treat caller-supplied digests as byte proof — use byte inspection context. */
export type Ds4DbiW1TrustedEvidenceLoaderBindingV1 = {
  observedSourceFileSha256: string;
  observedCanonicalPayloadDigestSha256: string;
  observedProvenanceManifestSha256: string;
};

export type Ds4DbiW1aByteInspectionProofV1 = {
  proofKind: 'LOADER_COMPUTED_FROM_BYTES';
  inspectedSourceFileSha256: string;
  inspectedCanonicalPayloadDigestSha256: string;
  inspectedDetachedProvenanceManifestDigestSha256: string;
};

export type Ds4DbiW1aValidationContextV1 =
  | { kind: 'STRUCTURE_ONLY' }
  | { kind: 'CALLER_DIGEST_CLAIM'; binding: Ds4DbiW1TrustedEvidenceLoaderBindingV1 }
  | { kind: 'BYTE_INSPECTION'; inspection: Ds4DbiW1aByteInspectionProofV1 };

/** Future W1B loader — no implementation in W1A. */
export interface Ds4DbiW1TrustedEvidenceLoaderV1 {
  readonly loaderContractVersion: 'ds4-dbi-w1-trusted-evidence-loader-v1';
  loadTrustedManifest(input: {
    manifest: Ds4DbiW1TrustedEvidenceManifestV1;
    inspection: Ds4DbiW1aByteInspectionProofV1;
  }): Promise<Ds4DbiW1aManifestValidationResultV1>;
}

export function validateDs4DbiW1TrustedEvidenceManifestV1(
  manifest: Ds4DbiW1TrustedEvidenceManifestV1,
  context: Ds4DbiW1aValidationContextV1 = { kind: 'STRUCTURE_ONLY' },
): Ds4DbiW1aManifestValidationResultV1 {
  const codes: Ds4DbiW1aManifestValidationFailureCodeV1[] = [];

  if (manifest.contractVersion !== DS4_DBI_W1A_CONTRACT_VERSION) {
    codes.push('INVALID_CONTRACT_VERSION');
  }

  const requiredStrings: Array<unknown> = [
    manifest.sourceFileSha256,
    manifest.canonicalPayloadContentDigestSha256,
    manifest.detachedProvenanceManifestDigestSha256,
    manifest.declaredIndependentTrustAnchorSha256,
    manifest.organizationId,
    manifest.vehicleId,
    manifest.tripId,
    manifest.sourceMotionRunId,
    manifest.shadowBundleVersion,
    manifest.speedAuthority,
    manifest.pinnedS4EvidenceIdentity,
    manifest.tripStartUtc,
    manifest.tripEndUtc,
    manifest.algorithmVersions?.c4,
    manifest.algorithmVersions?.fsm,
    manifest.algorithmVersions?.events,
    manifest.algorithmVersions?.bundle,
  ];
  if (requiredStrings.some((v) => v == null || v === '')) {
    codes.push('MISSING_REQUIRED_FIELD');
  }

  if (
    !isSha256(manifest.sourceFileSha256) ||
    !isSha256(manifest.canonicalPayloadContentDigestSha256) ||
    !isSha256(manifest.detachedProvenanceManifestDigestSha256) ||
    !isSha256(manifest.declaredIndependentTrustAnchorSha256)
  ) {
    codes.push('INVALID_SHA256_FORMAT');
  }

  if (manifest.independentTrustAnchorKind === 'CALLER_ATTESTATION_UNTRUSTED') {
    codes.push('CALLER_ATTESTATION_NOT_TRUST_ANCHOR');
    codes.push('FABRICATED_CALLER_ATTESTATION_REJECTED');
  }

  if (!manifest.speedAuthority) {
    codes.push('MISSING_SPEED_AUTHORITY');
  } else if (!SPEED_AUTHORITY_VALUES.has(manifest.speedAuthority)) {
    codes.push('INVALID_SPEED_AUTHORITY_ENUM');
  }

  const startMs = parseUtcInstant(manifest.tripStartUtc);
  const endMs = parseUtcInstant(manifest.tripEndUtc);
  if (startMs == null || endMs == null) {
    codes.push('INVALID_TRIP_UTC_BOUNDARY');
  } else if (endMs <= startMs) {
    codes.push('TRIP_END_NOT_AFTER_START');
  }

  if (manifest.algorithmVersions.bundle !== manifest.shadowBundleVersion) {
    codes.push('SHADOW_BUNDLE_ALGORITHM_MISMATCH');
  }

  if (!RECORDING_CLASSIFICATION_VALUES.has(manifest.recordingClassification)) {
    codes.push('INVALID_RECORDING_CLASSIFICATION');
  }

  if (!UUID_RE.test(manifest.tripId) || !UUID_RE.test(manifest.sourceMotionRunId)) {
    codes.push('INVALID_IDENTITY_UUID');
  }

  if (manifest.sourceMotionRunId === manifest.tripId) {
    codes.push('MOTION_RUN_EQUALS_TRIP_ID');
  }

  if (manifest.sameTripShadowRerunOfRunId != null) {
    if (manifest.sameTripShadowRerunOfRunId === manifest.tripId) {
      codes.push('SAME_TRIP_RERUN_CONFUSION');
    }
    if (manifest.sameTripShadowRerunOfRunId === manifest.sourceMotionRunId) {
      codes.push('SAME_TRIP_RERUN_EQUALS_MOTION_RUN');
    }
    if (!UUID_RE.test(manifest.sameTripShadowRerunOfRunId)) {
      codes.push('INVALID_IDENTITY_UUID');
    }
  }

  if (context.kind === 'CALLER_DIGEST_CLAIM') {
    codes.push('CALLER_DIGEST_CLAIM_NOT_BYTE_PROOF');
  }

  if (context.kind === 'BYTE_INSPECTION') {
    const ins = context.inspection;
    if (ins.proofKind !== 'LOADER_COMPUTED_FROM_BYTES') {
      codes.push('CALLER_DIGEST_CLAIM_NOT_BYTE_PROOF');
    } else {
      if (ins.inspectedSourceFileSha256 !== manifest.sourceFileSha256) {
        codes.push('OBSERVED_SOURCE_FILE_SHA_MISMATCH');
      }
      if (ins.inspectedCanonicalPayloadDigestSha256 !== manifest.canonicalPayloadContentDigestSha256) {
        codes.push('OBSERVED_CANONICAL_DIGEST_MISMATCH');
      }
      if (ins.inspectedDetachedProvenanceManifestDigestSha256 !== manifest.detachedProvenanceManifestDigestSha256) {
        codes.push('DETACHED_MANIFEST_DIGEST_MISMATCH');
      }
    }
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
    'INDEPENDENT_ANCHOR_NOT_VERIFIED_IN_W1A',
    'SOURCE_AUTHENTICATED_REQUIRES_W1B_LOADER',
    'SCIENTIFICALLY_ELIGIBLE_REQUIRES_W1D_PROTOCOL',
    'F04_TRUST_GATE_REMAINS_FALSE',
  ];
  if (!DS4_DBI_W0_TRUSTED_SEALED_REAL_LOADER_ACTIVE_V1) {
    limitations.push('TRUSTED_LOADER_NOT_ARMED');
  }

  let trustPlaneAchieved: Ds4DbiW1aManifestValidationSuccessV1['trustPlaneAchieved'] = 'STRUCTURE_VALID';

  if (context.kind === 'BYTE_INSPECTION') {
    trustPlaneAchieved = 'STRUCTURALLY_BOUND';
  }

  return {
    ok: true,
    trustPlaneAchieved,
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
