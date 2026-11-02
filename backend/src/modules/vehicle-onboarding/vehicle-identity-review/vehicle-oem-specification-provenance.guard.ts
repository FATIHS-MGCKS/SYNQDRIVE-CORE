import type {
  RegistrationIdentityCanonicalFieldKey,
  RegistrationIdentityFieldProvenanceEntry,
} from './vehicle-identity-canonical.types';
import { isRegistrationIdentityOemSpecificationFieldKey } from './vehicle-oem-specification-provenance.registry';

const REGISTRATION_IDENTITY_CANONICAL_FIELD_KEYS: RegistrationIdentityCanonicalFieldKey[] = [
  'make',
  'model',
  'year',
  'vin',
  'displacementCc',
  'fuelType',
  'nominalMotorPowerKw',
  'powerKind',
  'electrificationGrade',
  'hsn',
  'tsn',
  'typeVariantVersion',
];

const CANONICAL_KEY_SET = new Set<string>(REGISTRATION_IDENTITY_CANONICAL_FIELD_KEYS);

export function isRegistrationIdentityCanonicalFieldKey(
  key: string,
): key is RegistrationIdentityCanonicalFieldKey {
  return CANONICAL_KEY_SET.has(key);
}

/** Provider-sourced OEM suggestions must not implicitly become USER_CONFIRMED. */
export function normalizeOemProviderSuggestionEntry(
  entry: RegistrationIdentityFieldProvenanceEntry,
): RegistrationIdentityFieldProvenanceEntry {
  if (entry.confirmationStatus === 'USER_CONFIRMED' || entry.confirmationStatus === 'PROTECTED') {
    return {
      ...entry,
      confirmationStatus: 'SUGGESTED',
      confirmedAt: null,
    };
  }
  return {
    ...entry,
    confirmationStatus: 'SUGGESTED',
    confirmedAt: null,
  };
}

export function assertNoImplicitOemConfirmation(
  entry: RegistrationIdentityFieldProvenanceEntry | undefined,
): void {
  if (!entry) return;
  if (entry.confirmationStatus === 'USER_CONFIRMED' || entry.confirmationStatus === 'PROTECTED') {
    throw new Error('OEM provider suggestion must not carry USER_CONFIRMED or PROTECTED status');
  }
}
