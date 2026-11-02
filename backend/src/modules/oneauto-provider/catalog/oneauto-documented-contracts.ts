import type {
  OneAutoDocumentedProviderContract,
  OneAutoOptionalQueryParameter,
} from './oneauto-contract-types';
import { ONEAUTO_OPENAPI_EVIDENCE_REPO_PATH } from './oneauto-openapi-sku-bindings';

const SERVICE_PAGE = (slug: string) => `https://www.oneautoapi.com/service/${slug}/`;
const PRICING_DE = 'https://www.oneautoapi.com/pricing/de/';
const ASYNC_KB =
  'https://docs.oneautoapi.com/knowledgebase/working-with-asynchronous-api-methods/';
const STATUS_KB = 'https://docs.oneautoapi.com/knowledgebase/understanding-status-codes/';
const OPENAPI_EVIDENCE = ONEAUTO_OPENAPI_EVIDENCE_REPO_PATH;

const ASYNC_OPTIONAL_QUERY_PARAMS: readonly OneAutoOptionalQueryParameter[] = [
  { name: 'callback_url', schemaType: 'string' },
  { name: 'return_data_in_callback', schemaType: 'boolean' },
];

const NO_OPTIONAL_QUERY_PARAMS: readonly OneAutoOptionalQueryParameter[] = [];

/**
 * Official documented REST contracts (P2.5A + P2.5B OpenAPI evidence alignment).
 * DOCUMENTED entries do **not** grant execution, allowlist, or quote availability.
 */
export const ONEAUTO_DOCUMENTED_PROVIDER_CONTRACTS: ReadonlyMap<
  string,
  OneAutoDocumentedProviderContract
> = new Map<string, OneAutoDocumentedProviderContract>([
  [
    'OE_SERVICE_HISTORY_EU',
    {
      serviceSku: 'OE_SERVICE_HISTORY_EU',
      evidenceState: 'DOCUMENTED',
      httpMethod: 'GET',
      providerPathTemplate: 'ezyvin/servicehistory/',
      authHeaderName: 'x-api-key',
      vinQueryParameter: 'vehicle_identification_number',
      optionalQueryParameters: ASYNC_OPTIONAL_QUERY_PARAMS,
      responseEnvelope: 'SUCCESS_RESULT_ERROR',
      asyncCapability: 'ASYNC_CAPABLE',
      callbackSupported: true,
      asyncPollSameUrlWithoutNewCharge: false,
      http206CompleteSuccessAllowed: false,
      responseHandling: 'OPAQUE_JSON',
      catalogExecutionMode: 'ASYNC_POLL',
      evidenceSources: [
        OPENAPI_EVIDENCE,
        SERVICE_PAGE('ezyvin-oe-service-history-vin'),
        PRICING_DE,
        ASYNC_KB,
        STATUS_KB,
      ],
    },
  ],
  [
    'OE_SERVICE_SCHEDULE',
    {
      serviceSku: 'OE_SERVICE_SCHEDULE',
      evidenceState: 'DOCUMENTED',
      httpMethod: 'GET',
      providerPathTemplate: 'oneauto/oeserviceschedulefromvin/v2',
      authHeaderName: 'x-api-key',
      vinQueryParameter: 'vehicle_identification_number',
      optionalQueryParameters: ASYNC_OPTIONAL_QUERY_PARAMS,
      responseEnvelope: 'SUCCESS_RESULT_ERROR',
      asyncCapability: 'ASYNC_CAPABLE',
      callbackSupported: true,
      asyncPollSameUrlWithoutNewCharge: false,
      http206CompleteSuccessAllowed: false,
      responseHandling: 'OPAQUE_JSON',
      catalogExecutionMode: 'ASYNC_POLL',
      evidenceSources: [
        OPENAPI_EVIDENCE,
        SERVICE_PAGE('oe-service-schedule-vin'),
        PRICING_DE,
        ASYNC_KB,
        STATUS_KB,
      ],
    },
  ],
  [
    'OE_BUILD_DECODE',
    {
      serviceSku: 'OE_BUILD_DECODE',
      evidenceState: 'DOCUMENTED',
      httpMethod: 'GET',
      providerPathTemplate: 'oneauto/oebuilddecode/v2',
      authHeaderName: 'x-api-key',
      vinQueryParameter: 'vehicle_identification_number',
      optionalQueryParameters: ASYNC_OPTIONAL_QUERY_PARAMS,
      responseEnvelope: 'SUCCESS_RESULT_ERROR',
      asyncCapability: 'ASYNC_CAPABLE',
      callbackSupported: true,
      asyncPollSameUrlWithoutNewCharge: false,
      http206CompleteSuccessAllowed: false,
      responseHandling: 'OPAQUE_JSON',
      catalogExecutionMode: 'ASYNC_CAPABLE',
      evidenceSources: [
        OPENAPI_EVIDENCE,
        SERVICE_PAGE('oe-build-decode'),
        PRICING_DE,
        ASYNC_KB,
        STATUS_KB,
      ],
    },
  ],
  [
    'OE_BUILD_SHEET_EU',
    {
      serviceSku: 'OE_BUILD_SHEET_EU',
      evidenceState: 'DOCUMENTED',
      httpMethod: 'GET',
      providerPathTemplate: 'oneauto/oebuildsheeteuropefromvin/v2',
      authHeaderName: 'x-api-key',
      vinQueryParameter: 'vehicle_identification_number',
      optionalQueryParameters: ASYNC_OPTIONAL_QUERY_PARAMS,
      responseEnvelope: 'SUCCESS_RESULT_ERROR',
      asyncCapability: 'ASYNC_CAPABLE',
      callbackSupported: true,
      asyncPollSameUrlWithoutNewCharge: false,
      http206CompleteSuccessAllowed: false,
      responseHandling: 'OPAQUE_JSON',
      catalogExecutionMode: 'ASYNC_POLL',
      evidenceSources: [
        OPENAPI_EVIDENCE,
        SERVICE_PAGE('oe-build-sheet-data-europe-from-vin'),
        PRICING_DE,
        ASYNC_KB,
        STATUS_KB,
      ],
    },
  ],
  [
    'OE_VIN_LOOKUP_EU',
    {
      serviceSku: 'OE_VIN_LOOKUP_EU',
      evidenceState: 'DOCUMENTED',
      httpMethod: 'GET',
      providerPathTemplate: 'ezyvin/vinlookup/',
      authHeaderName: 'x-api-key',
      vinQueryParameter: 'vehicle_identification_number',
      optionalQueryParameters: ASYNC_OPTIONAL_QUERY_PARAMS,
      responseEnvelope: 'SUCCESS_RESULT_ERROR',
      asyncCapability: 'ASYNC_CAPABLE',
      callbackSupported: true,
      asyncPollSameUrlWithoutNewCharge: false,
      http206CompleteSuccessAllowed: false,
      responseHandling: 'OPAQUE_JSON',
      catalogExecutionMode: 'ASYNC_CAPABLE',
      evidenceSources: [
        OPENAPI_EVIDENCE,
        SERVICE_PAGE('ezyvin-oe-vin-lookup'),
        PRICING_DE,
        ASYNC_KB,
        STATUS_KB,
      ],
    },
  ],
  [
    'RECALL_CHECK',
    {
      serviceSku: 'RECALL_CHECK',
      evidenceState: 'DOCUMENTED',
      httpMethod: 'GET',
      providerPathTemplate: 'oneauto/recallcheckfromvin/v2',
      authHeaderName: 'x-api-key',
      vinQueryParameter: 'vehicle_identification_number',
      optionalQueryParameters: NO_OPTIONAL_QUERY_PARAMS,
      responseEnvelope: 'SUCCESS_RESULT_ERROR',
      asyncCapability: 'SYNC_ONLY',
      callbackSupported: false,
      asyncPollSameUrlWithoutNewCharge: false,
      http206CompleteSuccessAllowed: false,
      responseHandling: 'OPAQUE_JSON',
      catalogExecutionMode: 'SYNC',
      evidenceSources: [OPENAPI_EVIDENCE, SERVICE_PAGE('recall-check-vin'), STATUS_KB],
    },
  ],
]);

export function getDocumentedOneAutoContract(
  serviceSku: string,
): OneAutoDocumentedProviderContract | undefined {
  return ONEAUTO_DOCUMENTED_PROVIDER_CONTRACTS.get(serviceSku);
}

export function isOneAutoSkuDocumented(serviceSku: string): boolean {
  return ONEAUTO_DOCUMENTED_PROVIDER_CONTRACTS.has(serviceSku);
}

export function listDocumentedOneAutoContracts(): readonly OneAutoDocumentedProviderContract[] {
  return [...ONEAUTO_DOCUMENTED_PROVIDER_CONTRACTS.values()];
}
