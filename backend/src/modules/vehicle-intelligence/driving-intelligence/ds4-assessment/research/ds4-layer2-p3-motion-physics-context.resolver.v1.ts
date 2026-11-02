/**
 * DS4 Layer-2 P3 — read-only Motion Physics reference resolver (research/offline only).
 *
 * Do not import from motion-core shadow processor, DS4 assessment workers, or admission paths.
 */
import {
  MotionPhysicsEvidenceTier,
  PrismaClient,
} from '@prisma/client';
import {
  MOTION_PHYSICS_POLICY_REASONS,
  normalizeMotionSystemPowerDefinition,
  type MotionPhysicsIdentityFingerprint,
} from '@modules/vehicle-intelligence/motion-physics-reference/motion-physics-reference.domain';
import { evaluateIdentityAgainstVehicle } from '@modules/vehicle-intelligence/motion-physics-reference/motion-physics-reference.policy';
import { VehicleMotionPhysicsReferenceRepository } from '@modules/vehicle-intelligence/motion-physics-reference/motion-physics-reference.repository';
import {
  DS4_LAYER2_P3_MOTION_PHYSICS_CONTEXT_SCHEMA_VERSION_V1,
  DS4_LAYER2_P3_MOTION_PHYSICS_RESOLVER_VERSION_V1,
  type Ds4Layer2MotionPhysicsApplicabilityV1,
  type Ds4Layer2MotionPhysicsContextReferenceSnapshotV1,
  type Ds4Layer2MotionPhysicsContextResolverDepsV1,
  type Ds4Layer2MotionPhysicsContextResolverInputV1,
  type Ds4Layer2MotionPhysicsContextV1,
  type Ds4Layer2MotionPhysicsContextVehicleSnapshotV1,
  type Ds4Layer2MotionPhysicsLimitationReasonV1,
} from './ds4-layer2-p3-motion-physics-context.v1.contract';

function emptyContextBase(
  input: Ds4Layer2MotionPhysicsContextResolverInputV1,
): Pick<
  Ds4Layer2MotionPhysicsContextV1,
  'schemaVersion' | 'resolverVersion' | 'organizationId' | 'vehicleId'
> {
  return {
    schemaVersion: DS4_LAYER2_P3_MOTION_PHYSICS_CONTEXT_SCHEMA_VERSION_V1,
    resolverVersion: DS4_LAYER2_P3_MOTION_PHYSICS_RESOLVER_VERSION_V1,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
  };
}

function parseIdentityFingerprint(
  json: unknown,
): MotionPhysicsIdentityFingerprint | null {
  if (json == null || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  if (typeof o.make !== 'string' || typeof o.model !== 'string') return null;
  if (typeof o.modelYear !== 'number' || !Number.isFinite(o.modelYear)) return null;
  return {
    vinHash: o.vinHash == null ? null : String(o.vinHash),
    make: o.make,
    model: o.model,
    modelYear: o.modelYear,
    variantLabel: o.variantLabel == null ? null : String(o.variantLabel),
  };
}

function isReferenceEffectiveAt(
  row: Ds4Layer2MotionPhysicsContextReferenceSnapshotV1,
  asOf: Date,
): boolean {
  if (row.effectiveFrom.getTime() > asOf.getTime()) return false;
  if (row.effectiveTo != null && row.effectiveTo.getTime() < asOf.getTime()) return false;
  return true;
}

function referenceIntegrityOk(
  row: Ds4Layer2MotionPhysicsContextReferenceSnapshotV1,
): boolean {
  return row.isActive && row.supersededById == null;
}

function engineRatedPowerSemantics(
  normalizedDefinition: ReturnType<typeof normalizeMotionSystemPowerDefinition>,
  rawDefinition: string | null,
): boolean {
  if (normalizedDefinition === 'OEM_RATED_MOTOR_KW') return true;
  const raw = rawDefinition?.trim().toUpperCase();
  return raw === 'OEM_RATED_ENGINE_KW';
}

function classifyApplicability(input: {
  evidenceTier: MotionPhysicsEvidenceTier;
  verifiedAt: Date | null;
  verifiedByUserId: string | null;
  documentExtractionId: string | null;
}): {
  applicability: Ds4Layer2MotionPhysicsApplicabilityV1;
  extraReasons: Ds4Layer2MotionPhysicsLimitationReasonV1[];
} {
  const extraReasons: Ds4Layer2MotionPhysicsLimitationReasonV1[] = [];

  if (input.evidenceTier === MotionPhysicsEvidenceTier.VERIFIED) {
    const hasVerificationEvidence =
      input.verifiedAt != null &&
      input.verifiedByUserId != null &&
      input.documentExtractionId != null;
    if (!hasVerificationEvidence) {
      extraReasons.push('VERIFIED_TIER_WITHOUT_VERIFICATION_EVIDENCE');
      return { applicability: 'AMBIGUOUS', extraReasons };
    }
    return { applicability: 'AVAILABLE_VERIFIED', extraReasons };
  }

  if (input.evidenceTier === MotionPhysicsEvidenceTier.CONFIRMED) {
    return { applicability: 'AVAILABLE_CONFIRMED_UNVERIFIED', extraReasons };
  }

  if (input.evidenceTier === MotionPhysicsEvidenceTier.ESTIMATED) {
    return { applicability: 'ESTIMATED_ONLY', extraReasons };
  }

  return { applicability: 'AMBIGUOUS', extraReasons };
}

function buildContextFromReference(
  input: Ds4Layer2MotionPhysicsContextResolverInputV1,
  vehicle: Ds4Layer2MotionPhysicsContextVehicleSnapshotV1,
  row: Ds4Layer2MotionPhysicsContextReferenceSnapshotV1,
  asOf: Date,
): Ds4Layer2MotionPhysicsContextV1 {
  const limitationReasons: Ds4Layer2MotionPhysicsLimitationReasonV1[] = [];
  const identityFingerprint = parseIdentityFingerprint(row.identityFingerprintJson);

  if (!referenceIntegrityOk(row)) {
    limitationReasons.push('REFERENCE_INTEGRITY_INACTIVE_OR_SUPERSEDED');
    limitationReasons.push(MOTION_PHYSICS_POLICY_REASONS.NOT_ACTIVE);
    if (row.supersededById) {
      limitationReasons.push(MOTION_PHYSICS_POLICY_REASONS.SUPERSEDED);
    }
    return {
      ...emptyContextBase(input),
      motionReferenceId: row.id,
      identityFingerprint,
      effectiveFrom: row.effectiveFrom.toISOString(),
      effectiveTo: row.effectiveTo?.toISOString() ?? null,
      curbMassKg: null,
      systemMotorPowerKw: null,
      systemPowerDefinition: null,
      accel0To100S: null,
      evidenceTier: row.evidenceTier,
      source: row.source,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      applicability: 'AMBIGUOUS',
      limitationReasons,
      resolutionProvenance: 'ACTIVE_REFERENCE_ROW_ONLY',
    };
  }

  if (!isReferenceEffectiveAt(row, asOf)) {
    limitationReasons.push('REFERENCE_NOT_EFFECTIVE_AT_AS_OF');
    return {
      ...emptyContextBase(input),
      motionReferenceId: row.id,
      identityFingerprint,
      effectiveFrom: row.effectiveFrom.toISOString(),
      effectiveTo: row.effectiveTo?.toISOString() ?? null,
      curbMassKg: null,
      systemMotorPowerKw: null,
      systemPowerDefinition: null,
      accel0To100S: null,
      evidenceTier: row.evidenceTier,
      source: row.source,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      applicability: 'AMBIGUOUS',
      limitationReasons,
      resolutionProvenance: 'ACTIVE_REFERENCE_ROW_ONLY',
    };
  }

  if (identityFingerprint == null) {
    limitationReasons.push(MOTION_PHYSICS_POLICY_REASONS.IDENTITY_MISMATCH);
    return {
      ...emptyContextBase(input),
      motionReferenceId: row.id,
      identityFingerprint: null,
      effectiveFrom: row.effectiveFrom.toISOString(),
      effectiveTo: row.effectiveTo?.toISOString() ?? null,
      curbMassKg: null,
      systemMotorPowerKw: null,
      systemPowerDefinition: null,
      accel0To100S: null,
      evidenceTier: row.evidenceTier,
      source: row.source,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      applicability: 'AMBIGUOUS',
      limitationReasons,
      resolutionProvenance: 'ACTIVE_REFERENCE_ROW_ONLY',
    };
  }

  if (
    !evaluateIdentityAgainstVehicle(identityFingerprint, {
      vin: vehicle.vin,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
    })
  ) {
    limitationReasons.push(MOTION_PHYSICS_POLICY_REASONS.IDENTITY_MISMATCH);
    if (vehicle.vin?.trim() && identityFingerprint.vinHash) {
      limitationReasons.push(MOTION_PHYSICS_POLICY_REASONS.VIN_IDENTITY_MISMATCH);
    }
    return {
      ...emptyContextBase(input),
      motionReferenceId: row.id,
      identityFingerprint,
      effectiveFrom: row.effectiveFrom.toISOString(),
      effectiveTo: row.effectiveTo?.toISOString() ?? null,
      curbMassKg: null,
      systemMotorPowerKw: null,
      systemPowerDefinition: null,
      accel0To100S: null,
      evidenceTier: row.evidenceTier,
      source: row.source,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      applicability: 'IDENTITY_MISMATCH',
      limitationReasons,
      resolutionProvenance: 'ACTIVE_REFERENCE_ROW_ONLY',
    };
  }

  const normalizedDefinition = normalizeMotionSystemPowerDefinition(row.systemPowerDefinition);
  const systemPowerDefinition =
    normalizedDefinition ?? row.systemPowerDefinition ?? null;

  if (engineRatedPowerSemantics(normalizedDefinition, row.systemPowerDefinition)) {
    limitationReasons.push('ENGINE_RATED_POWER_NOT_SYSTEM_POWER');
  }

  const { applicability, extraReasons } = classifyApplicability({
    evidenceTier: row.evidenceTier,
    verifiedAt: row.verifiedAt,
    verifiedByUserId: row.verifiedByUserId,
    documentExtractionId: row.documentExtractionId,
  });
  limitationReasons.push(...extraReasons);

  return {
    ...emptyContextBase(input),
    motionReferenceId: row.id,
    identityFingerprint,
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveTo: row.effectiveTo?.toISOString() ?? null,
    curbMassKg: row.curbMassKg,
    systemMotorPowerKw: row.systemMotorPowerKw,
    systemPowerDefinition,
    accel0To100S: row.accel0To100S,
    evidenceTier: row.evidenceTier,
    source: row.source,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    applicability,
    limitationReasons,
    resolutionProvenance: 'ACTIVE_REFERENCE_ROW_ONLY',
  };
}

export async function resolveDs4Layer2MotionPhysicsContextV1(
  deps: Ds4Layer2MotionPhysicsContextResolverDepsV1,
  input: Ds4Layer2MotionPhysicsContextResolverInputV1,
): Promise<Ds4Layer2MotionPhysicsContextV1> {
  const asOf = input.asOfUtc ?? new Date();

  const vehicle = await deps.loadVehicle({
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
  });

  if (vehicle == null) {
    return {
      ...emptyContextBase(input),
      motionReferenceId: null,
      identityFingerprint: null,
      effectiveFrom: null,
      effectiveTo: null,
      curbMassKg: null,
      systemMotorPowerKw: null,
      systemPowerDefinition: null,
      accel0To100S: null,
      evidenceTier: null,
      source: null,
      verifiedAt: null,
      applicability: 'NOT_ELIGIBLE',
      limitationReasons: [MOTION_PHYSICS_POLICY_REASONS.VEHICLE_NOT_FOUND],
      resolutionProvenance: 'NO_ACTIVE_REFERENCE',
    };
  }

  if (vehicle.organizationId !== input.organizationId || vehicle.id !== input.vehicleId) {
    return {
      ...emptyContextBase(input),
      motionReferenceId: null,
      identityFingerprint: null,
      effectiveFrom: null,
      effectiveTo: null,
      curbMassKg: null,
      systemMotorPowerKw: null,
      systemPowerDefinition: null,
      accel0To100S: null,
      evidenceTier: null,
      source: null,
      verifiedAt: null,
      applicability: 'NOT_ELIGIBLE',
      limitationReasons: [MOTION_PHYSICS_POLICY_REASONS.VEHICLE_NOT_FOUND],
      resolutionProvenance: 'NO_ACTIVE_REFERENCE',
    };
  }

  const row = await deps.findActiveReference({
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
  });

  if (row == null) {
    return {
      ...emptyContextBase(input),
      motionReferenceId: null,
      identityFingerprint: null,
      effectiveFrom: null,
      effectiveTo: null,
      curbMassKg: null,
      systemMotorPowerKw: null,
      systemPowerDefinition: null,
      accel0To100S: null,
      evidenceTier: null,
      source: null,
      verifiedAt: null,
      applicability: 'MISSING',
      limitationReasons: ['NO_ACTIVE_MOTION_PHYSICS_REFERENCE'],
      resolutionProvenance: 'NO_ACTIVE_REFERENCE',
    };
  }

  if (row.organizationId !== input.organizationId || row.vehicleId !== input.vehicleId) {
    return {
      ...emptyContextBase(input),
      motionReferenceId: null,
      identityFingerprint: null,
      effectiveFrom: null,
      effectiveTo: null,
      curbMassKg: null,
      systemMotorPowerKw: null,
      systemPowerDefinition: null,
      accel0To100S: null,
      evidenceTier: null,
      source: null,
      verifiedAt: null,
      applicability: 'NOT_ELIGIBLE',
      limitationReasons: [MOTION_PHYSICS_POLICY_REASONS.VEHICLE_NOT_FOUND],
      resolutionProvenance: 'NO_ACTIVE_REFERENCE',
    };
  }

  return buildContextFromReference(input, vehicle, row, asOf);
}

/** Convenience for offline research scripts using Prisma (read-only SELECT). */
export function createDs4Layer2MotionPhysicsContextResolverDepsFromPrisma(
  prisma: PrismaClient,
): Ds4Layer2MotionPhysicsContextResolverDepsV1 {
  const repository = new VehicleMotionPhysicsReferenceRepository(prisma as never);

  return {
    loadVehicle: async ({ organizationId, vehicleId }) => {
      const row = await prisma.vehicle.findFirst({
        where: { id: vehicleId, organizationId },
        select: {
          id: true,
          organizationId: true,
          vin: true,
          make: true,
          model: true,
          year: true,
        },
      });
      return row;
    },
    findActiveReference: async ({ organizationId, vehicleId }) => {
      const row = await repository.findActiveForVehicle({ organizationId, vehicleId });
      if (!row) return null;
      return {
        id: row.id,
        organizationId: row.organizationId,
        vehicleId: row.vehicleId,
        identityFingerprintJson: row.identityFingerprintJson,
        curbMassKg: row.curbMassKg,
        systemMotorPowerKw: row.systemMotorPowerKw,
        systemPowerDefinition: row.systemPowerDefinition,
        accel0To100S: row.accel0To100S,
        evidenceTier: row.evidenceTier,
        source: row.source,
        verifiedAt: row.verifiedAt,
        verifiedByUserId: row.verifiedByUserId,
        documentExtractionId: row.documentExtractionId,
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo,
        isActive: row.isActive,
        supersededById: row.supersededById,
        variantAssumption: row.variantAssumption,
      };
    },
  };
}
