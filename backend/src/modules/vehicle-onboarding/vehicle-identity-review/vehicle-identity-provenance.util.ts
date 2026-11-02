import type {
  RegistrationIdentityCanonicalFieldKey,
  RegistrationIdentityCanonicalIdentity,
  RegistrationIdentityFieldProvenanceEntry,
  RegistrationIdentityProvenanceDocument,
  RegistrationIdentityProvenanceDocumentV1,
  RegistrationIdentityProvenanceDocumentV2,
} from './vehicle-identity-canonical.types';
import {
  getProtectedProvenanceEntry,
  getProtectedProvenanceValue,
  normalizeProvenanceStorageKey,
  valuesEqual,
} from './vehicle-identity-field-mapping.util';
import {
  REGISTRATION_IDENTITY_OEM_FIELD_REGISTRY_VERSION,
  REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_LEGACY,
  REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_OEM,
  isRegistrationIdentityOemSpecificationFieldKey,
} from './vehicle-oem-specification-provenance.registry';
import {
  assertNoImplicitOemConfirmation,
  normalizeOemProviderSuggestionEntry,
} from './vehicle-oem-specification-provenance.guard';
import { preserveRegistrationIdentityProvenanceDocumentVersion } from './vehicle-oem-specification-provenance.versioning';

function isProvenanceDocumentShape(raw: Record<string, unknown>): boolean {
  if (!raw.fields || typeof raw.fields !== 'object') return false;
  if (raw.version === REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_LEGACY) return true;
  if (raw.version === REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_OEM) {
    return raw.oemFieldRegistryVersion === REGISTRATION_IDENTITY_OEM_FIELD_REGISTRY_VERSION;
  }
  return false;
}

export function parseRegistrationIdentityProvenance(
  raw: unknown,
): RegistrationIdentityProvenanceDocument | null {
  if (!raw || typeof raw !== 'object') return null;
  const doc = raw as Record<string, unknown>;
  if (!isProvenanceDocumentShape(doc)) return null;
  if (typeof doc.updatedAt !== 'string') return null;
  return doc as RegistrationIdentityProvenanceDocument;
}

export function isProtectedProvenanceEntry(
  entry: RegistrationIdentityFieldProvenanceEntry | undefined,
): boolean {
  if (!entry) return false;
  return entry.confirmationStatus === 'USER_CONFIRMED' || entry.confirmationStatus === 'PROTECTED';
}

export function mergeProvenanceOnSave(input: {
  existing: RegistrationIdentityProvenanceDocument | null;
  canonical: RegistrationIdentityCanonicalIdentity;
  acceptedSuggestions?: Partial<Record<string, RegistrationIdentityFieldProvenanceEntry>>;
  explicitlyConfirmedCanonicalKeys?: Set<RegistrationIdentityCanonicalFieldKey>;
}): RegistrationIdentityProvenanceDocument {
  const now = new Date().toISOString();
  const fields: RegistrationIdentityProvenanceDocument['fields'] = {
    ...(input.existing?.fields ?? {}),
  };
  const explicit = input.explicitlyConfirmedCanonicalKeys ?? new Set();

  for (const field of input.canonical.fields) {
    const prev = getProtectedProvenanceValue(
      input.existing
        ? { ...input.existing, fields }
        : { version: 1, updatedAt: now, fields },
      field.key,
    );
    if (prev && !valuesEqual(prev.value, field.value) && !explicit.has(field.key)) {
      continue;
    }
    fields[field.key] = {
      value: field.value,
      provenance: field.provenance,
      confirmationStatus: 'USER_CONFIRMED',
      confirmedAt: now,
      documentExtractionId: field.documentExtractionId,
    };
  }

  if (input.acceptedSuggestions) {
    const extended = fields as Record<string, RegistrationIdentityFieldProvenanceEntry>;
    for (const [key, entry] of Object.entries(input.acceptedSuggestions)) {
      if (!entry) continue;
      const canonicalKey = normalizeProvenanceStorageKey(key);

      if (isRegistrationIdentityOemSpecificationFieldKey(canonicalKey)) {
        assertNoImplicitOemConfirmation(entry);
        const normalizedEntry = normalizeOemProviderSuggestionEntry(entry);
        const prev = getProtectedProvenanceEntry(
          input.existing ? { ...input.existing, fields } : null,
          canonicalKey,
        );
        if (prev && !valuesEqual(prev.value, normalizedEntry.value)) {
          continue;
        }
        extended[canonicalKey] = normalizedEntry;
        if (key !== canonicalKey && extended[key]) {
          delete extended[key];
        }
        continue;
      }

      const protectedKey =
        canonicalKey === 'systemMotorPowerKw' || canonicalKey === 'resolvedVariant'
          ? null
          : (canonicalKey as RegistrationIdentityCanonicalFieldKey);
      if (protectedKey) {
        const prev = getProtectedProvenanceValue(
          input.existing
            ? { ...input.existing, fields }
            : { version: 1, updatedAt: now, fields },
          protectedKey,
        );
        if (prev && !valuesEqual(prev.value, entry.value)) {
          continue;
        }
      }
      extended[canonicalKey] = {
        ...entry,
        confirmationStatus: entry.confirmationStatus ?? 'SUGGESTED',
      };
      if (key !== canonicalKey && extended[key]) {
        delete extended[key];
      }
    }
  }

  return preserveRegistrationIdentityProvenanceDocumentVersion(input.existing, fields, now);
}

export type { RegistrationIdentityProvenanceDocumentV1, RegistrationIdentityProvenanceDocumentV2 };
