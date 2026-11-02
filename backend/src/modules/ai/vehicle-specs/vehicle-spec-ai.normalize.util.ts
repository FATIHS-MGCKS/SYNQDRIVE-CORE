import type { VehicleSpecContext } from './vehicle-spec-ai.types';
import {
  normalizeMotionSystemPowerDefinition,
} from '@modules/vehicle-intelligence/motion-physics-reference/motion-physics-reference.domain';
import {
  normalizeCanonicalDrivetrain,
  normalizeElectrificationLevel,
  normalizeLvBatteryTypeInput,
  type CanonicalDrivetrain,
  type ElectrificationLevel,
} from '@modules/vehicles/vehicle-specification-canonical.contract';

export {
  DRIVETRAIN_VALUES,
  ELECTRIFICATION_LEVEL_VALUES,
  type CanonicalDrivetrain,
  type ElectrificationLevel,
} from '@modules/vehicles/vehicle-specification-canonical.contract';

export const normalizeDrivetrain = normalizeCanonicalDrivetrain;
export { normalizeElectrificationLevel };

const MHEV_LEVELS = new Set<ElectrificationLevel>(['MHEV_12V', 'MHEV_48V']);

const VARIANT_DEPENDENT_NUMERIC_KEYS = [
  'engineDisplacementCc',
  'cylinderCount',
  'frontRotorDiameterMm',
  'frontRotorWidthMm',
  'frontPadThicknessMm',
  'rearRotorDiameterMm',
  'rearRotorWidthMm',
  'rearPadThicknessMm',
  'brakeForceDistribution',
  'idleRpm',
  'maxRpm',
  'curbWeightKg',
  'systemMotorPowerKw',
  'systemPowerDefinition',
  'accel0To100S',
  'hvBatteryGrossCapacityKwh',
  'hvBatteryUsableCapacityKwh',
  'hvBatteryNominalVoltage',
  'hvBatteryModuleCount',
  'hvBatteryCellCount',
  'hvBatteryWarrantyYears',
  'hvBatteryWarrantyKm',
  'acOnboardChargerKw',
  'dcFastChargeMaxKw',
  'tankCapacityLiters',
] as const;

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function coerceHvBatteryPresent(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  const s = String(value).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return null;
}

export function normalizeNonNegativeInteger(value: unknown): number | null {
  const n = num(value);
  if (n == null || !Number.isInteger(n) || n < 0) return null;
  return n;
}

function parseAmbiguousVariants(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function applyVariantConfidenceGate(
  specs: Record<string, string | number | boolean | null>,
): string[] {
  const rejected: string[] = [];
  const confidence = num(specs.variantConfidence);
  const ambiguous = parseAmbiguousVariants(specs.ambiguousVariants);
  const lowConfidence = confidence == null || confidence < 0.7;
  const ambiguousVariant = ambiguous.length > 1;

  if (!lowConfidence && !ambiguousVariant) {
    return rejected;
  }

  rejected.push(
    ambiguousVariant ? 'variant_gate:ambiguous_variants' : 'variant_gate:low_confidence',
  );
  for (const key of VARIANT_DEPENDENT_NUMERIC_KEYS) {
    if (specs[key] != null) {
      specs[key] = null;
    }
  }
  if (lowConfidence || ambiguousVariant) {
    specs.hvBatteryPresent = null;
    specs.hvBatteryChemistry = null;
  }
  return rejected;
}

export function applyElectrificationHvSafety(
  specs: Record<string, string | number | boolean | null>,
): void {
  const level = normalizeElectrificationLevel(specs.electrificationLevel);
  if (level != null && MHEV_LEVELS.has(level)) {
    specs.hvBatteryPresent = false;
    specs.hvBatteryChemistry = null;
    specs.hvBatteryGrossCapacityKwh = null;
    specs.hvBatteryUsableCapacityKwh = null;
    specs.hvBatteryCapacityKwh = null;
    specs.hvBatteryNominalVoltage = null;
    specs.hvBatteryModuleCount = null;
    specs.hvBatteryCellCount = null;
    specs.hvBatteryWarrantyYears = null;
    specs.hvBatteryWarrantyKm = null;
    specs.acOnboardChargerKw = null;
    specs.dcFastChargeMaxKw = null;
  }
}

export function normalizeVehicleSpecValues(
  specs: Record<string, string | number | boolean | null>,
): Record<string, string | number | boolean | null> {
  const out = { ...specs };
  out.hvBatteryPresent = coerceHvBatteryPresent(out.hvBatteryPresent);
  out.cylinderCount = normalizeNonNegativeInteger(out.cylinderCount);
  out.hvBatteryModuleCount = normalizeNonNegativeInteger(out.hvBatteryModuleCount);
  out.hvBatteryCellCount = normalizeNonNegativeInteger(out.hvBatteryCellCount);
  out.hvBatteryWarrantyYears = normalizeNonNegativeInteger(out.hvBatteryWarrantyYears);
  out.manufacturerServiceIntervalMonths = normalizeNonNegativeInteger(
    out.manufacturerServiceIntervalMonths,
  );
  out.oilchangeIntervalMonths = normalizeNonNegativeInteger(out.oilchangeIntervalMonths);
  const drivetrain = normalizeCanonicalDrivetrain(out.drivetrain);
  out.drivetrain = drivetrain;
  const electrificationLevel = normalizeElectrificationLevel(out.electrificationLevel);
  out.electrificationLevel = electrificationLevel;
  const lvBattery = normalizeLvBatteryTypeInput(out.lvBatteryType ?? out.batteryType);
  out.lvBatteryType = lvBattery;
  if (lvBattery != null) {
    out.batteryType = lvBattery;
  } else if (out.lvBatteryType != null || out.batteryType != null) {
    out.batteryType = null;
  }
  applyElectrificationHvSafety(out);
  out.systemPowerDefinition = normalizeMotionSystemPowerDefinition(out.systemPowerDefinition);
  if (num(out.systemMotorPowerKw) == null && out.systemPowerDefinition != null) {
    out.systemPowerDefinition = null;
  }
  return out;
}

export function applyResolvedVariantIdentityGate(
  specs: Record<string, string | number | boolean | null>,
  context?: VehicleSpecContext,
): string[] {
  if (!context?.make?.trim() || !context?.model?.trim()) return [];
  const resolved = String(specs.resolvedVariant ?? '').trim().toLowerCase();
  if (!resolved) return [];

  const make = context.make.trim().toLowerCase();
  const modelToken = context.model.trim().toLowerCase().split(/\s+/).filter(Boolean)[0] ?? '';
  if (resolved.includes(make) || (modelToken.length >= 2 && resolved.includes(modelToken))) {
    return [];
  }

  const rejected: string[] = ['identity:resolved_variant_context_mismatch'];
  for (const key of VARIANT_DEPENDENT_NUMERIC_KEYS) {
    if (specs[key] != null) specs[key] = null;
  }
  specs.variantAssumption = null;
  return rejected;
}

