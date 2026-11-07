import { createHash } from 'crypto';
import type { DiV0MotionCoreShadowPayloadV1 } from '../../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import { isDs4DbiW0VerifiedSealedRealC4AttestationBoundV1 } from '../ds4-dbi-w0-sealed-real-attestation.v1';

describe('ds4-dbi-w0-sealed-real-attestation.v1', () => {
  const manifest = 'b'.repeat(64);

  it('rejects missing attestation', () => {
    expect(
      isDs4DbiW0VerifiedSealedRealC4AttestationBoundV1(null, {
        tripMeta: { tripId: 't', sourceMotionRunId: 'r' },
        observedPayloadDigestSha256: 'a'.repeat(64),
        shadowBundleVersion: 'B',
      }),
    ).toBe(false);
  });

  it('accepts only fully bound attestation', () => {
    const digest = 'c'.repeat(64);
    expect(
      isDs4DbiW0VerifiedSealedRealC4AttestationBoundV1(
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
      isDs4DbiW0VerifiedSealedRealC4AttestationBoundV1(
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
