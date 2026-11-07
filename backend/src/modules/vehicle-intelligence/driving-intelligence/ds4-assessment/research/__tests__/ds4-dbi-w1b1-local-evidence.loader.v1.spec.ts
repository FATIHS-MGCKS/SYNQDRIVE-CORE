import { createHash } from 'crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DS4_DBI_W0_TRUSTED_SEALED_REAL_LOADER_ACTIVE_V1 } from '../ds4-dbi-w0-sealed-real-attestation.v1';
import { validateDs4DbiW1TrustedEvidenceManifestV1 } from '../ds4-dbi-w1a-trusted-evidence.contract.v1';
import { computeDetachedManifestDigestV1 } from '../ds4-dbi-w1b1-digest-semantics.v1';
import {
  DS4_DBI_W1B1_MAX_PAYLOAD_BYTES,
  resolveRepoRelativePathV1,
  validateRepoRelativePathInputV1,
} from '../ds4-dbi-w1b1-path-security.v1';
import { loadDs4DbiW0HistoricalMotionFixtureV1 } from '../ds4-dbi-w0-historical-replay.loader.v1';
import { projectDs4DbiW1cTripAssessmentFromW0KernelV1 } from '../ds4-dbi-w1c-trip-assessment-projector.v1';
import { computeDs4DbiW0MbfFromPayloadV1 } from '../ds4-dbi-w0-mbf-kernel.v1';
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

  it('rejects path traversal before normalization', () => {
    const pre = validateRepoRelativePathInputV1('../../../etc/passwd');
    expect(pre.ok).toBe(false);
    if (!pre.ok) {
      expect(pre.code).toBe('PATH_TRAVERSAL_REJECTED');
    }
    const r = resolveRepoRelativePathV1({
      repositoryRoot: repoRoot,
      relPath: '../../../etc/passwd',
      allowedRootsRel: [fixtureRoot],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects absolute paths', () => {
    const pre = validateRepoRelativePathInputV1('/etc/passwd');
    expect(pre.ok).toBe(false);
    if (!pre.ok) {
      expect(pre.code).toBe('PATH_ABSOLUTE_REJECTED');
    }
  });

  function replaceSymlink(target: string, linkPath: string): void {
    if (existsSync(linkPath)) {
      unlinkSync(linkPath);
    }
    symlinkSync(target, linkPath);
  }

  it('rejects symlink escape and in-allowlist symlinks', () => {
    const sandboxAbs = join(repoRoot, fixtureRoot, 'w1b1-adversarial-sandbox', 'symlink');
    mkdirSync(sandboxAbs, { recursive: true });
    const realPayload = join(sandboxAbs, 'real-payload.json');
    writeFileSync(realPayload, '{"x":1}');

    const escapedExternal = mkdtempSync(join(tmpdir(), 'w1b1-ext-'));
    const externalFile = join(escapedExternal, 'secret.txt');
    writeFileSync(externalFile, 'leak');
    const escapeLink = join(sandboxAbs, 'escape-payload.json');
    replaceSymlink(externalFile, escapeLink);
    const escapeRes = resolveRepoRelativePathV1({
      repositoryRoot: repoRoot,
      relPath: `${fixtureRoot}/w1b1-adversarial-sandbox/symlink/escape-payload.json`,
      allowedRootsRel: [fixtureRoot],
    });
    expect(escapeRes.ok).toBe(false);
    if (!escapeRes.ok) {
      expect(escapeRes.code).toBe('SYMLINK_ESCAPE_REJECTED');
    }

    const inAllowlistLink = join(sandboxAbs, 'in-allowlist-link.json');
    replaceSymlink(realPayload, inAllowlistLink);
    const inRes = resolveRepoRelativePathV1({
      repositoryRoot: repoRoot,
      relPath: `${fixtureRoot}/w1b1-adversarial-sandbox/symlink/in-allowlist-link.json`,
      allowedRootsRel: [fixtureRoot],
    });
    expect(inRes.ok).toBe(false);
    if (!inRes.ok) {
      expect(inRes.code).toBe('SYMLINK_ESCAPE_REJECTED');
    }
  });

  it('historical manifests carry non-authentication safety flags', () => {
    const r = loadDs4DbiW1b1LocalEvidenceV1({ fixtureId: 'TIG22', repositoryRoot: repoRoot });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.verification.unavailableEvidence).toContain('PLACEHOLDER_VEHICLE_ID');
      expect(r.verification.unavailableEvidence).toContain('PINNED_S4_DECLARED_NOT_AUTHENTICATED');
      expect(r.verification.unavailableEvidence).toContain('PLACEHOLDER_TRUST_ANCHOR_NOT_VERIFIED');
      expect(r.verification.sourceAuthenticationStatus).toBe('NOT_AUTHENTICATED');
    }
  });

  it('TIG22 partial assessment parity via lower-trust historical replay', () => {
    const loaded = loadDs4DbiW0HistoricalMotionFixtureV1({
      fixtureId: 'TIG22',
      bindingTier: 'RELAXED',
      repositoryRoot: repoRoot,
    });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      return;
    }
    const kernel = computeDs4DbiW0MbfFromPayloadV1({
      payload: loaded.payload,
      tripMeta: loaded.tripMeta,
      qualityTier: 'STRICT',
      expectedContentFingerprint: loaded.payloadFileSha256,
      expectedShadowBundleVersion: loaded.tripMeta.shadowBundleVersion,
      evidenceOrigin: 'HISTORICAL_RESEARCH_RECORDING',
    });
    const projected = projectDs4DbiW1cTripAssessmentFromW0KernelV1(kernel);
    expect(projected.ok).toBe(true);
    if (projected.ok) {
      expect(projected.summary.tripOutcome).toBe('PARTIAL');
    }
  });

  it('rejects oversized payload before unbounded read', () => {
    const sandboxRel = `${fixtureRoot}/w1b1-adversarial-sandbox/oversized`;
    const sandboxAbs = join(repoRoot, sandboxRel);
    mkdirSync(sandboxAbs, { recursive: true });
    const bigPath = join(sandboxAbs, 'payload.json');
    writeFileSync(bigPath, Buffer.alloc(DS4_DBI_W1B1_MAX_PAYLOAD_BYTES + 1, 0x61));
    const manifest = readFileSync(join(repoRoot, syntheticRel, 'evidence_manifest.json'));
    writeFileSync(join(sandboxAbs, 'evidence_manifest.json'), manifest);
    const r = loadDs4DbiW1b1LocalEvidenceV1({
      fixtureId: 'W1B1_SYNTHETIC_POSITIVE',
      repositoryRoot: repoRoot,
      approvedPathOverride: {
        payloadRelPath: `${sandboxRel}/payload.json`,
        evidenceManifestRelPath: `${sandboxRel}/evidence_manifest.json`,
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.verification.failureCodes).toContain('FILE_TOO_LARGE');
      expect(r.verification.checksPerformed).toContain('PAYLOAD_SIZE_PRECHECK');
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
