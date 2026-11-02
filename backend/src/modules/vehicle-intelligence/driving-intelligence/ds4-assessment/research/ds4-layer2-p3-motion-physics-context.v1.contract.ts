import type {
  MotionPhysicsEvidenceTier,
  MotionPhysicsReferenceSource,
} from '@prisma/client';
import type {
  MotionPhysicsIdentityFingerprint,
  MotionPhysicsPolicyReasonCode,
} from '@modules/vehicle-intelligence/motion-physics-reference/motion-physics-reference.domain';

export const DS4_LAYER2_P3_MOTION_PHYSICS_CONTEXT_SCHEMA_VERSION_V1 =
  'DS4_LAYER2_P3_MOTION_PHYSICS_CONTEXT_V1';

export const DS4_LAYER2_P3_MOTION_PHYSICS_RESOLVER_VERSION_V1 =
  'DS4_LAYER2_P3_MOTION_PHYSICS_RESOLVER_V1';

/**
 * Research-only applicability for Layer-2 offline vehicle-physics diagnostics.
 * Not persisted on VehicleMotionPhysicsReference and not used in admission/eligibility.
 */
export type Ds4Layer2MotionPhysicsApplicabilityV1 =
  | 'AVAILABLE_VERIFIED'
  | 'AVAILABLE_CONFIRMED_UNVERIFIED'
  | 'ESTIMATED_ONLY'
  | 'MISSING'
  | 'IDENTITY_MISMATCH'
  | 'AMBIGUOUS'
  | 'NOT_ELIGIBLE';

/** Extends motion-physics policy codes with P3 research semantics (offline artifacts only). */
export type Ds4Layer2MotionPhysicsLimitationReasonV1 =
  | MotionPhysicsPolicyReasonCode
  | 'REFERENCE_NOT_EFFECTIVE_AT_AS_OF'
  | 'REFERENCE_INTEGRITY_INACTIVE_OR_SUPERSEDED'
  | 'VERIFIED_TIER_WITHOUT_VERIFICATION_EVIDENCE'
  | 'ENGINE_RATED_POWER_NOT_SYSTEM_POWER'
  | 'NO_ACTIVE_MOTION_PHYSICS_REFERENCE';

export type Ds4Layer2MotionPhysicsContextResolverInputV1 = {
  organizationId: string;
  vehicleId: string;
  /** Evaluation instant for effectiveFrom/effectiveTo; defaults to resolver clock when omitted. */
  asOfUtc?: Date;
};

export type Ds4Layer2MotionPhysicsContextVehicleSnapshotV1 = {
  id: string;
  organizationId: string;
  vin: string | null;
  make: string;
  model: string;
  year: number;
};

export type Ds4Layer2MotionPhysicsContextReferenceSnapshotV1 = {
  id: string;
  organizationId: string;
  vehicleId: string;
  identityFingerprintJson: unknown;
  curbMassKg: number | null;
  systemMotorPowerKw: number | null;
  systemPowerDefinition: string | null;
  accel0To100S: number | null;
  evidenceTier: MotionPhysicsEvidenceTier;
  source: MotionPhysicsReferenceSource;
  verifiedAt: Date | null;
  verifiedByUserId: string | null;
  documentExtractionId: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isActive: boolean;
  supersededById: string | null;
  variantAssumption: string | null;
};

export type Ds4Layer2MotionPhysicsContextV1 = {
  schemaVersion: typeof DS4_LAYER2_P3_MOTION_PHYSICS_CONTEXT_SCHEMA_VERSION_V1;
  resolverVersion: typeof DS4_LAYER2_P3_MOTION_PHYSICS_RESOLVER_VERSION_V1;
  organizationId: string;
  vehicleId: string;
  motionReferenceId: string | null;
  identityFingerprint: MotionPhysicsIdentityFingerprint | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  curbMassKg: number | null;
  systemMotorPowerKw: number | null;
  systemPowerDefinition: string | null;
  accel0To100S: number | null;
  evidenceTier: MotionPhysicsEvidenceTier | null;
  source: MotionPhysicsReferenceSource | null;
  verifiedAt: string | null;
  applicability: Ds4Layer2MotionPhysicsApplicabilityV1;
  limitationReasons: Ds4Layer2MotionPhysicsLimitationReasonV1[];
  /** Active reference row only; never AI spec or vehicles.curb_weight_kg fallback. */
  resolutionProvenance: 'ACTIVE_REFERENCE_ROW_ONLY' | 'NO_ACTIVE_REFERENCE';
};

export type Ds4Layer2MotionPhysicsContextResolverDepsV1 = {
  loadVehicle(input: {
    organizationId: string;
    vehicleId: string;
  }): Promise<Ds4Layer2MotionPhysicsContextVehicleSnapshotV1 | null>;
  findActiveReference(input: {
    organizationId: string;
    vehicleId: string;
  }): Promise<Ds4Layer2MotionPhysicsContextReferenceSnapshotV1 | null>;
};
