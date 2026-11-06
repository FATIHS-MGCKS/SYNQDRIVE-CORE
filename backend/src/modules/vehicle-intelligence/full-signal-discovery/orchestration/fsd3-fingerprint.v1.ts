import { createHash } from 'node:crypto';

/** Deterministic catalog fingerprint from complete availableSignals snapshot (no truncation). */
export function buildFsd3DeclaredCatalogFingerprintV1(
  availableSignals: readonly string[],
): string {
  const sorted = [...availableSignals].sort((a, b) => a.localeCompare(b));
  return createHash('sha256').update(sorted.join('|')).digest('hex');
}

export function buildFsd3CatalogStagePlanFingerprintV1(catalogFingerprint: string): string {
  return createHash('sha256').update(`CATALOG|${catalogFingerprint}`).digest('hex');
}

export function buildFsd3SnapshotStagePlanFingerprintV1(input: {
  catalogFingerprint: string;
  documentFingerprints: readonly string[];
}): string {
  const sorted = [...input.documentFingerprints].sort((a, b) => a.localeCompare(b));
  return createHash('sha256')
    .update(`SNAPSHOT|${input.catalogFingerprint}|${sorted.join('|')}`)
    .digest('hex');
}
