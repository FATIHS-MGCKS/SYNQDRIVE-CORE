import type { TranslationKey } from '../../i18n/translations/en';
import { formatFrontRearWeightDistribution, parseBrakeForceFrontPercent } from './vehicle-technical-spec.util';

export type MotionPhysicsEvidenceTierUi = 'ESTIMATED' | 'CONFIRMED' | 'VERIFIED' | null;

export type SpecValueState = 'value' | 'unknown' | 'not_applicable' | 'not_available';

export type SpecProvenanceUi =
  | 'USER_CONFIRMED'
  | 'AI_SUGGESTED'
  | 'PROVIDER'
  | 'REFERENCE'
  | null;

export type ConnectedVehicleTechnicalSpecsView = {
  vin: string | null;
  licensePlate: string | null;
  make: string;
  model: string;
  year: number | null;
  fuelType: string;
  driveTypeRaw: string | null;
  driveTypeNormalized: string | null;
  curbWeightKg: number | null;
  engineDisplacementCc: number | null;
  cylinderCount: number | null;
  frontToRearWeightDistribution: string;
  idleRpm: number | null;
  maxRpm: number | null;
  brakeForceFrontPercent: number | null;
  systemMotorPowerKw: number | null;
  accel0To100S: number | null;
  variantAssumption: string | null;
  tankCapacityLiters: number | null;
  serviceIntervalManufacturerKm: number | null;
  serviceIntervalManufacturerMonths: number | null;
  oilChangeIntervalKm: number | null;
  oilChangeIntervalMonths: number | null;
  tireFrontDimension: string | null;
  tireRearDimension: string | null;
  brakeFrontRotorDiameterMm: number | null;
  brakeFrontRotorWidthMm: number | null;
  brakeFrontPadThicknessMm: number | null;
  brakeRearRotorDiameterMm: number | null;
  brakeRearRotorWidthMm: number | null;
  brakeRearPadThicknessMm: number | null;
  batteryType: string | null;
  batteryAmpere: number | null;
  batteryVolt: number | null;
  hvBatteryUsableCapacityKwh: number | null;
  hvBatteryGrossCapacityKwh: number | null;
  hvBatteryChemistry: string | null;
  hvBatteryNominalVoltage: number | null;
  acOnboardChargerKw: number | null;
  dcFastChargeMaxKw: number | null;
  applicability: {
    showIceEngineFields: boolean;
    showTankAndOilMaintenance: boolean;
    showHvBatteryFields: boolean;
  };
  fieldProvenance: Partial<Record<string, SpecProvenanceUi>>;
};

export function motionPhysicsEvidenceTierLabelKey(
  tier: MotionPhysicsEvidenceTierUi,
): TranslationKey {
  if (tier === 'VERIFIED') return 'master.motionPhysics.evidence.verified';
  if (tier === 'CONFIRMED') return 'master.motionPhysics.evidence.confirmed';
  if (tier === 'ESTIMATED') return 'master.motionPhysics.evidence.estimated';
  return 'master.cv.technicalSpecs.noReference';
}

export function formatSpecsNumber(value: number | null | undefined, suffix = ''): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value}${suffix}`;
}

export function normalizeDriveType(raw: string | null | undefined): string | null {
  if (raw == null || String(raw).trim() === '') return null;
  const u = String(raw).trim().toUpperCase().replace(/\s+/g, '_');
  if (u === '4WD' || u === '4X4' || u === 'FOURWD') return 'FOUR_WD';
  if (u === 'FWD' || u === 'RWD' || u === 'AWD' || u === 'FOUR_WD') return u;
  return null;
}

export function driveTypeLabelKey(driveType: string | null | undefined): TranslationKey {
  const normalized = normalizeDriveType(driveType);
  if (normalized === 'FWD') return 'master.cv.technicalSpecs.driveType.fwd';
  if (normalized === 'RWD') return 'master.cv.technicalSpecs.driveType.rwd';
  if (normalized === 'AWD') return 'master.cv.technicalSpecs.driveType.awd';
  if (normalized === 'FOUR_WD') return 'master.cv.technicalSpecs.driveType.fourWd';
  return 'master.cv.technicalSpecs.driveType.unknown';
}

export function isPureElectricFuelLabel(fuelType: string | null | undefined): boolean {
  return (fuelType ?? '').trim().toLowerCase() === 'electric';
}

export function shouldShowHvBatteryFields(
  fuelType: string | null | undefined,
  hvSignals: {
    usableKwh?: number | null;
    grossKwh?: number | null;
    chemistry?: string | null;
  },
): boolean {
  if (isPureElectricFuelLabel(fuelType)) return true;
  const ft = (fuelType ?? '').trim().toLowerCase();
  if (ft === 'plug-in hybrid' || ft === 'hybrid') return true;
  return (
    hvSignals.usableKwh != null ||
    hvSignals.grossKwh != null ||
    Boolean(hvSignals.chemistry?.trim())
  );
}

type ProvenanceDoc = {
  fields?: Record<
    string,
    {
      provenance?: string;
      confirmationStatus?: string;
      documentExtractionId?: string | null;
    }
  >;
};

type ProvenanceFieldEntry = NonNullable<ProvenanceDoc['fields']>[string];

export function resolveMotionReferenceFieldProvenance(
  identityDoc: unknown,
  tier: MotionPhysicsEvidenceTierUi,
  storageKeys: string[] = ['systemMotorPowerKw'],
): SpecProvenanceUi {
  const fromDoc = resolveStorageProvenance(identityDoc, storageKeys);
  if (fromDoc) return fromDoc;
  if (tier === 'VERIFIED' || tier === 'CONFIRMED') return 'USER_CONFIRMED';
  if (tier === 'ESTIMATED') return 'AI_SUGGESTED';
  return null;
}

export function mapProvenanceEntryToUi(
  entry: ProvenanceFieldEntry | undefined,
): SpecProvenanceUi {
  if (!entry) return null;
  if (entry.confirmationStatus === 'USER_CONFIRMED' || entry.confirmationStatus === 'PROTECTED') {
    return 'USER_CONFIRMED';
  }
  const p = (entry.provenance ?? '').toUpperCase();
  if (p === 'AI_ESTIMATED' || p === 'KNOWLEDGE_ONLY') return 'AI_SUGGESTED';
  if (entry.documentExtractionId) return 'PROVIDER';
  if (p) return 'REFERENCE';
  return null;
}

export function resolveStorageProvenance(
  docRaw: unknown,
  storageKeys: string[],
): SpecProvenanceUi {
  if (!docRaw || typeof docRaw !== 'object') return null;
  const doc = docRaw as ProvenanceDoc;
  if (!doc.fields) return null;
  for (const key of storageKeys) {
    const direct = doc.fields[key];
    if (direct) return mapProvenanceEntryToUi(direct);
    for (const [rawKey, entry] of Object.entries(doc.fields)) {
      if (rawKey === key || rawKey.endsWith(key)) {
        const mapped = mapProvenanceEntryToUi(entry);
        if (mapped) return mapped;
      }
    }
  }
  return null;
}

export function specValueState(
  applicable: boolean,
  hasValue: boolean,
): SpecValueState {
  if (!applicable) return 'not_applicable';
  if (!hasValue) return 'unknown';
  return 'value';
}

export function specValueStateLabelKey(state: SpecValueState): TranslationKey {
  if (state === 'not_applicable') return 'master.cv.technicalSpecs.value.notApplicable';
  if (state === 'unknown') return 'master.cv.technicalSpecs.value.unknown';
  if (state === 'not_available') return 'master.cv.technicalSpecs.value.notAvailable';
  return 'master.cv.technicalSpecs.value.unknown';
}

export function provenanceLabelKey(provenance: SpecProvenanceUi): TranslationKey | null {
  if (provenance === 'USER_CONFIRMED') return 'master.cv.technicalSpecs.provenance.userConfirmed';
  if (provenance === 'AI_SUGGESTED') return 'master.cv.technicalSpecs.provenance.aiSuggested';
  if (provenance === 'PROVIDER') return 'master.cv.technicalSpecs.provenance.provider';
  if (provenance === 'REFERENCE') return 'master.cv.technicalSpecs.provenance.reference';
  return null;
}

function parseNum(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function parseOptionalString(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  return s ? s : null;
}

export function buildTechnicalSpecsView(input: {
  vin?: string | null;
  licensePlate?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  fuelType?: string | null;
  drivetrain?: string | null;
  driveType?: string | null;
  curbWeight?: string | number | null;
  engineDisplacementCc?: string | number | null;
  cylinderCount?: string | number | null;
  frontToRearWeightDistribution?: string | null;
  frontWeightDistributionPct?: number | null;
  idleRpm?: string | number | null;
  maxRpm?: string | number | null;
  brakeForceFrontPercent?: number | null;
  brakeForceDistribution?: string | null;
  systemMotorPowerKw?: string | number | null;
  accel0To100S?: string | number | null;
  variantAssumption?: string | null;
  tankCapacityLiters?: string | number | null;
  serviceIntervalManufacturerKm?: string | number | null;
  serviceIntervalManufacturerMonths?: string | number | null;
  oilChangeIntervalKm?: string | number | null;
  oilChangeIntervalMonths?: string | number | null;
  tireFrontDimension?: string | null;
  tireRearDimension?: string | null;
  brakeFrontRotorDiameter?: string | null;
  brakeFrontRotorWidth?: string | null;
  brakeFrontPadThickness?: string | null;
  brakeBackRotorDiameter?: string | null;
  brakeBackRotorWidth?: string | null;
  brakeBackPadThickness?: string | null;
  batteryType?: string | null;
  batteryAmpere?: string | number | null;
  batteryVolt?: string | number | null;
  hvBatteryUsableCapacityKwh?: string | number | null;
  hvBatteryGrossCapacityKwh?: string | number | null;
  hvBatteryChemistry?: string | null;
  hvBatteryNominalVoltage?: string | number | null;
  acOnboardChargerKw?: string | number | null;
  dcFastChargeMaxKw?: string | number | null;
  registrationIdentityProvenance?: unknown;
  hvMasterSpecificationProvenance?: string | null;
  motionReference?: {
    curbMassKg?: number | null;
    systemMotorPowerKw?: number | null;
    accel0To100S?: number | null;
    variantAssumption?: string | null;
  } | null;
  motionEvidenceTier?: MotionPhysicsEvidenceTierUi;
}): ConnectedVehicleTechnicalSpecsView {
  const ref = input.motionReference;
  const fuelType = input.fuelType?.trim() || '—';
  const driveRaw = input.drivetrain?.trim() || input.driveType?.trim() || null;
  const driveTypeNormalized = normalizeDriveType(driveRaw);
  const showIceEngineFields = !isPureElectricFuelLabel(fuelType);
  const showTankAndOilMaintenance = !isPureElectricFuelLabel(fuelType);

  const hvUsable = parseNum(input.hvBatteryUsableCapacityKwh);
  const hvGross = parseNum(input.hvBatteryGrossCapacityKwh);
  const hvChemistry = parseOptionalString(input.hvBatteryChemistry ?? null);
  const showHvBatteryFields = shouldShowHvBatteryFields(fuelType, {
    usableKwh: hvUsable,
    grossKwh: hvGross,
    chemistry: hvChemistry,
  });

  const doc = input.registrationIdentityProvenance;
  const fieldProvenance: Partial<Record<string, SpecProvenanceUi>> = {
    engineDisplacementCc: resolveStorageProvenance(doc, ['displacementCc', 'engineDisplacementCc']),
    cylinderCount: resolveStorageProvenance(doc, ['cylinderCount']),
    frontWeightDistributionPct: resolveStorageProvenance(doc, [
      'frontWeightDistributionPct',
      'frontToRearWeightDistribution',
    ]),
    idleRpm: resolveStorageProvenance(doc, ['idleRpm']),
    maxRpm: resolveStorageProvenance(doc, ['maxRpm']),
    brakeForceFrontPercent: resolveStorageProvenance(doc, [
      'brakeForceFrontPercent',
      'brakeForceDistribution',
    ]),
    tankCapacityLiters: resolveStorageProvenance(doc, ['tankCapacityLiters']),
    serviceIntervalManufacturerKm: resolveStorageProvenance(doc, [
      'serviceIntervalManufacturerKm',
      'manufacturerServiceIntervalKm',
    ]),
    serviceIntervalManufacturerMonths: resolveStorageProvenance(doc, [
      'serviceIntervalManufacturerMonths',
      'manufacturerServiceIntervalMonths',
    ]),
    oilChangeIntervalKm: resolveStorageProvenance(doc, ['oilChangeIntervalKm', 'oilchangeIntervalKm']),
    oilChangeIntervalMonths: resolveStorageProvenance(doc, [
      'oilChangeIntervalMonths',
      'oilchangeIntervalMonths',
    ]),
    driveType: resolveStorageProvenance(doc, ['driveType', 'drivetrain']),
  };

  if (input.hvMasterSpecificationProvenance?.trim()) {
    fieldProvenance.hvBatteryGrossCapacityKwh = 'REFERENCE';
    fieldProvenance.hvBatteryUsableCapacityKwh =
      fieldProvenance.hvBatteryUsableCapacityKwh ?? 'REFERENCE';
    fieldProvenance.hvBatteryChemistry = fieldProvenance.hvBatteryChemistry ?? 'REFERENCE';
  }
  const motionPowerProv = resolveMotionReferenceFieldProvenance(
    doc,
    input.motionEvidenceTier ?? null,
  );
  if (motionPowerProv) {
    fieldProvenance.systemMotorPowerKw = motionPowerProv;
  }

  return {
    vin: parseOptionalString(input.vin ?? null),
    licensePlate: parseOptionalString(input.licensePlate ?? null),
    make: input.make?.trim() || '—',
    model: input.model?.trim() || '—',
    year: input.year ?? null,
    fuelType,
    driveTypeRaw: driveRaw,
    driveTypeNormalized,
    curbWeightKg: ref?.curbMassKg ?? parseNum(input.curbWeight),
    engineDisplacementCc: parseNum(input.engineDisplacementCc),
    cylinderCount: parseNum(input.cylinderCount),
    frontToRearWeightDistribution:
      input.frontToRearWeightDistribution?.trim() ||
      formatFrontRearWeightDistribution(input.frontWeightDistributionPct ?? null) ||
      '—',
    idleRpm: parseNum(input.idleRpm),
    maxRpm: parseNum(input.maxRpm),
    brakeForceFrontPercent:
      input.brakeForceFrontPercent ??
      (input.brakeForceDistribution
        ? parseBrakeForceFrontPercent(input.brakeForceDistribution)
        : null),
    systemMotorPowerKw: ref?.systemMotorPowerKw ?? parseNum(input.systemMotorPowerKw),
    accel0To100S: ref?.accel0To100S ?? parseNum(input.accel0To100S),
    variantAssumption: ref?.variantAssumption?.trim() || input.variantAssumption?.trim() || null,
    tankCapacityLiters: parseNum(input.tankCapacityLiters),
    serviceIntervalManufacturerKm: parseNum(input.serviceIntervalManufacturerKm),
    serviceIntervalManufacturerMonths: parseNum(input.serviceIntervalManufacturerMonths),
    oilChangeIntervalKm: parseNum(input.oilChangeIntervalKm),
    oilChangeIntervalMonths: parseNum(input.oilChangeIntervalMonths),
    tireFrontDimension: parseOptionalString(input.tireFrontDimension ?? null),
    tireRearDimension: parseOptionalString(input.tireRearDimension ?? null),
    brakeFrontRotorDiameterMm: parseNum(input.brakeFrontRotorDiameter),
    brakeFrontRotorWidthMm: parseNum(input.brakeFrontRotorWidth),
    brakeFrontPadThicknessMm: parseNum(input.brakeFrontPadThickness),
    brakeRearRotorDiameterMm: parseNum(input.brakeBackRotorDiameter),
    brakeRearRotorWidthMm: parseNum(input.brakeBackRotorWidth),
    brakeRearPadThicknessMm: parseNum(input.brakeBackPadThickness),
    batteryType: parseOptionalString(input.batteryType ?? null),
    batteryAmpere: parseNum(input.batteryAmpere),
    batteryVolt: parseNum(input.batteryVolt),
    hvBatteryUsableCapacityKwh: hvUsable,
    hvBatteryGrossCapacityKwh: hvGross,
    hvBatteryChemistry: hvChemistry,
    hvBatteryNominalVoltage: parseNum(input.hvBatteryNominalVoltage),
    acOnboardChargerKw: parseNum(input.acOnboardChargerKw),
    dcFastChargeMaxKw: parseNum(input.dcFastChargeMaxKw),
    applicability: {
      showIceEngineFields,
      showTankAndOilMaintenance,
      showHvBatteryFields,
    },
    fieldProvenance,
  };
}
