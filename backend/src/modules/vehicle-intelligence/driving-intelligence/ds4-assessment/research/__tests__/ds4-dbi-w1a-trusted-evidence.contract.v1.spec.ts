import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  assertW1aTrustPlaneCapV1,
  DS4_DBI_W1A_CONTRACT_VERSION,
  type Ds4DbiW1TrustedEvidenceManifestV1,
  validateDs4DbiW1TrustedEvidenceManifestV1,
} from '../ds4-dbi-w1a-trusted-evidence.contract.v1';

const repoRoot = join(__dirname, '../../../../../../../..');

function baseManifest(overrides: Partial<Ds4DbiW1TrustedEvidenceManifestV1> = {}): Ds4DbiW1TrustedEvidenceManifestV1 {
  const shadowBundleVersion = 'DI_V0_MOTION_CORE_SHADOW_BUNDLE_V1_LEG_GATE_OBD_POINT_AUTH_V4';
  return {
    contractVersion: DS4_DBI_W1A_CONTRACT_VERSION,
    sourceFileSha256: 'aa'.repeat(32),
    canonicalPayloadContentDigestSha256: 'bb'.repeat(32),
    detachedProvenanceManifestDigestSha256: 'cc'.repeat(32),
    declaredIndependentTrustAnchorSha256: 'dd'.repeat(32),
    independentTrustAnchorKind: 'OWNER_APPROVED_INDEPENDENT_MANIFEST',
    organizationId: 'org',
    vehicleId: 'veh',
    tripId: '98d2a8e0-8b7d-4529-bf76-acee44d61fbe',
    sourceMotionRunId: '15cdc8ae-35b5-44a1-9c91-2cd9120d1546',
    shadowBundleVersion,
    speedAuthority: 'C4_ONLY',
    pinnedS4EvidenceIdentity: 'DI_V0_S4_EVIDENCE_V1:sha256:22e2a662af3a07458e5713bd004f563e9d038c86fb89f3353d39b8e7ea3504b3',
    tripStartUtc: '2026-10-22T18:30:00Z',
    tripEndUtc: '2026-10-22T19:04:53Z',
    algorithmVersions: { c4: 'x', fsm: 'y', events: 'z', bundle: shadowBundleVersion },
    recordingClassification: 'SEALED_PRODUCTION_SHADOW',
    sameTripShadowRerunOfRunId: '8ec6306e-606b-4507-ab03-ea058c5d810d',
    ...overrides,
  };
}

describe('ds4-dbi-w1a-trusted-evidence.contract.v1', () => {
  it('structure-only manifest yields STRUCTURE_VALID without byte proof', () => {
    const r = validateDs4DbiW1TrustedEvidenceManifestV1(baseManifest(), { kind: 'STRUCTURE_ONLY' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.trustPlaneAchieved).toBe('STRUCTURE_VALID');
      expect(r.limitations).toContain('INDEPENDENT_ANCHOR_NOT_VERIFIED_IN_W1A');
    }
  });

  it('rejects caller digest claim without byte inspection', () => {
    const m = baseManifest();
    const r = validateDs4DbiW1TrustedEvidenceManifestV1(m, {
      kind: 'CALLER_DIGEST_CLAIM',
      binding: {
        observedSourceFileSha256: m.sourceFileSha256,
        observedCanonicalPayloadDigestSha256: m.canonicalPayloadContentDigestSha256,
        observedProvenanceManifestSha256: m.detachedProvenanceManifestDigestSha256,
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.codes).toContain('CALLER_DIGEST_CLAIM_NOT_BYTE_PROOF');
    }
  });

  it('BYTE_INSPECTION from loader reaches STRUCTURALLY_BOUND', () => {
    const m = baseManifest();
    const r = validateDs4DbiW1TrustedEvidenceManifestV1(m, {
      kind: 'BYTE_INSPECTION',
      inspection: {
        proofKind: 'LOADER_COMPUTED_FROM_BYTES',
        inspectedSourceFileSha256: m.sourceFileSha256,
        inspectedCanonicalPayloadDigestSha256: m.canonicalPayloadContentDigestSha256,
        inspectedDetachedProvenanceManifestDigestSha256: m.detachedProvenanceManifestDigestSha256,
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.trustPlaneAchieved).toBe('STRUCTURALLY_BOUND');
    }
  });

  it('allows equal raw and canonical digest values when semantically distinct fields', () => {
    const digest = 'fca7baef63b3ef84e2cd0f1f44f08f0b6ced2294738ba65a5a1b74eca99f7c8a';
    const r = validateDs4DbiW1TrustedEvidenceManifestV1(
      baseManifest({
        sourceFileSha256: digest,
        canonicalPayloadContentDigestSha256: digest,
      }),
      { kind: 'STRUCTURE_ONLY' },
    );
    expect(r.ok).toBe(true);
  });

  it('rejects forged byte inspection mismatch', () => {
    const m = baseManifest();
    const r = validateDs4DbiW1TrustedEvidenceManifestV1(m, {
      kind: 'BYTE_INSPECTION',
      inspection: {
        proofKind: 'LOADER_COMPUTED_FROM_BYTES',
        inspectedSourceFileSha256: 'ff'.repeat(32),
        inspectedCanonicalPayloadDigestSha256: m.canonicalPayloadContentDigestSha256,
        inspectedDetachedProvenanceManifestDigestSha256: m.detachedProvenanceManifestDigestSha256,
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.codes).toContain('OBSERVED_SOURCE_FILE_SHA_MISMATCH');
    }
  });

  it('rejects invalid speedAuthority enum', () => {
    const r = validateDs4DbiW1TrustedEvidenceManifestV1(
      baseManifest({ speedAuthority: 'INFERRED_C4' as 'C4_ONLY' }),
      { kind: 'STRUCTURE_ONLY' },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.codes).toContain('INVALID_SPEED_AUTHORITY_ENUM');
    }
  });

  it('rejects invalid UTC ordering', () => {
    const r = validateDs4DbiW1TrustedEvidenceManifestV1(
      baseManifest({ tripStartUtc: '2026-10-22T19:00:00Z', tripEndUtc: '2026-10-22T18:00:00Z' }),
      { kind: 'STRUCTURE_ONLY' },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.codes).toContain('TRIP_END_NOT_AFTER_START');
    }
  });

  it('rejects shadow bundle mismatch', () => {
    const r = validateDs4DbiW1TrustedEvidenceManifestV1(
      baseManifest({ algorithmVersions: { c4: 'x', fsm: 'y', events: 'z', bundle: 'OTHER_BUNDLE' } }),
      { kind: 'STRUCTURE_ONLY' },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.codes).toContain('SHADOW_BUNDLE_ALGORITHM_MISMATCH');
    }
  });

  it('rejects duplicate physical-trip rerun equals motion run', () => {
    const m = baseManifest();
    const r = validateDs4DbiW1TrustedEvidenceManifestV1(
      baseManifest({ sameTripShadowRerunOfRunId: m.sourceMotionRunId }),
      { kind: 'STRUCTURE_ONLY' },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.codes).toContain('SAME_TRIP_RERUN_EQUALS_MOTION_RUN');
    }
  });

  it('rejects caller attestation anchor', () => {
    const r = validateDs4DbiW1TrustedEvidenceManifestV1(
      baseManifest({ independentTrustAnchorKind: 'CALLER_ATTESTATION_UNTRUSTED' }),
      { kind: 'STRUCTURE_ONLY' },
    );
    expect(r.ok).toBe(false);
  });

  it('declared anchor may equal detached digest without authenticating (W1A)', () => {
    const digest = 'cc'.repeat(32);
    const r = validateDs4DbiW1TrustedEvidenceManifestV1(
      baseManifest({
        detachedProvenanceManifestDigestSha256: digest,
        declaredIndependentTrustAnchorSha256: digest,
      }),
      { kind: 'STRUCTURE_ONLY' },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.limitations).toContain('INDEPENDENT_ANCHOR_NOT_VERIFIED_IN_W1A');
    }
  });

  it('detached digest from manifest bytes (fixture-style)', () => {
    const payloadPath = join(
      repoRoot,
      'research/driving-intelligence/evaluations/ds4-accel-brake-video-reference-20261023/inputs/tiguan-20261022/prod_run_v4_20261023/di_v0_motion_core_shadow_payload.json',
    );
    const bytes = readFileSync(payloadPath);
    const fileSha = createHash('sha256').update(bytes).digest('hex');
    const m = baseManifest({
      sourceFileSha256: fileSha,
      canonicalPayloadContentDigestSha256: createHash('sha256').update(JSON.stringify(JSON.parse(bytes.toString('utf8')))).digest('hex'),
    });
    const r = validateDs4DbiW1TrustedEvidenceManifestV1(m, { kind: 'STRUCTURE_ONLY' });
    expect(r.ok).toBe(true);
  });

  it('assertW1aTrustPlaneCap blocks authenticated planes', () => {
    expect(() => assertW1aTrustPlaneCapV1('SOURCE_AUTHENTICATED')).toThrow(/W1A_NEVER/);
  });
});
