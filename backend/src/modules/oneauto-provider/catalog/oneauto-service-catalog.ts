import { isOneAutoSkuExecutionVerified } from './oneauto-verified-contracts';
import {
  listDocumentedOneAutoContracts,
} from './oneauto-documented-contracts';
import type { OneAutoDocumentedProviderContract } from './oneauto-contract-types';
import type { OneAutoExecutionMode } from './oneauto-contract-types';

export type { OneAutoExecutionMode } from './oneauto-contract-types';

export type OneAutoCatalogAvailability =
  | 'AVAILABLE'
  | 'DISABLED_FLAG'
  | 'PRICE_NOT_CONFIGURED'
  | 'CONTRACT_UNVERIFIED';

export type OneAutoServiceCatalogEntry = {
  serviceSku: string;
  displayName: string;
  description: string;
  providerPathTemplate: string;
  httpMethod: 'GET';
  executionMode: OneAutoExecutionMode;
  requiredParameters: readonly ('vin')[];
  indicativePriceMinor: number | null;
  currency: string;
  pricingSourceVersion: string;
  availabilityStatus: OneAutoCatalogAvailability;
  resultHandling: 'EXTERNAL_STORE_ONLY';
  /** P2.5A — path attested on vendor marketing pages; execution still gated separately. */
  providerPathDocumented: boolean;
};

const CATALOG_VERSION = 'synqdrive-oneauto-catalog-v2-documented-paths';

const DISPLAY: Record<
  string,
  Pick<OneAutoServiceCatalogEntry, 'displayName' | 'description'>
> = {
  OE_SERVICE_HISTORY_EU: {
    displayName: 'OE Service History EU',
    description: 'Manufacturer service history (EU) — external provider payload only.',
  },
  OE_SERVICE_SCHEDULE: {
    displayName: 'OE Service Schedule',
    description: 'Manufacturer service schedule — external provider payload only.',
  },
  OE_BUILD_DECODE: {
    displayName: 'OE Build Decode',
    description: 'Build / specification decode — external provider payload only.',
  },
  OE_BUILD_SHEET_EU: {
    displayName: 'OE Build Sheet EU',
    description: 'EU build sheet — external provider payload only.',
  },
  OE_VIN_LOOKUP_EU: {
    displayName: 'OE VIN Lookup EU',
    description: 'EU VIN lookup — external provider payload only.',
  },
  RECALL_CHECK: {
    displayName: 'Recall Check',
    description: 'Recall check — external provider payload only.',
  },
};

function catalogEntryFromDocumented(doc: OneAutoDocumentedProviderContract): OneAutoServiceCatalogEntry {
  const meta = DISPLAY[doc.serviceSku];
  return {
    serviceSku: doc.serviceSku,
    displayName: meta?.displayName ?? doc.serviceSku,
    description: meta?.description ?? '',
    providerPathTemplate: doc.providerPathTemplate,
    httpMethod: doc.httpMethod,
    executionMode: doc.catalogExecutionMode,
    requiredParameters: ['vin'],
    indicativePriceMinor: null,
    currency: 'GBP',
    pricingSourceVersion: CATALOG_VERSION,
    availabilityStatus: 'CONTRACT_UNVERIFIED',
    resultHandling: 'EXTERNAL_STORE_ONLY',
    providerPathDocumented: true,
  };
}

/** Master Admin catalog — paths from DOCUMENTED registry; execution remains fail-closed. */
export const ONEAUTO_SERVICE_CATALOG: readonly OneAutoServiceCatalogEntry[] =
  listDocumentedOneAutoContracts().map(catalogEntryFromDocumented);

export function getOneAutoCatalogEntry(serviceSku: string): OneAutoServiceCatalogEntry | undefined {
  return ONEAUTO_SERVICE_CATALOG.find((e) => e.serviceSku === serviceSku);
}

export function resolveCatalogEntryForRuntime(
  entry: OneAutoServiceCatalogEntry,
  opts: {
    providerEnabled: boolean;
    indicativePriceMinorBySku: Record<string, number>;
    pricingCatalogVersion: string;
  },
): OneAutoServiceCatalogEntry {
  const configuredPrice = opts.indicativePriceMinorBySku[entry.serviceSku] ?? null;
  let availabilityStatus: OneAutoCatalogAvailability = entry.availabilityStatus;
  if (!opts.providerEnabled) availabilityStatus = 'DISABLED_FLAG';
  else if (!isOneAutoSkuExecutionVerified(entry.serviceSku)) availabilityStatus = 'CONTRACT_UNVERIFIED';
  else if (configuredPrice == null) availabilityStatus = 'PRICE_NOT_CONFIGURED';
  else availabilityStatus = 'AVAILABLE';
  return {
    ...entry,
    indicativePriceMinor: configuredPrice,
    pricingSourceVersion: opts.pricingCatalogVersion,
    availabilityStatus,
  };
}
