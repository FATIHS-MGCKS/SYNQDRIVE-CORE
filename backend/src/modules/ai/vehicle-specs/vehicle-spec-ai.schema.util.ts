import { MOTION_SYSTEM_POWER_DEFINITION_VALUES } from '@modules/vehicle-intelligence/motion-physics-reference/motion-physics-reference.domain';
import type { VehicleSpecContext, VehicleSpecsScopeResolution } from './vehicle-spec-ai.types';

export const VEHICLE_SPEC_FIELD_KEYS = [
  'lvBatteryType',
  'lvBatteryChemistry',
  'lvBatteryAmpere',
  'lvBatteryVolt',
  'hvBatteryPresent',
  'hvBatteryChemistry',
  'hvBatteryCellFormat',
  'hvBatteryGrossCapacityKwh',
  'hvBatteryUsableCapacityKwh',
  'hvBatteryNominalVoltage',
  'hvBatteryArchitecture',
  'hvBatteryModuleCount',
  'hvBatteryCellCount',
  'hvBatteryThermalManagement',
  'hvBatteryWarrantyYears',
  'hvBatteryWarrantyKm',
  'acOnboardChargerKw',
  'dcFastChargeMaxKw',
  'tankCapacityLiters',
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
  'variantAssumption',
  'sourceNote',
  'resolvedVariant',
  'variantConfidence',
  'ambiguousVariants',
  'electrificationLevel',
  'drivetrain',
  'frontToRearWeightDistribution',
  'manufacturerServiceIntervalKm',
  'manufacturerServiceIntervalMonths',
  'oilchangeIntervalKm',
  'oilchangeIntervalMonths',
] as const;

const LEGACY_ALIAS_KEYS = ['batteryType', 'batteryAmpere', 'batteryVolt', 'hvBatteryCapacityKwh'] as const;

function nullable(inner: Record<string, unknown>): Record<string, unknown> {
  return { anyOf: [inner, { type: 'null' }] };
}

export function buildVehicleSpecEmptyShape(): Record<string, string | number | boolean | null> {
  const empty: Record<string, string | number | boolean | null> = {};
  for (const key of [...VEHICLE_SPEC_FIELD_KEYS, ...LEGACY_ALIAS_KEYS]) {
    empty[key] = null;
  }
  return empty;
}

export function buildVehicleSpecJsonSchema(): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const key of VEHICLE_SPEC_FIELD_KEYS) {
    if (key === 'hvBatteryPresent') {
      properties[key] = nullable({ type: 'boolean' });
      continue;
    }
    if (key.endsWith('Count') || key === 'cylinderCount') {
      properties[key] = nullable({ type: 'integer' });
      continue;
    }
    if (key === 'variantConfidence') {
      properties[key] = nullable({ type: 'number' });
      continue;
    }
    if (key === 'ambiguousVariants') {
      properties[key] = nullable({
        type: 'array',
        items: { type: 'string' },
      });
      continue;
    }
    if (key === 'drivetrain') {
      properties[key] = nullable({
        type: 'string',
        enum: ['FWD', 'RWD', 'AWD', 'FOUR_WD', '4WD'],
      });
      continue;
    }
    if (key === 'electrificationLevel') {
      properties[key] = nullable({
        type: 'string',
        enum: [
          'NONE',
          'MHEV_12V',
          'MHEV_48V',
          'FULL_HYBRID',
          'PHEV',
          'BEV',
          'FCEV',
        ],
      });
      continue;
    }
    if (key === 'systemPowerDefinition') {
      properties[key] = nullable({
        type: 'string',
        enum: [...MOTION_SYSTEM_POWER_DEFINITION_VALUES],
      });
      continue;
    }
    if (
      key.includes('Mm') ||
      key.includes('Km') ||
      key.includes('Kw') ||
      key.includes('Kwh') ||
      key.includes('Liters') ||
      key.includes('Cc') ||
      key.includes('Rpm') ||
      key.includes('Kg') ||
      key === 'accel0To100S' ||
      key === 'brakeForceDistribution'
    ) {
      properties[key] = nullable({ type: 'number' });
      continue;
    }
    if (key.includes('Months')) {
      properties[key] = nullable({ type: 'integer' });
      continue;
    }
    properties[key] = nullable({ type: 'string' });
  }

  return {
    type: 'object',
    properties,
    additionalProperties: false,
  };
}

export function normalizeVehicleTokenIds(tokenIds?: number[]): number[] | undefined {
  if (!tokenIds?.length) return undefined;
  const unique = [...new Set(tokenIds.filter((id) => Number.isFinite(id) && id > 0))];
  return unique.length > 0 ? unique.sort((a, b) => a - b) : undefined;
}

export function resolveVehicleSpecsScope(tokenIds?: number[]): VehicleSpecsScopeResolution {
  const vehicleIds = normalizeVehicleTokenIds(tokenIds);
  if (vehicleIds) {
    return { vehicleIds, hasVehicleScope: true, knowledgeOnlyFallback: false };
  }
  return { vehicleIds: undefined, hasVehicleScope: false, knowledgeOnlyFallback: true };
}

export function buildVehicleSpecPrompt(
  vehicle: VehicleSpecContext | undefined,
  scope: VehicleSpecsScopeResolution,
): { system: string; user: string } {
  const vinLine = vehicle?.vin ? `VIN: ${vehicle.vin}` : '';
  const makeLine = vehicle?.make ? `MAKE: ${vehicle.make}` : '';
  const modelLine = vehicle?.model ? `MODEL: ${vehicle.model}` : '';
  const yearLine = vehicle?.year ? `YEAR: ${vehicle.year}` : '';
  const drivetrainLine = vehicle?.drivetrain ? `DRIVETRAIN: ${vehicle.drivetrain}` : '';
  const powertrainLine = vehicle?.powertrainType ? `POWERTRAIN_TYPE: ${vehicle.powertrainType}` : '';
  const fuelTypeLine = vehicle?.fuelType ? `FUEL_TYPE: ${vehicle.fuelType}` : '';
  const vehicleBlock = [vinLine, makeLine, modelLine, yearLine, drivetrainLine, powertrainLine, fuelTypeLine]
    .filter(Boolean)
    .join('\n');
  const tokenCtx =
    scope.vehicleIds && scope.vehicleIds.length > 0
      ? `Vehicle Token IDs (DIMO linkage for context only): ${scope.vehicleIds.join(', ')}`
      : '';

  const scopeNote = scope.knowledgeOnlyFallback
    ? 'No DIMO tokenId is available. Use make/model/year/VIN context only. Do NOT claim live DIMO telemetry or invent live vehicle data.'
    : 'DIMO tokenId(s) provided — vehicle context may be used, but return OEM factory specs as JSON only.';

  const system = `You are an OEM technical-data extraction engine for a fleet platform.
Return ONLY JSON matching the strict schema. Use automotive knowledge only — no web search, no live telemetry claims.
null means unknown; never invent variant-specific numbers.
${scopeNote}
MHEV (MHEV_12V/MHEV_48V): hvBatteryPresent must be false and all hvBattery* fields null.
BEV/PHEV/FULL_HYBRID/FCEV: hvBatteryPresent true when a traction pack exists.
When variantConfidence is below 0.7 or ambiguousVariants has more than one entry, leave variant-specific numerics null.
Do not output URLs. sourceNote describes evidence type in plain text only (no links).`;

  const user = `${vehicleBlock ? `Vehicle context:\n${vehicleBlock}\n${tokenCtx}\n` : ''}
Resolve the exact variant for the identity above and return factory/OEM specifications.
Rules:
- Identity (MAKE/MODEL/YEAR) is authoritative; resolvedVariant must refer to this vehicle line
- numbers without units in numeric fields
- tankCapacityLiters: ICE/HEV/PHEV tank liters; null for pure BEV
- drivetrain: FWD, RWD, AWD, FOUR_WD (4WD alias accepted)
- electrificationLevel: NONE, MHEV_12V, MHEV_48V, FULL_HYBRID, PHEV, BEV, FCEV
- variantConfidence: 0..1; below 0.7 when uncertain
- ambiguousVariants: candidate trims when uncertain (empty when confident)
- brake disc diameter (*RotorDiameterMm) vs nominal new disc thickness (*RotorWidthMm) are different quantities
- frontPadThicknessMm: factory NEW pad material thickness, not measured wear
- Zulassungsbescheinigung P.2 is not traction power without variant context
- systemPowerDefinition: OEM_RATED_MOTOR_KW when systemMotorPowerKw is ICE/single-motor rated power; OEM_RATED_SYSTEM_KW when it is OEM combined system power (BEV/PHEV/hybrid) with variant confidence >= 0.7; OEM_RATED_SYSTEM_KW_ESTIMATED when systemMotorPowerKw is filled but rating type is uncertain; null when systemMotorPowerKw is null or variant gate applies — never infer from fuelType/electrificationLevel alone`;

  return { system, user };
}

export function parseVehicleSpecJson(
  parsed: Record<string, unknown> | null | undefined,
): Record<string, string | number | boolean | null> {
  const result = buildVehicleSpecEmptyShape();
  if (!parsed || typeof parsed !== 'object') return result;

  for (const key of Object.keys(result)) {
    if (key in parsed && parsed[key] !== undefined) {
      result[key] = parsed[key] as string | number | boolean | null;
    }
  }
  if (Array.isArray(parsed.ambiguousVariants)) {
    (result as Record<string, unknown>).ambiguousVariants = parsed.ambiguousVariants;
  }

  if (result.lvBatteryType !== null && result.batteryType === null) result.batteryType = result.lvBatteryType;
  if (result.lvBatteryAmpere !== null && result.batteryAmpere === null) result.batteryAmpere = result.lvBatteryAmpere;
  if (result.lvBatteryVolt !== null && result.batteryVolt === null) result.batteryVolt = result.lvBatteryVolt;
  if (result.hvBatteryUsableCapacityKwh !== null && result.hvBatteryCapacityKwh === null) {
    result.hvBatteryCapacityKwh = result.hvBatteryUsableCapacityKwh;
  }

  return result;
}
