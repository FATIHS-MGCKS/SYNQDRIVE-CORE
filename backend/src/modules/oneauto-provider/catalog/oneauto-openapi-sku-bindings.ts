/**
 * Maps SynqDrive SKUs to path keys in docs/provider-evidence/oneauto-six-sku-openapi-evidence.json.
 */
export const ONEAUTO_OPENAPI_EVIDENCE_REPO_PATH =
  'docs/provider-evidence/oneauto-six-sku-openapi-evidence.json';

export const ONEAUTO_SKU_TO_OPENAPI_PATH_KEY: Readonly<Record<string, string>> = {
  OE_SERVICE_HISTORY_EU: '/ezyvin/servicehistory/',
  OE_SERVICE_SCHEDULE: '/oneauto/oeserviceschedulefromvin/v2',
  OE_BUILD_DECODE: '/oneauto/oebuilddecode/v2',
  OE_BUILD_SHEET_EU: '/oneauto/oebuildsheeteuropefromvin/v2',
  OE_VIN_LOOKUP_EU: '/ezyvin/vinlookup/',
  RECALL_CHECK: '/oneauto/recallcheckfromvin/v2',
};

export function openApiPathKeyToProviderPathTemplate(openApiPathKey: string): string {
  return openApiPathKey.replace(/^\//, '');
}
