/**
 * OEM specification identity — Vehicle columns + registrationIdentityProvenance field registry.
 * Provider evidence (One Auto jobs / attestation capture) stays separate from these columns until
 * an explicit Master confirm path writes them (future PR).
 */

export const REGISTRATION_IDENTITY_OEM_FIELD_REGISTRY_VERSION = 1 as const;

export const REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_LEGACY = 1 as const;
export const REGISTRATION_IDENTITY_PROVENANCE_DOCUMENT_VERSION_OEM = 2 as const;

/** Max lengths for future API validation (Prisma columns are unbounded TEXT). */
export const OEM_SPECIFICATION_CODE_MAX_LENGTH = 64;
export const OEM_SPECIFICATION_DESC_MAX_LENGTH = 512;

export const REGISTRATION_IDENTITY_OEM_SPECIFICATION_FIELD_KEYS = [
  'oemEngineCode',
  'oemEngineDesc',
  'oemTransmissionCode',
  'oemTransmissionDesc',
  'exteriorColorDesc',
  'oemExteriorColorCode',
  'interiorTrimDesc',
  'oemInteriorTrimCode',
  'oemModelRangeDesc',
  'oemDerivativeDesc',
] as const;

export type RegistrationIdentityOemSpecificationFieldKey =
  (typeof REGISTRATION_IDENTITY_OEM_SPECIFICATION_FIELD_KEYS)[number];

export const VEHICLE_OEM_SPECIFICATION_COLUMN_BY_PROVENANCE_KEY: Record<
  RegistrationIdentityOemSpecificationFieldKey,
  RegistrationIdentityOemSpecificationFieldKey
> = {
  oemEngineCode: 'oemEngineCode',
  oemEngineDesc: 'oemEngineDesc',
  oemTransmissionCode: 'oemTransmissionCode',
  oemTransmissionDesc: 'oemTransmissionDesc',
  exteriorColorDesc: 'exteriorColorDesc',
  oemExteriorColorCode: 'oemExteriorColorCode',
  interiorTrimDesc: 'interiorTrimDesc',
  oemInteriorTrimCode: 'oemInteriorTrimCode',
  oemModelRangeDesc: 'oemModelRangeDesc',
  oemDerivativeDesc: 'oemDerivativeDesc',
};

const OEM_KEY_SET = new Set<string>(REGISTRATION_IDENTITY_OEM_SPECIFICATION_FIELD_KEYS);

export function isRegistrationIdentityOemSpecificationFieldKey(
  key: string,
): key is RegistrationIdentityOemSpecificationFieldKey {
  return OEM_KEY_SET.has(key);
}

export function oemSpecificationFieldMaxLength(
  key: RegistrationIdentityOemSpecificationFieldKey,
): number {
  if (key.endsWith('Desc')) return OEM_SPECIFICATION_DESC_MAX_LENGTH;
  return OEM_SPECIFICATION_CODE_MAX_LENGTH;
}
