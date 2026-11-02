/**
 * Vehicle Specifications V3 — canonical input contract (code registry, not DB).
 * Aligns AI V2, Master registration, and technical PATCH boundaries without migrations.
 */
import {
  normalizeBatteryType,
  type NormalizedBatteryType,
} from '@modules/vehicle-intelligence/battery-health/battery-status';

export const TOTAL_CANONICAL_CONTRACT_SURFACES = 65;

/**
 * Canonical display/storage units for Vehicle Specifications V3 (semantics only — numeric values unchanged).
 * Frontend i18n unit labels must match these semantics (e.g. LV charge capacity → Ah, not A).
 */
export const VEHICLE_SPEC_CANONICAL_UNITS = {
  motorPowerKw: 'kW',
  systemMotorPowerKw: 'kW',
  acOnboardChargerKw: 'kW',
  dcFastChargeMaxKw: 'kW',
  hvBatteryUsableCapacityKwh: 'kWh',
  hvBatteryGrossCapacityKwh: 'kWh',
  hvBatteryCapacityKwh: 'kWh',
  lvBatteryAmpere: 'Ah',
  lvBatteryChargeCapacity: 'Ah',
  lvBatteryVolt: 'V',
  electricCurrent: 'A',
  torque: 'Nm',
  engineDisplacementCc: 'cm³',
  curbWeightKg: 'kg',
  vehicleLengthMm: 'mm',
  vehicleWidthMm: 'mm',
  vehicleHeightMm: 'mm',
  brakeRotorDiameterMm: 'mm',
  brakePadThicknessMm: 'mm',
  percentage: '%',
  idleRpm: 'rpm',
  maxRpm: 'rpm',
  tankCapacityLiters: 'L',
} as const;

/** Legacy AI JSON keys mapped to canonical persisted/API field names (no value coercion). */
export const VEHICLE_SPEC_LEGACY_AI_FIELD_ALIASES: Readonly<Record<string, string>> = {
  batteryType: 'lvBatteryType',
  batteryAmpere: 'lvBatteryAmpere',
  batteryVolt: 'lvBatteryVolt',
  hvBatteryCapacityKwh: 'hvBatteryUsableCapacityKwh',
  frontToRearWeightDistribution: 'frontWeightDistributionPct',
  brakeForceDistribution: 'brakeForceFrontPercent',
};

export function resolveVehicleSpecLegacyAiAlias(fieldKey: string): string {
  return VEHICLE_SPEC_LEGACY_AI_FIELD_ALIASES[fieldKey] ?? fieldKey;
}

export const NON_PERSISTENT_VEHICLE_SPEC_INPUT_FIELDS = [
  'electrificationLevel',
  'lvBatteryChemistry',
] as const;

export type NonPersistentVehicleSpecInputField =
  (typeof NON_PERSISTENT_VEHICLE_SPEC_INPUT_FIELDS)[number];

export const DRIVETRAIN_VALUES = ['FWD', 'RWD', 'AWD', 'FOUR_WD'] as const;
export type CanonicalDrivetrain = (typeof DRIVETRAIN_VALUES)[number];

export const ELECTRIFICATION_LEVEL_VALUES = [
  'NONE',
  'MHEV_12V',
  'MHEV_48V',
  'FULL_HYBRID',
  'PHEV',
  'BEV',
  'FCEV',
] as const;
export type ElectrificationLevel = (typeof ELECTRIFICATION_LEVEL_VALUES)[number];

export const CANONICAL_LV_BATTERY_STORAGE_TYPES = [
  'AGM',
  'EFB',
  'LEAD_ACID',
  'LITHIUM',
] as const;
export type CanonicalLvBatteryStorageType = (typeof CANONICAL_LV_BATTERY_STORAGE_TYPES)[number];

const DRIVETRAIN_ALIASES: Record<string, CanonicalDrivetrain> = {
  '4WD': 'FOUR_WD',
  '4X4': 'FOUR_WD',
  FOURWD: 'FOUR_WD',
  ALLRAD: 'FOUR_WD',
  ALL_WHEEL: 'AWD',
  ALLWHEEL: 'AWD',
};

export function normalizeCanonicalDrivetrain(value: unknown): CanonicalDrivetrain | null {
  if (value == null) return null;
  const raw = String(value).trim().toUpperCase().replace(/\s+/g, '_').replace(/-/g, '_');
  if (!raw) return null;
  const aliased = DRIVETRAIN_ALIASES[raw] ?? raw;
  if ((DRIVETRAIN_VALUES as readonly string[]).includes(aliased)) {
    return aliased as CanonicalDrivetrain;
  }
  return null;
}

export function normalizeElectrificationLevel(value: unknown): ElectrificationLevel | null {
  if (value == null) return null;
  const raw = String(value).trim().toUpperCase().replace(/\s+/g, '_');
  if ((ELECTRIFICATION_LEVEL_VALUES as readonly string[]).includes(raw)) {
    return raw as ElectrificationLevel;
  }
  return null;
}

/** Maps health-layer normalization to persisted LV battery_type tokens (backward compatible). */
export function canonicalLvBatteryStorageType(
  normalized: NormalizedBatteryType,
): CanonicalLvBatteryStorageType | null {
  if (normalized === 'UNKNOWN') return null;
  return normalized;
}

/**
 * Normalizes AI/manual LV battery type input to a persisted enum token, or null when unknown/unsupported.
 */
export function normalizeLvBatteryTypeInput(value: unknown): CanonicalLvBatteryStorageType | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  return canonicalLvBatteryStorageType(normalizeBatteryType(raw));
}

export function isNonPersistentVehicleSpecField(key: string): key is NonPersistentVehicleSpecInputField {
  return (NON_PERSISTENT_VEHICLE_SPEC_INPUT_FIELDS as readonly string[]).includes(key);
}

/**
 * Read-only electrification classification from durable powertrain identity fields.
 * Returns null when fuel/powertrain signals are insufficient or contradictory.
 */
export function deriveElectrificationLevelReadOnly(input: {
  fuelType?: string | null;
  powertrainType?: string | null;
}): ElectrificationLevel | null {
  const fuel = String(input.fuelType ?? '')
    .trim()
    .toLowerCase();
  const powertrain = String(input.powertrainType ?? '')
    .trim()
    .toUpperCase();

  if (!fuel && !powertrain) return null;

  if (fuel.includes('fcev') || fuel.includes('hydrogen') || fuel.includes('wasserstoff')) {
    return 'FCEV';
  }
  if (fuel.includes('plugin') || fuel.includes('plug-in') || fuel.includes('phev')) {
    return powertrain === 'COMBUSTION' ? null : 'PHEV';
  }
  if (
    fuel.includes('electric') ||
    fuel.includes('bev') ||
    fuel.includes('battery electric') ||
    powertrain === 'ELECTRIC_DRIVE'
  ) {
    if (fuel.includes('hybrid') && !fuel.includes('plugin') && !fuel.includes('plug-in')) {
      return null;
    }
    if (powertrain === 'COMBUSTION') return null;
    return 'BEV';
  }
  if (fuel.includes('48v') || fuel.includes('mhev') || fuel.includes('mild')) {
    return fuel.includes('12') ? 'MHEV_12V' : 'MHEV_48V';
  }
  if (fuel.includes('hybrid')) {
    return 'FULL_HYBRID';
  }
  if (powertrain === 'COMBINED_SYSTEM') {
    return null;
  }
  if (fuel.includes('diesel') || fuel.includes('gasoline') || fuel.includes('petrol') || fuel.includes('benzin')) {
    return 'NONE';
  }
  return null;
}

export function mapPowerKindToPowertrainType(
  powerKind: unknown,
): 'COMBUSTION' | 'ELECTRIC_DRIVE' | 'COMBINED_SYSTEM' | null {
  const raw = String(powerKind ?? '')
    .trim()
    .toUpperCase();
  if (raw === 'COMBUSTION' || raw === 'ELECTRIC_DRIVE' || raw === 'COMBINED_SYSTEM') {
    return raw;
  }
  return null;
}
