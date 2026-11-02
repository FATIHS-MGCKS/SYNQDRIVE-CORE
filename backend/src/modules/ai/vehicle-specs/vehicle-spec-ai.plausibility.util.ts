import type { VehicleSpecContext } from './vehicle-spec-ai.types';

export interface MotionSpecPlausibilityResult {
  specs: Record<string, string | number | boolean | null>;
  rejectedFields: string[];
}

const CURB_MIN = 700;
const CURB_MAX = 3500;
const POWER_MIN_KW = 20;
const POWER_MAX_KW = 800;
const ACCEL_MIN_S = 2;
const ACCEL_MAX_S = 60;
const W_PER_KG_MIN = 20;
const W_PER_KG_MAX = 400;

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeIdentityToken(value: string | undefined | null): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function rejectMotionFieldsForIdentityMismatch(
  specs: Record<string, string | number | boolean | null>,
  context?: VehicleSpecContext,
): string[] {
  if (!context?.make || !context?.model || !context?.year) return [];
  const rejected: string[] = [];
  const specMake = specs.make != null ? normalizeIdentityToken(String(specs.make)) : '';
  const specModel = specs.model != null ? normalizeIdentityToken(String(specs.model)) : '';
  const specYear = specs.year != null ? Number(specs.year) : null;
  const ctxMake = normalizeIdentityToken(context.make);
  const ctxModel = normalizeIdentityToken(context.model);
  if (
    (specMake && specMake !== ctxMake) ||
    (specModel && specModel !== ctxModel) ||
    (specYear != null && Number.isFinite(specYear) && specYear !== context.year)
  ) {
    rejected.push('motion_fields:identity_mmy_mismatch');
    specs.curbWeightKg = null;
    specs.systemMotorPowerKw = null;
    specs.accel0To100S = null;
    specs.variantAssumption = null;
    specs.systemPowerDefinition = null;
  }
  return rejected;
}

export function applyVehicleSpecMotionPlausibility(
  specs: Record<string, string | number | boolean | null>,
  context?: VehicleSpecContext,
): MotionSpecPlausibilityResult {
  const out = { ...specs };
  const rejected: string[] = rejectMotionFieldsForIdentityMismatch(out, context);

  const curb = num(out.curbWeightKg);
  if (curb != null && (curb < CURB_MIN || curb > CURB_MAX)) {
    out.curbWeightKg = null;
    rejected.push('curbWeightKg');
  }

  const power = num(out.systemMotorPowerKw);
  if (power != null && (power < POWER_MIN_KW || power > POWER_MAX_KW)) {
    out.systemMotorPowerKw = null;
    rejected.push('systemMotorPowerKw');
  }
  if (out.systemMotorPowerKw == null && out.systemPowerDefinition != null) {
    out.systemPowerDefinition = null;
  }

  const accel = num(out.accel0To100S);
  if (accel != null && (accel < ACCEL_MIN_S || accel > ACCEL_MAX_S)) {
    out.accel0To100S = null;
    rejected.push('accel0To100S');
  }

  const mass = num(out.curbWeightKg);
  if (power != null && mass != null && mass > 0) {
    const wPerKg = (power * 1000) / mass;
    if (wPerKg < W_PER_KG_MIN || wPerKg > W_PER_KG_MAX) {
      out.systemMotorPowerKw = null;
      rejected.push('systemMotorPowerKw:power_to_mass');
    }
  }

  if (out.systemMotorPowerKw == null && out.systemPowerDefinition != null) {
    out.systemPowerDefinition = null;
  }

  return { specs: out, rejectedFields: rejected };
}
