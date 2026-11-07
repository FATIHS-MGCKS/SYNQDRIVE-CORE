/**
 * W1B1 — Local immutable evidence loader (research only).
 * Computes all digests from bytes; never accepts caller-supplied inspection proofs.
 */

import { readFileSync } from 'fs';
import type { DiV0MotionCoreShadowPayloadV1 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import { deriveDs4DrivingExposureV1 } from '../ds4-assessment-driving-exposure.v1';
import { resolveW0SpeedAuthorityPartitionV1 } from './ds4-dbi-w0-moving-exposure-clock.v1';
import type { Ds4DbiW0TripMetaV1 } from './ds4-dbi-w0-mbf-kernel.v1';
import { DS4_DBI_W0_TRUSTED_SEALED_REAL_LOADER_ACTIVE_V1 } from './ds4-dbi-w0-sealed-real-attestation.v1';
import {
  assertW1aTrustPlaneCapV1,
  type Ds4DbiW1EvidenceTrustPlaneV1,
  type Ds4DbiW1TrustedEvidenceManifestV1,
  validateDs4DbiW1TrustedEvidenceManifestV1,
} from './ds4-dbi-w1a-trusted-evidence.contract.v1';
import {
  computeCanonicalPayloadDigestV1,
  computeDetachedManifestDigestV1,
  computeRawFileSha256V1,
} from './ds4-dbi-w1b1-digest-semantics.v1';
import {
  DS4_DBI_W1B1_FIXTURES_V1,
  type Ds4DbiW1b1FixtureIdV1,
  type Ds4DbiW1b1FixtureRecordV1,
} from './ds4-dbi-w1b1-fixture-registry.v1';
import {
  assertFileSizeBoundedV1,
  DS4_DBI_W1B1_MAX_MANIFEST_BYTES,
  DS4_DBI_W1B1_MAX_PAYLOAD_BYTES,
  resolveRepoRelativePathV1,
} from './ds4-dbi-w1b1-path-security.v1';

export const DS4_DBI_W1B1_LOADER_VERSION = 'ds4-dbi-w1b1-local-evidence-v1' as const;

export type Ds4DbiW1b1EvidenceManifestFileV1 = {
  fileVersion: 'ds4-dbi-w1b1-evidence-manifest-file-v1';
  w1a: Ds4DbiW1TrustedEvidenceManifestV1;
};

export type Ds4DbiW1b1LoadFailureCodeV1 =
  | 'FIXTURE_NOT_REGISTERED'
  | 'SOURCE_FILE_MISSING'
  | 'MANIFEST_FILE_MISSING'
  | 'PATH_TRAVERSAL_REJECTED'
  | 'PATH_OUTSIDE_ALLOWLIST'
  | 'SYMLINK_ESCAPE_REJECTED'
  | 'FILE_TOO_LARGE'
  | 'PAYLOAD_JSON_PARSE'
  | 'MANIFEST_JSON_PARSE'
  | 'RAW_FILE_SHA_MISMATCH'
  | 'CANONICAL_PAYLOAD_DIGEST_MISMATCH'
  | 'DETACHED_MANIFEST_DIGEST_MISMATCH'
  | 'W1A_MANIFEST_VALIDATION_FAILED'
  | 'PAYLOAD_SPEED_AUTHORITY_MISSING'
  | 'PAYLOAD_SPEED_AUTHORITY_CONTRADICTS_MANIFEST'
  | 'PAYLOAD_CONTRACT_BUNDLE_MISMATCH'
  | 'CALLER_INSPECTION_PROOF_FORBIDDEN'
  | 'TRUSTED_LOADER_NOT_ARMED'
  | 'F04_NOT_ARMED';

export type Ds4DbiW1b1VerificationReportV1 = {
  loaderVersion: typeof DS4_DBI_W1B1_LOADER_VERSION;
  fixtureId: Ds4DbiW1b1FixtureIdV1;
  classification: Ds4DbiW1b1FixtureRecordV1['classification'];
  trustPlaneAchieved: Ds4DbiW1EvidenceTrustPlaneV1 | null;
  sourceAuthenticationStatus: 'NOT_AUTHENTICATED';
  scientificValidationStatus: 'NOT_EVALUATED';
  sealedRealC4StatisticalEligibility: false;
  checksPerformed: string[];
  hashes: {
    rawFileSha256: string | null;
    canonicalPayloadDigestSha256: string | null;
    detachedManifestDigestSha256: string | null;
    rawMatchesManifest: boolean | null;
    canonicalMatchesManifest: boolean | null;
    manifestDigestMatches: boolean | null;
  };
  identities: {
    tripId: string | null;
    sourceMotionRunId: string | null;
    shadowBundleVersion: string | null;
  };
  unavailableEvidence: string[];
  limitations: string[];
  failureCodes: Ds4DbiW1b1LoadFailureCodeV1[];
};

export type Ds4DbiW1b1LoadSuccessV1 = {
  ok: true;
  fixture: Ds4DbiW1b1FixtureRecordV1;
  payload: DiV0MotionCoreShadowPayloadV1;
  manifest: Ds4DbiW1TrustedEvidenceManifestV1;
  tripMeta: Ds4DbiW0TripMetaV1;
  trustPlaneAchieved: 'STRUCTURALLY_BOUND';
  verification: Ds4DbiW1b1VerificationReportV1;
};

export type Ds4DbiW1b1LoadFailureV1 = {
  ok: false;
  fixtureId: Ds4DbiW1b1FixtureIdV1;
  verification: Ds4DbiW1b1VerificationReportV1;
};

export type Ds4DbiW1b1LoadResultV1 = Ds4DbiW1b1LoadSuccessV1 | Ds4DbiW1b1LoadFailureV1;

function emptyReport(
  fixtureId: Ds4DbiW1b1FixtureIdV1,
  record: Ds4DbiW1b1FixtureRecordV1 | null,
): Ds4DbiW1b1VerificationReportV1 {
  return {
    loaderVersion: DS4_DBI_W1B1_LOADER_VERSION,
    fixtureId,
    classification: record?.classification ?? 'HISTORICAL_RECORDING',
    trustPlaneAchieved: null,
    sourceAuthenticationStatus: 'NOT_AUTHENTICATED',
    scientificValidationStatus: 'NOT_EVALUATED',
    sealedRealC4StatisticalEligibility: false,
    checksPerformed: [],
    hashes: {
      rawFileSha256: null,
      canonicalPayloadDigestSha256: null,
      detachedManifestDigestSha256: null,
      rawMatchesManifest: null,
      canonicalMatchesManifest: null,
      manifestDigestMatches: null,
    },
    identities: { tripId: null, sourceMotionRunId: null, shadowBundleVersion: null },
    unavailableEvidence: [
      'INDEPENDENT_TRUST_ANCHOR_NOT_VERIFIED_W1B1',
      'SOURCE_AUTHENTICATION_REQUIRES_W1B2',
    ],
    limitations: [
      'W1B1_MAX_TRUST_PLANE_STRUCTURALLY_BOUND',
      'NO_RELAXED_SPEED_AUTHORITY_INFERENCE',
    ],
    failureCodes: [],
  };
}

function fail(
  fixtureId: Ds4DbiW1b1FixtureIdV1,
  record: Ds4DbiW1b1FixtureRecordV1 | null,
  codes: Ds4DbiW1b1LoadFailureCodeV1[],
  patch: Partial<Ds4DbiW1b1VerificationReportV1>,
): Ds4DbiW1b1LoadFailureV1 {
  const verification = { ...emptyReport(fixtureId, record), ...patch, failureCodes: [...new Set(codes)] };
  return { ok: false, fixtureId, verification };
}

export function assertW1b1TrustPlaneCapV1(plane: Ds4DbiW1EvidenceTrustPlaneV1): Ds4DbiW1EvidenceTrustPlaneV1 {
  assertW1aTrustPlaneCapV1(plane);
  if (plane === 'SOURCE_AUTHENTICATED' || plane === 'SCIENTIFICALLY_ELIGIBLE') {
    throw new Error('W1B1_NEVER_SOURCE_AUTHENTICATED');
  }
  return plane;
}

/**
 * Load and byte-verify a registered fixture. Rejects any caller inspection object
 * (no optional proof parameter by design).
 */
export function loadDs4DbiW1b1LocalEvidenceV1(input: {
  fixtureId: Ds4DbiW1b1FixtureIdV1;
  repositoryRoot: string;
  /** Approved offline paths only (e.g. adversarial temp dirs under repo test harness). */
  approvedPathOverride?: {
    payloadRelPath: string;
    evidenceManifestRelPath: string;
  };
  /** Must be absent/false — guards against future API misuse in tests. */
  callerInspectionProofAttempt?: unknown;
}): Ds4DbiW1b1LoadResultV1 {
  if (input.callerInspectionProofAttempt != null) {
    const record = DS4_DBI_W1B1_FIXTURES_V1[input.fixtureId] ?? null;
    return fail(input.fixtureId, record, ['CALLER_INSPECTION_PROOF_FORBIDDEN'], {
      checksPerformed: ['CALLER_INSPECTION_REJECTED'],
    });
  }

  const record = DS4_DBI_W1B1_FIXTURES_V1[input.fixtureId];
  if (!record) {
    return fail(input.fixtureId, null, ['FIXTURE_NOT_REGISTERED'], {});
  }

  const report = emptyReport(input.fixtureId, record);
  report.checksPerformed.push('FIXTURE_ALLOWLIST');
  report.checksPerformed.push('F04_TRUST_GATE_FALSE');
  if (DS4_DBI_W0_TRUSTED_SEALED_REAL_LOADER_ACTIVE_V1) {
    return fail(input.fixtureId, record, ['TRUSTED_LOADER_NOT_ARMED', 'F04_NOT_ARMED'], { ...report });
  }

  const payloadRel = input.approvedPathOverride?.payloadRelPath ?? record.payloadRelPath;
  const manifestRel = input.approvedPathOverride?.evidenceManifestRelPath ?? record.evidenceManifestRelPath;

  const payloadPath = resolveRepoRelativePathV1({
    repositoryRoot: input.repositoryRoot,
    relPath: payloadRel,
    allowedRootsRel: record.allowedReadRootsRel,
  });
  if (!payloadPath.ok) {
    return fail(input.fixtureId, record, [payloadPath.code], { ...report, checksPerformed: [...report.checksPerformed, 'PATH_RESOLVE_PAYLOAD'] });
  }

  const manifestPath = resolveRepoRelativePathV1({
    repositoryRoot: input.repositoryRoot,
    relPath: manifestRel,
    allowedRootsRel: record.allowedReadRootsRel,
  });
  if (!manifestPath.ok) {
    return fail(input.fixtureId, record, [manifestPath.code], { ...report, checksPerformed: [...report.checksPerformed, 'PATH_RESOLVE_MANIFEST'] });
  }

  let payloadBytes: Buffer;
  let manifestBytes: Buffer;
  try {
    payloadBytes = readFileSync(payloadPath.absPath);
    manifestBytes = readFileSync(manifestPath.absPath);
  } catch {
    const code = record.payloadRelPath ? 'SOURCE_FILE_MISSING' : 'MANIFEST_FILE_MISSING';
    return fail(input.fixtureId, record, [code], report);
  }

  const payloadSizeCode = assertFileSizeBoundedV1(payloadBytes.length, DS4_DBI_W1B1_MAX_PAYLOAD_BYTES);
  if (payloadSizeCode) {
    return fail(input.fixtureId, record, [payloadSizeCode], report);
  }
  const manifestSizeCode = assertFileSizeBoundedV1(manifestBytes.length, DS4_DBI_W1B1_MAX_MANIFEST_BYTES);
  if (manifestSizeCode) {
    return fail(input.fixtureId, record, [manifestSizeCode], report);
  }

  report.checksPerformed.push('READ_PAYLOAD_BYTES', 'READ_MANIFEST_BYTES');

  const rawSha = computeRawFileSha256V1(payloadBytes);
  report.hashes.rawFileSha256 = rawSha;

  let payload: DiV0MotionCoreShadowPayloadV1;
  try {
    payload = JSON.parse(payloadBytes.toString('utf8')) as DiV0MotionCoreShadowPayloadV1;
  } catch {
    return fail(input.fixtureId, record, ['PAYLOAD_JSON_PARSE'], { ...report, trustPlaneAchieved: 'STRUCTURE_VALID' });
  }

  const canonicalSha = computeCanonicalPayloadDigestV1(payload);
  report.hashes.canonicalPayloadDigestSha256 = canonicalSha;
  report.checksPerformed.push('COMPUTE_RAW_AND_CANONICAL_DIGEST');

  let manifestFile: Ds4DbiW1b1EvidenceManifestFileV1;
  try {
    manifestFile = JSON.parse(manifestBytes.toString('utf8')) as Ds4DbiW1b1EvidenceManifestFileV1;
  } catch {
    return fail(input.fixtureId, record, ['MANIFEST_JSON_PARSE'], report);
  }

  const manifest = manifestFile.w1a;
  if (!manifest) {
    return fail(input.fixtureId, record, ['MANIFEST_JSON_PARSE'], report);
  }

  const computedManifestDigest = computeDetachedManifestDigestV1(manifest);
  report.hashes.detachedManifestDigestSha256 = computedManifestDigest;
  report.checksPerformed.push('COMPUTE_DETACHED_MANIFEST_DIGEST');

  const codes: Ds4DbiW1b1LoadFailureCodeV1[] = [];

  if (rawSha !== manifest.sourceFileSha256) {
    codes.push('RAW_FILE_SHA_MISMATCH');
    report.hashes.rawMatchesManifest = false;
  } else {
    report.hashes.rawMatchesManifest = true;
  }

  if (canonicalSha !== manifest.canonicalPayloadContentDigestSha256) {
    codes.push('CANONICAL_PAYLOAD_DIGEST_MISMATCH');
    report.hashes.canonicalMatchesManifest = false;
  } else {
    report.hashes.canonicalMatchesManifest = true;
  }

  if (computedManifestDigest !== manifest.detachedProvenanceManifestDigestSha256) {
    codes.push('DETACHED_MANIFEST_DIGEST_MISMATCH');
    report.hashes.manifestDigestMatches = false;
  } else {
    report.hashes.manifestDigestMatches = true;
  }

  report.identities.tripId = manifest.tripId;
  report.identities.sourceMotionRunId = manifest.sourceMotionRunId;
  report.identities.shadowBundleVersion = manifest.shadowBundleVersion;

  if (codes.length > 0) {
    report.trustPlaneAchieved = report.hashes.rawMatchesManifest ? 'FILE_BYTES_INTEGRITY_VERIFIED' : 'STRUCTURE_VALID';
    return fail(input.fixtureId, record, codes, report);
  }

  const payloadAuthority = resolveW0SpeedAuthorityPartitionV1(payload);
  if (!payloadAuthority) {
    codes.push('PAYLOAD_SPEED_AUTHORITY_MISSING');
    report.unavailableEvidence.push('PAYLOAD_contract.speedAuthority');
    report.limitations.push('HISTORICAL_C4_ESTIMATOR_INFERENCE_NOT_USED_IN_W1B1');
  } else if (payloadAuthority !== manifest.speedAuthority) {
    codes.push('PAYLOAD_SPEED_AUTHORITY_CONTRADICTS_MANIFEST');
  }

  const bundleObs = payload.contract?.algorithmVersions?.bundle;
  if (bundleObs && bundleObs !== manifest.shadowBundleVersion) {
    codes.push('PAYLOAD_CONTRACT_BUNDLE_MISMATCH');
  }

  if (codes.length > 0) {
    report.trustPlaneAchieved = 'FILE_BYTES_INTEGRITY_VERIFIED';
    report.checksPerformed.push('STRICT_SOURCE_BINDING');
    return fail(input.fixtureId, record, codes, report);
  }

  const w1a = validateDs4DbiW1TrustedEvidenceManifestV1(manifest, {
    kind: 'BYTE_INSPECTION',
    inspection: {
      proofKind: 'LOADER_COMPUTED_FROM_BYTES',
      inspectedSourceFileSha256: rawSha,
      inspectedCanonicalPayloadDigestSha256: canonicalSha,
      inspectedDetachedProvenanceManifestDigestSha256: computedManifestDigest,
    },
  });

  if (!w1a.ok) {
    return fail(input.fixtureId, record, ['W1A_MANIFEST_VALIDATION_FAILED'], {
      ...report,
      trustPlaneAchieved: 'FILE_BYTES_INTEGRITY_VERIFIED',
      checksPerformed: [...report.checksPerformed, 'W1A_MANIFEST_STRUCTURAL_VALIDATE'],
      limitations: [...report.limitations, ...w1a.codes],
    });
  }

  const trustPlane = assertW1b1TrustPlaneCapV1(w1a.trustPlaneAchieved);
  if (trustPlane !== 'STRUCTURALLY_BOUND') {
    return fail(input.fixtureId, record, ['W1A_MANIFEST_VALIDATION_FAILED'], report);
  }

  const drivingExposure = deriveDs4DrivingExposureV1({
    payload,
    speedAuthority: manifest.speedAuthority,
  });
  const tripMeta: Ds4DbiW0TripMetaV1 = {
    tripId: manifest.tripId,
    sourceMotionRunId: manifest.sourceMotionRunId,
    speedAuthority: manifest.speedAuthority,
    shadowBundleVersion: manifest.shadowBundleVersion,
    contentFingerprint: canonicalSha,
    exposureSecondsEs: drivingExposure.derivable ? drivingExposure.exposureSeconds : 0,
    distanceKm: drivingExposure.derivable ? drivingExposure.distanceKm : 0,
  };

  if (record.classification === 'SYNTHETIC') {
    report.limitations.push('SYNTHETIC_FIXTURE_NOT_REAL_WORLD_VALIDATION');
  } else {
    report.limitations.push('HISTORICAL_RECORDING_NOT_SOURCE_AUTHENTICATED');
  }

  report.trustPlaneAchieved = 'STRUCTURALLY_BOUND';
  report.checksPerformed.push('STRICT_SOURCE_BINDING', 'W1A_STRUCTURALLY_BOUND');

  return {
    ok: true,
    fixture: record,
    payload,
    manifest,
    tripMeta,
    trustPlaneAchieved: 'STRUCTURALLY_BOUND',
    verification: { ...report, failureCodes: [] },
  };
}
