import { BadRequestException } from '@nestjs/common';
import {
  assertAiTechnicalFieldsConfirmed,
  buildVehicleTechnicalSpecificationPrismaPatch,
  mapVehicleTechnicalSpecsToRegisteredVehicleFields,
  stripTechnicalSpecificationKeysFromUpdateBody,
  technicalSpecSaveRequiresOptimisticConcurrency,
} from './vehicle-technical-spec-patch.util';

const baseVehicle = {
  engineDisplacementCc: null as number | null,
  cylinderCount: null as number | null,
  frontWeightDistributionPct: null as number | null,
  idleRpm: null as number | null,
  maxRpm: null as number | null,
  brakeForceFrontPercent: null as number | null,
  tankCapacityLiters: null as number | null,
  serviceIntervalManufacturerKm: null as number | null,
  serviceIntervalManufacturerMonths: null as number | null,
  oilChangeIntervalKm: null as number | null,
  oilChangeIntervalMonths: null as number | null,
  driveType: null as import('@prisma/client').DriveType | null,
  registrationIdentityProvenance: null,
};

const userConfirmedDisplacementProvenance = {
  version: 1 as const,
  updatedAt: '2026-01-01T00:00:00.000Z',
  fields: {
    displacementCc: {
      value: 1968,
      provenance: 'USER_CONFIRMED' as const,
      confirmationStatus: 'USER_CONFIRMED' as const,
      confirmedAt: '2026-01-01T00:00:00.000Z',
      documentExtractionId: null,
    },
  },
};

describe('vehicle-technical-spec-patch.util', () => {
  it('maps Audi weight 58 to 58/42 in registered vehicle fields', () => {
    expect(
      mapVehicleTechnicalSpecsToRegisteredVehicleFields({
        engineDisplacementCc: null,
        cylinderCount: null,
        frontWeightDistributionPct: 58,
      }).frontToRearWeightDistribution,
    ).toBe('58/42');
  });

  it('maps Tiguan weight 60 to 60/40', () => {
    expect(
      mapVehicleTechnicalSpecsToRegisteredVehicleFields({
        engineDisplacementCc: null,
        cylinderCount: null,
        frontWeightDistributionPct: 60,
      }).frontToRearWeightDistribution,
    ).toBe('60/40');
  });

  it('keeps Arteon weight unknown when null', () => {
    expect(
      mapVehicleTechnicalSpecsToRegisteredVehicleFields({
        engineDisplacementCc: null,
        cylinderCount: null,
        frontWeightDistributionPct: null,
      }).frontToRearWeightDistribution,
    ).toBe('');
  });

  it('persists displacement and cylinders with explicit confirmation', () => {
    const patch = buildVehicleTechnicalSpecificationPrismaPatch(
      baseVehicle,
      {
        engineDisplacementCc: 1968,
        cylinderCount: 4,
        technicalSpecificationSave: {
          confirmedFieldKeys: ['engineDisplacementCc', 'cylinderCount'],
        },
      },
      null,
    );
    expect(patch.engineDisplacementCc).toBe(1968);
    expect(patch.cylinderCount).toBe(4);
  });

  it('requires confirmation for changed technical fields', () => {
    expect(() =>
      buildVehicleTechnicalSpecificationPrismaPatch(
        { ...baseVehicle, frontWeightDistributionPct: 58 },
        { frontToRearWeightDistribution: '60/40' },
        null,
      ),
    ).toThrow(BadRequestException);
  });

  it('blocks overwriting USER_CONFIRMED displacement without confirmation', () => {
    expect(() =>
      buildVehicleTechnicalSpecificationPrismaPatch(
        { ...baseVehicle, engineDisplacementCc: 1968 },
        { engineDisplacementCc: 1984 },
        userConfirmedDisplacementProvenance,
      ),
    ).toThrow(BadRequestException);
  });

  it('allows authorized correction of USER_CONFIRMED displacement with confirmedFieldKeys', () => {
    const patch = buildVehicleTechnicalSpecificationPrismaPatch(
      { ...baseVehicle, engineDisplacementCc: 1968 },
      {
        engineDisplacementCc: 1984,
        technicalSpecificationSave: { confirmedFieldKeys: ['engineDisplacementCc'] },
      },
      userConfirmedDisplacementProvenance,
    );
    expect(patch.engineDisplacementCc).toBe(1984);
    const provenance = patch.registrationIdentityProvenance as {
      fields: { displacementCc?: { value: number; provenance: string } };
    };
    expect(provenance.fields.displacementCc?.value).toBe(1984);
    expect(provenance.fields.displacementCc?.provenance).toBe('USER_CONFIRMED');
  });

  it('leaves legacy null vehicle unchanged when no input keys', () => {
    const patch = buildVehicleTechnicalSpecificationPrismaPatch(baseVehicle, {}, null);
    expect(patch).toEqual({});
  });

  it('rejects AI-sourced displacement without explicit confirmation metadata', () => {
    expect(() =>
      assertAiTechnicalFieldsConfirmed(
        { engineDisplacementCc: 1968 },
        { engineDisplacementCc: { category: 'AI_ESTIMATED' } },
      ),
    ).toThrow(BadRequestException);
  });

  it('strips aiFieldProvenance from generic Prisma update body', () => {
    const stripped = stripTechnicalSpecificationKeysFromUpdateBody({
      make: 'Audi',
      aiFieldProvenance: { engineDisplacementCc: { category: 'AI_ESTIMATED' } },
      engineDisplacementCc: 1968,
      technicalSpecificationSave: { confirmedFieldKeys: ['engineDisplacementCc'] },
    });
    expect(stripped).toEqual({ make: 'Audi' });
  });

  it('legacy PATCH body without technical keys passes through unchanged except metadata strip', () => {
    const stripped = stripTechnicalSpecificationKeysFromUpdateBody({
      make: 'VW',
      model: 'Golf',
      aiFieldProvenance: { cylinderCount: { category: 'KNOWLEDGE_ONLY' } },
    });
    expect(stripped).toEqual({ make: 'VW', model: 'Golf' });
  });

  it('requires optimistic concurrency for protected displacement correction', () => {
    expect(
      technicalSpecSaveRequiresOptimisticConcurrency(
        userConfirmedDisplacementProvenance,
        { ...baseVehicle, engineDisplacementCc: 1968 },
        {
          engineDisplacementCc: 1984,
          technicalSpecificationSave: { confirmedFieldKeys: ['engineDisplacementCc'] },
        },
      ),
    ).toBe(true);
  });

  it('does not require optimistic concurrency for first-time confirmed save', () => {
    expect(
      technicalSpecSaveRequiresOptimisticConcurrency(null, baseVehicle, {
        engineDisplacementCc: 1968,
        technicalSpecificationSave: { confirmedFieldKeys: ['engineDisplacementCc'] },
      }),
    ).toBe(false);
  });

  it('persists idleRpm, maxRpm, and brakeForceFrontPercent with confirmation', () => {
    const patch = buildVehicleTechnicalSpecificationPrismaPatch(
      baseVehicle,
      {
        idleRpm: 750,
        maxRpm: 6500,
        brakeForceFrontPercent: 62,
        technicalSpecificationSave: {
          confirmedFieldKeys: ['idleRpm', 'maxRpm', 'brakeForceDistribution'],
        },
      },
      null,
    );
    expect(patch.idleRpm).toBe(750);
    expect(patch.maxRpm).toBe(6500);
    expect(patch.brakeForceFrontPercent).toBe(62);
  });

  it('rejects maxRpm not greater than idleRpm', () => {
    expect(() =>
      buildVehicleTechnicalSpecificationPrismaPatch(
        { ...baseVehicle, idleRpm: 800 },
        {
          maxRpm: 700,
          technicalSpecificationSave: { confirmedFieldKeys: ['maxRpm'] },
        },
        null,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects weight distribution string as brake force', () => {
    expect(() =>
      buildVehicleTechnicalSpecificationPrismaPatch(
        baseVehicle,
        {
          brakeForceDistribution: '58/42',
          technicalSpecificationSave: { confirmedFieldKeys: ['brakeForceDistribution'] },
        },
        null,
      ),
    ).toThrow(BadRequestException);
  });

  it('allows confirmed AI idleRpm when confirmedFieldKeys present', () => {
    expect(() =>
      assertAiTechnicalFieldsConfirmed(
        {
          idleRpm: 750,
          technicalSpecificationSave: { confirmedFieldKeys: ['idleRpm'] },
        },
        { idleRpm: { category: 'AI_ESTIMATED' } },
      ),
    ).not.toThrow();
  });

  it('omits unchanged idleRpm from patch when sent equal to current', () => {
    const patch = buildVehicleTechnicalSpecificationPrismaPatch(
      { ...baseVehicle, idleRpm: 750 },
      {
        idleRpm: 750,
        technicalSpecificationSave: { confirmedFieldKeys: ['idleRpm'] },
      },
      null,
    );
    expect(patch.idleRpm).toBeUndefined();
  });

  it('persists tank and service intervals with confirmation', () => {
    const patch = buildVehicleTechnicalSpecificationPrismaPatch(
      baseVehicle,
      {
        tankCapacityLiters: 55,
        serviceIntervalManufacturerKm: 30000,
        oilChangeIntervalMonths: 24,
        technicalSpecificationSave: {
          confirmedFieldKeys: [
            'tankCapacityLiters',
            'serviceIntervalManufacturerKm',
            'oilChangeIntervalMonths',
          ],
        },
      },
      null,
    );
    expect(patch.tankCapacityLiters).toBe(55);
    expect(patch.serviceIntervalManufacturerKm).toBe(30000);
    expect(patch.oilChangeIntervalMonths).toBe(24);
  });

  it('persists drivetrain as driveType when confirmed', () => {
    const patch = buildVehicleTechnicalSpecificationPrismaPatch(
      baseVehicle,
      {
        drivetrain: 'AWD',
        technicalSpecificationSave: { confirmedFieldKeys: ['drivetrain'] },
      },
      null,
    );
    expect(patch.driveType).toBe('AWD');
  });
});
