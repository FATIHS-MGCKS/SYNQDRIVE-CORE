import type { FuelType } from '@prisma/client';
import type {
  RegistrationIdentityCanonicalFieldKey,
  RegistrationIdentityCanonicalIdentity,
  RegistrationIdentityFieldProvenanceEntry,
  RegistrationIdentityProvenanceDocument,
} from './vehicle-identity-canonical.types';
import {
  getProtectedProvenanceValue,
  normalizeProvenanceStorageKey,
  readVehicleScalar,
  vehicleScalarKeyForCanonical,
  valuesEqual,
  type VehicleScalarSnapshot,
} from './vehicle-identity-field-mapping.util';
import { isRegistrationIdentityCanonicalFieldKey } from './vehicle-oem-specification-provenance.guard';

export type IdentityPersistenceViolation = {
  code: string;
  fieldKey: string;
  message: string;
};

export function collectProtectedIdentityViolations(input: {
  existing: RegistrationIdentityProvenanceDocument | null;
  vehicle: VehicleScalarSnapshot;
  canonical: RegistrationIdentityCanonicalIdentity;
  acceptedSuggestions: Partial<Record<string, RegistrationIdentityFieldProvenanceEntry>>;
  explicitlyConfirmedCanonicalKeys: Set<RegistrationIdentityCanonicalFieldKey>;
}): IdentityPersistenceViolation[] {
  const violations: IdentityPersistenceViolation[] = [];

  const assertChangeAllowed = (
    canonicalKey: RegistrationIdentityCanonicalFieldKey,
    requestedValue: string | number | boolean | null,
  ) => {
    const protectedEntry = getProtectedProvenanceValue(input.existing, canonicalKey);
    if (!protectedEntry) return;
    if (valuesEqual(protectedEntry.value, requestedValue)) return;
    if (input.explicitlyConfirmedCanonicalKeys.has(canonicalKey)) return;
    violations.push({
      code: 'PROTECTED_FIELD_CHANGE_DENIED',
      fieldKey: canonicalKey,
      message: `Protected USER_CONFIRMED value for ${canonicalKey} cannot change without explicit field confirmation in this save.`,
    });
  };

  for (const field of input.canonical.fields) {
    assertChangeAllowed(field.key, field.value);
  }

  for (const [rawKey, entry] of Object.entries(input.acceptedSuggestions)) {
    if (!entry) continue;
    const canonicalKey = normalizeProvenanceStorageKey(rawKey);
    if (canonicalKey === 'systemMotorPowerKw' || canonicalKey === 'resolvedVariant') {
      continue;
    }
    if (!isRegistrationIdentityCanonicalFieldKey(canonicalKey)) {
      continue;
    }
    assertChangeAllowed(canonicalKey, entry.value);
  }

  for (const field of input.canonical.fields) {
    const scalarKey = vehicleScalarKeyForCanonical(field.key);
    if (!scalarKey) continue;
    const protectedEntry = getProtectedProvenanceValue(input.existing, field.key);
    if (!protectedEntry) continue;
    const vehicleValue = readVehicleScalar(input.vehicle, scalarKey);
    if (
      !valuesEqual(protectedEntry.value, field.value) &&
      !input.explicitlyConfirmedCanonicalKeys.has(field.key)
    ) {
      violations.push({
        code: 'PROTECTED_VEHICLE_SCALAR_DENIED',
        fieldKey: field.key,
        message: `Vehicle column ${scalarKey} is protected by confirmed provenance and cannot change without explicit confirmation.`,
      });
    } else if (
      valuesEqual(protectedEntry.value, field.value) &&
      !valuesEqual(vehicleValue, field.value) &&
      !input.explicitlyConfirmedCanonicalKeys.has(field.key)
    ) {
      violations.push({
        code: 'PROVENANCE_VEHICLE_SCALAR_DIVERGENCE',
        fieldKey: field.key,
        message: `Vehicle column ${scalarKey} diverges from protected provenance; reload and confirm explicitly to repair.`,
      });
    }
  }

  return violations;
}

export function normalizeAcceptedSuggestions(
  suggested: Partial<Record<string, RegistrationIdentityFieldProvenanceEntry>>,
  acceptKeys: Set<string>,
): Partial<Record<string, RegistrationIdentityFieldProvenanceEntry>> {
  const out: Partial<Record<string, RegistrationIdentityFieldProvenanceEntry>> = {};
  for (const [key, entry] of Object.entries(suggested)) {
    if (!acceptKeys.has(key) || !entry) continue;
    const canonicalKey = normalizeProvenanceStorageKey(key);
    out[canonicalKey] = {
      ...entry,
      confirmationStatus: entry.confirmationStatus ?? 'SUGGESTED',
    };
  }
  return out;
}

export function buildVehicleScalarPatch(input: {
  canonical: RegistrationIdentityCanonicalIdentity;
  mapFuelType: (raw: string | null) => FuelType | null;
}): Partial<{
  make: string;
  model: string;
  year: number;
  vin: string | null;
  fuelType: FuelType;
}> {
  const byCanonical = new Map(input.canonical.fields.map((f) => [f.key, f.value]));
  const patch: Partial<{
    make: string;
    model: string;
    year: number;
    vin: string | null;
    fuelType: FuelType;
  }> = {};

  const make = byCanonical.get('make');
  const model = byCanonical.get('model');
  const year = byCanonical.get('year');
  const vin = byCanonical.get('vin');
  const fuel = byCanonical.get('fuelType');

  if (typeof make === 'string' && make.trim()) patch.make = make.trim();
  if (typeof model === 'string' && model.trim()) patch.model = model.trim();
  if (typeof year === 'number' && Number.isFinite(year)) patch.year = year;
  if (vin === null || typeof vin === 'string') patch.vin = vin === '' ? null : vin;
  const mappedFuel = input.mapFuelType(typeof fuel === 'string' ? fuel : null);
  if (mappedFuel) patch.fuelType = mappedFuel;

  return patch;
}

export function assertProvenanceMatchesVehicleScalars(input: {
  provenanceDoc: RegistrationIdentityProvenanceDocument;
  vehiclePatch: Partial<{
    make: string;
    model: string;
    year: number;
    vin: string | null;
    fuelType: FuelType;
  }>;
  mapFuelType: (raw: string | null) => FuelType | null;
}): void {
  for (const [key, scalarKey] of [
    ['make', 'make'],
    ['model', 'model'],
    ['year', 'year'],
    ['vin', 'vin'],
    ['fuelType', 'fuelType'],
  ] as const) {
    const canonicalKey = key as RegistrationIdentityCanonicalFieldKey;
    const entry = input.provenanceDoc.fields[canonicalKey];
    const patchVal = input.vehiclePatch[scalarKey];
    if (!entry || entry.confirmationStatus !== 'USER_CONFIRMED' || patchVal === undefined) continue;
    if (canonicalKey === 'fuelType') {
      const mapped = input.mapFuelType(String(entry.value));
      if (mapped && mapped !== patchVal) {
        throw new Error(`Provenance fuelType does not match vehicle patch`);
      }
      continue;
    }
    if (!valuesEqual(entry.value, patchVal)) {
      throw new Error(`Provenance ${canonicalKey} does not match vehicle patch`);
    }
  }
}
