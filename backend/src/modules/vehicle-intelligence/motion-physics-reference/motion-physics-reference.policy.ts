import {
  MotionPhysicsEvidenceTier,
  MotionPhysicsReferenceSource,
} from '@prisma/client';
import type {
  MotionPhysicsIdentityFingerprint,
  MotionPhysicsPolicyReasonCode,
  MotionPhysicsReferencePayload,
} from './motion-physics-reference.domain';
import { MOTION_PHYSICS_POLICY_REASONS } from './motion-physics-reference.domain';
import { identityFingerprintsMatch } from './motion-physics-identity.util';

export interface MotionPhysicsPolicyEvaluation {
  ok: boolean;
  reasonCodes: MotionPhysicsPolicyReasonCode[];
}

function hasAnyMotionValue(payload: MotionPhysicsReferencePayload): boolean {
  const definition = payload.systemPowerDefinition?.trim();
  return (
    payload.curbMassKg != null ||
    payload.systemMotorPowerKw != null ||
    payload.accel0To100S != null ||
    Boolean(definition)
  );
}

export function evaluateMotionPhysicsReferenceCreate(input: {
  payload: MotionPhysicsReferencePayload;
  proposedTier: MotionPhysicsEvidenceTier;
  proposedSource: MotionPhysicsReferenceSource;
  activeTier?: MotionPhysicsEvidenceTier | null;
  manualOperatorConfirm?: boolean;
}): MotionPhysicsPolicyEvaluation {
  const reasonCodes: MotionPhysicsPolicyReasonCode[] = [];

  if (!hasAnyMotionValue(input.payload)) {
    reasonCodes.push(MOTION_PHYSICS_POLICY_REASONS.MISSING_REQUIRED_FIELD);
  }

  if (
    input.activeTier === MotionPhysicsEvidenceTier.VERIFIED &&
    input.proposedTier !== MotionPhysicsEvidenceTier.VERIFIED
  ) {
    reasonCodes.push(MOTION_PHYSICS_POLICY_REASONS.ACTIVE_VERIFIED_PROTECTED);
  }

  if (
    input.activeTier === MotionPhysicsEvidenceTier.VERIFIED &&
    input.proposedSource === MotionPhysicsReferenceSource.MISTRAL_AI
  ) {
    reasonCodes.push(MOTION_PHYSICS_POLICY_REASONS.TIER_DOWNGRADE_FORBIDDEN);
  }

  if (
    input.activeTier === MotionPhysicsEvidenceTier.CONFIRMED &&
    input.proposedSource === MotionPhysicsReferenceSource.MISTRAL_AI
  ) {
    reasonCodes.push(MOTION_PHYSICS_POLICY_REASONS.TIER_DOWNGRADE_FORBIDDEN);
  }

  if (input.proposedTier === MotionPhysicsEvidenceTier.VERIFIED) {
    reasonCodes.push(MOTION_PHYSICS_POLICY_REASONS.VERIFY_NOT_ALLOWED);
  }

  if (input.proposedSource === MotionPhysicsReferenceSource.OPERATOR_CONFIRMED) {
    reasonCodes.push(MOTION_PHYSICS_POLICY_REASONS.IMPLICIT_OPERATOR_CONFIRM_FORBIDDEN);
  }

  if (
    input.proposedSource === MotionPhysicsReferenceSource.MANUAL_ENTRY &&
    input.proposedTier === MotionPhysicsEvidenceTier.CONFIRMED &&
    !input.manualOperatorConfirm
  ) {
    reasonCodes.push(MOTION_PHYSICS_POLICY_REASONS.IMPLICIT_MANUAL_CONFIRM_FORBIDDEN);
  }

  return { ok: reasonCodes.length === 0, reasonCodes };
}

export function evaluateMotionPhysicsConfirm(input: {
  currentTier: MotionPhysicsEvidenceTier;
  isActive: boolean;
  isSuperseded: boolean;
}): MotionPhysicsPolicyEvaluation {
  const reasonCodes: MotionPhysicsPolicyReasonCode[] = [];
  if (input.isSuperseded) {
    reasonCodes.push(MOTION_PHYSICS_POLICY_REASONS.SUPERSEDED);
  }
  if (!input.isActive) {
    reasonCodes.push(MOTION_PHYSICS_POLICY_REASONS.NOT_ACTIVE);
  }
  if (input.currentTier === MotionPhysicsEvidenceTier.VERIFIED) {
    reasonCodes.push(MOTION_PHYSICS_POLICY_REASONS.ALREADY_VERIFIED);
  }
  return { ok: reasonCodes.length === 0, reasonCodes };
}

export function evaluateMotionPhysicsVerify(input: {
  isActive: boolean;
  isSuperseded: boolean;
  currentTier: MotionPhysicsEvidenceTier;
  documentExtractionId?: string | null;
  documentValidated?: boolean;
  identityMatch: boolean;
  vinIdentityMatch: boolean;
}): MotionPhysicsPolicyEvaluation {
  const reasonCodes: MotionPhysicsPolicyReasonCode[] = [];
  reasonCodes.push(MOTION_PHYSICS_POLICY_REASONS.VERIFY_EVIDENCE_PIPELINE_NOT_READY);
  if (input.isSuperseded) {
    reasonCodes.push(MOTION_PHYSICS_POLICY_REASONS.SUPERSEDED);
  }
  if (!input.isActive) {
    reasonCodes.push(MOTION_PHYSICS_POLICY_REASONS.NOT_ACTIVE);
  }
  if (input.currentTier === MotionPhysicsEvidenceTier.VERIFIED) {
    reasonCodes.push(MOTION_PHYSICS_POLICY_REASONS.ALREADY_VERIFIED);
  }
  if (!input.identityMatch) {
    reasonCodes.push(MOTION_PHYSICS_POLICY_REASONS.IDENTITY_MISMATCH);
  }
  if (!input.vinIdentityMatch) {
    reasonCodes.push(MOTION_PHYSICS_POLICY_REASONS.VIN_IDENTITY_MISMATCH);
  }
  if (!input.documentExtractionId) {
    reasonCodes.push(MOTION_PHYSICS_POLICY_REASONS.MISSING_EVIDENCE_FOR_VERIFY);
  } else if (!input.documentValidated) {
    reasonCodes.push(MOTION_PHYSICS_POLICY_REASONS.DOCUMENT_NOT_VALIDATED);
  }
  return { ok: reasonCodes.length === 0, reasonCodes };
}

export function evaluateIdentityAgainstVehicle(
  fingerprint: MotionPhysicsIdentityFingerprint,
  vehicle: { vin?: string | null; make: string; model: string; year: number },
): boolean {
  const current = {
    vin: vehicle.vin,
    make: vehicle.make,
    model: vehicle.model,
    modelYear: vehicle.year,
  };
  return identityFingerprintsMatch(
    fingerprint,
    {
      vinHash: fingerprint.vinHash,
      make: current.make,
      model: current.model,
      modelYear: current.modelYear,
      variantLabel: fingerprint.variantLabel,
    },
  );
}
