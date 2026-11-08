import type { Ds4RpmReferenceIntelligenceV1ComputeInput } from '../rpm-reference-intelligence-v1/ds4-rpm-reference-intelligence-v1.contract';
import { referencePairIsConsistent } from '../rpm-reference-intelligence-v1/ds4-rpm-reference-intelligence-v1-reference-input';

export const DS4_COLD_ENGINE_MAX_RPM_SANITY_UPPER = 12_000;
export const DS4_COLD_ENGINE_MAX_RPM_SANITY_LOWER = 500;

export type Ds4ColdEngineHighRpmReferenceVerdictV1 = {
  admitted: boolean;
  admittedMaxRpm: number | null;
  reasonCodes: string[];
  referenceTrustTier: 'OEM_USER_CONFIRMED' | 'DOWNGRADED_ESTIMATE' | 'UNAVAILABLE';
};

function resolveTrustTier(
  reference: Ds4RpmReferenceIntelligenceV1ComputeInput['reference'],
  pairConsistent: boolean,
): Ds4ColdEngineHighRpmReferenceVerdictV1['referenceTrustTier'] {
  if (reference.idleRpm == null || reference.maxRpm == null || !pairConsistent) {
    return 'UNAVAILABLE';
  }
  if (
    reference.idleRpmProvenance === 'USER_CONFIRMED' &&
    reference.maxRpmProvenance === 'USER_CONFIRMED'
  ) {
    return 'OEM_USER_CONFIRMED';
  }
  if (reference.idleRpmProvenance === 'MISSING' || reference.maxRpmProvenance === 'MISSING') {
    return 'UNAVAILABLE';
  }
  return 'DOWNGRADED_ESTIMATE';
}

export function evaluateColdEngineHighRpmReferenceAdmission(input: {
  organizationId: string;
  vehicleId: string;
  vehicleRpmReferenceBinding: { organizationId: string; vehicleId: string } | null;
  reference: Ds4RpmReferenceIntelligenceV1ComputeInput['reference'];
}): Ds4ColdEngineHighRpmReferenceVerdictV1 {
  const reasonCodes: string[] = [];
  const binding = input.vehicleRpmReferenceBinding;
  if (
    binding == null ||
    binding.organizationId !== input.organizationId ||
    binding.vehicleId !== input.vehicleId
  ) {
    reasonCodes.push('VEHICLE_REFERENCE_BINDING_MISMATCH');
  }

  const { idleRpm, maxRpm } = input.reference;
  if (idleRpm == null || maxRpm == null) {
    reasonCodes.push('REFERENCE_SPEC_UNAVAILABLE');
  }
  if (!Number.isFinite(idleRpm ?? Number.NaN) || !Number.isFinite(maxRpm ?? Number.NaN)) {
    reasonCodes.push('REFERENCE_SPEC_UNAVAILABLE');
  }
  if (
    idleRpm != null &&
    maxRpm != null &&
    (maxRpm <= idleRpm ||
      maxRpm < DS4_COLD_ENGINE_MAX_RPM_SANITY_LOWER ||
      maxRpm > DS4_COLD_ENGINE_MAX_RPM_SANITY_UPPER)
  ) {
    reasonCodes.push('REFERENCE_PAIR_INCONSISTENT');
  }

  const pairConsistent = referencePairIsConsistent(idleRpm, maxRpm);
  if (!pairConsistent) {
    reasonCodes.push('REFERENCE_PAIR_INCONSISTENT');
  }

  const referenceTrustTier = resolveTrustTier(input.reference, pairConsistent);
  if (referenceTrustTier !== 'OEM_USER_CONFIRMED') {
    reasonCodes.push('REFERENCE_PROVENANCE_DOWNGRADED');
  }
  if (input.reference.iceRpmApplicability !== 'APPLICABLE') {
    reasonCodes.push('ICE_RPM_NOT_APPLICABLE');
  }

  const admitted =
    reasonCodes.length === 0 &&
    referenceTrustTier === 'OEM_USER_CONFIRMED' &&
    maxRpm != null &&
    Number.isFinite(maxRpm);

  return {
    admitted,
    admittedMaxRpm: admitted ? maxRpm : null,
    reasonCodes,
    referenceTrustTier,
  };
}
