export type OneAutoExecutionMode =
  | 'SYNC'
  | 'ASYNC_POLL'
  | 'ASYNC_CAPABLE'
  | 'ASYNC_UNVERIFIED';

/** Official One Auto API key header (marketing + service pages). */
export type OneAutoAuthHeaderName = 'x-api-key';

/** Official VIN query parameter for documented EU/VIN services. */
export type OneAutoVinQueryParameter = 'vehicle_identification_number';

export type OneAutoOptionalQueryParameterName = 'callback_url' | 'return_data_in_callback';

/** Documented optional query parameters from OpenAPI evidence (not sent until execution-verified). */
export type OneAutoOptionalQueryParameter = {
  name: OneAutoOptionalQueryParameterName;
  schemaType: 'string' | 'boolean';
};

export type OneAutoHttpMethod = 'GET';

export type OneAutoAsyncCapability =
  | 'SYNC_ONLY'
  | 'ASYNC_CAPABLE'
  | 'ASYNC_UNVERIFIED';

/**
 * Evidence axis — DOCUMENTED ≠ executable.
 * EXECUTION_VERIFIED is required for outbound HTTP and Master Admin execute.
 */
export type OneAutoContractEvidenceState = 'DOCUMENTED' | 'EXECUTION_VERIFIED' | 'UNVERIFIED';

export type OneAutoDocumentedProviderContract = {
  serviceSku: string;
  evidenceState: 'DOCUMENTED';
  httpMethod: OneAutoHttpMethod;
  providerPathTemplate: string;
  authHeaderName: OneAutoAuthHeaderName;
  vinQueryParameter: OneAutoVinQueryParameter;
  optionalQueryParameters: readonly OneAutoOptionalQueryParameter[];
  /** OpenAPI 200 response uses success / result / error envelope (opaque at runtime). */
  responseEnvelope: 'SUCCESS_RESULT_ERROR';
  asyncCapability: OneAutoAsyncCapability;
  /** Vendor docs support callback_url — not activated in SynqDrive. */
  callbackSupported: boolean;
  /**
   * Same-URL poll after 202 is blocked until explicitly attested on an execution-verified entry.
   */
  asyncPollSameUrlWithoutNewCharge: false;
  /**
   * Vendor 206 = partial / often non-chargeable — never complete success unless execution-verified.
   */
  http206CompleteSuccessAllowed: false;
  responseHandling: 'OPAQUE_JSON';
  /** Maps to Master Admin catalog executionMode hint. */
  catalogExecutionMode: OneAutoExecutionMode;
  evidenceSources: readonly string[];
};

export type OneAutoExecutionVerifiedProviderContract = Omit<
  OneAutoDocumentedProviderContract,
  'evidenceState' | 'asyncPollSameUrlWithoutNewCharge' | 'http206CompleteSuccessAllowed'
> & {
  evidenceState: 'EXECUTION_VERIFIED';
  asyncPollSameUrlWithoutNewCharge: boolean;
  http206CompleteSuccessAllowed: boolean;
  pricingSourceVersion: string;
};

export type OneAutoProviderHttpContract = OneAutoExecutionVerifiedProviderContract;
