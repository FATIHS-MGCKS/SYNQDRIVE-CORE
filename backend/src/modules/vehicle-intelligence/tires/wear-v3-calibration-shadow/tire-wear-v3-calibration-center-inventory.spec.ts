import { NotFoundException } from '@nestjs/common';
import { TireWearV3CalibrationCenterInventoryReadService } from './tire-wear-v3-calibration-center-inventory-read.service';
import { TireWearV3CalibrationEligibilityService } from './tire-wear-v3-calibration-eligibility.service';
import { TireWearV3CalibrationShadowWriterService } from './tire-wear-v3-calibration-shadow-writer.service';

describe('TireWearV3CalibrationCenterInventoryReadService', () => {
  const writer = {
    isWriteEnabled: jest.fn().mockReturnValue(false),
  } as unknown as TireWearV3CalibrationShadowWriterService;

  const eligibility = {
    resolveForSetup: jest.fn(),
  } as unknown as TireWearV3CalibrationEligibilityService;

  const prisma = {
    vehicleTireSetup: {
      groupBy: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    tire: { findMany: jest.fn() },
    tireWearV3PriorShadowV1: { groupBy: jest.fn(), findFirst: jest.fn() },
    tireWearV3CalibrationSnapshotV1: { groupBy: jest.fn(), count: jest.fn() },
    vehicleTireTreadMeasurement: { findFirst: jest.fn() },
    tireDs4MotionShadowInputV1: { count: jest.fn(), findFirst: jest.fn() },
    vehicle: { findFirst: jest.fn() },
  };

  const service = new TireWearV3CalibrationCenterInventoryReadService(
    prisma as never,
    eligibility,
    writer,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns global inventory summary without enabling writer', async () => {
    prisma.vehicleTireSetup.groupBy.mockResolvedValueOnce([{ organizationId: 'org-1' }]);
    prisma.vehicleTireSetup.groupBy.mockResolvedValueOnce([{ vehicleId: 'veh-1' }]);
    prisma.vehicleTireSetup.count
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);
    prisma.tireWearV3PriorShadowV1.groupBy.mockResolvedValue([{ tireSetupId: 's1' }]);
    prisma.tireWearV3CalibrationSnapshotV1.groupBy.mockResolvedValue([]);
    prisma.tire.findMany.mockResolvedValue([
      {
        id: 'tire-1',
        tireSetId: 'setup-1',
        organizationId: 'org-1',
        currentPosition: 'FRONT_LEFT',
      },
    ]);

    const summary = await service.getGlobalSummary();
    expect(summary.registeredSetupCount).toBe(3);
    expect(summary.writer.writeEnabled).toBe(false);
    expect(writer.isWriteEnabled).toHaveBeenCalled();
  });

  it('rejects cross-tenant vehicle scope', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(
      service.listSetupsForVehicle({
        organizationId: 'org-a',
        vehicleId: 'veh-b',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('marks ambiguous physical identity when multiple tires share a wheel', async () => {
    prisma.vehicleTireSetup.findFirst.mockResolvedValue({
      id: 'setup-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      name: 'Winter',
      status: 'ACTIVE',
      tireSeason: 'WINTER',
      frontDimension: '225/45R17',
      rearDimension: null,
      brandModelFront: null,
      brandModelRear: null,
      installedAt: new Date('2026-01-01T00:00:00.000Z'),
      removedAt: null,
      installedOdometerKm: 1000,
      odometerAnchorStatus: 'CONFIRMED',
      mountPeriods: [],
      _count: { measurements: 1, wearV3CalibrationSnapshots: 0 },
    });
    prisma.vehicleTireTreadMeasurement.findFirst.mockResolvedValue(null);
    prisma.tire.findMany.mockResolvedValue([
      {
        id: 't1',
        currentPosition: 'FRONT_LEFT',
        brand: 'Michelin',
        tireModel: 'X',
        dotCode: null,
      },
      {
        id: 't2',
        currentPosition: 'FRONT_LEFT',
        brand: 'Michelin',
        tireModel: 'Y',
        dotCode: null,
      },
    ]);
    prisma.tireWearV3PriorShadowV1.findFirst.mockResolvedValue(null);
    prisma.tireDs4MotionShadowInputV1.count.mockResolvedValue(0);
    prisma.tireDs4MotionShadowInputV1.findFirst.mockResolvedValue(null);
    (eligibility.resolveForSetup as jest.Mock).mockResolvedValue(null);

    const detail = await service.getSetupDetail({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tireSetupId: 'setup-1',
    });

    const fl = detail.wheels.find((w) => w.wheelPosition === 'FL');
    expect(fl?.physicalIdentityStatus).toBe('AMBIGUOUS');
    expect(fl?.physicalTireId).toBeNull();
  });

  it('paginates setup list with bounded limit', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });
    prisma.vehicleTireSetup.count.mockResolvedValue(1);
    prisma.vehicleTireSetup.findMany.mockResolvedValue([
      {
        id: 'setup-1',
        name: null,
        status: 'ACTIVE',
        installedAt: null,
        removedAt: null,
        _count: {
          measurements: 0,
          wearV3CalibrationSnapshots: 0,
          wearV3PriorShadowRows: 0,
        },
        measurements: [],
      },
    ]);

    const page = await service.listSetupsForVehicle({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      limit: 500,
    });
    expect(page.limit).toBe(100);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.snapshotCount).toBe(0);
  });
});
