import { BadRequestException } from '@nestjs/common';
import type { DriveType, Prisma } from '@prisma/client';
import {
  getProtectedProvenanceValue,
  normalizeProvenanceStorageKey,
} from '@modules/vehicle-onboarding/vehicle-identity-review/vehicle-identity-field-mapping.util';
import type { RegistrationIdentityProvenanceDocument } from '@modules/vehicle-onboarding/vehicle-identity-review/vehicle-identity-canonical.types';
import { isProtectedProvenanceEntry } from '@modules/vehicle-onboarding/vehicle-identity-review/vehicle-identity-provenance.util';
import { mapMasterFormDrivetrainToDriveType } from '@modules/vehicle-onboarding/master-dimo/master-dimo-registration.mapper';
import {
  formatFrontRearWeightDistribution,
  parseBrakeForceFrontPercent,
  parseFrontWeightDistributionPct,
  parsePositiveIntegerField,
  parseTankCapacityLiters,
  parseVehicleRpmField,
  valuesEqualScalar,
  vehicleRpmPairIsConsistent,
} from './vehicle-technical-spec.util';

export type VehicleTechnicalSpecFieldKey =
  | 'engineDisplacementCc'
  | 'cylinderCount'
  | 'frontWeightDistributionPct'
  | 'idleRpm'
  | 'maxRpm'
  | 'brakeForceFrontPercent'
  | 'tankCapacityLiters'
  | 'serviceIntervalManufacturerKm'
  | 'serviceIntervalManufacturerMonths'
  | 'oilChangeIntervalKm'
  | 'oilChangeIntervalMonths';

export type VehicleTechnicalSpecificationSaveMeta = {
  confirmedFieldKeys?: string[];
};

export type VehicleTechnicalSpecificationPatchInput = {
  engineDisplacementCc?: number | string | null;
  cylinderCount?: number | string | null;
  frontWeightDistributionPct?: number | string | null;
  frontToRearWeightDistribution?: string | null;
  idleRpm?: number | string | null;
  maxRpm?: number | string | null;
  brakeForceFrontPercent?: number | string | null;
  brakeForceDistribution?: string | number | null;
  tankCapacityLiters?: number | string | null;
  serviceIntervalManufacturerKm?: number | string | null;
  serviceIntervalManufacturerMonths?: number | string | null;
  oilChangeIntervalKm?: number | string | null;
  oilChangeIntervalMonths?: number | string | null;
  drivetrain?: string | null;
  technicalSpecificationSave?: VehicleTechnicalSpecificationSaveMeta;
};

export type VehicleTechnicalSpecificationVehicleRow = {
  engineDisplacementCc: number | null;
  cylinderCount: number | null;
  frontWeightDistributionPct: number | null;
  idleRpm: number | null;
  maxRpm: number | null;
  brakeForceFrontPercent: number | null;
  tankCapacityLiters: number | null;
  serviceIntervalManufacturerKm: number | null;
  serviceIntervalManufacturerMonths: number | null;
  oilChangeIntervalKm: number | null;
  oilChangeIntervalMonths: number | null;
  driveType: DriveType | null;
  registrationIdentityProvenance: unknown;
};

const AI_PROVENANCE_CATEGORIES = new Set(['AI_ESTIMATED', 'KNOWLEDGE_ONLY']);

function normalizeConfirmedFieldKey(key: string): VehicleTechnicalSpecFieldKey | string {
  if (key === 'frontToRearWeightDistribution') return 'frontWeightDistributionPct';
  if (key === 'brakeForceDistribution') return 'brakeForceFrontPercent';
  if (key === 'manufacturerServiceIntervalKm') return 'serviceIntervalManufacturerKm';
  if (key === 'manufacturerServiceIntervalMonths') return 'serviceIntervalManufacturerMonths';
  if (key === 'oilchangeIntervalKm') return 'oilChangeIntervalKm';
  if (key === 'oilchangeIntervalMonths') return 'oilChangeIntervalMonths';
  return key;
}

function provenanceEntryForKey(
  doc: RegistrationIdentityProvenanceDocument | null,
  storageKey: string,
) {
  if (!doc?.fields) return undefined;
  const direct = doc.fields[storageKey as keyof typeof doc.fields];
  if (direct) return direct;
  for (const [rawKey, entry] of Object.entries(doc.fields)) {
    if (normalizeProvenanceStorageKey(rawKey) === storageKey) return entry;
  }
  return undefined;
}

function isProtectedTechnicalField(
  doc: RegistrationIdentityProvenanceDocument | null,
  storageKey: VehicleTechnicalSpecFieldKey | 'displacementCc',
): boolean {
  if (storageKey === 'displacementCc') {
    return getProtectedProvenanceValue(doc, 'displacementCc') != null;
  }
  const entry = provenanceEntryForKey(doc, storageKey);
  return isProtectedProvenanceEntry(entry);
}

function protectedValue(
  doc: RegistrationIdentityProvenanceDocument | null,
  storageKey: VehicleTechnicalSpecFieldKey | 'displacementCc',
): number | null {
  if (storageKey === 'displacementCc') {
    const entry = getProtectedProvenanceValue(doc, 'displacementCc');
    const v = entry?.value;
    return typeof v === 'number' ? v : null;
  }
  const entry = provenanceEntryForKey(doc, storageKey);
  if (!isProtectedProvenanceEntry(entry)) return null;
  const v = entry?.value;
  return typeof v === 'number' ? v : null;
}

export function buildVehicleTechnicalSpecificationPrismaPatch(
  vehicle: VehicleTechnicalSpecificationVehicleRow,
  input: VehicleTechnicalSpecificationPatchInput,
  provenanceDoc: RegistrationIdentityProvenanceDocument | null,
): Prisma.VehicleUpdateInput {
  const confirmed = new Set(
    (input.technicalSpecificationSave?.confirmedFieldKeys ?? []).map((k) =>
      normalizeConfirmedFieldKey(k),
    ),
  );

  const patch: Prisma.VehicleUpdateInput = {};
  const provenanceUpdates: RegistrationIdentityProvenanceDocument = provenanceDoc
    ? { ...provenanceDoc, fields: { ...provenanceDoc.fields } }
    : { version: 1, updatedAt: new Date().toISOString(), fields: {} };

  const considerField = (
    key: VehicleTechnicalSpecFieldKey,
    next: number | null,
    current: number | null,
    provenanceStorageKey: VehicleTechnicalSpecFieldKey | 'displacementCc',
  ) => {
    const currentNorm =
      key === 'brakeForceFrontPercent' && current != null ? Math.round(current) : current;
    const nextNorm = key === 'brakeForceFrontPercent' && next != null ? Math.round(next) : next;
    if (valuesEqualScalar(nextNorm, currentNorm)) return;

    if (isProtectedTechnicalField(provenanceDoc, provenanceStorageKey)) {
      const locked = protectedValue(provenanceDoc, provenanceStorageKey);
      if (locked != null && !valuesEqualScalar(next, locked) && !confirmed.has(key)) {
        throw new BadRequestException({
          message: `Protected USER_CONFIRMED value for ${key} cannot be changed without explicit confirmation.`,
          code: 'VEHICLE_TECH_SPEC_USER_CONFIRMED_BLOCKED',
          field: key,
        });
      }
    }

    if (!confirmed.has(key)) {
      throw new BadRequestException({
        message: `Field ${key} requires explicit user confirmation before save.`,
        code: 'VEHICLE_TECH_SPEC_CONFIRMATION_REQUIRED',
        field: key,
      });
    }

    if (key === 'engineDisplacementCc') {
      patch.engineDisplacementCc = next;
    } else if (key === 'cylinderCount') {
      patch.cylinderCount = next;
    } else if (key === 'frontWeightDistributionPct') {
      patch.frontWeightDistributionPct = next;
    } else if (key === 'idleRpm') {
      patch.idleRpm = next;
    } else if (key === 'maxRpm') {
      patch.maxRpm = next;
    } else if (key === 'brakeForceFrontPercent') {
      patch.brakeForceFrontPercent = next;
    } else if (key === 'tankCapacityLiters') {
      patch.tankCapacityLiters = next;
    } else if (key === 'serviceIntervalManufacturerKm') {
      patch.serviceIntervalManufacturerKm = next;
    } else if (key === 'serviceIntervalManufacturerMonths') {
      patch.serviceIntervalManufacturerMonths = next;
    } else if (key === 'oilChangeIntervalKm') {
      patch.oilChangeIntervalKm = next;
    } else {
      patch.oilChangeIntervalMonths = next;
    }

    provenanceUpdates.fields[provenanceStorageKey as keyof typeof provenanceUpdates.fields] = {
      value: next,
      provenance: 'USER_CONFIRMED',
      confirmationStatus: 'USER_CONFIRMED',
      confirmedAt: new Date().toISOString(),
      documentExtractionId: null,
    };
  };

  if (
    input.engineDisplacementCc !== undefined ||
    input.cylinderCount !== undefined ||
    input.frontWeightDistributionPct !== undefined ||
    input.frontToRearWeightDistribution !== undefined ||
    input.idleRpm !== undefined ||
    input.maxRpm !== undefined ||
    input.brakeForceFrontPercent !== undefined ||
    input.brakeForceDistribution !== undefined ||
    input.tankCapacityLiters !== undefined ||
    input.serviceIntervalManufacturerKm !== undefined ||
    input.serviceIntervalManufacturerMonths !== undefined ||
    input.oilChangeIntervalKm !== undefined ||
    input.oilChangeIntervalMonths !== undefined ||
    input.drivetrain !== undefined
  ) {
    let nextDisplacement: number | null | undefined;
    if (input.engineDisplacementCc !== undefined) {
      if (input.engineDisplacementCc === null || input.engineDisplacementCc === '') {
        nextDisplacement = null;
      } else {
        const parsed = parsePositiveIntegerField(input.engineDisplacementCc);
        if (parsed == null) {
          throw new BadRequestException({
            message: 'engineDisplacementCc must be a positive integer.',
            code: 'VEHICLE_TECH_SPEC_INVALID_DISPLACEMENT',
          });
        }
        nextDisplacement = parsed;
      }
      considerField(
        'engineDisplacementCc',
        nextDisplacement ?? null,
        vehicle.engineDisplacementCc,
        'displacementCc',
      );
    }

    if (input.cylinderCount !== undefined) {
      let nextCyl: number | null;
      if (input.cylinderCount === null || input.cylinderCount === '') {
        nextCyl = null;
      } else {
        const parsed = parsePositiveIntegerField(input.cylinderCount);
        if (parsed == null) {
          throw new BadRequestException({
            message: 'cylinderCount must be a positive integer.',
            code: 'VEHICLE_TECH_SPEC_INVALID_CYLINDER_COUNT',
          });
        }
        nextCyl = parsed;
      }
      considerField('cylinderCount', nextCyl, vehicle.cylinderCount, 'cylinderCount');
    }

    const frontInput =
      input.frontWeightDistributionPct !== undefined
        ? input.frontWeightDistributionPct
        : input.frontToRearWeightDistribution;
    if (frontInput !== undefined) {
      let nextFront: number | null;
      if (frontInput === null || frontInput === '') {
        nextFront = null;
      } else {
        const parsed = parseFrontWeightDistributionPct(frontInput);
        if (parsed == null) {
          throw new BadRequestException({
            message: 'frontWeightDistributionPct must be a valid front axle percent (e.g. 58 or 58/42).',
            code: 'VEHICLE_TECH_SPEC_INVALID_WEIGHT_DISTRIBUTION',
          });
        }
        nextFront = parsed;
      }
      considerField(
        'frontWeightDistributionPct',
        nextFront,
        vehicle.frontWeightDistributionPct,
        'frontWeightDistributionPct',
      );
    }

    let nextIdle: number | null | undefined;
    if (input.idleRpm !== undefined) {
      if (input.idleRpm === null || input.idleRpm === '') {
        nextIdle = null;
      } else {
        const parsed = parseVehicleRpmField(input.idleRpm);
        if (parsed == null) {
          throw new BadRequestException({
            message: 'idleRpm must be a positive integer.',
            code: 'VEHICLE_TECH_SPEC_INVALID_IDLE_RPM',
          });
        }
        nextIdle = parsed;
      }
      considerField('idleRpm', nextIdle ?? null, vehicle.idleRpm, 'idleRpm');
    }

    let nextMax: number | null | undefined;
    if (input.maxRpm !== undefined) {
      if (input.maxRpm === null || input.maxRpm === '') {
        nextMax = null;
      } else {
        const parsed = parseVehicleRpmField(input.maxRpm);
        if (parsed == null) {
          throw new BadRequestException({
            message: 'maxRpm must be a positive integer.',
            code: 'VEHICLE_TECH_SPEC_INVALID_MAX_RPM',
          });
        }
        nextMax = parsed;
      }
      considerField('maxRpm', nextMax ?? null, vehicle.maxRpm, 'maxRpm');
    }

    const effectiveIdle =
      nextIdle !== undefined ? (nextIdle ?? null) : vehicle.idleRpm;
    const effectiveMax = nextMax !== undefined ? (nextMax ?? null) : vehicle.maxRpm;
    if (!vehicleRpmPairIsConsistent(effectiveIdle, effectiveMax)) {
      throw new BadRequestException({
        message: 'maxRpm must be greater than idleRpm when both are set.',
        code: 'VEHICLE_TECH_SPEC_RPM_ORDER',
      });
    }

    const brakeInput =
      input.brakeForceFrontPercent !== undefined
        ? input.brakeForceFrontPercent
        : input.brakeForceDistribution;
    if (brakeInput !== undefined) {
      let nextBrake: number | null;
      if (brakeInput === null || brakeInput === '') {
        nextBrake = null;
      } else {
        const parsed = parseBrakeForceFrontPercent(brakeInput);
        if (parsed == null) {
          throw new BadRequestException({
            message:
              'brakeForceFrontPercent must be a front brake force percent (not F/R weight distribution).',
            code: 'VEHICLE_TECH_SPEC_INVALID_BRAKE_FORCE',
          });
        }
        nextBrake = parsed;
      }
      considerField(
        'brakeForceFrontPercent',
        nextBrake,
        vehicle.brakeForceFrontPercent,
        'brakeForceFrontPercent',
      );
    }

    if (input.tankCapacityLiters !== undefined) {
      let nextTank: number | null;
      if (input.tankCapacityLiters === null || input.tankCapacityLiters === '') {
        nextTank = null;
      } else {
        const parsed = parseTankCapacityLiters(input.tankCapacityLiters);
        if (parsed == null) {
          throw new BadRequestException({
            message: 'tankCapacityLiters must be a non-negative number.',
            code: 'VEHICLE_TECH_SPEC_INVALID_TANK_CAPACITY',
          });
        }
        nextTank = parsed;
      }
      considerField('tankCapacityLiters', nextTank, vehicle.tankCapacityLiters, 'tankCapacityLiters');
    }

    const considerInterval = (
      key:
        | 'serviceIntervalManufacturerKm'
        | 'serviceIntervalManufacturerMonths'
        | 'oilChangeIntervalKm'
        | 'oilChangeIntervalMonths',
      raw: number | string | null | undefined,
      current: number | null,
    ) => {
      if (raw === undefined) return;
      let next: number | null;
      if (raw === null || raw === '') {
        next = null;
      } else {
        const parsed = parsePositiveIntegerField(raw);
        if (parsed == null) {
          throw new BadRequestException({
            message: `${key} must be a positive integer.`,
            code: 'VEHICLE_TECH_SPEC_INVALID_INTERVAL',
            field: key,
          });
        }
        next = parsed;
      }
      considerField(key, next, current, key);
    };

    considerInterval(
      'serviceIntervalManufacturerKm',
      input.serviceIntervalManufacturerKm,
      vehicle.serviceIntervalManufacturerKm,
    );
    considerInterval(
      'serviceIntervalManufacturerMonths',
      input.serviceIntervalManufacturerMonths,
      vehicle.serviceIntervalManufacturerMonths,
    );
    considerInterval('oilChangeIntervalKm', input.oilChangeIntervalKm, vehicle.oilChangeIntervalKm);
    considerInterval(
      'oilChangeIntervalMonths',
      input.oilChangeIntervalMonths,
      vehicle.oilChangeIntervalMonths,
    );

    if (input.drivetrain !== undefined) {
      if (!confirmed.has('drivetrain')) {
        throw new BadRequestException({
          message: 'Field drivetrain requires explicit user confirmation before save.',
          code: 'VEHICLE_TECH_SPEC_CONFIRMATION_REQUIRED',
          field: 'drivetrain',
        });
      }
      let nextDrive: DriveType | null = null;
      if (input.drivetrain !== null && String(input.drivetrain).trim() !== '') {
        nextDrive = mapMasterFormDrivetrainToDriveType(input.drivetrain);
        if (!nextDrive) {
          throw new BadRequestException({
            message: 'drivetrain must be a valid drive type (FWD, RWD, AWD, 4WD).',
            code: 'VEHICLE_TECH_SPEC_INVALID_DRIVETRAIN',
          });
        }
      }
      const currentDrive = vehicle.driveType;
      if (nextDrive !== currentDrive) {
        patch.driveType = nextDrive;
      }
    }
  }

  if (Object.keys(provenanceUpdates.fields).length > 0) {
    provenanceUpdates.updatedAt = new Date().toISOString();
    patch.registrationIdentityProvenance = provenanceUpdates as Prisma.InputJsonValue;
  }

  return patch;
}

export function mapVehicleTechnicalSpecsToRegisteredVehicleFields(vehicle: {
  engineDisplacementCc: number | null;
  cylinderCount: number | null;
  frontWeightDistributionPct: number | null;
}): {
  engineDisplacementCc: string;
  cylinderCount: string;
  frontToRearWeightDistribution: string;
} {
  return {
    engineDisplacementCc:
      vehicle.engineDisplacementCc != null ? String(vehicle.engineDisplacementCc) : '',
    cylinderCount: vehicle.cylinderCount != null ? String(vehicle.cylinderCount) : '',
    frontToRearWeightDistribution: formatFrontRearWeightDistribution(
      vehicle.frontWeightDistributionPct,
    ),
  };
}

export function extractTechnicalSpecificationPatchInput(
  body: Record<string, unknown>,
): VehicleTechnicalSpecificationPatchInput | null {
  const keys = [
    'engineDisplacementCc',
    'cylinderCount',
    'frontWeightDistributionPct',
    'frontToRearWeightDistribution',
    'idleRpm',
    'maxRpm',
    'brakeForceFrontPercent',
    'brakeForceDistribution',
    'tankCapacityLiters',
    'serviceIntervalManufacturerKm',
    'serviceIntervalManufacturerMonths',
    'oilChangeIntervalKm',
    'oilChangeIntervalMonths',
    'drivetrain',
    'technicalSpecificationSave',
  ];
  const hasAny = keys.some((k) => body[k] !== undefined);
  if (!hasAny) return null;
  return {
    engineDisplacementCc: body.engineDisplacementCc as number | string | null | undefined,
    cylinderCount: body.cylinderCount as number | string | null | undefined,
    frontWeightDistributionPct: body.frontWeightDistributionPct as number | string | null | undefined,
    frontToRearWeightDistribution: body.frontToRearWeightDistribution as string | null | undefined,
    idleRpm: body.idleRpm as number | string | null | undefined,
    maxRpm: body.maxRpm as number | string | null | undefined,
    brakeForceFrontPercent: body.brakeForceFrontPercent as number | string | null | undefined,
    brakeForceDistribution: body.brakeForceDistribution as string | number | null | undefined,
    tankCapacityLiters: body.tankCapacityLiters as number | string | null | undefined,
    serviceIntervalManufacturerKm: body.serviceIntervalManufacturerKm as
      | number
      | string
      | null
      | undefined,
    serviceIntervalManufacturerMonths: body.serviceIntervalManufacturerMonths as
      | number
      | string
      | null
      | undefined,
    oilChangeIntervalKm: body.oilChangeIntervalKm as number | string | null | undefined,
    oilChangeIntervalMonths: body.oilChangeIntervalMonths as number | string | null | undefined,
    drivetrain: body.drivetrain as string | null | undefined,
    technicalSpecificationSave: body.technicalSpecificationSave as
      | VehicleTechnicalSpecificationSaveMeta
      | undefined,
  };
}

export function stripTechnicalSpecificationKeysFromUpdateBody(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...body };
  for (const key of [
    'engineDisplacementCc',
    'cylinderCount',
    'frontWeightDistributionPct',
    'frontToRearWeightDistribution',
    'idleRpm',
    'maxRpm',
    'brakeForceFrontPercent',
    'brakeForceDistribution',
    'tankCapacityLiters',
    'serviceIntervalManufacturerKm',
    'serviceIntervalManufacturerMonths',
    'oilChangeIntervalKm',
    'oilChangeIntervalMonths',
    'drivetrain',
    'technicalSpecificationSave',
    'aiFieldProvenance',
  ]) {
    delete next[key];
  }
  return next;
}

/** True when this save corrects a USER_CONFIRMED technical field (needs optimistic concurrency). */
export function technicalSpecSaveRequiresOptimisticConcurrency(
  provenanceDoc: RegistrationIdentityProvenanceDocument | null,
  vehicle: VehicleTechnicalSpecificationVehicleRow,
  input: VehicleTechnicalSpecificationPatchInput,
): boolean {
  const confirmed = new Set(
    (input.technicalSpecificationSave?.confirmedFieldKeys ?? []).map((k) =>
      normalizeConfirmedFieldKey(k),
    ),
  );
  if (confirmed.size === 0) return false;

  if (input.engineDisplacementCc !== undefined && confirmed.has('engineDisplacementCc')) {
    if (isProtectedTechnicalField(provenanceDoc, 'displacementCc')) {
      const locked = protectedValue(provenanceDoc, 'displacementCc');
      let next: number | null;
      if (input.engineDisplacementCc === null || input.engineDisplacementCc === '') {
        next = null;
      } else {
        next = parsePositiveIntegerField(input.engineDisplacementCc);
      }
      if (locked != null && next != null && !valuesEqualScalar(next, locked)) return true;
    }
  }

  if (input.cylinderCount !== undefined && confirmed.has('cylinderCount')) {
    if (isProtectedTechnicalField(provenanceDoc, 'cylinderCount')) {
      const locked = protectedValue(provenanceDoc, 'cylinderCount');
      let next: number | null;
      if (input.cylinderCount === null || input.cylinderCount === '') {
        next = null;
      } else {
        next = parsePositiveIntegerField(input.cylinderCount);
      }
      if (locked != null && next != null && !valuesEqualScalar(next, locked)) return true;
    }
  }

  const frontInput =
    input.frontWeightDistributionPct !== undefined
      ? input.frontWeightDistributionPct
      : input.frontToRearWeightDistribution;
  if (frontInput !== undefined && confirmed.has('frontWeightDistributionPct')) {
    if (isProtectedTechnicalField(provenanceDoc, 'frontWeightDistributionPct')) {
      const locked = protectedValue(provenanceDoc, 'frontWeightDistributionPct');
      let next: number | null;
      if (frontInput === null || frontInput === '') {
        next = null;
      } else {
        next = parseFrontWeightDistributionPct(frontInput);
      }
      if (locked != null && next != null && !valuesEqualScalar(next, locked)) return true;
    }
  }

  if (input.idleRpm !== undefined && confirmed.has('idleRpm')) {
    if (isProtectedTechnicalField(provenanceDoc, 'idleRpm')) {
      const locked = protectedValue(provenanceDoc, 'idleRpm');
      let next: number | null;
      if (input.idleRpm === null || input.idleRpm === '') {
        next = null;
      } else {
        next = parseVehicleRpmField(input.idleRpm);
      }
      if (locked != null && next != null && !valuesEqualScalar(next, locked)) return true;
    }
  }

  if (input.maxRpm !== undefined && confirmed.has('maxRpm')) {
    if (isProtectedTechnicalField(provenanceDoc, 'maxRpm')) {
      const locked = protectedValue(provenanceDoc, 'maxRpm');
      let next: number | null;
      if (input.maxRpm === null || input.maxRpm === '') {
        next = null;
      } else {
        next = parseVehicleRpmField(input.maxRpm);
      }
      if (locked != null && next != null && !valuesEqualScalar(next, locked)) return true;
    }
  }

  const brakeInput =
    input.brakeForceFrontPercent !== undefined
      ? input.brakeForceFrontPercent
      : input.brakeForceDistribution;
  if (brakeInput !== undefined && confirmed.has('brakeForceFrontPercent')) {
    if (isProtectedTechnicalField(provenanceDoc, 'brakeForceFrontPercent')) {
      const locked = protectedValue(provenanceDoc, 'brakeForceFrontPercent');
      let next: number | null;
      if (brakeInput === null || brakeInput === '') {
        next = null;
      } else {
        next = parseBrakeForceFrontPercent(brakeInput);
      }
      if (locked != null && next != null && !valuesEqualScalar(next, locked)) return true;
    }
  }

  return false;
}

/** Returns true when client marks a field as AI-sourced without user confirmation. */
export function assertAiTechnicalFieldsConfirmed(
  input: VehicleTechnicalSpecificationPatchInput,
  aiFieldProvenance: Record<string, { category?: string }> | null | undefined,
): void {
  if (!aiFieldProvenance) return;
  const confirmed = new Set(
    (input.technicalSpecificationSave?.confirmedFieldKeys ?? []).map((k) =>
      normalizeConfirmedFieldKey(k),
    ),
  );
  const aiKeys: Array<{ formKey: string; patchKeys: string[] }> = [
    { formKey: 'engineDisplacementCc', patchKeys: ['engineDisplacementCc'] },
    { formKey: 'cylinderCount', patchKeys: ['cylinderCount'] },
    {
      formKey: 'frontToRearWeightDistribution',
      patchKeys: ['frontToRearWeightDistribution', 'frontWeightDistributionPct'],
    },
    { formKey: 'idleRpm', patchKeys: ['idleRpm'] },
    { formKey: 'maxRpm', patchKeys: ['maxRpm'] },
    {
      formKey: 'brakeForceDistribution',
      patchKeys: ['brakeForceDistribution', 'brakeForceFrontPercent'],
    },
    { formKey: 'tankCapacityLiters', patchKeys: ['tankCapacityLiters'] },
    {
      formKey: 'manufacturerServiceIntervalKm',
      patchKeys: ['serviceIntervalManufacturerKm'],
    },
    {
      formKey: 'manufacturerServiceIntervalMonths',
      patchKeys: ['serviceIntervalManufacturerMonths'],
    },
    { formKey: 'oilchangeIntervalKm', patchKeys: ['oilChangeIntervalKm'] },
    { formKey: 'oilchangeIntervalMonths', patchKeys: ['oilChangeIntervalMonths'] },
    { formKey: 'drivetrain', patchKeys: ['drivetrain'] },
  ];
  for (const { formKey, patchKeys } of aiKeys) {
    const meta = aiFieldProvenance[formKey];
    if (!meta?.category || !AI_PROVENANCE_CATEGORIES.has(meta.category)) continue;
    const patchTouched = patchKeys.some(
      (patchKey) => input[patchKey as keyof VehicleTechnicalSpecificationPatchInput] !== undefined,
    );
    if (!patchTouched) continue;
    if (
      !confirmed.has(formKey) &&
      !patchKeys.some((patchKey) => confirmed.has(normalizeConfirmedFieldKey(patchKey)))
    ) {
      throw new BadRequestException({
        message: `AI-suggested field ${formKey} requires explicit confirmation before persistence.`,
        code: 'VEHICLE_TECH_SPEC_AI_CONFIRMATION_REQUIRED',
        field: formKey,
      });
    }
  }
}
