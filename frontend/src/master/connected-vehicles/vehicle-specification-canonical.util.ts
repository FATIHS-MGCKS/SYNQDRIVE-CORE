/**
 * Frontend mirror of backend vehicle-specification-canonical.contract (input boundaries only).
 */

export const NON_PERSISTENT_VEHICLE_SPEC_INPUT_FIELDS = [
  'electrificationLevel',
  'lvBatteryChemistry',
] as const;

export const CANONICAL_LV_BATTERY_STORAGE_TYPES = ['AGM', 'EFB', 'LEAD_ACID', 'LITHIUM'] as const;
export type CanonicalLvBatteryStorageType = (typeof CANONICAL_LV_BATTERY_STORAGE_TYPES)[number];

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

function normalizeBatteryTypeAlias(raw: string): CanonicalLvBatteryStorageType | null {
  const v = raw.trim().toUpperCase();
  if (!v) return null;
  if (/(LITHIUM|LIFEPO|LFP|LI-ION|LIION|LI ION)/.test(v)) return 'LITHIUM';
  if (/AGM/.test(v)) return 'AGM';
  if (/EFB/.test(v)) return 'EFB';
  if (/(LEAD|BLEI|FLOODED|SLI|GEL|VRLA)/.test(v)) return 'LEAD_ACID';
  if (v === 'AGM' || v === 'EFB' || v === 'LEAD_ACID' || v === 'LITHIUM') {
    return v as CanonicalLvBatteryStorageType;
  }
  return null;
}

export function normalizeLvBatteryTypeInput(value: unknown): CanonicalLvBatteryStorageType | null {
  if (value == null) return null;
  return normalizeBatteryTypeAlias(String(value));
}

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
  if (fuel.includes('fcev') || fuel.includes('hydrogen')) return 'FCEV';
  if (fuel.includes('plugin') || fuel.includes('plug-in') || fuel.includes('phev')) {
    return powertrain === 'COMBUSTION' ? null : 'PHEV';
  }
  if (fuel.includes('electric') || fuel.includes('bev') || powertrain === 'ELECTRIC_DRIVE') {
    if (fuel.includes('hybrid') && !fuel.includes('plugin')) return null;
    if (powertrain === 'COMBUSTION') return null;
    return 'BEV';
  }
  if (fuel.includes('48v') || fuel.includes('mhev') || fuel.includes('mild')) {
    return fuel.includes('12') ? 'MHEV_12V' : 'MHEV_48V';
  }
  if (fuel.includes('hybrid')) return 'FULL_HYBRID';
  if (fuel.includes('diesel') || fuel.includes('gasoline') || fuel.includes('petrol')) {
    return 'NONE';
  }
  return null;
}

export function stripNonPersistentVehicleSpecFields<T extends Record<string, unknown>>(payload: T): T {
  const out = { ...payload };
  for (const key of NON_PERSISTENT_VEHICLE_SPEC_INPUT_FIELDS) {
    delete out[key];
  }
  return out;
}

export function isCanonicalLvBatteryStorageType(
  value: string,
): value is CanonicalLvBatteryStorageType {
  return (CANONICAL_LV_BATTERY_STORAGE_TYPES as readonly string[]).includes(value);
}

/** Form state: canonical select value, or legacy raw string when unrecognized (not silently replaced). */
export function resolveRegistrationLvBatteryFormState(raw: string): {
  selectValue: CanonicalLvBatteryStorageType | '';
  legacyDisplay: string | null;
} {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return { selectValue: '', legacyDisplay: null };
  const canonical = normalizeLvBatteryTypeInput(trimmed);
  if (canonical) return { selectValue: canonical, legacyDisplay: null };
  return { selectValue: '', legacyDisplay: trimmed };
}

export type RegistrationLvBatterySubmitResolution = {
  canonical: CanonicalLvBatteryStorageType | null;
  /** Preserved on RegisteredVehicle for read-back when legacy-only (no spec write). */
  legacyRaw: string | null;
  validationError: 'lvBatteryTypeRequiredForNumbers' | 'lvBatteryTypeInvalid' | null;
};

export function resolveRegistrationLvBatteryForSubmit(input: {
  typeRaw: string;
  ampereRaw: string;
  voltRaw: string;
}): RegistrationLvBatterySubmitResolution {
  const trimmed = input.typeRaw.trim();
  const hasNumbers = Boolean(input.ampereRaw.trim() || input.voltRaw.trim());
  const canonical = normalizeLvBatteryTypeInput(trimmed);
  if (hasNumbers && !canonical) {
    return {
      canonical: null,
      legacyRaw: trimmed || null,
      validationError: trimmed ? 'lvBatteryTypeInvalid' : 'lvBatteryTypeRequiredForNumbers',
    };
  }
  if (trimmed && !canonical) {
    return { canonical: null, legacyRaw: trimmed, validationError: null };
  }
  return { canonical, legacyRaw: null, validationError: null };
}
