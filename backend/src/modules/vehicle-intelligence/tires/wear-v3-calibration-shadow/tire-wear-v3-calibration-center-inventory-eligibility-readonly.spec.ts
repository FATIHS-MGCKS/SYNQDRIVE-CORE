import { NotFoundException } from '@nestjs/common';
import { TireOdometerAnchorStatus, TirePosition } from '@prisma/client';
import { TireWearV3CalibrationCenterInventoryReadService } from './tire-wear-v3-calibration-center-inventory-read.service';
import { TireWearV3CalibrationEligibilityService } from './tire-wear-v3-calibration-eligibility.service';
import { TireWearV3CalibrationShadowWriterService } from './tire-wear-v3-calibration-shadow-writer.service';

describe('TireWearV3CalibrationCenterInventory eligibility read-only contract', () => {
  const mutating = ['create', 'update', 'delete', 'upsert', 'createMany', 'updateMany', 'deleteMany'];

  function guardPrismaClient(base: Record<string, unknown>) {
    for (const model of Object.values(base)) {
      if (model && typeof model === 'object') {
        for (const method of mutating) {
          if (method in (model as object)) {
            (model as Record<string, unknown>)[method] = jest.fn(() => {
              throw new Error(`Unexpected Prisma.${method} during inventory read`);
            });
          }
        }
      }
    }
    return base;
  }

  const writer = {
    isWriteEnabled: jest.fn().mockReturnValue(false),
    runTick: jest.fn(),
  } as unknown as TireWearV3CalibrationShadowWriterService;

  const prisma = guardPrismaClient({
    vehicleTireSetup: {
      findFirst: jest.fn(),
    },
    vehicleTireTreadMeasurement: {
      findMany: jest.fn(),
    },
    tire: {
      findMany: jest.fn(),
    },
    tirePositionHistory: {
      findMany: jest.fn(),
    },
    tireWearV3PriorShadowV1: {
      findFirst: jest.fn(),
    },
    tireDs4MotionShadowInputV1: {
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    tireTripUsageLedger: {
      findMany: jest.fn(),
    },
    vehicle: {
      findFirst: jest.fn(),
    },
  }) as Record<string, Record<string, jest.Mock>>;

  const eligibility = new TireWearV3CalibrationEligibilityService(prisma as never);

  const service = new TireWearV3CalibrationCenterInventoryReadService(
    prisma as never,
    eligibility,
    writer,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getSetupDetail uses real eligibility without Prisma writes or writer side effects', async () => {
    const setupFixture = {
      id: 'setup-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      name: 'Summer',
      status: 'ACTIVE',
      tireSeason: 'SUMMER',
      frontDimension: null,
      rearDimension: null,
      brandModelFront: null,
      brandModelRear: null,
      installedAt: new Date('2026-01-01T00:00:00.000Z'),
      removedAt: null,
      installedOdometerKm: 1000,
      odometerAnchorStatus: TireOdometerAnchorStatus.ANCHORED,
      mountPeriods: [
        {
          id: 'mp-1',
          installedAt: new Date('2026-01-01T00:00:00.000Z'),
          removedAt: null,
          installedOdometerKm: 1000,
          odometerAnchorStatus: TireOdometerAnchorStatus.ANCHORED,
        },
      ],
      _count: { measurements: 1, wearV3CalibrationSnapshots: 0 },
    };

    (prisma.vehicleTireSetup.findFirst as jest.Mock).mockResolvedValue({
      ...setupFixture,
      vehicle: { organizationId: 'org-1' },
    });
    (prisma.vehicleTireTreadMeasurement.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'm1',
        measuredAt: new Date('2026-02-01T00:00:00.000Z'),
        evidenceSource: 'WORKSHOP',
        source: 'manual',
        frontLeftMm: 6.2,
        frontRightMm: null,
        rearLeftMm: null,
        rearRightMm: null,
      },
    ]);
    (prisma.tire.findMany as jest.Mock).mockImplementation(
      (args: { select?: Record<string, boolean> }) => {
        if (args?.select?.mountedAt) {
          return Promise.resolve([
            {
              id: 'tire-fl',
              mountedAt: new Date('2026-01-01T00:00:00.000Z'),
              dismountedAt: null,
              installedPosition: TirePosition.FRONT_LEFT,
            },
          ]);
        }
        if (args?.select?.brand) {
          return Promise.resolve([
            {
              id: 'tire-fl',
              currentPosition: TirePosition.FRONT_LEFT,
              brand: 'Conti',
              tireModel: 'Premium',
              dotCode: null,
            },
          ]);
        }
        return Promise.resolve([
          { id: 'tire-fl', currentPosition: TirePosition.FRONT_LEFT },
        ]);
      },
    );
    (prisma.tirePositionHistory.findMany as jest.Mock).mockResolvedValue([
      {
        tireId: 'tire-fl',
        toPosition: TirePosition.FRONT_LEFT,
        changedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    (prisma.tireTripUsageLedger.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.tireWearV3PriorShadowV1.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.tireDs4MotionShadowInputV1.count as jest.Mock).mockResolvedValue(0);
    (prisma.tireDs4MotionShadowInputV1.findFirst as jest.Mock).mockResolvedValue(null);

    const detail = await service.getSetupDetail({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tireSetupId: 'setup-1',
    });

    expect(detail.snapshotCount).toBe(0);
    expect(detail.calibrationEligibility.reason).toBeNull();
    expect(detail.calibrationEligibility.evaluable).toBe(true);
    expect((writer as unknown as { runTick: jest.Mock }).runTick).not.toHaveBeenCalled();
    expect(detail.wheels[0]?.historicalMeasurement.treadDepthMm).toBe(6.2);
  });

  it('rejects cross-tenant vehicle scope (fail-closed)', async () => {
    (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      service.listSetupsForVehicle({
        organizationId: 'org-a',
        vehicleId: 'veh-b',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
