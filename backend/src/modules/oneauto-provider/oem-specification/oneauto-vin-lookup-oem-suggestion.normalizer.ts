import { oemSpecificationFieldMaxLength } from '@modules/vehicle-onboarding/vehicle-identity-review/vehicle-oem-specification-provenance.registry';
import {
  ONEAUTO_OEM_VIN_LOOKUP_EU_SERVICE_SKU,
  ONEAUTO_VIN_LOOKUP_EU_MAPPED_PROVIDER_PATHS,
  ONEAUTO_VIN_LOOKUP_EU_UNMAPPED_CODE_FIELD_KEYS,
  type OneAutoVinLookupEuMappedCanonicalFieldKey,
  type OneAutoVinLookupEuNormalizeResult,
  type OneAutoVinLookupEuSkipReason,
  type OneAutoVinLookupEuSuggestionField,
  type OneAutoVinLookupEuSuggestionSnapshot,
} from './oneauto-vin-lookup-oem-suggestion.types';

const PROVIDER_DATE_LAST_UPDATED = 'date_last_updated';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isValidIsoTimestamp(value: string): boolean {
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

function readBoundedDescString(raw: unknown, maxLength: number): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLength) return null;
  return trimmed;
}

function parseProviderDataUpdatedAt(result: Record<string, unknown>): string | null {
  const raw = result[PROVIDER_DATE_LAST_UPDATED];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!DATE_ONLY_RE.test(trimmed)) return null;
  return trimmed;
}

function classifySkipReason(
  raw: unknown,
  maxLength: number,
): OneAutoVinLookupEuSkipReason {
  if (raw === null || raw === undefined) return 'PROVIDER_FIELD_ABSENT';
  if (typeof raw !== 'string') return 'PROVIDER_FIELD_NOT_STRING';
  const trimmed = raw.trim();
  if (trimmed.length === 0) return 'PROVIDER_FIELD_EMPTY';
  if (trimmed.replace(/\s+/g, ' ').length > maxLength) return 'PROVIDER_FIELD_TOO_LONG';
  return 'PROVIDER_FIELD_EMPTY';
}

/**
 * Pure normalizer: OE_VIN_LOOKUP_EU `result` object → bounded OEM desc suggestions.
 * Does not mutate `providerResult`. Never infers OEM code columns.
 */
export function normalizeOemVinLookupEuSuggestions(input: {
  providerResult: unknown;
  fetchedAt: string;
  snapshotCreatedAt: string;
}): OneAutoVinLookupEuNormalizeResult {
  if (!isPlainObject(input.providerResult)) {
    return { ok: false, code: 'INVALID_PROVIDER_RESULT' };
  }
  if (!isValidIsoTimestamp(input.fetchedAt)) {
    return { ok: false, code: 'INVALID_FETCHED_AT' };
  }
  if (!isValidIsoTimestamp(input.snapshotCreatedAt)) {
    return { ok: false, code: 'INVALID_SNAPSHOT_CREATED_AT' };
  }

  const source = input.providerResult;
  const mappedSuggestions: Partial<
    Record<OneAutoVinLookupEuMappedCanonicalFieldKey, OneAutoVinLookupEuSuggestionField>
  > = {};
  const skippedProviderFields: Partial<
    Record<OneAutoVinLookupEuMappedCanonicalFieldKey, OneAutoVinLookupEuSkipReason>
  > = {};

  for (const canonicalFieldKey of Object.keys(
    ONEAUTO_VIN_LOOKUP_EU_MAPPED_PROVIDER_PATHS,
  ) as OneAutoVinLookupEuMappedCanonicalFieldKey[]) {
    const providerFieldPath = ONEAUTO_VIN_LOOKUP_EU_MAPPED_PROVIDER_PATHS[canonicalFieldKey];
    const raw = source[providerFieldPath];
    const maxLength = oemSpecificationFieldMaxLength(canonicalFieldKey);
    const value = readBoundedDescString(raw, maxLength);
    if (value == null) {
      skippedProviderFields[canonicalFieldKey] = classifySkipReason(raw, maxLength);
      continue;
    }
    mappedSuggestions[canonicalFieldKey] = {
      canonicalFieldKey,
      value,
      providerFieldPath,
    };
  }

  const snapshot: OneAutoVinLookupEuSuggestionSnapshot = {
    serviceSku: ONEAUTO_OEM_VIN_LOOKUP_EU_SERVICE_SKU,
    mappedSuggestions,
    unmappedCodeFieldKeys: [...ONEAUTO_VIN_LOOKUP_EU_UNMAPPED_CODE_FIELD_KEYS],
    skippedProviderFields,
    timestamps: {
      providerDataUpdatedAt: parseProviderDataUpdatedAt(source),
      fetchedAt: input.fetchedAt,
      snapshotCreatedAt: input.snapshotCreatedAt,
    },
  };

  return { ok: true, snapshot };
}
