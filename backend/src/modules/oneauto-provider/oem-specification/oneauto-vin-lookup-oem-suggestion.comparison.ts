import {
  REGISTRATION_IDENTITY_OEM_SPECIFICATION_FIELD_KEYS,
  type RegistrationIdentityOemSpecificationFieldKey,
} from '@modules/vehicle-onboarding/vehicle-identity-review/vehicle-oem-specification-provenance.registry';
import {
  ONEAUTO_VIN_LOOKUP_EU_MAPPED_PROVIDER_PATHS,
  type OneAutoOemCanonicalFieldInput,
  type OneAutoOemFieldComparisonResult,
  type OneAutoOemFieldComparisonRow,
  type OneAutoOemSuggestionComparisonState,
  type OneAutoVinLookupEuSuggestionSnapshot,
} from './oneauto-vin-lookup-oem-suggestion.types';

const MAPPED_KEY_SET = new Set<string>(Object.keys(ONEAUTO_VIN_LOOKUP_EU_MAPPED_PROVIDER_PATHS));

function isMappedCanonicalFieldKey(
  key: RegistrationIdentityOemSpecificationFieldKey,
): key is keyof typeof ONEAUTO_VIN_LOOKUP_EU_MAPPED_PROVIDER_PATHS {
  return MAPPED_KEY_SET.has(key);
}

function normalizeCanonicalValue(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length > 0 ? trimmed : null;
}

function compareMappedField(
  canonicalValue: string | null,
  suggestedValue: string | null,
): OneAutoOemSuggestionComparisonState {
  if (suggestedValue == null) {
    return 'NOT_COMPARABLE';
  }
  if (canonicalValue == null) {
    return 'MISSING';
  }
  if (canonicalValue === suggestedValue) {
    return 'MATCH';
  }
  return 'CONFLICT';
}

/**
 * Field-level comparison for all ten OEM registry keys.
 * Protection / confirmation status is orthogonal to comparisonState.
 */
export function compareOemVinLookupEuSuggestions(
  snapshot: OneAutoVinLookupEuSuggestionSnapshot,
  canonicalByField: Partial<Record<RegistrationIdentityOemSpecificationFieldKey, OneAutoOemCanonicalFieldInput>>,
): OneAutoOemFieldComparisonResult {
  const fields: OneAutoOemFieldComparisonRow[] = [];

  for (const canonicalFieldKey of REGISTRATION_IDENTITY_OEM_SPECIFICATION_FIELD_KEYS) {
    const canonicalInput = canonicalByField[canonicalFieldKey];
    const canonicalValue = normalizeCanonicalValue(canonicalInput?.value ?? null);
    const confirmationStatus = canonicalInput?.confirmationStatus ?? null;

    if (!isMappedCanonicalFieldKey(canonicalFieldKey)) {
      fields.push({
        canonicalFieldKey,
        comparisonState: 'NOT_COMPARABLE',
        canonicalValue,
        suggestedValue: null,
        providerFieldPath: null,
        confirmationStatus,
        implicitConfirmationAllowed: false,
      });
      continue;
    }

    const suggestion = snapshot.mappedSuggestions[canonicalFieldKey];
    const suggestedValue = suggestion?.value ?? null;
    const providerFieldPath =
      suggestion?.providerFieldPath ??
      ONEAUTO_VIN_LOOKUP_EU_MAPPED_PROVIDER_PATHS[canonicalFieldKey];

    fields.push({
      canonicalFieldKey,
      comparisonState: compareMappedField(canonicalValue, suggestedValue),
      canonicalValue,
      suggestedValue,
      providerFieldPath,
      confirmationStatus,
      implicitConfirmationAllowed: false,
    });
  }

  return {
    serviceSku: snapshot.serviceSku,
    timestamps: { ...snapshot.timestamps },
    fields,
  };
}
