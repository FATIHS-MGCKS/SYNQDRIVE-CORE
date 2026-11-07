/**
 * W1B1 deterministic digest semantics (documented; matches W0 kernel where noted).
 */

import { createHash } from 'crypto';
import type { DiV0MotionCoreShadowPayloadV1 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import type { Ds4DbiW1TrustedEvidenceManifestV1 } from './ds4-dbi-w1a-trusted-evidence.contract.v1';

export const DS4_DBI_W1B1_DIGEST_SEMANTICS_VERSION = 'ds4-dbi-w1b1-digest-semantics-v1' as const;

/** RAW_FILE_SHA256 — digest of exact on-disk bytes (including whitespace). */
export function computeRawFileSha256V1(fileBytes: Buffer): string {
  return createHash('sha256').update(fileBytes).digest('hex');
}

/**
 * CANONICAL_PAYLOAD_DIGEST — same as `fingerprintPayloadV1` in W0 MBF kernel:
 * SHA-256 of `JSON.stringify(parsedPayloadObject)` (key order as parsed).
 */
export function computeCanonicalPayloadDigestV1(payload: DiV0MotionCoreShadowPayloadV1): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function sortKeysDeepV1(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => sortKeysDeepV1(v));
  }
  if (value != null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      out[key] = sortKeysDeepV1(record[key]);
    }
    return out;
  }
  return value;
}

/**
 * MANIFEST_DIGEST — SHA-256 of canonical manifest body JSON excluding
 * `detachedProvenanceManifestDigestSha256` (sorted keys; no circular self-hash).
 */
export function canonicalManifestBodyJsonV1(
  manifest: Ds4DbiW1TrustedEvidenceManifestV1,
): string {
  const { detachedProvenanceManifestDigestSha256: _drop, ...body } = manifest;
  return JSON.stringify(sortKeysDeepV1(body));
}

export function computeDetachedManifestDigestV1(manifest: Ds4DbiW1TrustedEvidenceManifestV1): string {
  return createHash('sha256').update(canonicalManifestBodyJsonV1(manifest)).digest('hex');
}
