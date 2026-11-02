import {
  REGISTRATION_IDENTITY_OEM_FIELD_REGISTRY_VERSION,
  REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_LEGACY,
  REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_OEM,
} from './vehicle-oem-specification-provenance.registry';
import type {
  RegistrationIdentityProvenanceDocument,
  RegistrationIdentityProvenanceDocumentV1,
  RegistrationIdentityProvenanceDocumentV2,
} from './vehicle-identity-canonical.types';

export function registrationIdentityProvenanceDocumentVersion(
  doc: RegistrationIdentityProvenanceDocument | null,
): number | null {
  return doc?.version ?? null;
}

export function isRegistrationIdentityProvenanceDocumentV2(
  doc: RegistrationIdentityProvenanceDocument,
): doc is RegistrationIdentityProvenanceDocumentV2 {
  return doc.version === REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_OEM;
}

/** Upgrade v1 → v2 in memory only (does not mutate JSONB on disk until a future save). */
export function upgradeRegistrationIdentityProvenanceDocumentToV2(
  doc: RegistrationIdentityProvenanceDocumentV1,
): RegistrationIdentityProvenanceDocumentV2 {
  return {
    version: REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_OEM,
    updatedAt: doc.updatedAt,
    oemFieldRegistryVersion: REGISTRATION_IDENTITY_OEM_FIELD_REGISTRY_VERSION,
    fields: { ...doc.fields },
  };
}

export function buildEmptyRegistrationIdentityProvenanceDocumentV2(
  updatedAt: string,
): RegistrationIdentityProvenanceDocumentV2 {
  return {
    version: REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_OEM,
    updatedAt,
    oemFieldRegistryVersion: REGISTRATION_IDENTITY_OEM_FIELD_REGISTRY_VERSION,
    fields: {},
  };
}

export function preserveRegistrationIdentityProvenanceDocumentVersion(
  existing: RegistrationIdentityProvenanceDocument | null,
  fields: RegistrationIdentityProvenanceDocument['fields'],
  updatedAt: string,
): RegistrationIdentityProvenanceDocument {
  if (existing && isRegistrationIdentityProvenanceDocumentV2(existing)) {
    return {
      version: REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_OEM,
      updatedAt,
      oemFieldRegistryVersion: existing.oemFieldRegistryVersion,
      fields,
    };
  }
  return {
    version: REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_LEGACY,
    updatedAt,
    fields,
  };
}
