import { parseRegistrationIdentityProvenance } from '@modules/vehicle-onboarding/vehicle-identity-review/vehicle-identity-provenance.util';
import type { RegistrationIdentityFieldProvenanceEntry } from '@modules/vehicle-onboarding/vehicle-identity-review/vehicle-identity-canonical.types';
import type { VsiIceRpmApplicability } from '../../vehicle-signal-intelligence/vsi-profile-cadence.types';
import {
  buildDs4RpmReferenceIntelligenceV1ReferenceBlock,
  type Ds4RpmReferenceIntelligenceV1VehicleSpecFieldProvenance,
} from './ds4-rpm-reference-intelligence-v1-reference-input';
import type { Ds4RpmReferenceIntelligenceV1ComputeInput } from './ds4-rpm-reference-intelligence-v1.contract';

export type Ds4RpmReferenceIntelligenceV1VehicleReferenceRow = {
  organizationId: string;
  idleRpm: number | null;
  maxRpm: number | null;
  registrationIdentityProvenance: unknown;
};

function decimalToNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    const n = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function mapRegistrationFieldProvenanceForRpmReference(
  entry: RegistrationIdentityFieldProvenanceEntry | undefined,
): Ds4RpmReferenceIntelligenceV1VehicleSpecFieldProvenance | null {
  if (!entry) return null;
  if (entry.confirmationStatus === 'USER_CONFIRMED' || entry.confirmationStatus === 'PROTECTED') {
    return { category: 'USER_CONFIRMED', provenance: entry.provenance ?? 'USER_CONFIRMED' };
  }
  const provenance = entry.provenance ?? entry.confirmationStatus ?? null;
  return provenance != null ? { category: String(provenance), provenance: entry.provenance ?? null } : null;
}

export function extractVehicleRpmReferenceFieldProvenance(
  rawProvenance: unknown,
  field: 'idleRpm' | 'maxRpm',
): Ds4RpmReferenceIntelligenceV1VehicleSpecFieldProvenance | null {
  const doc = parseRegistrationIdentityProvenance(rawProvenance);
  if (!doc?.fields || typeof doc.fields !== 'object') return null;
  const entry = (doc.fields as Record<string, RegistrationIdentityFieldProvenanceEntry>)[field];
  return mapRegistrationFieldProvenanceForRpmReference(entry);
}

/**
 * Shared read-only vehicle reference snapshot for RPM Reference Intelligence (Phase 5B P1 reader).
 * Caller supplies vehicle row fields — no database access.
 */
export function buildDs4RpmReferenceIntelligenceV1ReferenceFromVehicleRow(input: {
  vehicle: Ds4RpmReferenceIntelligenceV1VehicleReferenceRow;
  iceRpmApplicability: VsiIceRpmApplicability;
}): Ds4RpmReferenceIntelligenceV1ComputeInput['reference'] {
  const idleRpm = decimalToNumber(input.vehicle.idleRpm);
  const maxRpm = decimalToNumber(input.vehicle.maxRpm);
  return buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
    idleRpm,
    maxRpm,
    idleRpmProvenance: extractVehicleRpmReferenceFieldProvenance(
      input.vehicle.registrationIdentityProvenance,
      'idleRpm',
    ),
    maxRpmProvenance: extractVehicleRpmReferenceFieldProvenance(
      input.vehicle.registrationIdentityProvenance,
      'maxRpm',
    ),
    iceRpmApplicability: input.iceRpmApplicability,
  });
}
