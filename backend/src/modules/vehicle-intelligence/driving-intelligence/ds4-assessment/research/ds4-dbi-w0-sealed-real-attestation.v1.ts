/**
 * W0 research gate — statistical eligibility via sealed-real path is **disabled** until an
 * independently verified loader arms trusted provenance (deferred to W1).
 *
 * Structural field binding below is design metadata only; it does **not** authenticate provenance.
 */
export const DS4_DBI_W0_TRUSTED_SEALED_REAL_LOADER_ACTIVE_V1 = false as const;

/**
 * Future verified sealed-real C4 loader output. Not accepted as trusted provenance in W0.
 * Owner-authorized loader + manifest integration is deferred to W1.
 */
export type Ds4DbiW0VerifiedSealedRealC4AttestationV1 = {
  contractVersion: 'ds4-dbi-w0-verified-sealed-real-c4-v1';
  sourceMotionRunId: string;
  tripId: string;
  shadowBundleVersion: string;
  /** Canonical payload digest from verified loader (must match kernel observed digest). */
  payloadContentDigestSha256: string;
  /** SHA-256 of verified provenance manifest (opaque to kernel — bound for future audit). */
  provenanceManifestSha256: string;
  integrityCheckPassed: true;
};

/** Structural binding check only — never implies trusted sealed-real provenance while W0 gate is false. */
export function isDs4DbiW0VerifiedSealedRealC4AttestationStructurallyBoundV1(
  attestation: Ds4DbiW0VerifiedSealedRealC4AttestationV1 | null | undefined,
  binding: {
    tripMeta: { tripId: string; sourceMotionRunId: string } | null;
    observedPayloadDigestSha256: string;
    shadowBundleVersion: string;
  },
): boolean {
  if (!attestation || !binding.tripMeta) {
    return false;
  }
  if (attestation.contractVersion !== 'ds4-dbi-w0-verified-sealed-real-c4-v1') {
    return false;
  }
  if (attestation.integrityCheckPassed !== true) {
    return false;
  }
  if (attestation.sourceMotionRunId !== binding.tripMeta.sourceMotionRunId) {
    return false;
  }
  if (attestation.tripId !== binding.tripMeta.tripId) {
    return false;
  }
  if (attestation.shadowBundleVersion !== binding.shadowBundleVersion) {
    return false;
  }
  if (attestation.payloadContentDigestSha256 !== binding.observedPayloadDigestSha256) {
    return false;
  }
  if (!/^[a-f0-9]{64}$/i.test(attestation.provenanceManifestSha256)) {
    return false;
  }
  if (!/^[a-f0-9]{64}$/i.test(attestation.payloadContentDigestSha256)) {
    return false;
  }
  return true;
}

/** @deprecated Use isDs4DbiW0VerifiedSealedRealC4AttestationStructurallyBoundV1 — same structural check, no trust. */
export const isDs4DbiW0VerifiedSealedRealC4AttestationBoundV1 = isDs4DbiW0VerifiedSealedRealC4AttestationStructurallyBoundV1;

/** Trusted provenance for statistical eligibility — always false in W0; wired in W1 with verified loader. */
export function isDs4DbiW0TrustedSealedRealProvenanceVerifiedV1(
  _input: {
    attestation: Ds4DbiW0VerifiedSealedRealC4AttestationV1 | null | undefined;
    tripMeta: { tripId: string; sourceMotionRunId: string } | null;
    observedPayloadDigestSha256: string;
    shadowBundleVersion: string;
  },
): boolean {
  if (!DS4_DBI_W0_TRUSTED_SEALED_REAL_LOADER_ACTIVE_V1) {
    return false;
  }
  return isDs4DbiW0VerifiedSealedRealC4AttestationStructurallyBoundV1(_input.attestation, {
    tripMeta: _input.tripMeta,
    observedPayloadDigestSha256: _input.observedPayloadDigestSha256,
    shadowBundleVersion: _input.shadowBundleVersion,
  });
}
