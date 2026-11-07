import {
  assertW1aTrustPlaneCapV1,
  DS4_DBI_W1A_CONTRACT_VERSION,
  type Ds4DbiW1TrustedEvidenceManifestV1,
  validateDs4DbiW1TrustedEvidenceManifestV1,
} from '../ds4-dbi-w1a-trusted-evidence.contract.v1';

function baseManifest(): Ds4DbiW1TrustedEvidenceManifestV1 {
  return {
    contractVersion: DS4_DBI_W1A_CONTRACT_VERSION,
    sourceFileSha256: 'aa'.repeat(32),
    canonicalPayloadContentDigestSha256: 'bb'.repeat(32),
    provenanceManifestSha256: 'cc'.repeat(32),
    independentTrustAnchorSha256: 'dd'.repeat(32),
    independentTrustAnchorKind: 'OWNER_APPROVED_INDEPENDENT_MANIFEST',
    organizationId: 'org',
    vehicleId: 'veh',
    tripId: '98d2a8e0-8b7d-4529-bf76-acee44d61fbe',
    sourceMotionRunId: '15cdc8ae-35b5-44a1-9c91-2cd9120d1546',
    shadowBundleVersion: 'DI_V0_MOTION_CORE_SHADOW_BUNDLE_V1_LEG_GATE_OBD_POINT_AUTH_V4',
    speedAuthority: 'C4_ONLY',
    pinnedS4EvidenceIdentity: 'DI_V0_S4_EVIDENCE_V1:sha256:22e2a662af3a07458e5713bd004f563e9d038c86fb89f3353d39b8e7ea3504b3',
    tripStartUtc: '2026-10-22T18:30:00Z',
    tripEndUtc: '2026-10-22T19:04:53Z',
    algorithmVersions: { c4: 'x', fsm: 'y', events: 'z', bundle: 'b' },
    recordingClassification: 'SEALED_PRODUCTION_SHADOW',
    sameTripShadowRerunOfRunId: '8ec6306e-606b-4507-ab03-ea058c5d810d',
  };
}

describe('ds4-dbi-w1a-trusted-evidence.contract.v1', () => {
  it('valid manifest reaches at most STRUCTURALLY_BOUND', () => {
    const m = baseManifest();
    const r = validateDs4DbiW1TrustedEvidenceManifestV1(m, {
      observedSourceFileSha256: m.sourceFileSha256,
      observedCanonicalPayloadDigestSha256: m.canonicalPayloadContentDigestSha256,
      observedProvenanceManifestSha256: m.provenanceManifestSha256,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.trustPlaneAchieved).toBe('STRUCTURALLY_BOUND');
      expect(r.limitations).toContain('W1A_MAX_TRUST_PLANE_IS_STRUCTURALLY_BOUND');
      expect(r.limitations).toContain('TRUSTED_LOADER_NOT_ARMED');
    }
  });

  it('rejects self-referential trust anchor', () => {
    const m = { ...baseManifest(), independentTrustAnchorSha256: baseManifest().provenanceManifestSha256 };
    const r = validateDs4DbiW1TrustedEvidenceManifestV1(m);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.codes).toContain('MANIFEST_SELF_HASH_ONLY_NOT_INDEPENDENT_ANCHOR');
    }
  });

  it('rejects caller attestation anchor', () => {
    const m = {
      ...baseManifest(),
      independentTrustAnchorKind: 'CALLER_ATTESTATION_UNTRUSTED' as const,
    };
    const r = validateDs4DbiW1TrustedEvidenceManifestV1(m);
    expect(r.ok).toBe(false);
  });

  it('rejects missing speedAuthority', () => {
    const m = { ...baseManifest(), speedAuthority: '' as 'C4_ONLY' };
    const r = validateDs4DbiW1TrustedEvidenceManifestV1(m);
    expect(r.ok).toBe(false);
  });

  it('rejects motion run id equal to trip id', () => {
    const m = { ...baseManifest(), sourceMotionRunId: baseManifest().tripId };
    const r = validateDs4DbiW1TrustedEvidenceManifestV1(m);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.codes).toContain('MOTION_RUN_EQUALS_TRIP_ID');
    }
  });

  it('rejects tampered binding digests', () => {
    const m = baseManifest();
    const r = validateDs4DbiW1TrustedEvidenceManifestV1(m, {
      observedSourceFileSha256: 'ff'.repeat(32),
      observedCanonicalPayloadDigestSha256: m.canonicalPayloadContentDigestSha256,
      observedProvenanceManifestSha256: m.provenanceManifestSha256,
    });
    expect(r.ok).toBe(false);
  });

  it('assertW1aTrustPlaneCap blocks authenticated planes', () => {
    expect(() => assertW1aTrustPlaneCapV1('SOURCE_AUTHENTICATED')).toThrow(/W1A_NEVER/);
  });

  it('rejects collapsed file and canonical digest', () => {
    const digest = 'ee'.repeat(32);
    const m = { ...baseManifest(), sourceFileSha256: digest, canonicalPayloadContentDigestSha256: digest };
    const r = validateDs4DbiW1TrustedEvidenceManifestV1(m);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.codes).toContain('FILE_AND_CANONICAL_DIGEST_IDENTICAL_SEMANTICS_COLLAPSED');
    }
  });

  it('rejects same-trip rerun id equal to trip id', () => {
    const m = { ...baseManifest(), sameTripShadowRerunOfRunId: baseManifest().tripId };
    const r = validateDs4DbiW1TrustedEvidenceManifestV1(m);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.codes).toContain('SAME_TRIP_RERUN_CONFUSION');
    }
  });

  it('rejects mismatched provenance manifest hash binding', () => {
    const m = baseManifest();
    const r = validateDs4DbiW1TrustedEvidenceManifestV1(m, {
      observedSourceFileSha256: m.sourceFileSha256,
      observedCanonicalPayloadDigestSha256: m.canonicalPayloadContentDigestSha256,
      observedProvenanceManifestSha256: '11'.repeat(32),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.codes).toContain('PROVENANCE_MANIFEST_BINDING_MISMATCH');
    }
  });

  it('without binding achieves FILE_INTEGRITY_VERIFIED only', () => {
    const m = baseManifest();
    const r = validateDs4DbiW1TrustedEvidenceManifestV1(m);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.trustPlaneAchieved).toBe('FILE_INTEGRITY_VERIFIED');
    }
  });
});
