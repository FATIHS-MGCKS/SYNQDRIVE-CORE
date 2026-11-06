import { createHash } from 'node:crypto';
import { FSD_DISCOVERY_RUN_CONTRACT_VERSION_V1 } from '../persistence/fsd-discovery-persistence.contract.v1';
import type { FsdHistoricalWindowV1 } from '../fsd-query-document.builder.v1';

export function buildFsd4HistoricalWindowFingerprintV1(window: FsdHistoricalWindowV1): string {
  return createHash('sha256').update(`${window.fromUtc}|${window.toUtc}`).digest('hex');
}

export function buildFsd4HistoricalRequestRunKeyV1(input: {
  historicalRequestKey: string;
  connectionIdentityFingerprint: string;
  historicalWindowFingerprint: string;
}): string {
  return createHash('sha256')
    .update(
      `${FSD_DISCOVERY_RUN_CONTRACT_VERSION_V1}|fsd4-historical-request|${input.connectionIdentityFingerprint}|${input.historicalRequestKey}|${input.historicalWindowFingerprint}`,
    )
    .digest('hex');
}

export function buildFsd4CatalogStagePlanFingerprintV1(input: {
  historicalRequestKey: string;
  historicalWindowFingerprint: string;
}): string {
  return createHash('sha256')
    .update(`CATALOG|fsd4|${input.historicalRequestKey}|${input.historicalWindowFingerprint}`)
    .digest('hex');
}

export function buildFsd4HistoricalStagePlanFingerprintV1(input: {
  historicalWindowFingerprint: string;
  declaredCatalogFingerprint: string;
  documentFingerprints: readonly string[];
}): string {
  const sorted = [...input.documentFingerprints].sort((a, b) => a.localeCompare(b));
  return createHash('sha256')
    .update(
      `HISTORICAL|${input.historicalWindowFingerprint}|${input.declaredCatalogFingerprint}|${sorted.join('|')}`,
    )
    .digest('hex');
}

export const FSD4_CATALOG_FINGERPRINT_EVIDENCE_SIGNAL_V1 = '__fsd4_declared_catalog_fingerprint__';
