import type { RegistrationIdentityOemSpecificationFieldKey } from '@modules/vehicle-onboarding/vehicle-identity-review/vehicle-oem-specification-provenance.registry';

export const ONEAUTO_OEM_VIN_LOOKUP_EU_SERVICE_SKU = 'OE_VIN_LOOKUP_EU' as const;

/** Six OpenAPI-documented vinlookup result properties mapped to Vehicle OEM desc columns. */
export const ONEAUTO_VIN_LOOKUP_EU_MAPPED_PROVIDER_PATHS = {
  oemModelRangeDesc: 'oem_model_range_desc',
  oemDerivativeDesc: 'oem_derivative_desc',
  oemEngineDesc: 'oem_engine_desc',
  oemTransmissionDesc: 'oem_transmission_type_desc',
  exteriorColorDesc: 'oem_colour_desc',
  interiorTrimDesc: 'oem_interior_trim_desc',
} as const;

export type OneAutoVinLookupEuMappedCanonicalFieldKey = keyof typeof ONEAUTO_VIN_LOOKUP_EU_MAPPED_PROVIDER_PATHS;

export const ONEAUTO_VIN_LOOKUP_EU_UNMAPPED_CODE_FIELD_KEYS = [
  'oemEngineCode',
  'oemTransmissionCode',
  'oemExteriorColorCode',
  'oemInteriorTrimCode',
] as const satisfies readonly RegistrationIdentityOemSpecificationFieldKey[];

export type OneAutoVinLookupEuUnmappedCodeFieldKey =
  (typeof ONEAUTO_VIN_LOOKUP_EU_UNMAPPED_CODE_FIELD_KEYS)[number];

export type OneAutoOemSuggestionComparisonState =
  | 'MATCH'
  | 'MISSING'
  | 'CONFLICT'
  | 'NOT_COMPARABLE';

export type OneAutoOemFieldConfirmationStatus =
  | 'USER_CONFIRMED'
  | 'SUGGESTED'
  | 'UNCONFIRMED'
  | 'PROTECTED'
  | null;

export type OneAutoVinLookupEuSuggestionField = {
  canonicalFieldKey: OneAutoVinLookupEuMappedCanonicalFieldKey;
  value: string;
  providerFieldPath: string;
};

export type OneAutoVinLookupEuSuggestionTimestamps = {
  /** From provider `date_last_updated` when valid (date-only ISO string). */
  providerDataUpdatedAt: string | null;
  /** When SynqDrive fetched/stored the provider HTTP response. */
  fetchedAt: string;
  /** When this normalized snapshot object was built (may equal fetchedAt). */
  snapshotCreatedAt: string;
};

export type OneAutoVinLookupEuSuggestionSnapshot = {
  serviceSku: typeof ONEAUTO_OEM_VIN_LOOKUP_EU_SERVICE_SKU;
  mappedSuggestions: Readonly<Partial<Record<OneAutoVinLookupEuMappedCanonicalFieldKey, OneAutoVinLookupEuSuggestionField>>>;
  unmappedCodeFieldKeys: readonly OneAutoVinLookupEuUnmappedCodeFieldKey[];
  skippedProviderFields: Readonly<
    Partial<Record<OneAutoVinLookupEuMappedCanonicalFieldKey, OneAutoVinLookupEuSkipReason>>
  >;
  timestamps: OneAutoVinLookupEuSuggestionTimestamps;
};

export type OneAutoVinLookupEuSkipReason =
  | 'PROVIDER_FIELD_ABSENT'
  | 'PROVIDER_FIELD_EMPTY'
  | 'PROVIDER_FIELD_NOT_STRING'
  | 'PROVIDER_FIELD_TOO_LONG';

export type OneAutoVinLookupEuNormalizeFailureCode =
  | 'INVALID_PROVIDER_RESULT'
  | 'INVALID_FETCHED_AT'
  | 'INVALID_SNAPSHOT_CREATED_AT';

export type OneAutoVinLookupEuNormalizeResult =
  | { ok: true; snapshot: OneAutoVinLookupEuSuggestionSnapshot }
  | { ok: false; code: OneAutoVinLookupEuNormalizeFailureCode };

export type OneAutoOemFieldComparisonRow = {
  canonicalFieldKey: RegistrationIdentityOemSpecificationFieldKey;
  comparisonState: OneAutoOemSuggestionComparisonState;
  canonicalValue: string | null;
  suggestedValue: string | null;
  providerFieldPath: string | null;
  confirmationStatus: OneAutoOemFieldConfirmationStatus;
  /** Always false for vinlookup suggestions — explicit Master confirm required elsewhere. */
  implicitConfirmationAllowed: false;
};

export type OneAutoOemFieldComparisonResult = {
  serviceSku: typeof ONEAUTO_OEM_VIN_LOOKUP_EU_SERVICE_SKU;
  timestamps: OneAutoVinLookupEuSuggestionTimestamps;
  fields: readonly OneAutoOemFieldComparisonRow[];
};

export type OneAutoOemCanonicalFieldInput = {
  value: string | null;
  confirmationStatus?: OneAutoOemFieldConfirmationStatus;
};
