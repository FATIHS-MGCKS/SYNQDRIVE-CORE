export type OneAutoCatalogAvailability =
  | 'AVAILABLE'
  | 'DISABLED_FLAG'
  | 'PRICE_NOT_CONFIGURED'
  | 'PATH_UNVERIFIED'
  | 'CONTRACT_UNVERIFIED';

export type OneAutoExecutionMode = 'SYNC' | 'ASYNC_POLL' | 'ASYNC_CAPABLE' | 'ASYNC_UNVERIFIED';

export type OneAutoContractGateReport = {
  serviceSku: string;
  executable: boolean;
  reason: 'CONTRACT_UNVERIFIED' | 'DOCUMENTED_NOT_EXECUTABLE' | 'EXECUTABLE';
  documentationState?: 'DOCUMENTED' | 'UNVERIFIED';
  executionVerificationState?: 'EXECUTION_VERIFIED' | 'UNVERIFIED';
  unverifiedFields: string[];
};

export type OneAutoCatalogService = {
  serviceSku: string;
  displayName: string;
  description: string;
  providerPathTemplate: string;
  httpMethod: 'GET';
  executionMode: OneAutoExecutionMode;
  requiredParameters: readonly string[];
  indicativePriceMinor: number | null;
  currency: string;
  pricingSourceVersion: string;
  availabilityStatus: OneAutoCatalogAvailability;
  resultHandling: 'EXTERNAL_STORE_ONLY';
  contractGate: OneAutoContractGateReport;
  executable: boolean;
};

export type OneAutoCatalogResponse = {
  services: OneAutoCatalogService[];
  indicativePricingDisclaimer: string;
};

export type OneAutoQuoteResponse = {
  organizationId: string;
  vehicleId: string;
  serviceSku: string;
  vinSnapshot: string;
  estimatedPriceMinor: number | null;
  currency: string;
  pricingSourceVersion: string;
  executionMode: OneAutoExecutionMode;
  indicativeNotGuaranteed: boolean;
  quoteIssuedAt: string;
  quoteExpiresAt: string;
  contractGate: OneAutoContractGateReport;
};

export type OneAutoJobStatus =
  | 'CREATED'
  | 'QUEUED'
  | 'RUNNING'
  | 'AWAITING_PROVIDER'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'EXPIRED';

export type OneAutoJobDto = {
  id: string;
  organizationId: string;
  vehicleId: string;
  vinSnapshot: string;
  serviceSku: string;
  status: OneAutoJobStatus;
  idempotencyKey: string;
  providerRequestId: string | null;
  estimatedPriceMinor: number | null;
  confirmedPriceMinor: number | null;
  currency: string;
  pricingSourceVersion: string | null;
  costConfirmedAt: string | null;
  actualChargeMinor: number | null;
  actualChargeKnown: boolean;
  pollAttemptCount: number;
  lastErrorCode: string | null;
  initialProviderDispatchAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OneAutoJobResultResponse = {
  job: OneAutoJobDto;
  latestResponse: {
    httpStatus: number;
    providerStatusHeader: string | null;
    responseBodyJson: unknown;
    fetchedAt: string;
  } | null;
  actualChargeKnown: boolean;
  actualChargeMinor: number | null;
};

export type OneAutoExecuteBody = {
  serviceSku: string;
  idempotencyKey: string;
  confirmedPriceMinor: number;
  pricingSourceVersion: string;
  quoteIssuedAt: string;
  acknowledgeIndicativeNotGuaranteed: boolean;
};

export const ONEAUTO_TERMINAL_JOB_STATUSES: ReadonlySet<OneAutoJobStatus> = new Set([
  'SUCCEEDED',
  'FAILED',
  'EXPIRED',
]);

export const ONEAUTO_INITIAL_CATALOG_SKUS = [
  'OE_SERVICE_HISTORY_EU',
  'OE_SERVICE_SCHEDULE',
  'OE_BUILD_DECODE',
  'OE_BUILD_SHEET_EU',
  'OE_VIN_LOOKUP_EU',
  'RECALL_CHECK',
] as const;
