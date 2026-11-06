import { createHash } from 'node:crypto';
import { FSD_DISCOVERY_RUN_CONTRACT_VERSION_V1 } from '../persistence/fsd-discovery-persistence.contract.v1';

/** Stable run identity before any catalog provider response (H1). */
export function buildFsd3DiscoveryRequestRunKeyV1(input: {
  discoveryRequestKey: string;
  connectionIdentityFingerprint: string;
}): string {
  return createHash('sha256')
    .update(
      `${FSD_DISCOVERY_RUN_CONTRACT_VERSION_V1}|fsd3-discovery-request|${input.connectionIdentityFingerprint}|${input.discoveryRequestKey}`,
    )
    .digest('hex');
}

/** Immutable catalog stage plan fingerprint known before catalog fetch. */
export function buildFsd3CatalogStagePlanFingerprintForRequestV1(discoveryRequestKey: string): string {
  return createHash('sha256').update(`CATALOG|request|${discoveryRequestKey}`).digest('hex');
}

export const FSD3_CATALOG_FINGERPRINT_EVIDENCE_SIGNAL_V1 = '__fsd3_declared_catalog_fingerprint__';
