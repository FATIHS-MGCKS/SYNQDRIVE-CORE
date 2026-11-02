import { DriveType, type Prisma } from '@prisma/client';
import { VEHICLE_ADMIN_BASELINE_DRAFT_VERSION } from '../contracts/vo-document-versions';
import { VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2 } from '../contracts/vo-document-versions';
import type { VehicleAdministrativeBaselineDraftV1 } from '../contracts/vehicle-admin-baseline-draft.v1';
import type { VehicleTechnicalBaselineDraftV2 } from '../contracts/vehicle-technical-baseline-draft.v2';
import type { MasterDimoRegistrationInput } from './master-dimo-registration.types';
import {
  BatteryReferenceCapacitySource,
  BatteryReferenceCapacityType,
} from '@modules/vehicle-intelligence/battery-health/battery-v2-domain';
import { parseFrontWeightDistributionPct } from '@modules/vehicles/vehicle-technical-spec.util';
import { normalizeCanonicalDrivetrain } from '@modules/vehicles/vehicle-specification-canonical.contract';

function readStringField(extra: MasterDimoRegistrationInput['extraData'], key: string): string | null {
  if (!extra || typeof extra !== 'object') return null;
  const raw = (extra as Record<string, unknown>)[key];
  if (raw == null) return null;
  const s = String(raw).trim();
  return s.length ? s : null;
}

export function buildAdminBaselineDraftFromMasterInput(
  input: MasterDimoRegistrationInput,
): VehicleAdministrativeBaselineDraftV1 {
  const extra = input.extraData;
  return {
    version: VEHICLE_ADMIN_BASELINE_DRAFT_VERSION,
    vehicleName: readStringField(extra, 'vehicleName'),
    licensePlate: readStringField(extra, 'licensePlate'),
    stationId: input.stationId?.trim() || null,
    notes: readStringField(extra, 'notes'),
  };
}

export function buildTechnicalBaselineDraftFromMasterManualSpecs(
  input: MasterDimoRegistrationInput,
): VehicleTechnicalBaselineDraftV2 {
  const draft: VehicleTechnicalBaselineDraftV2 = {
    version: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
  };
  const brakes = input.manualSpecs?.brakes;
  if (brakes) {
    const frontPad =
      brakes.frontPadNominalThicknessMm ?? brakes.frontPadThickness ?? null;
    const rearPad = brakes.rearPadNominalThicknessMm ?? brakes.rearPadThickness ?? null;
    const hasBrake =
      frontPad != null ||
      rearPad != null ||
      brakes.frontRotorDiameter != null ||
      brakes.rearRotorDiameter != null;
    if (hasBrake) {
      draft.brakeReference = {
        frontPadNominalThicknessMm: frontPad ?? undefined,
        rearPadNominalThicknessMm: rearPad ?? undefined,
        frontRotorDiameter: brakes.frontRotorDiameter ?? undefined,
        rearRotorDiameter: brakes.rearRotorDiameter ?? undefined,
        frontRotorWidth: brakes.frontRotorWidth ?? undefined,
        rearRotorWidth: brakes.rearRotorWidth ?? undefined,
        sourceType: brakes.source ?? 'manual_registration',
      };
    }
  }

  const tires = input.manualSpecs?.tires;
  if (tires) {
    const hasTire =
      Boolean(tires.frontDimension?.trim()) ||
      Boolean(tires.rearDimension?.trim()) ||
      Boolean(tires.brandModelFront?.trim()) ||
      Boolean(tires.brandModelRear?.trim()) ||
      tires.treadFL != null ||
      tires.treadFR != null ||
      tires.treadBL != null ||
      tires.treadBR != null;
    if (hasTire) {
      draft.tireInstalledConfig = {
        evidenceInstalled: true,
        brandModelFront: tires.brandModelFront ?? null,
        brandModelRear: tires.brandModelRear ?? null,
        tireSeason: tires.tireSeason ?? null,
        frontDimension: tires.frontDimension ?? null,
        rearDimension: tires.rearDimension ?? null,
      };
      draft.tireReferenceSpec = {
        frontDimension: tires.frontDimension ?? null,
        rearDimension: tires.rearDimension ?? null,
        loadIndexFront: tires.loadIndexFront ?? null,
        speedIndexFront: tires.speedIndexFront ?? null,
        loadIndexRear: tires.loadIndexRear ?? null,
        speedIndexRear: tires.speedIndexRear ?? null,
        referenceProvenance: 'manual_registration',
      };
    }
  }

  const extra = input.extraData ?? {};
  const curbMassKg = (extra as { curbWeightKg?: number }).curbWeightKg;
  const systemMotorPowerKw = (extra as { systemMotorPowerKw?: number }).systemMotorPowerKw;
  const accel0To100S = (extra as { accel0To100S?: number }).accel0To100S;
  const variantAssumption = (extra as { motionPhysicsVariantAssumption?: string })
    .motionPhysicsVariantAssumption;
  if (curbMassKg != null || systemMotorPowerKw != null || accel0To100S != null) {
    draft.motionPhysicsReference = {
      curbMassKg: curbMassKg ?? null,
      systemMotorPowerKw: systemMotorPowerKw ?? null,
      systemPowerDefinition:
        systemMotorPowerKw != null ? 'OEM_RATED_SYSTEM_KW_ESTIMATED' : null,
      accel0To100S: accel0To100S ?? null,
      variantAssumption: variantAssumption ?? null,
      evidenceTier: 'ESTIMATED',
      source: 'ONBOARDING_ACTIVATION',
    };
  }

  return draft;
}

/** Vehicle scalar fields not carried by canonical activation SQL insert. */
export function buildPostActivationVehiclePatch(
  input: MasterDimoRegistrationInput,
): Prisma.VehicleUpdateInput {
  const extra = input.extraData ?? {};
  const patch: Prisma.VehicleUpdateInput = {};

  const mileageKm = (extra as { mileageKm?: number }).mileageKm;
  if (mileageKm != null && Number.isFinite(mileageKm)) {
    patch.mileageKm = mileageKm;
  }

  const hardwareType = (extra as { hardwareType?: string }).hardwareType;
  if (hardwareType != null && String(hardwareType).trim() !== '') {
    patch.hardwareType = String(hardwareType).trim() as never;
  }

  const vehicleType = (extra as { vehicleType?: string }).vehicleType;
  if (vehicleType != null && String(vehicleType).trim() !== '') {
    patch.vehicleType = vehicleType as Prisma.VehicleUpdateInput['vehicleType'];
  }

  const drivetrainRaw = (extra as { drivetrain?: unknown }).drivetrain;
  const driveType = mapMasterFormDrivetrainToDriveType(drivetrainRaw);
  if (driveType) {
    patch.driveType = driveType;
  }

  const scalarKeys = [
    'curbWeightKg',
    'engineDisplacementCc',
    'cylinderCount',
    'idleRpm',
    'maxRpm',
    'brakeForceFrontPercent',
    'tankCapacityLiters',
    'serviceIntervalManufacturerKm',
    'serviceIntervalManufacturerMonths',
    'oilChangeIntervalKm',
    'oilChangeIntervalMonths',
  ] as const;

  for (const key of scalarKeys) {
    const value = (extra as Record<string, unknown>)[key];
    if (value !== undefined && value !== null && value !== '') {
      (patch as Record<string, unknown>)[key] = value;
    }
  }

  const frontToRear = (extra as { frontToRearWeightDistribution?: unknown })
    .frontToRearWeightDistribution;
  if (frontToRear !== undefined && frontToRear !== null && frontToRear !== '') {
    const parsed = parseFrontWeightDistributionPct(frontToRear);
    if (parsed != null) {
      patch.frontWeightDistributionPct = parsed;
    }
  }

  return patch;
}

/** Maps Master form `drivetrain` strings to Prisma `DriveType` (vehicles.drive_type). */
export function mapMasterFormDrivetrainToDriveType(raw: unknown): DriveType | null {
  const normalized = normalizeCanonicalDrivetrain(raw);
  if (!normalized) return null;
  return DriveType[normalized];
}

export function masterManualSpecsNeedLegacyTireTreadPass(input: MasterDimoRegistrationInput): boolean {
  const tr = input.manualSpecs?.tires;
  if (!tr) return false;
  return (
    tr.treadFL != null ||
    tr.treadFR != null ||
    tr.treadBL != null ||
    tr.treadBR != null ||
    tr.initialTreadFrontMm != null ||
    tr.initialTreadRearMm != null ||
    tr.tireCondition != null ||
    tr.aiTireSpec != null
  );
}

export function hasLowVoltageBatteryManualSpec(input: MasterDimoRegistrationInput): boolean {
  const b = input.manualSpecs?.battery;
  if (!b) return false;
  return (
    (b.batteryType != null && String(b.batteryType).trim() !== '') ||
    b.batteryAmpere != null ||
    b.batteryVolt != null
  );
}

function parsePositiveKwhFromExtra(
  extra: MasterDimoRegistrationInput['extraData'],
  key: string,
): number | null {
  if (!extra || typeof extra !== 'object') return null;
  const raw = (extra as Record<string, unknown>)[key as string];
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export const MASTER_HV_CAPACITY_RESOLUTION_REASONS = {
  USABLE_EXCEEDS_GROSS: 'USABLE_EXCEEDS_GROSS',
} as const;

export type MasterHvCapacityResolution =
  | { kind: 'none' }
  | {
      kind: 'usable_reference';
      reference: NonNullable<VehicleTechnicalBaselineDraftV2['hvBatteryReference']>;
    }
  | {
      kind: 'invalid';
      reason: (typeof MASTER_HV_CAPACITY_RESOLUTION_REASONS)[keyof typeof MASTER_HV_CAPACITY_RESOLUTION_REASONS];
    };

/**
 * Maps Master registration extraData to an onboarding HV reference draft (USABLE only).
 * Gross kWh is accepted for operator context but never materialized as the SOH reference.
 */
export function resolveHvBatteryCapacityFromMasterExtra(
  extra: MasterDimoRegistrationInput['extraData'],
): MasterHvCapacityResolution {
  const usableKwh =
    parsePositiveKwhFromExtra(extra, 'hvBatteryUsableCapacityKwh') ??
    parsePositiveKwhFromExtra(extra, 'hvBatteryCapacityKwh');
  const grossKwh = parsePositiveKwhFromExtra(extra, 'hvBatteryGrossCapacityKwh');

  if (usableKwh == null) {
    return { kind: 'none' };
  }
  if (grossKwh != null && usableKwh > grossKwh) {
    return {
      kind: 'invalid',
      reason: MASTER_HV_CAPACITY_RESOLUTION_REASONS.USABLE_EXCEEDS_GROSS,
    };
  }

  return {
    kind: 'usable_reference',
    reference: {
      capacityKwh: usableKwh,
      capacityType: BatteryReferenceCapacityType.USABLE,
      source: BatteryReferenceCapacitySource.MANUAL_VERIFIED,
      documentId: null,
      serviceEventId: null,
      notes: null,
    },
  };
}

/** @deprecated Prefer resolveHvBatteryCapacityFromMasterExtra — returns reference only. */
export function tryHvBatteryFromExtra(
  extra: MasterDimoRegistrationInput['extraData'],
): VehicleTechnicalBaselineDraftV2['hvBatteryReference'] | null {
  const resolved = resolveHvBatteryCapacityFromMasterExtra(extra);
  if (resolved.kind === 'usable_reference') return resolved.reference;
  return null;
}
