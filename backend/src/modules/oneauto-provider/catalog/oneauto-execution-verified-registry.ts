import { getDocumentedOneAutoContract } from './oneauto-documented-contracts';
import type { OneAutoExecutionVerifiedProviderContract } from './oneauto-contract-types';

/** Env `ONEAUTO_PRICING_CATALOG_VERSION` must match at execute time when using default indicative prices. */
export const ONEAUTO_P3_VIN_LOOKUP_EU_PRICING_SOURCE_VERSION =
  'synqdrive-p3-vin-lookup-e2-sync-200-v1' as const;

const P3_VIN_LOOKUP_EVIDENCE_SOURCES = [
  'architecture/oneauto-provider/evidence/P25E_E2_PROVIDER_DASHBOARD_ASYNC_SEQUENCE.md',
  'architecture/oneauto-provider/evidence/P25E_P1_SECURE_RESULT_CAPTURE.md',
  'architecture/oneauto-provider/evidence/P3_VIN_LOOKUP_EXECUTION_VERIFIED.md',
] as const;

/**
 * OE_VIN_LOOKUP_EU — execution-verified for **sync HTTP 200** completion only (live E2).
 * E1 (HTTP 202, single GET, no polling) does **not** enable async same-URL poll (`false`).
 */
export function buildExecutionVerifiedOeVinLookupEu(): OneAutoExecutionVerifiedProviderContract {
  const documented = getDocumentedOneAutoContract('OE_VIN_LOOKUP_EU');
  if (!documented) {
    throw new Error('OE_VIN_LOOKUP_EU documented contract missing');
  }
  return {
    ...documented,
    evidenceState: 'EXECUTION_VERIFIED',
    asyncPollSameUrlWithoutNewCharge: false,
    http206CompleteSuccessAllowed: false,
    catalogExecutionMode: 'SYNC',
    asyncCapability: 'SYNC_ONLY',
    pricingSourceVersion: ONEAUTO_P3_VIN_LOOKUP_EU_PRICING_SOURCE_VERSION,
    evidenceSources: [...documented.evidenceSources, ...P3_VIN_LOOKUP_EVIDENCE_SOURCES],
  };
}

export const ONEAUTO_EXECUTION_VERIFIED_SKUS_READONLY = ['OE_VIN_LOOKUP_EU'] as const;

export function seedOneAutoExecutionVerifiedRegistry(
  target: Map<string, OneAutoExecutionVerifiedProviderContract>,
): void {
  target.clear();
  target.set('OE_VIN_LOOKUP_EU', buildExecutionVerifiedOeVinLookupEu());
}
