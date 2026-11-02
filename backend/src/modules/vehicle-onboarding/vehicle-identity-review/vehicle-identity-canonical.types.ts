import type { VehicleIdentityValueProvenance } from './vehicle-identity-review.types';
import type { RegistrationIdentityOemSpecificationFieldKey } from './vehicle-oem-specification-provenance.registry';
import {
  REGISTRATION_IDENTITY_OEM_FIELD_REGISTRY_VERSION,
  REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_LEGACY,
  REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_OEM,
} from './vehicle-oem-specification-provenance.registry';

export const REGISTRATION_IDENTITY_CANONICAL_VERSION = 1;

export type RegistrationIdentityCanonicalFieldKey =
  | 'make'
  | 'model'
  | 'year'
  | 'vin'
  | 'displacementCc'
  | 'fuelType'
  | 'nominalMotorPowerKw'
  | 'powerKind'
  | 'electrificationGrade'
  | 'hsn'
  | 'tsn'
  | 'typeVariantVersion';

/** Extended technical-spec keys stored in the same provenance envelope (P3+). */
export type RegistrationIdentityTechnicalSpecProvenanceFieldKey =
  | 'cylinderCount'
  | 'frontWeightDistributionPct'
  | 'idleRpm'
  | 'maxRpm'
  | 'brakeForceFrontPercent'
  | 'tankCapacityLiters'
  | 'serviceIntervalManufacturerKm'
  | 'serviceIntervalManufacturerMonths'
  | 'oilChangeIntervalKm'
  | 'oilChangeIntervalMonths';

export type RegistrationIdentityExtendedProvenanceFieldKey =
  | 'systemMotorPowerKw'
  | 'resolvedVariant';

export type RegistrationIdentityProvenanceFieldKey =
  | RegistrationIdentityCanonicalFieldKey
  | RegistrationIdentityTechnicalSpecProvenanceFieldKey
  | RegistrationIdentityExtendedProvenanceFieldKey
  | RegistrationIdentityOemSpecificationFieldKey;

export type RegistrationIdentityCanonicalField = {
  key: RegistrationIdentityCanonicalFieldKey;
  value: string | number | null;
  provenance: VehicleIdentityValueProvenance;
  confirmationStatus: 'USER_CONFIRMED';
  documentExtractionId: string | null;
};

export type RegistrationIdentityCanonicalIdentity = {
  version: typeof REGISTRATION_IDENTITY_CANONICAL_VERSION;
  documentExtractionId: string | null;
  fields: RegistrationIdentityCanonicalField[];
};

export type RegistrationIdentityFieldProvenanceEntry = {
  value: string | number | boolean | null;
  provenance: VehicleIdentityValueProvenance;
  confirmationStatus: 'USER_CONFIRMED' | 'SUGGESTED' | 'UNCONFIRMED' | 'PROTECTED';
  confirmedAt: string | null;
  documentExtractionId: string | null;
};

export type RegistrationIdentityProvenanceDocumentV1 = {
  version: typeof REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_LEGACY;
  updatedAt: string;
  fields: Partial<Record<RegistrationIdentityProvenanceFieldKey, RegistrationIdentityFieldProvenanceEntry>>;
};

/** Version 2 adds explicit OEM field registry version (optional upgrade; v1 remains valid). */
export type RegistrationIdentityProvenanceDocumentV2 = {
  version: typeof REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_OEM;
  updatedAt: string;
  oemFieldRegistryVersion: typeof REGISTRATION_IDENTITY_OEM_FIELD_REGISTRY_VERSION;
  fields: Partial<Record<RegistrationIdentityProvenanceFieldKey, RegistrationIdentityFieldProvenanceEntry>>;
};

export type RegistrationIdentityProvenanceDocument =
  | RegistrationIdentityProvenanceDocumentV1
  | RegistrationIdentityProvenanceDocumentV2;

/** @deprecated Use RegistrationIdentityProvenanceDocument — kept for call-site clarity. */
export type RegistrationIdentityProvenanceDocumentLegacy = RegistrationIdentityProvenanceDocumentV1;

export type VehicleIdentityAiV2PreviewResult = {
  ok: boolean;
  canonical: RegistrationIdentityCanonicalIdentity;
  aiSpecs: Record<string, string | number | boolean | null>;
  suggestedFields: Partial<
    Record<RegistrationIdentityCanonicalFieldKey | 'engineDisplacementCc' | 'systemMotorPowerKw' | 'resolvedVariant', RegistrationIdentityFieldProvenanceEntry>
  >;
  conflicts: Array<{ code: string; fieldKey: string; message: string }>;
  rejectedAiFields: string[];
  aiLiveInvoked: boolean;
};
