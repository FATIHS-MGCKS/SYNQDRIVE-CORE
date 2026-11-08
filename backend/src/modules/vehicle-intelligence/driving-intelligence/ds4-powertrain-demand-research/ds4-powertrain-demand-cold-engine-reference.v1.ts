import type { Ds4PowertrainDemandEvidenceOrigin } from './ds4-powertrain-demand-research.contract.v1';
import type { Ds4RpmReferenceIntelligenceV1ComputeInput } from '../rpm-reference-intelligence-v1/ds4-rpm-reference-intelligence-v1.contract';
import { referencePairIsConsistent } from '../rpm-reference-intelligence-v1/ds4-rpm-reference-intelligence-v1-reference-input';

export const DS4_COLD_ENGINE_MAX_RPM_SANITY_UPPER = 12_000;
export const DS4_COLD_ENGINE_MAX_RPM_SANITY_LOWER = 500;

export type Ds4ColdEngineHighRpmReferenceVerdictV1 = {
  admitted: boolean;
  admittedMaxRpm: number | null;
  reasonCodes: string[];
  referenceTrustTier: 'SYNTHETIC_FIXTURE_ONLY' | 'DOWNGRADED_ESTIMATE' | 'UNAVAILABLE';
};

function referenceFieldsStructurallyAdmissible(
  reference: Ds4RpmReferenceIntelligenceV1ComputeInput['reference'],
  pairConsistent: boolean,
): boolean {
  if (reference.idleRpm == null || reference.maxRpm == null || !pairConsistent) return false;
  if (
    reference.idleRpmProvenance !== 'USER_CONFIRMED' ||
    reference.maxRpmProvenance !== 'USER_CONFIRMED'
  ) {
    return false;
  }
  return reference.iceRpmApplicability === 'APPLICABLE';
}

export function evaluateColdEngineHighRpmReferenceAdmission(input: {
  organizationId: string;
  vehicleId: string;
  vehicleRpmReferenceBinding: { organizationId: string; vehicleId: string } | null;
  reference: Ds4RpmReferenceIntelligenceV1ComputeInput['reference'];
  evidenceOrigin: Ds4PowertrainDemandEvidenceOrigin;
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

  if (input.reference.iceRpmApplicability !== 'APPLICABLE') {
    reasonCodes.push('ICE_RPM_NOT_APPLICABLE');
  }

  const structurallyOk = referenceFieldsStructurallyAdmissible(input.reference, pairConsistent);
  if (!structurallyOk) {
    reasonCodes.push('REFERENCE_PROVENANCE_DOWNGRADED');
  }

  if (input.evidenceOrigin !== 'SYNTHETIC_FIXTURE') {
    reasonCodes.push('REFERENCE_TRUST_REQUIRES_SYNTHETIC_FIXTURE');
  }

  const admitted =
    input.evidenceOrigin === 'SYNTHETIC_FIXTURE' &&
    reasonCodes.length === 0 &&
    structurallyOk &&
    maxRpm != null &&
    Number.isFinite(maxRpm);

  const referenceTrustTier: Ds4ColdEngineHighRpmReferenceVerdictV1['referenceTrustTier'] = admitted
    ? 'SYNTHETIC_FIXTURE_ONLY'
    : structurallyOk && input.evidenceOrigin !== 'SYNTHETIC_FIXTURE'
      ? 'DOWNGRADED_ESTIMATE'
      : 'UNAVAILABLE';

  return {
    admitted,
    admittedMaxRpm: admitted ? maxRpm : null,
    reasonCodes,
    referenceTrustTier,
  };
}
