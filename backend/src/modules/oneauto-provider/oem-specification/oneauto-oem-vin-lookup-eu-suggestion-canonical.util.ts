import { parseRegistrationIdentityProvenance } from '@modules/vehicle-onboarding/vehicle-identity-review/vehicle-identity-provenance.util';
import {
  REGISTRATION_IDENTITY_OEM_SPECIFICATION_FIELD_KEYS,
  type RegistrationIdentityOemSpecificationFieldKey,
} from '@modules/vehicle-onboarding/vehicle-identity-review/vehicle-oem-specification-provenance.registry';
import type { VehicleOemSpecificationVehicleRow } from '@modules/vehicles/vehicle-oem-specification-patch.util';
import type { OneAutoOemCanonicalFieldInput } from './oneauto-vin-lookup-oem-suggestion.types';

const OEM_COLUMN_BY_KEY: Record<
  RegistrationIdentityOemSpecificationFieldKey,
  keyof VehicleOemSpecificationVehicleRow
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

export function buildOemCanonicalFieldInputsFromVehicle(
  vehicle: VehicleOemSpecificationVehicleRow,
): Partial<Record<RegistrationIdentityOemSpecificationFieldKey, OneAutoOemCanonicalFieldInput>> {
  const provenanceDoc = parseRegistrationIdentityProvenance(vehicle.registrationIdentityProvenance);
  const out: Partial<
    Record<RegistrationIdentityOemSpecificationFieldKey, OneAutoOemCanonicalFieldInput>
  > = {};

  for (const key of REGISTRATION_IDENTITY_OEM_SPECIFICATION_FIELD_KEYS) {
    const column = OEM_COLUMN_BY_KEY[key];
    const value = vehicle[column] as string | null;
    const entry = provenanceDoc?.fields?.[key];
    out[key] = {
      value,
      confirmationStatus: entry?.confirmationStatus ?? null,
    };
  }

  return out;
}
