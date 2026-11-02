import { api } from '../../lib/api';
import type { DimoVehicle, RegisteredVehicle } from '../data/platform-data';
import { parseMotionPhysicsCurbMassField } from './motion-physics-reference-sync.util';
import {
  applySelectedHvCatalogEvidenceToVehicle,
  buildHvMasterSpecPatchFromRegisteredVehicle,
} from './master-hv-master-specification.util';
import type { VehicleAiFieldProvenanceMap } from './vehicle-ai-field-provenance.util';
import {
  upsertBrakeReferenceSpecOnEdit,
  upsertLvBatterySpecOnEdit,
} from './master-vehicle-manual-baseline-edit.util';
import {
  parseFrontWeightDistributionPct,
  parsePositiveIntegerField,
  parseBrakeForceFrontPercent,
  parseVehicleRpmField,
} from './vehicle-technical-spec.util';
import {
  normalizeCanonicalDrivetrain,
  normalizeLvBatteryTypeInput,
  stripNonPersistentVehicleSpecFields,
} from './vehicle-specification-canonical.util';

function parseOptionalNumber(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseOptionalFloat(value: string | undefined | null): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const MHEV_ELECTRIFICATION_LEVELS = new Set(['MHEV_12V', 'MHEV_48V']);

export function isElectrifiedFuelType(
  fuelType: string | undefined | null,
  electrificationLevel?: string | null,
): boolean {
  const level = String(electrificationLevel ?? '').trim().toUpperCase();
  if (level && MHEV_ELECTRIFICATION_LEVELS.has(level)) {
    return false;
  }
  if (level === 'NONE') {
    return false;
  }
  if (
    level === 'BEV' ||
    level === 'PHEV' ||
    level === 'FULL_HYBRID' ||
    level === 'FCEV'
  ) {
    return true;
  }
  const fuel = String(fuelType ?? '').trim().toLowerCase();
  if (!fuel) return false;
  if (fuel.includes('mild') || fuel.includes('mhev') || fuel.includes('48v')) {
    return false;
  }
  return (
    fuel.includes('electric') ||
    fuel.includes('plugin') ||
    fuel.includes('phev') ||
    (fuel.includes('hybrid') && !fuel.includes('mild'))
  );
}

/** HV traction capacity fields for Master DIMO register-from-dimo extraData (usable vs gross kept separate). */
export function buildMasterHvCapacityExtraFields(
  rv: RegisteredVehicle,
): Record<string, number> {
  if (!isElectrifiedFuelType(rv.fuelType, rv.electrificationLevel)) return {};

  const usable =
    parseOptionalFloat(rv.hvBatteryUsableCapacityKwh) ??
    parseOptionalFloat(rv.hvBatteryCapacityKwh);
  const gross = parseOptionalFloat(rv.hvBatteryGrossCapacityKwh);

  const out: Record<string, number> = {};
  if (usable != null) out.hvBatteryUsableCapacityKwh = usable;
  if (gross != null) out.hvBatteryGrossCapacityKwh = gross;
  return out;
}

export function mapApiDimoToDimoVehicle(raw: Record<string, unknown>): DimoVehicle {
  const connectionStatus =
    raw.connectionStatus === 'Connected' || raw.connection_status === 'Connected'
      ? 'Connected'
      : 'Disconnected';
  return {
    id: String(raw.id ?? raw.dimoVehicleId ?? ''),
    tokenId:
      raw.tokenId != null
        ? Number(raw.tokenId)
        : raw.token_id != null
          ? Number(raw.token_id)
          : null,
    vin: String(raw.vin ?? ''),
    make: String(raw.make ?? raw.brand ?? 'Unknown'),
    model: String(raw.model ?? 'Unknown'),
    year: Number(raw.year ?? new Date().getFullYear()),
    odometer: Number(raw.odometer ?? raw.mileageKm ?? raw.mileage_km ?? 0),
    battery: raw.battery != null ? Number(raw.battery) : raw.batteryLevel != null ? Number(raw.batteryLevel) : null,
    fuelLevel: raw.fuelLevel != null ? Number(raw.fuelLevel) : raw.fuel_level != null ? Number(raw.fuel_level) : null,
    powertrainType: (raw.powertrainType ?? raw.powertrain_type ?? null) as string | null,
    lastSignal: String(raw.lastSignal ?? raw.last_signal ?? ''),
    connectionStatus,
  };
}

/** Registration submit treats populated spec fields as explicitly confirmed (parity with edit PATCH). */
export function buildRegistrationTechnicalConfirmedFieldKeys(rv: RegisteredVehicle): string[] {
  const keys: string[] = [];
  const pushIf = (key: string, present: boolean) => {
    if (present) keys.push(key);
  };
  pushIf('engineDisplacementCc', parsePositiveIntegerField(rv.engineDisplacementCc) != null);
  pushIf('cylinderCount', parsePositiveIntegerField(rv.cylinderCount) != null);
  pushIf(
    'frontToRearWeightDistribution',
    Boolean(rv.frontToRearWeightDistribution?.trim()),
  );
  pushIf('idleRpm', parseVehicleRpmField(rv.idleRpm) != null);
  pushIf('maxRpm', parseVehicleRpmField(rv.maxRpm) != null);
  pushIf(
    'brakeForceDistribution',
    parseBrakeForceFrontPercent(rv.brakeForceDistribution) != null ||
      rv.brakeForceDistribution?.trim() === '',
  );
  pushIf('tankCapacityLiters', parseOptionalFloat(rv.tankCapacityLiters) != null);
  pushIf(
    'manufacturerServiceIntervalKm',
    parsePositiveIntegerField(rv.serviceIntervalManufacturerKm) != null,
  );
  pushIf(
    'manufacturerServiceIntervalMonths',
    parsePositiveIntegerField(rv.serviceIntervalManufacturerMonths) != null,
  );
  pushIf('oilchangeIntervalKm', parsePositiveIntegerField(rv.oilChangeIntervalKm) != null);
  pushIf('oilchangeIntervalMonths', parsePositiveIntegerField(rv.oilChangeIntervalMonths) != null);
  pushIf('drivetrain', Boolean(rv.drivetrain?.trim()));
  return keys;
}

export function buildVehicleExtraData(
  rv: RegisteredVehicle,
  options?: { aiFieldProvenance?: VehicleAiFieldProvenanceMap },
): Record<string, unknown> {
  const aiFieldProvenance = options?.aiFieldProvenance ?? rv.aiFieldProvenance;
  const out: Record<string, unknown> = stripNonPersistentVehicleSpecFields({
    vehicleName: rv.vehicleName || `${rv.make} ${rv.model}`.trim(),
    licensePlate: rv.licensePlate || undefined,
    mileageKm: parseOptionalNumber(rv.mileage) ?? 0,
    fuelType: rv.fuelType,
    vehicleType: rv.vehicleType,
    hardwareType: rv.hardwareType ?? 'UNKNOWN',
    notes: rv.notes || undefined,
    drivetrain:
      normalizeCanonicalDrivetrain(rv.drivetrain) ?? (rv.drivetrain?.trim() || undefined),
    curbWeightKg: parseOptionalNumber(rv.curbWeight),
    systemMotorPowerKw: parseOptionalFloat(rv.systemMotorPowerKw),
    accel0To100S: parseOptionalFloat(rv.accel0To100S),
    motionPhysicsVariantAssumption: rv.motionPhysicsVariantAssumption?.trim() || undefined,
    idleRpm: parseOptionalNumber(rv.idleRpm),
    maxRpm: parseOptionalNumber(rv.maxRpm),
    brakeForceFrontPercent: parseOptionalFloat(rv.brakeForceDistribution),
    frontToRearWeightDistribution: rv.frontToRearWeightDistribution || undefined,
    engineDisplacementCc: parsePositiveIntegerField(rv.engineDisplacementCc) ?? undefined,
    cylinderCount: parsePositiveIntegerField(rv.cylinderCount) ?? undefined,
    tankCapacityLiters: parseOptionalFloat(rv.tankCapacityLiters),
    serviceIntervalManufacturerKm: parseOptionalNumber(rv.serviceIntervalManufacturerKm),
    serviceIntervalManufacturerMonths: parseOptionalNumber(rv.serviceIntervalManufacturerMonths),
    oilChangeIntervalKm: parseOptionalNumber(rv.oilChangeIntervalKm),
    oilChangeIntervalMonths: parseOptionalNumber(rv.oilChangeIntervalMonths),
    ...buildMasterHvCapacityExtraFields(rv),
    ...(aiFieldProvenance && Object.keys(aiFieldProvenance).length > 0
      ? { aiFieldProvenance }
      : {}),
  });
  const confirmedFieldKeys = buildRegistrationTechnicalConfirmedFieldKeys(rv);
  if (confirmedFieldKeys.length > 0) {
    out.technicalSpecificationSave = { confirmedFieldKeys };
  }
  return out;
}

export function buildVehicleManualSpecs(rv: RegisteredVehicle) {
  const frontPad = parseOptionalFloat(rv.brakeFrontPadThickness);
  const rearPad = parseOptionalFloat(rv.brakeBackPadThickness);
  const hasBrakeInput =
    frontPad != null ||
    rearPad != null ||
    parseOptionalFloat(rv.brakeFrontRotorDiameter) != null ||
    parseOptionalFloat(rv.brakeBackRotorDiameter) != null;

  const hasTireInput =
    Boolean(rv.tireFrontDimension?.trim()) ||
    Boolean(rv.tireBackDimension?.trim()) ||
    parseOptionalFloat(rv.treadDepthFL) != null;

  const manualSpecs: Record<string, unknown> = {};

  if (rv.batteryType || rv.batteryAmpere || rv.batteryVolt) {
    const batteryType =
      normalizeLvBatteryTypeInput(rv.batteryType) ?? null;
    if (batteryType) {
      manualSpecs.battery = {
        batteryType,
        batteryAmpere: parseOptionalNumber(rv.batteryAmpere),
        batteryVolt: parseOptionalNumber(rv.batteryVolt),
      };
    }
  }

  if (hasBrakeInput) {
    manualSpecs.brakes = {
      condition: 'UNKNOWN',
      odometerKm: parseOptionalNumber(rv.mileage),
      frontPadThickness: frontPad,
      rearPadThickness: rearPad,
      frontRotorDiameter: parseOptionalFloat(rv.brakeFrontRotorDiameter),
      rearRotorDiameter: parseOptionalFloat(rv.brakeBackRotorDiameter),
      frontRotorWidth: parseOptionalFloat(rv.brakeFrontRotorWidth),
      rearRotorWidth: parseOptionalFloat(rv.brakeBackRotorWidth),
    };
  }

  if (hasTireInput) {
    manualSpecs.tires = {
      frontDimension: rv.tireFrontDimension || null,
      rearDimension: rv.tireBackDimension || null,
      brandModelFront: rv.tireFrontBrandModel || null,
      brandModelRear: rv.tireBackBrandModel || null,
      tireSeason: rv.tireFrontSeason || null,
      loadIndexFront: rv.tireFrontLoadIndex || null,
      speedIndexFront: rv.tireFrontSpeedIndex || null,
      loadIndexRear: rv.tireBackLoadIndex || null,
      speedIndexRear: rv.tireBackSpeedIndex || null,
      dotCodeFront: rv.tireFrontDot || null,
      dotCodeRear: rv.tireBackDot || null,
      tireCondition: rv.tireCondition || null,
      treadFL: parseOptionalFloat(rv.treadDepthFL),
      treadFR: parseOptionalFloat(rv.treadDepthFR),
      treadBL: parseOptionalFloat(rv.treadDepthBL),
      treadBR: parseOptionalFloat(rv.treadDepthBR),
      aiTireSpec: rv.aiTireSpec ?? null,
    };
  }

  return Object.keys(manualSpecs).length > 0 ? manualSpecs : undefined;
}

export type ManualBaselineArea = 'tires' | 'battery' | 'brakes';

export type ManualBaselineFailure = {
  area: ManualBaselineArea;
  message: string;
};

export type PostActivationEnrichmentResult = {
  tireTread?: {
    status: 'FAILED';
    message: string;
  };
};

export type PersistMasterVehicleResult = {
  vehicleId: string;
  /** Present when the vehicle was created but post-create baseline APIs failed (manual create only). */
  baselineFailures?: ManualBaselineFailure[];
  /** Present when register-from-dimo succeeded but server-side tire enrichment failed. */
  postActivationEnrichment?: PostActivationEnrichmentResult;
};

function baselineErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return 'UNKNOWN_ERROR';
}

type ManualTirePayload = {
  frontDimension?: string | null;
  rearDimension?: string | null;
  brandModelFront?: string | null;
  brandModelRear?: string | null;
  tireSeason?: string | null;
  loadIndexFront?: string | null;
  speedIndexFront?: string | null;
  loadIndexRear?: string | null;
  speedIndexRear?: string | null;
  dotCodeFront?: string | null;
  dotCodeRear?: string | null;
  tireCondition?: string | null;
  treadFL?: number | null;
  treadFR?: number | null;
  treadBL?: number | null;
  treadBR?: number | null;
};
type ManualBrakePayload = {
  odometerKm?: number | null;
  frontPadThickness?: number | null;
  rearPadThickness?: number | null;
  frontRotorDiameter?: number | null;
  rearRotorDiameter?: number | null;
  frontRotorWidth?: number | null;
  rearRotorWidth?: number | null;
  workshopMeasurementConfirmed?: boolean | null;
  frontPadMeasuredMm?: number | null;
  rearPadMeasuredMm?: number | null;
  frontDiscMeasuredMm?: number | null;
  rearDiscMeasuredMm?: number | null;
};
type ManualBatteryPayload = {
  batteryType?: string | null;
  batteryAmpere?: number | null;
  batteryVolt?: number | null;
};

/** Not persisted on Connected Vehicle edit-save (no durable vehicle column / contract). */
export const VEHICLE_AI_V2_EDIT_NON_PERSISTENT_FIELDS = [
  'electrificationLevel',
  'lvBatteryChemistry',
] as const;

/** Fields only applied via register-from-dimo today (no safe post-create API). */
export const MANUAL_CREATE_UNSUPPORTED_REGISTERED_VEHICLE_FIELDS = [
  'serviceHistory',
  'highMobilityActivation',
] as const;

/** Not persisted on register-from-dimo (no vehicle columns); use vehicle update after registration. */
export const REGISTER_FROM_DIMO_UNSUPPORTED_EXTRA_FIELDS = [
  'engineDisplacementCc',
  'cylinderCount',
] as const;

export async function applyManualBaselinesAfterCreate(
  orgId: string,
  vehicleId: string,
  rv: RegisteredVehicle,
): Promise<ManualBaselineFailure[]> {
  const failures: ManualBaselineFailure[] = [];
  const manualSpecs = buildVehicleManualSpecs(rv);
  if (!manualSpecs) return failures;

  const tires = manualSpecs.tires as ManualTirePayload | undefined;
  if (tires) {
    try {
      await api.vehicles.upsertTires(orgId, vehicleId, {
      frontDimension: tires.frontDimension ?? null,
      rearDimension: tires.rearDimension ?? null,
      brandModelFront: tires.brandModelFront ?? null,
      brandModelRear: tires.brandModelRear ?? null,
      tireSeason: tires.tireSeason ?? null,
      loadIndexFront: tires.loadIndexFront ?? null,
      speedIndexFront: tires.speedIndexFront ?? null,
      loadIndexRear: tires.loadIndexRear ?? null,
      speedIndexRear: tires.speedIndexRear ?? null,
      dotCodeFront: tires.dotCodeFront ?? null,
      dotCodeRear: tires.dotCodeRear ?? null,
      tireCondition: tires.tireCondition ?? null,
      treadFL: tires.treadFL ?? null,
      treadFR: tires.treadFR ?? null,
      treadBL: tires.treadBL ?? null,
      treadBR: tires.treadBR ?? null,
      });
    } catch (error) {
      failures.push({ area: 'tires', message: baselineErrorMessage(error) });
    }
  }

  const battery = manualSpecs.battery as ManualBatteryPayload | undefined;
  if (battery) {
    try {
      await api.vehicleIntelligence.createBatterySpec(vehicleId, {
      batteryType: battery.batteryType ?? null,
      batteryAmpere: battery.batteryAmpere ?? null,
      batteryVolt: battery.batteryVolt ?? null,
      sourceType: 'MANUAL',
      sourceConfidence: 1,
      });
    } catch (error) {
      failures.push({ area: 'battery', message: baselineErrorMessage(error) });
    }
  }

  const brakes = manualSpecs.brakes as ManualBrakePayload | undefined;
  if (brakes?.workshopMeasurementConfirmed === true) {
    const measured = {
      frontPadMm: brakes.frontPadMeasuredMm ?? undefined,
      rearPadMm: brakes.rearPadMeasuredMm ?? undefined,
      frontDiscMm: brakes.frontDiscMeasuredMm ?? undefined,
      rearDiscMm: brakes.rearDiscMeasuredMm ?? undefined,
    };
    const hasExplicitMeasured = Object.values(measured).some((v) => v != null);
    if (hasExplicitMeasured) {
      try {
        await api.vehicleIntelligence.recordBrakeService(vehicleId, {
          serviceDate: new Date().toISOString(),
          odometerKm: brakes.odometerKm ?? parseOptionalNumber(rv.mileage) ?? undefined,
          source: 'manual',
          measured,
          initializeIfPossible: true,
        });
      } catch (error) {
        failures.push({ area: 'brakes', message: baselineErrorMessage(error) });
      }
    }
  }

  return failures;
}

function manualSpecJson(value: ReturnType<typeof buildVehicleManualSpecs>): string {
  return JSON.stringify(value ?? null);
}

export async function applyManualBaselinesOnEdit(
  orgId: string,
  vehicleId: string,
  current: RegisteredVehicle,
  baseline: RegisteredVehicle,
): Promise<ManualBaselineFailure[]> {
  const failures: ManualBaselineFailure[] = [];
  const nextSpecs = buildVehicleManualSpecs(current);
  const prevSpecs = buildVehicleManualSpecs(baseline);
  if (manualSpecJson(nextSpecs) === manualSpecJson(prevSpecs)) {
    return failures;
  }
  if (!nextSpecs) return failures;

  const tires = nextSpecs.tires as ManualTirePayload | undefined;
  const prevTires = prevSpecs?.tires as ManualTirePayload | undefined;
  if (tires && JSON.stringify(tires) !== JSON.stringify(prevTires)) {
    try {
      await api.vehicles.upsertTires(orgId, vehicleId, {
        frontDimension: tires.frontDimension ?? null,
        rearDimension: tires.rearDimension ?? null,
        brandModelFront: tires.brandModelFront ?? null,
        brandModelRear: tires.brandModelRear ?? null,
        tireSeason: tires.tireSeason ?? null,
        loadIndexFront: tires.loadIndexFront ?? null,
        speedIndexFront: tires.speedIndexFront ?? null,
        loadIndexRear: tires.loadIndexRear ?? null,
        speedIndexRear: tires.speedIndexRear ?? null,
        dotCodeFront: tires.dotCodeFront ?? null,
        dotCodeRear: tires.dotCodeRear ?? null,
        tireCondition: tires.tireCondition ?? null,
        treadFL: tires.treadFL ?? null,
        treadFR: tires.treadFR ?? null,
        treadBL: tires.treadBL ?? null,
        treadBR: tires.treadBR ?? null,
      });
    } catch (error) {
      failures.push({ area: 'tires', message: baselineErrorMessage(error) });
    }
  }

  const battery = nextSpecs.battery as ManualBatteryPayload | undefined;
  const prevBattery = prevSpecs?.battery as ManualBatteryPayload | undefined;
  if (battery && JSON.stringify(battery) !== JSON.stringify(prevBattery)) {
    try {
      await upsertLvBatterySpecOnEdit(vehicleId, battery);
    } catch (error) {
      failures.push({ area: 'battery', message: baselineErrorMessage(error) });
    }
  }

  const brakes = nextSpecs.brakes as ManualBrakePayload | undefined;
  const prevBrakes = prevSpecs?.brakes as ManualBrakePayload | undefined;
  if (brakes?.workshopMeasurementConfirmed === true) {
    const measured = {
      frontPadMm: brakes.frontPadMeasuredMm ?? undefined,
      rearPadMm: brakes.rearPadMeasuredMm ?? undefined,
      frontDiscMm: brakes.frontDiscMeasuredMm ?? undefined,
      rearDiscMm: brakes.rearDiscMeasuredMm ?? undefined,
    };
    const hasExplicitMeasured = Object.values(measured).some((v) => v != null);
    if (hasExplicitMeasured) {
      try {
        await api.vehicleIntelligence.recordBrakeService(vehicleId, {
          serviceDate: new Date().toISOString(),
          odometerKm: brakes.odometerKm ?? parseOptionalNumber(current.mileage) ?? undefined,
          source: 'manual',
          measured,
          initializeIfPossible: true,
        });
      } catch (error) {
        failures.push({ area: 'brakes', message: baselineErrorMessage(error) });
      }
    }
  } else if (brakes && JSON.stringify(brakes) !== JSON.stringify(prevBrakes)) {
    try {
      await upsertBrakeReferenceSpecOnEdit(vehicleId, brakes);
    } catch (error) {
      failures.push({ area: 'brakes', message: baselineErrorMessage(error) });
    }
  }

  return failures;
}

/** Admin GET may expose legacy `hvBatteryCapacityKwh` without split usable/gross fields. */
export function resolveAdminDtoHvUsableCapacityKwh(
  dto: Record<string, unknown>,
): string {
  const usable = dto.hvBatteryUsableCapacityKwh;
  if (usable != null && String(usable).trim() !== '') {
    return String(usable);
  }
  const legacy = dto.hvBatteryCapacityKwh;
  if (legacy != null && String(legacy).trim() !== '') {
    return String(legacy);
  }
  return '';
}

export function assertMasterHvCapacityConsistency(rv: RegisteredVehicle): void {
  const usable =
    parseOptionalFloat(rv.hvBatteryUsableCapacityKwh) ??
    parseOptionalFloat(rv.hvBatteryCapacityKwh);
  const gross = parseOptionalFloat(rv.hvBatteryGrossCapacityKwh);
  if (usable != null && gross != null && usable > gross) {
    throw new Error('HV_USABLE_EXCEEDS_GROSS');
  }
}

export type MasterVehicleHvStammdatenDiff = {
  vehiclePatch: Record<string, unknown>;
  usableReferenceKwh: number | null;
  usableReferenceChanged: boolean;
};

/**
 * Master spec edit: vehicle-table HV scalars (usable legacy column + tank).
 * Gross kWh has no vehicle column; canonical gross reference is not written here
 * (single active reference row + gross not used as SOH reference on register).
 */
export function buildMasterVehicleHvStammdatenDiff(
  current: RegisteredVehicle,
  baseline: RegisteredVehicle,
): MasterVehicleHvStammdatenDiff {
  const vehiclePatch: Record<string, unknown> = {};
  const electrified = isElectrifiedFuelType(current.fuelType, current.electrificationLevel);

  const nextUsable =
    parseOptionalFloat(current.hvBatteryUsableCapacityKwh) ??
    parseOptionalFloat(current.hvBatteryCapacityKwh);
  const prevUsable =
    parseOptionalFloat(baseline.hvBatteryUsableCapacityKwh) ??
    parseOptionalFloat(baseline.hvBatteryCapacityKwh);

  if (electrified) {
    if (nextUsable !== prevUsable) {
      vehiclePatch.hvBatteryCapacityKwh = nextUsable;
    }
  }

  const nextTank = parseOptionalFloat(current.tankCapacityLiters);
  const prevTank = parseOptionalFloat(baseline.tankCapacityLiters);
  if (nextTank !== prevTank) {
    vehiclePatch.tankCapacityLiters = nextTank;
  }

  const usableReferenceChanged =
    electrified && nextUsable != null && nextUsable !== prevUsable;

  return {
    vehiclePatch,
    usableReferenceKwh: electrified ? nextUsable : null,
    usableReferenceChanged,
  };
}

/** Maps Master admin GET vehicle DTO into the registration modal shape (full baseline for edit). */
export function mapAdminVehicleDtoToRegisteredVehicle(
  dto: Record<string, unknown>,
): RegisteredVehicle {
  const str = (key: string, fallback = '') => {
    const v = dto[key];
    return v != null && String(v).trim() !== '' ? String(v) : fallback;
  };
  const num = (key: string, fallback = 0) => {
    const v = dto[key];
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const makeRaw = str('make');
  const modelRaw = str('model');
  const mileageRaw = dto.mileage ?? dto.mileageKm;
  const hardwareRaw = dto.hardwareType != null ? String(dto.hardwareType).trim() : '';

  return {
    id: str('id'),
    vehicleName: str('vehicleName', `${makeRaw} ${modelRaw}`.trim()),
    vin: str('vin'),
    make: makeRaw || 'Unknown',
    model: modelRaw || 'Unknown',
    year: dto.year != null && dto.year !== '' ? num('year', 0) : 0,
    organizationId: str('organizationId'),
    organizationName: str('organizationName'),
    station: str('station'),
    status: (str('status') as RegisteredVehicle['status']) || 'Available',
    health: (str('health') as RegisteredVehicle['health']) || 'Good',
    lastSignal: str('lastSignal'),
    online: Boolean(dto.online),
    fuelType: str('fuelType'),
    mileage:
      mileageRaw != null && mileageRaw !== '' && Number.isFinite(Number(mileageRaw))
        ? Number(mileageRaw)
        : 0,
    licensePlate: str('licensePlate'),
    vehicleType: str('vehicleType'),
    operationalStatus: str('operationalStatus', 'Active'),
    notes: str('notes'),
    batteryType: str('batteryType'),
    batteryAmpere: str('batteryAmpere'),
    batteryVolt: str('batteryVolt'),
    lvBatteryChemistry: str('lvBatteryChemistry'),
    hvBatteryCapacityKwh:
      str('hvBatteryCapacityKwh') || resolveAdminDtoHvUsableCapacityKwh(dto),
    tankCapacityLiters: str('tankCapacityLiters'),
    hvBatteryPresent: str('hvBatteryPresent'),
    hvBatteryChemistry: str('hvBatteryChemistry'),
    hvBatteryCellFormat: str('hvBatteryCellFormat'),
    hvBatteryGrossCapacityKwh: str('hvBatteryGrossCapacityKwh'),
    hvBatteryUsableCapacityKwh: resolveAdminDtoHvUsableCapacityKwh(dto),
    hvBatteryNominalVoltage: str('hvBatteryNominalVoltage'),
    hvBatteryArchitecture: str('hvBatteryArchitecture'),
    hvBatteryThermalManagement: str('hvBatteryThermalManagement'),
    hvBatteryWarrantyYears: str('hvBatteryWarrantyYears'),
    hvBatteryWarrantyKm: str('hvBatteryWarrantyKm'),
    acOnboardChargerKw: str('acOnboardChargerKw'),
    dcFastChargeMaxKw: str('dcFastChargeMaxKw'),
    engineDisplacementCc: str('engineDisplacementCc'),
    cylinderCount: str('cylinderCount'),
    tireFrontDimension: str('tireFrontDimension'),
    tireFrontBrandModel: str('tireFrontBrandModel'),
    tireFrontSeason: str('tireFrontSeason'),
    tireFrontDot: str('tireFrontDot'),
    tireFrontLoadIndex: str('tireFrontLoadIndex'),
    tireFrontSpeedIndex: str('tireFrontSpeedIndex'),
    tireBackDimension: str('tireBackDimension'),
    tireBackBrandModel: str('tireBackBrandModel'),
    tireBackSeason: str('tireBackSeason'),
    tireBackDot: str('tireBackDot'),
    tireBackLoadIndex: str('tireBackLoadIndex'),
    tireBackSpeedIndex: str('tireBackSpeedIndex'),
    treadDepthFL: str('treadDepthFL'),
    treadDepthFR: str('treadDepthFR'),
    treadDepthBL: str('treadDepthBL'),
    treadDepthBR: str('treadDepthBR'),
    tireCondition: (str('tireCondition') as RegisteredVehicle['tireCondition']) || '',
    aiTireSpec: (dto.aiTireSpec as Record<string, unknown> | null) ?? null,
    brakeFrontRotorDiameter: str('brakeFrontRotorDiameter'),
    brakeFrontRotorWidth: str('brakeFrontRotorWidth'),
    brakeFrontPadThickness: str('brakeFrontPadThickness'),
    brakeBackRotorDiameter: str('brakeBackRotorDiameter'),
    brakeBackRotorWidth: str('brakeBackRotorWidth'),
    brakeBackPadThickness: str('brakeBackPadThickness'),
    idleRpm: str('idleRpm'),
    maxRpm: str('maxRpm'),
    drivetrain: str('drivetrain'),
    brakeForceDistribution: str('brakeForceDistribution'),
    frontToRearWeightDistribution: str('frontToRearWeightDistribution'),
    curbWeight: str('curbWeight'),
    systemMotorPowerKw: str('systemMotorPowerKw'),
    accel0To100S: str('accel0To100S'),
    motionPhysicsVariantAssumption: str('motionPhysicsVariantAssumption'),
    systemPowerDefinition: str('systemPowerDefinition'),
    connectionModality:
      dto.connectionModality != null && String(dto.connectionModality).trim() !== ''
        ? String(dto.connectionModality)
        : null,
    telemetryConnectionFamily:
      dto.telemetryConnectionFamily != null &&
      String(dto.telemetryConnectionFamily).trim() !== ''
        ? String(dto.telemetryConnectionFamily)
        : null,
    serviceIntervals: str('serviceIntervals'),
    serviceIntervalManufacturerKm: str('serviceIntervalManufacturerKm'),
    serviceIntervalManufacturerMonths: str('serviceIntervalManufacturerMonths'),
    oilChangeIntervalKm: str('oilChangeIntervalKm'),
    oilChangeIntervalMonths: str('oilChangeIntervalMonths'),
    lastTuev: str('lastTuev'),
    lastBokraft: str('lastBokraft'),
    lastInspection: str('lastInspection'),
    lastOilChange: str('lastOilChange'),
    lastBrakePadChange: str('lastBrakePadChange'),
    lastBrakeRotorChange: str('lastBrakeRotorChange'),
    hardwareType: (hardwareRaw || 'UNKNOWN') as RegisteredVehicle['hardwareType'],
    hvMasterSpecificationProvenance:
      dto.hvMasterSpecificationProvenance === 'ESTIMATED' ||
      dto.hvMasterSpecificationProvenance === 'CONFIRMED'
        ? dto.hvMasterSpecificationProvenance
        : null,
    hvMasterSpecificationVariantLabel:
      dto.hvMasterSpecificationVariantLabel != null
        ? String(dto.hvMasterSpecificationVariantLabel)
        : null,
    hvMasterSpecificationEvidenceNote:
      dto.hvMasterSpecificationEvidenceNote != null
        ? String(dto.hvMasterSpecificationEvidenceNote)
        : null,
    hvMasterSpecificationCatalogReferences: Array.isArray(dto.hvMasterSpecificationCatalogReferences)
      ? dto.hvMasterSpecificationCatalogReferences
          .map((r) => (typeof r === 'string' ? r.trim() : ''))
          .filter((r) => r.length > 0)
      : null,
    hvMasterSpecificationCatalogVariantKey:
      dto.hvMasterSpecificationCatalogVariantKey != null
        ? String(dto.hvMasterSpecificationCatalogVariantKey).trim() || null
        : null,
    hvMasterSpecificationFieldChangeClassification:
      dto.hvMasterSpecificationFieldChangeClassification != null
        ? String(dto.hvMasterSpecificationFieldChangeClassification)
        : null,
  };
}

export type MasterVehicleSaveOutcome = {
  physicsSaved: boolean;
  hvMasterSaved: boolean;
  manualBaselinesSaved: boolean;
};

export class MasterVehiclePartialSaveError extends Error {
  readonly outcome: MasterVehicleSaveOutcome;
  readonly failures: Array<{ step: 'physics' | 'hvMaster' | 'manualBaselines'; message: string }>;

  constructor(
    outcome: MasterVehicleSaveOutcome,
    failures: Array<{ step: 'physics' | 'hvMaster' | 'manualBaselines'; message: string }>,
  ) {
    super('MASTER_VEHICLE_PARTIAL_SAVE');
    this.name = 'MasterVehiclePartialSaveError';
    this.outcome = outcome;
    this.failures = failures;
  }
}

export function parseCurbWeightKgFromForm(curbWeight: string | undefined | null): number | null {
  const parsed = parseMotionPhysicsCurbMassField(String(curbWeight ?? ''));
  if (parsed.status === 'empty') return null;
  if (parsed.status === 'invalid') {
    throw new Error('CURB_MASS_INVALID');
  }
  return parsed.kg;
}

function strEq(a: string | undefined | null, b: string | undefined | null): boolean {
  return String(a ?? '').trim() === String(b ?? '').trim();
}

/**
 * Connected-vehicles spec edit: vehicle-table physics scalars (curb mass + technical specs).
 * Motion power/accel/variant persist via motion-physics-reference APIs in the modal.
 */
export function buildMasterVehiclePhysicsSpecPatch(
  current: RegisteredVehicle,
  baseline: RegisteredVehicle,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const confirmedFieldKeys: string[] = [];

  const nextKg = parseCurbWeightKgFromForm(current.curbWeight);
  const prevKg = parseCurbWeightKgFromForm(baseline.curbWeight);
  if (nextKg != null && nextKg !== prevKg) {
    patch.curbWeightKg = nextKg;
  }

  if (!strEq(current.engineDisplacementCc, baseline.engineDisplacementCc)) {
    const parsed = parsePositiveIntegerField(current.engineDisplacementCc);
    patch.engineDisplacementCc = parsed;
    confirmedFieldKeys.push('engineDisplacementCc');
  }

  if (!strEq(current.cylinderCount, baseline.cylinderCount)) {
    const parsed = parsePositiveIntegerField(current.cylinderCount);
    patch.cylinderCount = parsed;
    confirmedFieldKeys.push('cylinderCount');
  }

  if (!strEq(current.frontToRearWeightDistribution, baseline.frontToRearWeightDistribution)) {
    const raw = current.frontToRearWeightDistribution?.trim() ?? '';
    if (!raw) {
      patch.frontToRearWeightDistribution = null;
    } else {
      const frontPct = parseFrontWeightDistributionPct(raw);
      if (frontPct == null) {
        throw new Error('INVALID_FRONT_REAR_WEIGHT_DISTRIBUTION');
      }
      patch.frontToRearWeightDistribution = raw;
      patch.frontWeightDistributionPct = frontPct;
    }
    confirmedFieldKeys.push('frontToRearWeightDistribution');
  }

  if (!strEq(current.idleRpm, baseline.idleRpm)) {
    const raw = current.idleRpm?.trim() ?? '';
    if (!raw) {
      patch.idleRpm = null;
    } else {
      const parsed = parseVehicleRpmField(raw);
      if (parsed == null) {
        throw new Error('INVALID_IDLE_RPM');
      }
      patch.idleRpm = parsed;
    }
    confirmedFieldKeys.push('idleRpm');
  }

  if (!strEq(current.maxRpm, baseline.maxRpm)) {
    const raw = current.maxRpm?.trim() ?? '';
    if (!raw) {
      patch.maxRpm = null;
    } else {
      const parsed = parseVehicleRpmField(raw);
      if (parsed == null) {
        throw new Error('INVALID_MAX_RPM');
      }
      patch.maxRpm = parsed;
    }
    confirmedFieldKeys.push('maxRpm');
  }

  if (!strEq(current.brakeForceDistribution, baseline.brakeForceDistribution)) {
    const raw = current.brakeForceDistribution?.trim() ?? '';
    if (!raw) {
      patch.brakeForceFrontPercent = null;
    } else {
      const frontPct = parseBrakeForceFrontPercent(raw);
      if (frontPct == null) {
        throw new Error('INVALID_BRAKE_FORCE_DISTRIBUTION');
      }
      patch.brakeForceFrontPercent = frontPct;
    }
    confirmedFieldKeys.push('brakeForceDistribution');
  }

  if (!strEq(current.tankCapacityLiters, baseline.tankCapacityLiters)) {
    const parsed = parseOptionalFloat(current.tankCapacityLiters);
    patch.tankCapacityLiters = parsed;
    confirmedFieldKeys.push('tankCapacityLiters');
  }

  if (!strEq(current.serviceIntervalManufacturerKm, baseline.serviceIntervalManufacturerKm)) {
    const raw = current.serviceIntervalManufacturerKm?.trim() ?? '';
    if (!raw) {
      patch.serviceIntervalManufacturerKm = null;
    } else {
      const parsed = parsePositiveIntegerField(raw);
      if (parsed == null) throw new Error('INVALID_SERVICE_INTERVAL_MANUFACTURER_KM');
      patch.serviceIntervalManufacturerKm = parsed;
    }
    confirmedFieldKeys.push('manufacturerServiceIntervalKm');
  }

  if (
    !strEq(current.serviceIntervalManufacturerMonths, baseline.serviceIntervalManufacturerMonths)
  ) {
    const raw = current.serviceIntervalManufacturerMonths?.trim() ?? '';
    if (!raw) {
      patch.serviceIntervalManufacturerMonths = null;
    } else {
      const parsed = parsePositiveIntegerField(raw);
      if (parsed == null) throw new Error('INVALID_SERVICE_INTERVAL_MANUFACTURER_MONTHS');
      patch.serviceIntervalManufacturerMonths = parsed;
    }
    confirmedFieldKeys.push('manufacturerServiceIntervalMonths');
  }

  if (!strEq(current.oilChangeIntervalKm, baseline.oilChangeIntervalKm)) {
    const raw = current.oilChangeIntervalKm?.trim() ?? '';
    if (!raw) {
      patch.oilChangeIntervalKm = null;
    } else {
      const parsed = parsePositiveIntegerField(raw);
      if (parsed == null) throw new Error('INVALID_OIL_CHANGE_INTERVAL_KM');
      patch.oilChangeIntervalKm = parsed;
    }
    confirmedFieldKeys.push('oilchangeIntervalKm');
  }

  if (!strEq(current.oilChangeIntervalMonths, baseline.oilChangeIntervalMonths)) {
    const raw = current.oilChangeIntervalMonths?.trim() ?? '';
    if (!raw) {
      patch.oilChangeIntervalMonths = null;
    } else {
      const parsed = parsePositiveIntegerField(raw);
      if (parsed == null) throw new Error('INVALID_OIL_CHANGE_INTERVAL_MONTHS');
      patch.oilChangeIntervalMonths = parsed;
    }
    confirmedFieldKeys.push('oilchangeIntervalMonths');
  }

  if (!strEq(current.drivetrain, baseline.drivetrain)) {
    patch.drivetrain = current.drivetrain?.trim() ? current.drivetrain.trim() : null;
    confirmedFieldKeys.push('drivetrain');
  }

  if (confirmedFieldKeys.length > 0) {
    patch.technicalSpecificationSave = { confirmedFieldKeys };
  }

  if (current.aiFieldProvenance && Object.keys(current.aiFieldProvenance).length > 0) {
    patch.aiFieldProvenance = current.aiFieldProvenance;
  }

  return patch;
}

export type MasterVehiclePhysicsEditOptions = {
  baseline: RegisteredVehicle;
};

/** Spec edit from Connected Vehicles — vehicle physics PATCH + manual tire/LV/brake reference baselines. */
export async function updateMasterRegisteredVehicle(
  rv: RegisteredVehicle,
  options: MasterVehiclePhysicsEditOptions,
): Promise<MasterVehicleSaveOutcome> {
  const orgId = rv.organizationId?.trim();
  const vehicleId = rv.id?.trim();
  if (!orgId || !vehicleId) {
    throw new Error('ORG_VEHICLE_REQUIRED');
  }
  if (!options.baseline?.id) {
    throw new Error('EDIT_BASELINE_REQUIRED');
  }

  const outcome: MasterVehicleSaveOutcome = {
    physicsSaved: false,
    hvMasterSaved: false,
    manualBaselinesSaved: false,
  };
  const failures: Array<{ step: 'physics' | 'hvMaster' | 'manualBaselines'; message: string }> =
    [];

  const patch = buildMasterVehiclePhysicsSpecPatch(rv, options.baseline);
  if (Object.keys(patch).length > 0) {
    try {
      await api.vehicles.update(orgId, vehicleId, patch);
      outcome.physicsSaved = true;
    } catch (error) {
      failures.push({
        step: 'physics',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const manualFailures = await applyManualBaselinesOnEdit(
    orgId,
    vehicleId,
    rv,
    options.baseline,
  );
  if (manualFailures.length === 0) {
    const nextSpecs = buildVehicleManualSpecs(rv);
    const prevSpecs = buildVehicleManualSpecs(options.baseline);
    if (manualSpecJson(nextSpecs) !== manualSpecJson(prevSpecs) && nextSpecs) {
      outcome.manualBaselinesSaved = true;
    }
  } else {
    for (const f of manualFailures) {
      failures.push({ step: 'manualBaselines', message: `${f.area}: ${f.message}` });
    }
  }

  const enrichedRv = applySelectedHvCatalogEvidenceToVehicle(rv);
  const hvMasterPatch = buildHvMasterSpecPatchFromRegisteredVehicle(enrichedRv, options.baseline);
  if (hvMasterPatch) {
    try {
      await api.vehicles.upsertHvMasterSpecification(vehicleId, hvMasterPatch);
      outcome.hvMasterSaved = true;
    } catch (error) {
      failures.push({
        step: 'hvMaster',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (failures.length > 0) {
    throw new MasterVehiclePartialSaveError(outcome, failures);
  }

  return outcome;
}

export async function persistMasterRegisteredVehicle(
  rv: RegisteredVehicle,
  options: { dimoVehicleId?: string | null } = {},
): Promise<PersistMasterVehicleResult> {
  const orgId = rv.organizationId;
  if (!orgId) {
    throw new Error('ORGANIZATION_REQUIRED');
  }

  const extraData = buildVehicleExtraData(rv, {
    aiFieldProvenance: rv.aiFieldProvenance,
  });
  const manualSpecs = buildVehicleManualSpecs(rv);

  if (options.dimoVehicleId) {
    const created = await api.vehicles.registerFromDimo(orgId, {
      dimoVehicleId: options.dimoVehicleId,
      extraData,
      manualSpecs,
    });
    const vehicleId = created?.vehicle?.id ?? created?.id;
    if (!vehicleId) {
      throw new Error('REGISTER_FROM_DIMO_NO_VEHICLE_ID');
    }
    const postActivationEnrichment = created?.postActivationEnrichment as
      | PostActivationEnrichmentResult
      | undefined;
    return {
      vehicleId: String(vehicleId),
      postActivationEnrichment,
    };
  }

  const vin = rv.vin?.trim();
  if (!vin) {
    throw new Error('VIN_REQUIRED');
  }

  const created = await api.vehicles.create(orgId, {
    vin,
    make: rv.make?.trim() || 'Unknown',
    model: rv.model?.trim() || 'Unknown',
    year: rv.year || new Date().getFullYear(),
    ...extraData,
  });

  const vehicleId = created?.id ?? created?.vehicle?.id;
  if (!vehicleId) {
    throw new Error('MANUAL_CREATE_NO_VEHICLE_ID');
  }
  const id = String(vehicleId);
  const baselineFailures = await applyManualBaselinesAfterCreate(orgId, id, rv);
  return {
    vehicleId: id,
    baselineFailures: baselineFailures.length > 0 ? baselineFailures : undefined,
  };
}
