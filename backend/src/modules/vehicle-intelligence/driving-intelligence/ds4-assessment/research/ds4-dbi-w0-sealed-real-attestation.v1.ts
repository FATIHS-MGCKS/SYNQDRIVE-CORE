/**
 * Future verified sealed-real C4 loader output. Research harness does not mint this until
 * owner-authorized loader + manifest integration exists.
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

export function isDs4DbiW0VerifiedSealedRealC4AttestationBoundV1(
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
