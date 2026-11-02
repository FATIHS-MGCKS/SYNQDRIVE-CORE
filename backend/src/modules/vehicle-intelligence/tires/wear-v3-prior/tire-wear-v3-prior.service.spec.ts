import { ConfigService } from '@nestjs/config';
import { TireBaselineStatus, TireEvidenceSource, TireOdometerAnchorStatus, TireSeason } from '@prisma/client';
import { TireWearV3PriorService } from './tire-wear-v3-prior.service';
import { TireWearV3PriorRepository } from './tire-wear-v3-prior.repository';
import { TIRE_WEAR_V3_PRIOR_MODEL_VERSION } from './tire-wear-v3-prior.config';

describe('TireWearV3PriorService', () => {
  const setupId = 'setup-1';
  const vehicleId = 'vehicle-1';
  const orgId = 'org-1';
  const mountInstalled = new Date('2026-01-01');

  const prisma = {
    vehicleTireSetup: {
      findUnique: jest.fn(),
    },
    tireTripUsageLedger: {
      findMany: jest.fn(),
    },
    vehicleTireTreadMeasurement: {
      findMany: jest.fn(),
    },
    tirePositionHistory: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const repository = {
    findLatestShadowRow: jest.fn(),
    insertShadowRow: jest.fn(),
    insertShadowRowIdempotent: jest.fn(),
    findLatestDs4ShadowEvidenceByLedgerIds: jest.fn().mockResolvedValue([]),
  };

  const configService = {
    get: jest.fn().mockReturnValue(false),
  };

  let service: TireWearV3PriorService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TireWearV3PriorService(
      prisma as never,
      repository as unknown as TireWearV3PriorRepository,
      configService as unknown as ConfigService,
    );
  });

  function mockAnchoredSetup(overrides: Record<string, unknown> = {}) {
    prisma.vehicleTireSetup.findUnique.mockResolvedValue({
      id: setupId,
      vehicleId,
      organizationId: orgId,
      tireSeason: TireSeason.SUMMER,
      expectedLifeKm: 40000,
      expectedLifeKmFront: null,
      expectedLifeKmRear: null,
      initialTreadFrontMm: 8,
      initialTreadRearMm: 8,
      initialTreadDepthMm: 8,
      installedOdometerKm: 10000,
      installedAt: mountInstalled,
      removedAt: null,
      odometerAnchorStatus: TireOdometerAnchorStatus.ANCHORED,
      initialTreadEvidenceSource: TireEvidenceSource.USER_CONFIRMED,
      baselineStatus: TireBaselineStatus.CONFIRMED,
      aiTireSpec: null,
      mountPeriods: [
        {
          id: 'mp-1',
          installedAt: mountInstalled,
          removedAt: null,
          installedOdometerKm: 10000,
          odometerAnchorStatus: TireOdometerAnchorStatus.ANCHORED,
        },
      ],
      vehicle: {
        organizationId: orgId,
        latestState: { odometerKm: 15000 },
      },
      ...overrides,
    });
  }

  it('sums only non-invalidated ledger distance within mount period', async () => {
    mockAnchoredSetup();
    prisma.tireTripUsageLedger.findMany.mockResolvedValue([
      {
        id: 'led-1',
        tripId: 't1',
        distanceKm: 100,
        revisionNumber: 1,
        sourceFingerprint: 'fp-a',
        tripStartedAt: new Date('2026-02-01'),
      },
      {
        id: 'led-2',
        tripId: 't2',
        distanceKm: 50,
        revisionNumber: 2,
        sourceFingerprint: 'fp-b',
        tripStartedAt: new Date('2026-03-01'),
      },
    ]);
    prisma.vehicleTireTreadMeasurement.findMany.mockResolvedValue([]);

    const result = await service.computeForSetup(setupId);
    expect(prisma.tireTripUsageLedger.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tireSetupId: setupId, invalidatedAt: null },
      }),
    );
    expect(result?.ledgerDistanceKm).toBe(150);
    expect(result?.modelVersion).toBe(TIRE_WEAR_V3_PRIOR_MODEL_VERSION);
    expect(result?.dynamicBeta).toBe(0);
    expect(result?.wheels).toHaveLength(4);
    expect(result?.verification.status).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('marks UNRATED when odometer anchor is missing', async () => {
    mockAnchoredSetup({
      odometerAnchorStatus: TireOdometerAnchorStatus.ANCHOR_REQUIRED,
      installedOdometerKm: null,
      mountPeriods: [
        {
          id: 'mp-1',
          installedAt: mountInstalled,
          removedAt: null,
          installedOdometerKm: null,
          odometerAnchorStatus: TireOdometerAnchorStatus.ANCHOR_REQUIRED,
        },
      ],
    });
    prisma.tireTripUsageLedger.findMany.mockResolvedValue([]);
    prisma.vehicleTireTreadMeasurement.findMany.mockResolvedValue([]);

    const result = await service.computeForSetup(setupId);
    expect(result?.rated).toBe(false);
    expect(result?.wheels[0]?.evidenceLevel).toBe('UNRATED');
    expect(result?.setupFlags).toContain('ODOMETER_ANCHOR_NOT_CONFIRMED');
  });

  it('does not persist shadow rows when write flag is off', async () => {
    mockAnchoredSetup();
    prisma.tireTripUsageLedger.findMany.mockResolvedValue([]);
    prisma.vehicleTireTreadMeasurement.findMany.mockResolvedValue([]);

    await service.computeForSetup(setupId, { persistShadow: true });
    expect(repository.insertShadowRowIdempotent).not.toHaveBeenCalled();
  });

  it('does not persist shadow rows when persistShadow is false even if env write is on', async () => {
    configService.get.mockReturnValue(true);
    mockAnchoredSetup();
    prisma.tireTripUsageLedger.findMany.mockResolvedValue([]);
    prisma.vehicleTireTreadMeasurement.findMany.mockResolvedValue([]);

    await service.computeForSetup(setupId, { persistShadow: false });
    expect(repository.insertShadowRowIdempotent).not.toHaveBeenCalled();
  });

  it('persists shadow rows when env write is on and persistShadow is omitted', async () => {
    configService.get.mockReturnValue(true);
    mockAnchoredSetup();
    prisma.tireTripUsageLedger.findMany.mockResolvedValue([]);
    prisma.vehicleTireTreadMeasurement.findMany.mockResolvedValue([]);

    await service.computeForSetup(setupId);
    expect(repository.insertShadowRowIdempotent).toHaveBeenCalledTimes(1);
  });

  it('persists shadow rows when env write is on and persistShadow is true', async () => {
    configService.get.mockReturnValue(true);
    mockAnchoredSetup();
    prisma.tireTripUsageLedger.findMany.mockResolvedValue([]);
    prisma.vehicleTireTreadMeasurement.findMany.mockResolvedValue([]);

    await service.computeForSetup(setupId, { persistShadow: true });
    expect(repository.insertShadowRowIdempotent).toHaveBeenCalledTimes(1);
  });

  it('keeps L1 for a single tread measurement (no rate calibration)', async () => {
    mockAnchoredSetup();
    prisma.tireTripUsageLedger.findMany.mockResolvedValue([
      {
        id: 'led-1',
        tripId: 't1',
        distanceKm: 5000,
        revisionNumber: 1,
        sourceFingerprint: 'fp',
        tripStartedAt: new Date('2026-02-01'),
      },
    ]);
    prisma.vehicleTireTreadMeasurement.findMany.mockResolvedValue([
      {
        id: 'm1',
        measuredAt: new Date('2026-08-01'),
        odometerAtMeasurement: 12000,
        frontLeftMm: 7.5,
        frontRightMm: 7.5,
        rearLeftMm: 7.5,
        rearRightMm: 7.5,
        source: 'manual',
        isCalibrationPoint: true,
      },
    ]);

    const result = await service.computeForSetup(setupId);
    const fl = result?.wheels.find((w) => w.position === 'FL');
    expect(fl?.evidenceLevel).toBe('L1');
    expect(fl?.wearRate.source).not.toBe('measurement_fused');
  });

  it('ignores excluded ai_confirmed rows for rate fitting and projection anchor', async () => {
    mockAnchoredSetup();
    prisma.tireTripUsageLedger.findMany.mockResolvedValue([
      {
        id: 'led-1',
        tripId: 't1',
        distanceKm: 5000,
        revisionNumber: 1,
        sourceFingerprint: 'fp',
        tripStartedAt: new Date('2026-02-01'),
      },
    ]);
    prisma.vehicleTireTreadMeasurement.findMany.mockResolvedValue([
      {
        id: 'm-trusted',
        measuredAt: new Date('2026-03-01'),
        odometerAtMeasurement: 12000,
        frontLeftMm: 7.5,
        frontRightMm: 7.5,
        rearLeftMm: 7.5,
        rearRightMm: 7.5,
        source: 'manual',
        isCalibrationPoint: false,
        evidenceSource: TireEvidenceSource.MANUAL_MEASUREMENT,
      },
      {
        id: 'm-ai',
        measuredAt: new Date('2026-09-01'),
        odometerAtMeasurement: 20000,
        frontLeftMm: 2,
        frontRightMm: 2,
        rearLeftMm: 2,
        rearRightMm: 2,
        source: 'ai_confirmed',
        isCalibrationPoint: false,
        evidenceSource: TireEvidenceSource.USER_CONFIRMED,
      },
    ]);

    const result = await service.computeForSetup(setupId);
    expect(result?.setupFlags).toContain('MEASUREMENTS_EXCLUDED_UNTRUSTED_NUMERICAL_SOURCE');
    const fl = result?.wheels.find((w) => w.position === 'FL');
    expect(fl?.wearRate.source).not.toBe('measurement_fused');
    expect(fl?.estimatedTreadMm?.lo).toBeGreaterThan(6);
  });

  it('does not fuse wear rate from two spaced excluded-source measurements alone', async () => {
    mockAnchoredSetup();
    prisma.tireTripUsageLedger.findMany.mockResolvedValue([]);
    prisma.vehicleTireTreadMeasurement.findMany.mockResolvedValue([
      {
        id: 'm1',
        measuredAt: new Date('2026-03-01'),
        odometerAtMeasurement: 11000,
        frontLeftMm: 7,
        frontRightMm: 7,
        rearLeftMm: 7,
        rearRightMm: 7,
        source: 'ai_confirmed',
        isCalibrationPoint: false,
        evidenceSource: TireEvidenceSource.USER_CONFIRMED,
      },
      {
        id: 'm2',
        measuredAt: new Date('2026-08-01'),
        odometerAtMeasurement: 18000,
        frontLeftMm: 5,
        frontRightMm: 5,
        rearLeftMm: 5,
        rearRightMm: 5,
        source: 'ai_confirmed',
        isCalibrationPoint: false,
        evidenceSource: TireEvidenceSource.USER_CONFIRMED,
      },
    ]);

    const result = await service.computeForSetup(setupId);
    const fl = result?.wheels.find((w) => w.position === 'FL');
    expect(fl?.wearRate.source).not.toBe('measurement_fused');
    expect(result?.setupFlags).toContain('MEASUREMENTS_EXCLUDED_UNTRUSTED_NUMERICAL_SOURCE');
  });
});
