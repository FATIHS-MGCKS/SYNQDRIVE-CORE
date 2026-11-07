import { createHash } from 'crypto';
import {
  DS4_DBI_W0_TRUSTED_SEALED_REAL_LOADER_ACTIVE_V1,
  isDs4DbiW0TrustedSealedRealProvenanceVerifiedV1,
  isDs4DbiW0VerifiedSealedRealC4AttestationStructurallyBoundV1,
} from '../ds4-dbi-w0-sealed-real-attestation.v1';

describe('ds4-dbi-w0-sealed-real-attestation.v1', () => {
  const manifest = 'b'.repeat(64);

  it('rejects missing attestation', () => {
    expect(DS4_DBI_W0_TRUSTED_SEALED_REAL_LOADER_ACTIVE_V1).toBe(false);
    expect(
      isDs4DbiW0TrustedSealedRealProvenanceVerifiedV1({
        attestation: {
          contractVersion: 'ds4-dbi-w0-verified-sealed-real-c4-v1',
          tripId: 't1',
          sourceMotionRunId: 'r1',
          shadowBundleVersion: 'B',
          payloadContentDigestSha256: 'c'.repeat(64),
          provenanceManifestSha256: manifest,
          integrityCheckPassed: true,
        },
        tripMeta: { tripId: 't1', sourceMotionRunId: 'r1' },
        observedPayloadDigestSha256: 'c'.repeat(64),
        shadowBundleVersion: 'B',
      }),
    ).toBe(false);
    expect(
      isDs4DbiW0VerifiedSealedRealC4AttestationStructurallyBoundV1(null, {
        tripMeta: { tripId: 't', sourceMotionRunId: 'r' },
        observedPayloadDigestSha256: 'a'.repeat(64),
        shadowBundleVersion: 'B',
      }),
    ).toBe(false);
  });

  it('structural binding accepts matching fields (not trusted provenance)', () => {
    const digest = 'c'.repeat(64);
    expect(
      isDs4DbiW0VerifiedSealedRealC4AttestationStructurallyBoundV1(
        {
          contractVersion: 'ds4-dbi-w0-verified-sealed-real-c4-v1',
          tripId: 't1',
          sourceMotionRunId: 'r1',
          shadowBundleVersion: 'B',
          payloadContentDigestSha256: digest,
          provenanceManifestSha256: manifest,
          integrityCheckPassed: true,
        },
        {
          tripMeta: { tripId: 't1', sourceMotionRunId: 'r1' },
          observedPayloadDigestSha256: digest,
          shadowBundleVersion: 'B',
        },
      ),
    ).toBe(true);
  });

  it('rejects digest or trip binding mismatch', () => {
    const digest = createHash('sha256').update('{}').digest('hex');
    expect(
      isDs4DbiW0VerifiedSealedRealC4AttestationStructurallyBoundV1(
        {
          contractVersion: 'ds4-dbi-w0-verified-sealed-real-c4-v1',
          tripId: 't1',
          sourceMotionRunId: 'r1',
          shadowBundleVersion: 'B',
          payloadContentDigestSha256: 'f'.repeat(64),
          provenanceManifestSha256: manifest,
          integrityCheckPassed: true,
        },
        {
          tripMeta: { tripId: 't1', sourceMotionRunId: 'r1' },
          observedPayloadDigestSha256: digest,
          shadowBundleVersion: 'B',
        },
      ),
    ).toBe(false);
  });
});
