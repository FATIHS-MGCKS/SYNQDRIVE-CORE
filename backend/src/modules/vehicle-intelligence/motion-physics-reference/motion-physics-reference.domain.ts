import {
  MotionPhysicsEvidenceTier,
  MotionPhysicsReferenceSource,
} from '@prisma/client';

export const MOTION_PHYSICS_REFERENCE_CHANGE_ACTIONS = {
  CREATED: 'CREATED',
  SUPERSEDED: 'SUPERSEDED',
  CONFIRMED: 'CONFIRMED',
  VERIFIED: 'VERIFIED',
  NOTES_UPDATED: 'NOTES_UPDATED',
} as const;

export type MotionPhysicsReferenceChangeAction =
  (typeof MOTION_PHYSICS_REFERENCE_CHANGE_ACTIONS)[keyof typeof MOTION_PHYSICS_REFERENCE_CHANGE_ACTIONS];

export const MOTION_PHYSICS_POLICY_REASONS = {
  VEHICLE_NOT_FOUND: 'VEHICLE_NOT_FOUND',
  IDENTITY_MISMATCH: 'IDENTITY_MISMATCH',
  ACTIVE_VERIFIED_PROTECTED: 'ACTIVE_VERIFIED_PROTECTED',
  TIER_DOWNGRADE_FORBIDDEN: 'TIER_DOWNGRADE_FORBIDDEN',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_NUMERIC: 'INVALID_NUMERIC',
  VERIFY_NOT_ALLOWED: 'VERIFY_NOT_ALLOWED',
  MISSING_EVIDENCE_FOR_VERIFY: 'MISSING_EVIDENCE_FOR_VERIFY',
  DOCUMENT_NOT_VALIDATED: 'DOCUMENT_NOT_VALIDATED',
  NOT_ACTIVE: 'NOT_ACTIVE',
  ALREADY_VERIFIED: 'ALREADY_VERIFIED',
  SUPERSEDED: 'SUPERSEDED',
  VERIFY_EVIDENCE_PIPELINE_NOT_READY: 'VERIFY_EVIDENCE_PIPELINE_NOT_READY',
  VIN_IDENTITY_MISMATCH: 'VIN_IDENTITY_MISMATCH',
  IMPLICIT_OPERATOR_CONFIRM_FORBIDDEN: 'IMPLICIT_OPERATOR_CONFIRM_FORBIDDEN',
  IMPLICIT_MANUAL_CONFIRM_FORBIDDEN: 'IMPLICIT_MANUAL_CONFIRM_FORBIDDEN',
} as const;

export type MotionPhysicsPolicyReasonCode =
  (typeof MOTION_PHYSICS_POLICY_REASONS)[keyof typeof MOTION_PHYSICS_POLICY_REASONS];

export interface MotionPhysicsIdentityFingerprint {
  vinHash?: string | null;
  make: string;
  model: string;
  modelYear: number;
  variantLabel?: string | null;
}

/** Canonical semantics for how systemMotorPowerKw should be interpreted (Master UI: Art der Leistungsangabe). */
export const MOTION_SYSTEM_POWER_DEFINITION_VALUES = [
  'OEM_RATED_MOTOR_KW',
  'OEM_RATED_SYSTEM_KW',
  'OEM_RATED_SYSTEM_KW_ESTIMATED',
] as const;

export type MotionSystemPowerDefinition = (typeof MOTION_SYSTEM_POWER_DEFINITION_VALUES)[number];

/**
 * Legacy persisted tokens → canonical contract (read / input normalization only; no DB rewrite).
 * OEM_RATED_ENGINE_KW was used for ICE nominal engine kW before the MOTOR_KW enum name;
 * same semantics as vehicle-spec AI rule: ICE / single-motor rated power (not combined system kW).
 */
export const MOTION_SYSTEM_POWER_DEFINITION_LEGACY_ALIASES: Readonly<
  Record<string, MotionSystemPowerDefinition>
> = {
  OEM_RATED_ENGINE_KW: 'OEM_RATED_MOTOR_KW',
};

export function normalizeMotionSystemPowerDefinition(value: unknown): MotionSystemPowerDefinition | null {
  if (value == null) return null;
  const raw = String(value).trim().toUpperCase();
  if (!raw) return null;
  const legacy = MOTION_SYSTEM_POWER_DEFINITION_LEGACY_ALIASES[raw];
  if (legacy) return legacy;
  if ((MOTION_SYSTEM_POWER_DEFINITION_VALUES as readonly string[]).includes(raw)) {
    return raw as MotionSystemPowerDefinition;
  }
  return null;
}

export interface MotionPhysicsReferencePayload {
  curbMassKg?: number | null;
  systemMotorPowerKw?: number | null;
  systemPowerDefinition?: string | null;
  accel0To100S?: number | null;
  variantAssumption?: string | null;
}

export interface MotionPhysicsCreateTierOptions {
  manualOperatorConfirm?: boolean;
}

/** Evidence tier for POST create — OPERATOR_CONFIRMED is confirm-endpoint only. */
export function resolveMotionPhysicsEvidenceTierForCreate(
  source: MotionPhysicsReferenceSource,
  options?: MotionPhysicsCreateTierOptions,
): MotionPhysicsEvidenceTier | null {
  switch (source) {
    case MotionPhysicsReferenceSource.MANUAL_ENTRY:
      return options?.manualOperatorConfirm
        ? MotionPhysicsEvidenceTier.CONFIRMED
        : MotionPhysicsEvidenceTier.ESTIMATED;
    case MotionPhysicsReferenceSource.MISTRAL_AI:
      return MotionPhysicsEvidenceTier.ESTIMATED;
    case MotionPhysicsReferenceSource.ONBOARDING_ACTIVATION:
    case MotionPhysicsReferenceSource.REGISTRATION_CERTIFICATE:
    case MotionPhysicsReferenceSource.MANUFACTURER_VERIFIED:
      return MotionPhysicsEvidenceTier.CONFIRMED;
    case MotionPhysicsReferenceSource.OPERATOR_CONFIRMED:
      return null;
    default:
      return MotionPhysicsEvidenceTier.ESTIMATED;
  }
}
