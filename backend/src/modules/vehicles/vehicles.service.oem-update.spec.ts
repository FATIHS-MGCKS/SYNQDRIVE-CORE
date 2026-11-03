import { ConflictException } from '@nestjs/common';
import { DriveType } from '@prisma/client';
import { VehiclesService } from './vehicles.service';

describe('VehiclesService.update — OEM optimistic concurrency', () => {
  it('returns VEHICLE_OEM_SPEC_SAVE_CONFLICT when updateMany loses optimistic race', async () => {
    const staleUpdatedAt = new Date('2026-01-01T00:00:00.000Z');
    const vehicleRow = {
      id: 'veh-1',
      organizationId: 'org-1',
      engineDisplacementCc: null,
      cylinderCount: null,
      frontWeightDistributionPct: null,
      idleRpm: null,
      maxRpm: null,
      brakeForceFrontPercent: null,
      tankCapacityLiters: null,
      serviceIntervalManufacturerKm: null,
      serviceIntervalManufacturerMonths: null,
      oilChangeIntervalKm: null,
      oilChangeIntervalMonths: null,
      driveType: DriveType.FWD,
      registrationIdentityProvenance: null,
      updatedAt: staleUpdatedAt,
      oemEngineCode: null,
      oemEngineDesc: null,
      oemTransmissionCode: null,
      oemTransmissionDesc: null,
      exteriorColorDesc: null,
      oemExteriorColorCode: null,
      interiorTrimDesc: null,
      oemInteriorTrimCode: null,
      oemModelRangeDesc: null,
      oemDerivativeDesc: null,
    };

    const prisma = {
      vehicle: {
        findFirst: jest.fn().mockResolvedValue(vehicleRow),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const service = {
      prisma,
      withOrgScope: (orgId: string) => ({ organizationId: orgId }),
    } as unknown as VehiclesService;

    await expect(
      VehiclesService.prototype.update.call(
        service,
        'veh-1',
        {} as never,
        'org-1',
        {
          rawBody: {
            oemEngineCode: 'NEW',
            technicalSpecificationSave: { confirmedFieldKeys: ['oemEngineCode'] },
          },
          actorPlatformRole: 'MASTER_ADMIN',
        },
      ),
    ).rejects.toMatchObject({
      response: { code: 'VEHICLE_OEM_SPEC_SAVE_CONFLICT' },
    });

    expect(prisma.vehicle.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'veh-1',
          organizationId: 'org-1',
          updatedAt: staleUpdatedAt,
        }),
        data: expect.objectContaining({
          updatedAt: expect.any(Date),
        }),
      }),
    );
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
  });
});
