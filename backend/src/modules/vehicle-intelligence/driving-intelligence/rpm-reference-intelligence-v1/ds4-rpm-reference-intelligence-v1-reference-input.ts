import { vehicleRpmPairIsConsistent } from '../../../vehicles/vehicle-technical-spec.util';
import type {
  Ds4RpmReferenceIntelligenceV1ComputeInput,
  Ds4RpmReferenceSpecProvenanceClass,
} from './ds4-rpm-reference-intelligence-v1.contract';
import type { VsiIceRpmApplicability } from '../../vehicle-signal-intelligence/vsi-profile-cadence.types';

export type Ds4RpmReferenceIntelligenceV1VehicleSpecFieldProvenance = {
  category?: string | null;
  provenance?: string | null;
};

function mapProvenanceClass(input: {
  rpmValue: number | null | undefined;
  fieldProvenance?: Ds4RpmReferenceIntelligenceV1VehicleSpecFieldProvenance | null;
}): Ds4RpmReferenceSpecProvenanceClass {
  if (input.rpmValue == null) return 'MISSING';
  const category = String(
    input.fieldProvenance?.category ?? input.fieldProvenance?.provenance ?? '',
  ).trim();
  if (category === 'USER_CONFIRMED') return 'USER_CONFIRMED';
  if (category === 'AI_ESTIMATED') return 'AI_ESTIMATED';
  if (category === 'KNOWLEDGE_ONLY') return 'KNOWLEDGE_ONLY';
  if (!category) return 'UNKNOWN';
  return 'UNKNOWN';
}

/**
 * Read-only vehicle specification snapshot for RPM reference intelligence tests and future callers.
 * Does not read the database — caller supplies vehicle row fields.
 */
export function buildDs4RpmReferenceIntelligenceV1ReferenceBlock(input: {
  idleRpm: number | null | undefined;
  maxRpm: number | null | undefined;
  idleRpmProvenance?: Ds4RpmReferenceIntelligenceV1VehicleSpecFieldProvenance | null;
  maxRpmProvenance?: Ds4RpmReferenceIntelligenceV1VehicleSpecFieldProvenance | null;
  iceRpmApplicability: VsiIceRpmApplicability;
}): Ds4RpmReferenceIntelligenceV1ComputeInput['reference'] {
  const idleRpm = input.idleRpm ?? null;
  const maxRpm = input.maxRpm ?? null;
  return {
    idleRpm,
    maxRpm,
    idleRpmProvenance: mapProvenanceClass({
      rpmValue: idleRpm,
      fieldProvenance: input.idleRpmProvenance,
    }),
    maxRpmProvenance: mapProvenanceClass({
      rpmValue: maxRpm,
      fieldProvenance: input.maxRpmProvenance,
    }),
    iceRpmApplicability: input.iceRpmApplicability,
  };
}

export function referencePairIsConsistent(idleRpm: number | null, maxRpm: number | null): boolean {
  return vehicleRpmPairIsConsistent(idleRpm, maxRpm);
}
