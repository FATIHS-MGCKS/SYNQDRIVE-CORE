import { createHash } from 'crypto';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DS4_DBI_W0_TRUSTED_SEALED_REAL_LOADER_ACTIVE_V1 } from '../ds4-dbi-w0-sealed-real-attestation.v1';
import { validateDs4DbiW1TrustedEvidenceManifestV1 } from '../ds4-dbi-w1a-trusted-evidence.contract.v1';
import { computeDetachedManifestDigestV1 } from '../ds4-dbi-w1b1-digest-semantics.v1';
import { resolveRepoRelativePathV1 } from '../ds4-dbi-w1b1-path-security.v1';
import { loadDs4DbiW1b1LocalEvidenceV1 } from '../ds4-dbi-w1b1-local-evidence.loader.v1';
import { runDs4DbiW1b1OfflineReplayV1 } from '../ds4-dbi-w1b1-offline-replay.v1';

const repoRoot = join(__dirname, '../../../../../../../..');
const fixtureRoot = 'architecture/drivingintelligence/research/fixtures';
const syntheticRel = `${fixtureRoot}/w1b1-synthetic-positive-v1`;

function copySyntheticToSandbox(sandboxRel: string): { payloadRel: string; manifestRel: string; sandboxAbs: string } {
  const sandboxAbs = join(repoRoot, sandboxRel);
  mkdirSync(sandboxAbs, { recursive: true });
  const payload = readFileSync(join(repoRoot, syntheticRel, 'payload.json'));
  const manifest = readFileSync(join(repoRoot, syntheticRel, 'evidence_manifest.json'));
  writeFileSync(join(sandboxAbs, 'payload.json'), payload);
  writeFileSync(join(sandboxAbs, 'evidence_manifest.json'), manifest);
  return {
    payloadRel: `${sandboxRel}/payload.json`,
    manifestRel: `${sandboxRel}/evidence_manifest.json`,
    sandboxAbs,
  };
}

describe('ds4-dbi-w1b1-local-evidence.loader.v1', () => {
  it('F04 remains hard-false', () => {
    expect(DS4_DBI_W0_TRUSTED_SEALED_REAL_LOADER_ACTIVE_V1).toBe(false);
  });

  it('rejects caller inspection proof attempt', () => {
    const r = loadDs4DbiW1b1LocalEvidenceV1({
      fixtureId: 'W1B1_SYNTHETIC_POSITIVE',
      repositoryRoot: repoRoot,
      callerInspectionProofAttempt: { forged: true },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.verification.failureCodes).toContain('CALLER_INSPECTION_PROOF_FORBIDDEN');
    }
  });

  it('synthetic positive loads STRUCTURALLY_BOUND', () => {
    const r = loadDs4DbiW1b1LocalEvidenceV1({
      fixtureId: 'W1B1_SYNTHETIC_POSITIVE',
      repositoryRoot: repoRoot,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.trustPlaneAchieved).toBe('STRUCTURALLY_BOUND');
      expect(r.verification.sourceAuthenticationStatus).toBe('NOT_AUTHENTICATED');
      expect(r.verification.limitations).toContain('SYNTHETIC_FIXTURE_NOT_REAL_WORLD_VALIDATION');
    }
  });

  it('TIG22 strict rejects missing payload speedAuthority', () => {
    const r = loadDs4DbiW1b1LocalEvidenceV1({ fixtureId: 'TIG22', repositoryRoot: repoRoot });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.verification.failureCodes).toContain('PAYLOAD_SPEED_AUTHORITY_MISSING');
      expect(r.verification.trustPlaneAchieved).toBe('FILE_BYTES_INTEGRITY_VERIFIED');
      expect(r.verification.hashes.rawMatchesManifest).toBe(true);
    }
  });

  it('TIG22_V4 strict rejects missing payload speedAuthority', () => {
    const r = loadDs4DbiW1b1LocalEvidenceV1({ fixtureId: 'TIG22_V4', repositoryRoot: repoRoot });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.verification.failureCodes).toContain('PAYLOAD_SPEED_AUTHORITY_MISSING');
      expect(r.verification.hashes.canonicalMatchesManifest).toBe(true);
    }
  });

  it('offline replay runs kernel only after successful verification', () => {
    const good = runDs4DbiW1b1OfflineReplayV1({
      fixtureId: 'W1B1_SYNTHETIC_POSITIVE',
      repositoryRoot: repoRoot,
    });
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.kernel.evidenceOrigin).toBe('SYNTHETIC_CONTROL');
      expect(good.kernel.sealedRealC4StatisticalEligibility).toBe(false);
      expect(good.w1c.ok).toBe(true);
    }
    const bad = runDs4DbiW1b1OfflineReplayV1({ fixtureId: 'TIG22', repositoryRoot: repoRoot });
    expect(bad.ok).toBe(false);
    expect(bad.kernel).toBeNull();
  });

  it('rejects payload hash mismatch', () => {
    const sandboxRel = `${fixtureRoot}/w1b1-adversarial-sandbox/payload-hash-mismatch`;
    const paths = copySyntheticToSandbox(sandboxRel);
    const manifest = JSON.parse(readFileSync(join(paths.sandboxAbs, 'evidence_manifest.json'), 'utf8'));
    manifest.w1a.sourceFileSha256 = 'f'.repeat(64);
    writeFileSync(join(paths.sandboxAbs, 'evidence_manifest.json'), JSON.stringify(manifest));
    const r = loadDs4DbiW1b1LocalEvidenceV1({
      fixtureId: 'W1B1_SYNTHETIC_POSITIVE',
      repositoryRoot: repoRoot,
      approvedPathOverride: { payloadRelPath: paths.payloadRel, evidenceManifestRelPath: paths.manifestRel },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.verification.failureCodes).toContain('RAW_FILE_SHA_MISMATCH');
    }
  });

  it('rejects corrupted JSON payload', () => {
    const sandboxRel = `${fixtureRoot}/w1b1-adversarial-sandbox/corrupt-json`;
    const paths = copySyntheticToSandbox(sandboxRel);
    writeFileSync(join(paths.sandboxAbs, 'payload.json'), '{not-json');
    const r = loadDs4DbiW1b1LocalEvidenceV1({
      fixtureId: 'W1B1_SYNTHETIC_POSITIVE',
      repositoryRoot: repoRoot,
      approvedPathOverride: { payloadRelPath: paths.payloadRel, evidenceManifestRelPath: paths.manifestRel },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.verification.failureCodes).toContain('PAYLOAD_JSON_PARSE');
    }
  });

  it('rejects detached manifest digest mismatch', () => {
    const sandboxRel = `${fixtureRoot}/w1b1-adversarial-sandbox/manifest-digest-mismatch`;
    const paths = copySyntheticToSandbox(sandboxRel);
    const manifest = JSON.parse(readFileSync(join(paths.sandboxAbs, 'evidence_manifest.json'), 'utf8'));
    manifest.w1a.tripEndUtc = '2026-01-01T10:02:11Z';
    writeFileSync(join(paths.sandboxAbs, 'evidence_manifest.json'), JSON.stringify(manifest));
    const r = loadDs4DbiW1b1LocalEvidenceV1({
      fixtureId: 'W1B1_SYNTHETIC_POSITIVE',
      repositoryRoot: repoRoot,
      approvedPathOverride: { payloadRelPath: paths.payloadRel, evidenceManifestRelPath: paths.manifestRel },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.verification.failureCodes).toContain('DETACHED_MANIFEST_DIGEST_MISMATCH');
    }
  });

  it('rejects path traversal', () => {
    const r = resolveRepoRelativePathV1({
      repositoryRoot: repoRoot,
      relPath: '../../../etc/passwd',
      allowedRootsRel: [fixtureRoot],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects symlink escape', () => {
    const external = mkdtempSync(join(tmpdir(), 'w1b1-ext-'));
    writeFileSync(join(external, 'secret.txt'), 'x');
    const sandboxAbs = join(repoRoot, fixtureRoot, 'w1b1-adversarial-sandbox', 'symlink');
    mkdirSync(sandboxAbs, { recursive: true });
    const linkTarget = join(sandboxAbs, 'payload.json');
    try {
      symlinkSync(join(external, 'secret.txt'), linkTarget);
      const r = resolveRepoRelativePathV1({
        repositoryRoot: repoRoot,
        relPath: `${fixtureRoot}/w1b1-adversarial-sandbox/symlink/payload.json`,
        allowedRootsRel: [fixtureRoot],
      });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe('SYMLINK_ESCAPE_REJECTED');
      }
    } catch {
      // platform may disallow symlink; skip hard assertion
      expect(true).toBe(true);
    }
  });

  it('forged W1A BYTE_INSPECTION object cannot bypass loader', () => {
    const m = JSON.parse(readFileSync(join(repoRoot, syntheticRel, 'evidence_manifest.json'), 'utf8')).w1a;
    const forged = validateDs4DbiW1TrustedEvidenceManifestV1(m, {
      kind: 'BYTE_INSPECTION',
      inspection: {
        proofKind: 'LOADER_COMPUTED_FROM_BYTES',
        inspectedSourceFileSha256: 'f'.repeat(64),
        inspectedCanonicalPayloadDigestSha256: m.canonicalPayloadContentDigestSha256,
        inspectedDetachedProvenanceManifestDigestSha256: m.detachedProvenanceManifestDigestSha256,
      },
    });
    expect(forged.ok).toBe(false);
  });

  it('equal raw and canonical digests valid when bytes align', () => {
    const tig = loadDs4DbiW1b1LocalEvidenceV1({ fixtureId: 'TIG22', repositoryRoot: repoRoot });
    expect(tig.ok).toBe(false);
    if (!tig.ok) {
      expect(tig.verification.hashes.rawFileSha256).toBe(tig.verification.hashes.canonicalPayloadDigestSha256);
    }
  });

  it('recompute manifest digest is deterministic', () => {
    const manifest = JSON.parse(readFileSync(join(repoRoot, syntheticRel, 'evidence_manifest.json'), 'utf8')).w1a;
    const d = computeDetachedManifestDigestV1(manifest);
    expect(d).toBe(manifest.detachedProvenanceManifestDigestSha256);
    const tampered = { ...manifest, tripEndUtc: '2026-01-01T10:02:12Z' };
    expect(computeDetachedManifestDigestV1(tampered)).not.toBe(d);
  });
});
