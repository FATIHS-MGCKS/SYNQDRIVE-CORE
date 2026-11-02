import type { Ds4Layer2MotionPhysicsContextV1 } from './ds4-layer2-p3-motion-physics-context.v1.contract';
import { resolveDs4Layer2MotionPhysicsContextV1 } from './ds4-layer2-p3-motion-physics-context.resolver.v1';
import type {
  Ds4Layer2MotionPhysicsContextReferenceSnapshotV1,
  Ds4Layer2MotionPhysicsContextVehicleSnapshotV1,
} from './ds4-layer2-p3-motion-physics-context.v1.contract';
import type { Ds4Layer2P3cTemporalReferenceEvidenceV1 } from './ds4-layer2-p3c-physics-diagnostics.v1.contract';

const KMH100_TO_MPS = 100 / 3.6;

export function computeAverageAccelReferenceMps2(accel0To100S: number | null): number | null {
  if (accel0To100S == null || !Number.isFinite(accel0To100S) || accel0To100S <= 0) {
    return null;
  }
  return KMH100_TO_MPS / accel0To100S;
}

export function evaluateTemporalReferenceEvidenceV1(input: {
  tripStartUtc: Date;
  tripEndUtc: Date;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}): Ds4Layer2P3cTemporalReferenceEvidenceV1 {
  if (input.effectiveFrom.getTime() > input.tripEndUtc.getTime()) {
    return 'REFERENCE_POSTDATES_TRIP';
  }
  if (input.effectiveTo != null && input.effectiveTo.getTime() < input.tripStartUtc.getTime()) {
    return 'REFERENCE_EXPIRED_BEFORE_TRIP';
  }
  if (input.effectiveFrom.getTime() > input.tripStartUtc.getTime()) {
    return 'TEMPORAL_AMBIGUOUS';
  }
  return 'EFFECTIVE_AT_TRIP_END';
}

export function physicsReferenceAllowsDiagnostics(
  applicability: Ds4Layer2MotionPhysicsContextV1['applicability'],
  temporal: Ds4Layer2P3cTemporalReferenceEvidenceV1,
): boolean {
  if (temporal !== 'EFFECTIVE_AT_TRIP_END') return false;
  return (
    applicability === 'AVAILABLE_VERIFIED' ||
    applicability === 'AVAILABLE_CONFIRMED_UNVERIFIED' ||
    applicability === 'ESTIMATED_ONLY'
  );
}

export async function resolveMotionPhysicsForTripWindowV1(input: {
  organizationId: string;
  vehicleId: string;
  tripStartUtc: Date;
  tripEndUtc: Date;
  vehicle: Ds4Layer2MotionPhysicsContextVehicleSnapshotV1;
  reference: Ds4Layer2MotionPhysicsContextReferenceSnapshotV1;
}): Promise<{
  atTripEnd: Ds4Layer2MotionPhysicsContextV1;
  atNow: Ds4Layer2MotionPhysicsContextV1;
  temporalEvidence: Ds4Layer2P3cTemporalReferenceEvidenceV1;
}> {
  const deps = {
    loadVehicle: async () => input.vehicle,
    findActiveReference: async () => input.reference,
  };

  const atTripEnd = await resolveDs4Layer2MotionPhysicsContextV1(deps, {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    asOfUtc: input.tripEndUtc,
  });

  const atNow = await resolveDs4Layer2MotionPhysicsContextV1(deps, {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
  });

  const temporalEvidence = evaluateTemporalReferenceEvidenceV1({
    tripStartUtc: input.tripStartUtc,
    tripEndUtc: input.tripEndUtc,
    effectiveFrom: input.reference.effectiveFrom,
    effectiveTo: input.reference.effectiveTo,
  });

  return { atTripEnd, atNow, temporalEvidence };
}
