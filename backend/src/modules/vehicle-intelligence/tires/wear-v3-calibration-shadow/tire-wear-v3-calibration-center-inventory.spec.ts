import { NotFoundException } from '@nestjs/common';
import { TirePosition } from '@prisma/client';
import { TireWearV3CalibrationCenterInventoryReadService } from './tire-wear-v3-calibration-center-inventory-read.service';
import { TireWearV3CalibrationEligibilityService } from './tire-wear-v3-calibration-eligibility.service';
import { TireWearV3CalibrationShadowWriterService } from './tire-wear-v3-calibration-shadow-writer.service';

const baseSetup = {
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
  mountPeriods: [
    {
      id: 'mp-1',
      installedAt: new Date('2026-01-01T00:00:00.000Z'),
      removedAt: null,
      installedOdometerKm: 1000,
      odometerAnchorStatus: 'CONFIRMED',
    },
  ],
  _count: { measurements: 1, wearV3CalibrationSnapshots: 0 },
};

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
    tirePositionHistory: { findMany: jest.fn() },
    tireWearV3PriorShadowV1: { groupBy: jest.fn(), findFirst: jest.fn() },
    tireWearV3CalibrationSnapshotV1: { groupBy: jest.fn(), count: jest.fn() },
    vehicleTireTreadMeasurement: { findMany: jest.fn() },
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

  function mockSetupDetailReads(options: {
    measurements?: unknown[];
    mountTires?: unknown[];
    activeTires?: unknown[];
    positionHistory?: unknown[];
  }) {
    prisma.vehicleTireSetup.findFirst.mockResolvedValue(baseSetup);
    prisma.vehicleTireTreadMeasurement.findMany.mockResolvedValue(options.measurements ?? []);
    prisma.tire.findMany
      .mockResolvedValueOnce(options.mountTires ?? [])
      .mockResolvedValueOnce(options.activeTires ?? []);
    prisma.tirePositionHistory.findMany.mockResolvedValue(options.positionHistory ?? []);
    prisma.tireWearV3PriorShadowV1.findFirst.mockResolvedValue(null);
    prisma.tireDs4MotionShadowInputV1.count.mockResolvedValue(0);
    prisma.tireDs4MotionShadowInputV1.findFirst.mockResolvedValue(null);
    (eligibility.resolveForSetup as jest.Mock).mockResolvedValue(null);
  }

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
    mockSetupDetailReads({
      activeTires: [
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
      ],
    });

    const detail = await service.getSetupDetail({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tireSetupId: 'setup-1',
    });

    const fl = detail.wheels.find((w) => w.wheelPosition === 'FL');
    expect(fl?.currentAssignment.physicalIdentityStatus).toBe('AMBIGUOUS');
    expect(fl?.currentAssignment.physicalTireId).toBeNull();
  });

  it('preserves tread values but does not link to current tire after replacement', async () => {
    const measuredAt = new Date('2026-02-01T00:00:00.000Z');
    const replaceAt = new Date('2026-04-01T00:00:00.000Z');
    mockSetupDetailReads({
      measurements: [
        {
          id: 'm1',
          measuredAt,
          evidenceSource: 'WORKSHOP',
          source: 'manual',
          frontLeftMm: 5.1,
          frontRightMm: null,
          rearLeftMm: null,
          rearRightMm: null,
        },
      ],
      mountTires: [
        {
          id: 'tire-old',
          mountedAt: new Date('2026-01-01T00:00:00.000Z'),
          dismountedAt: replaceAt,
          installedPosition: TirePosition.FRONT_LEFT,
        },
        {
          id: 'tire-new',
          mountedAt: replaceAt,
          dismountedAt: null,
          installedPosition: TirePosition.FRONT_LEFT,
        },
      ],
      activeTires: [
        {
          id: 'tire-new',
          currentPosition: TirePosition.FRONT_LEFT,
          brand: null,
          tireModel: null,
          dotCode: null,
        },
      ],
      positionHistory: [
        {
          tireId: 'tire-old',
          toPosition: TirePosition.FRONT_LEFT,
          changedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          tireId: 'tire-new',
          toPosition: TirePosition.FRONT_LEFT,
          changedAt: replaceAt,
        },
      ],
    });

    const detail = await service.getSetupDetail({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tireSetupId: 'setup-1',
    });
    const fl = detail.wheels.find((w) => w.wheelPosition === 'FL')!;
    expect(fl.historicalMeasurement.treadDepthMm).toBe(5.1);
    expect(fl.measurementAttribution.status).toBe('CONFIRMED');
    expect(fl.measurementAttribution.attributedPhysicalTireId).toBe('tire-old');
    expect(fl.measurementAttribution.linksMeasurementToCurrentMountedTire).toBe(false);
    expect(fl.currentAssignment.physicalTireId).toBe('tire-new');
  });

  it('keeps measurements visible with NOT_ATTRIBUTABLE when pre-mount', async () => {
    mockSetupDetailReads({
      measurements: [
        {
          id: 'm-pre',
          measuredAt: new Date('2025-12-01T00:00:00.000Z'),
          evidenceSource: null,
          source: 'import',
          frontLeftMm: 4.0,
          frontRightMm: null,
          rearLeftMm: null,
          rearRightMm: null,
        },
      ],
      mountTires: [
        {
          id: 'tire-a',
          mountedAt: new Date('2026-01-01T00:00:00.000Z'),
          dismountedAt: null,
          installedPosition: TirePosition.FRONT_LEFT,
        },
      ],
      activeTires: [
        {
          id: 'tire-a',
          currentPosition: TirePosition.FRONT_LEFT,
          brand: null,
          tireModel: null,
          dotCode: null,
        },
      ],
    });

    const detail = await service.getSetupDetail({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tireSetupId: 'setup-1',
    });
    const fl = detail.wheels.find((w) => w.wheelPosition === 'FL')!;
    expect(fl.historicalMeasurement.treadDepthMm).toBe(4.0);
    expect(fl.measurementAttribution.status).toBe('NOT_ATTRIBUTABLE');
  });

  it('reports zero calibration snapshots in detail', async () => {
    mockSetupDetailReads({});
    const detail = await service.getSetupDetail({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tireSetupId: 'setup-1',
    });
    expect(detail.snapshotCount).toBe(0);
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
