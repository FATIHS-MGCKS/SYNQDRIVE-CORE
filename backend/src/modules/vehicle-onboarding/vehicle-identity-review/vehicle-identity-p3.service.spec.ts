import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FuelType } from '@prisma/client';
import { VehicleIdentityP3Service } from './vehicle-identity-p3.service';
import type { VehicleIdentityFieldConfirmationInput } from './vehicle-identity-review.types';
import { VehicleIdentityReviewService } from './vehicle-identity-review.service';
import { VehicleSpecAiService } from '@modules/ai/vehicle-specs/vehicle-spec-ai.service';

describe('VehicleIdentityP3Service', () => {
  const prisma = {
    vehicle: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    vehicleLatestState: { findUnique: jest.fn() },
    vehicleMotionPhysicsReference: { findFirst: jest.fn() },
    vehicleDataSourceLink: { findFirst: jest.fn() },
    vehicleDocumentExtraction: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };

  const config = {
    get: jest.fn((key: string) => {
      if (key === 'vehicleIdentityP3') return { enabled: true, aiLiveEnabled: false };
      if (key === 'vehicleIdentityP2') return { enabled: true };
      if (key === 'documentExtraction') return { zb1RegistrationCertificateExtractionEnabled: false };
      return undefined;
    }),
  };

  const reviewService = {
    getReviewSnapshot: jest.fn(),
    validateConfirmations: jest.fn(),
  } as unknown as VehicleIdentityReviewService;

  const vehicleSpecAi = {
    isConfigured: jest.fn().mockReturnValue(false),
    getVehicleSpecs: jest.fn(),
  } as unknown as VehicleSpecAiService;

  let service: VehicleIdentityP3Service;

  beforeEach(() => {
    jest.clearAllMocks();
    (config.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'vehicleIdentityP3') return { enabled: true, aiLiveEnabled: false };
      if (key === 'vehicleIdentityP2') return { enabled: true };
      if (key === 'documentExtraction') return { zb1RegistrationCertificateExtractionEnabled: false };
      return undefined;
    });
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'veh-1',
      year: 2020,
      make: 'VW',
      model: 'Golf',
      vin: 'VINOLD',
      fuelType: FuelType.GASOLINE,
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      registrationIdentityProvenance: null,
    });
    prisma.vehicle.update.mockResolvedValue({});
    prisma.vehicle.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));
    reviewService.getReviewSnapshot = jest.fn().mockResolvedValue({
      fields: [
        {
          fieldCode: 'd1Manufacturer',
          labelKey: '',
          value: 'VW',
          provenance: 'MANUAL_ENTRY',
          extractionStatus: null,
          conflict: false,
          baselineValue: null,
          baselineProvenance: 'UNAVAILABLE',
          documentValue: null,
          manualValue: 'VW',
          userConfirmed: false,
          editable: true,
          displayValue: 'VW',
          documentFieldCode: 'D.1',
        },
        {
          fieldCode: 'p2NominalPowerKw',
          labelKey: '',
          value: 85,
          provenance: 'MANUAL_ENTRY',
          extractionStatus: null,
          conflict: false,
          baselineValue: null,
          baselineProvenance: 'UNAVAILABLE',
          documentValue: null,
          manualValue: 85,
          userConfirmed: false,
          editable: true,
          displayValue: '85',
          documentFieldCode: 'P.2',
        },
      ],
      vinMismatchBlocked: false,
      p2PowerSemanticsWarning: 'warn',
      documentExtractionId: null,
      capabilities: { p2Enabled: true, p3Enabled: true, zb1UploadEnabled: false, documentStoragePolicyAcknowledged: false },
      suggestedManualDraft: {
        displacementCc: null,
        motorPowerKw: null,
        fuelType: null,
        displacementProvenance: 'UNAVAILABLE',
        motorPowerProvenance: 'UNAVAILABLE',
        fuelProvenance: 'UNAVAILABLE',
      },
    });
    service = new VehicleIdentityP3Service(
      prisma as never,
      config as unknown as ConfigService,
      reviewService,
      vehicleSpecAi,
    );
  });

  it('rejects when P3 flag is off', async () => {
    (config.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'vehicleIdentityP3') return { enabled: false };
      return undefined;
    });
    await expect(service.getProvenance('org-1', 'veh-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('manual path → AI preview → save → reload provenance', async () => {
    const confirmations: VehicleIdentityFieldConfirmationInput[] = [
      { fieldCode: 'd1Manufacturer', confirmed: true },
      { fieldCode: 'p2NominalPowerKw', confirmed: true },
    ];
    const preview = await service.previewAiV2('org-1', 'veh-1', {
      confirmations,
      injectedAiSpecs: {
        engineDisplacementCc: 1498,
        resolvedVariant: '1.5 TSI',
        variantConfidence: 0.92,
      },
    });
    expect(preview.canonical.fields.some((f) => f.key === 'make')).toBe(true);
    expect(preview.suggestedFields.engineDisplacementCc?.provenance).toBe('AI_ESTIMATED');

    const saved = await service.saveIdentity('org-1', 'veh-1', {
      confirmations,
      acceptSuggestedFieldKeys: ['engineDisplacementCc'],
      injectedAiSpecs: {
        engineDisplacementCc: 1498,
        resolvedVariant: '1.5 TSI',
        variantConfidence: 0.92,
      },
    });
    expect(saved.persisted).toBe(true);
    expect(prisma.vehicle.updateMany).toHaveBeenCalled();

    prisma.vehicle.findFirst.mockResolvedValueOnce({
      registrationIdentityProvenance: saved.provenance,
    });
    const reloaded = await service.getProvenance('org-1', 'veh-1');
    expect(reloaded.provenance?.fields.make?.confirmationStatus).toBe('USER_CONFIRMED');
  });

  it('blocks save when AI displacement conflicts with eTSI variant', async () => {
    await expect(
      service.saveIdentity('org-1', 'veh-1', {
        confirmations: [
          { fieldCode: 'd2TypeVariantVersion', confirmed: true, correctedValue: '1.5 eTSI' },
          { fieldCode: 'manualElectrificationGrade', confirmed: true, correctedValue: 'MHEV' },
        ],
        injectedAiSpecs: {
          engineDisplacementCc: 1984,
          resolvedVariant: '1.5 eTSI',
          variantConfidence: 0.95,
        },
      }),
    ).rejects.toMatchObject({ response: { code: 'VEHICLE_IDENTITY_SAVE_BLOCKED_CONFLICTS' } });
  });

  it('returns null provenance for legacy vehicles', async () => {
    prisma.vehicle.findFirst.mockResolvedValueOnce({
      registrationIdentityProvenance: null,
    });
    const result = await service.getProvenance('org-1', 'veh-1');
    expect(result.provenance).toBeNull();
  });

  it('rejects AI displacement alias against protected displacementCc', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'veh-1',
      year: 2020,
      make: 'VW',
      model: 'Golf',
      vin: 'VINOLD',
      fuelType: FuelType.GASOLINE,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      registrationIdentityProvenance: {
        version: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
        fields: {
          displacementCc: {
            value: 1498,
            provenance: 'USER_CONFIRMED',
            confirmationStatus: 'USER_CONFIRMED',
            confirmedAt: '2026-01-01T00:00:00.000Z',
            documentExtractionId: null,
          },
        },
      },
    });
    await expect(
      service.saveIdentity('org-1', 'veh-1', {
        confirmations: [{ fieldCode: 'd1Manufacturer', confirmed: true }],
        acceptSuggestedFieldKeys: ['engineDisplacementCc'],
        injectedAiSpecs: {
          engineDisplacementCc: 1984,
          variantConfidence: 0.95,
          resolvedVariant: '1.5 TSI',
        },
      }),
    ).rejects.toMatchObject({ response: { code: 'VEHICLE_IDENTITY_PROTECTED_FIELD_VIOLATION' } });
    expect(prisma.vehicle.updateMany).not.toHaveBeenCalled();
  });

  it('allows explicit correction of protected make with confirmed d1 + correctedValue', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'veh-1',
      year: 2020,
      make: 'Audi',
      model: 'Golf',
      vin: 'VINOLD',
      fuelType: FuelType.GASOLINE,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      registrationIdentityProvenance: {
        version: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
        fields: {
          make: {
            value: 'Audi',
            provenance: 'USER_CONFIRMED',
            confirmationStatus: 'USER_CONFIRMED',
            confirmedAt: '2026-01-01T00:00:00.000Z',
            documentExtractionId: null,
          },
        },
      },
    });
    await service.saveIdentity('org-1', 'veh-1', {
      confirmations: [{ fieldCode: 'd1Manufacturer', confirmed: true, correctedValue: 'VW' }],
      injectedAiSpecs: {},
    });
    const updateArg = prisma.vehicle.updateMany.mock.calls[0][0];
    expect(updateArg.data.make).toBe('VW');
    const prov = updateArg.data.registrationIdentityProvenance as { fields: { make: { value: string } } };
    expect(prov.fields.make.value).toBe('VW');
  });

  it('blocks identity save when registration certificate FIN mismatches vehicle FIN', async () => {
    reviewService.getReviewSnapshot = jest.fn().mockResolvedValue({
      fields: [
        {
          fieldCode: 'd1Manufacturer',
          labelKey: '',
          value: 'VW',
          provenance: 'MANUAL_ENTRY',
          extractionStatus: null,
          conflict: false,
          baselineValue: null,
          baselineProvenance: 'UNAVAILABLE',
          documentValue: null,
          manualValue: 'VW',
          userConfirmed: false,
          editable: true,
          displayValue: 'VW',
          documentFieldCode: 'D.1',
        },
      ],
      vinMismatchBlocked: true,
      p2PowerSemanticsWarning: 'warn',
      documentExtractionId: 'ext-1',
      capabilities: { p2Enabled: true, p3Enabled: true, zb1UploadEnabled: true, documentStoragePolicyAcknowledged: false },
      suggestedManualDraft: {
        displacementCc: null,
        motorPowerKw: null,
        fuelType: null,
        displacementProvenance: 'UNAVAILABLE',
        motorPowerProvenance: 'UNAVAILABLE',
        fuelProvenance: 'UNAVAILABLE',
      },
    });
    await expect(
      service.saveIdentity('org-1', 'veh-1', {
        documentExtractionId: 'ext-1',
        vinMismatchAcknowledged: true,
        confirmations: [{ fieldCode: 'd1Manufacturer', confirmed: true }],
        injectedAiSpecs: {},
      }),
    ).rejects.toMatchObject({ response: { code: 'VIN_MISMATCH_IDENTITY_SAVE_BLOCKED' } });
    expect(prisma.vehicle.updateMany).not.toHaveBeenCalled();
  });

  it('returns conflict when optimistic update loses race', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'veh-1',
      year: 2020,
      make: 'VW',
      model: 'Golf',
      vin: 'VINOLD',
      fuelType: FuelType.GASOLINE,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      registrationIdentityProvenance: null,
    });
    prisma.vehicle.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.saveIdentity('org-1', 'veh-1', {
        confirmations: [{ fieldCode: 'd1Manufacturer', confirmed: true }],
        injectedAiSpecs: {},
      }),
    ).rejects.toMatchObject({ response: { code: 'VEHICLE_IDENTITY_SAVE_CONFLICT' } });
  });

});
