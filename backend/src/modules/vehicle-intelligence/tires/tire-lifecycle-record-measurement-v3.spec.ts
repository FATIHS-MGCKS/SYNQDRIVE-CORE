import { TireEvidenceSource, TireSetupStatus } from '@prisma/client';
import { TireLifecycleService } from './tire-lifecycle.service';
import { TireWearModelService } from './tire-wear-model.service';
import { TireHealthService } from './tire-health.service';
import { TireIdentityService } from './tire-identity.service';
import type { TireWearV3PriorService } from './wear-v3-prior/tire-wear-v3-prior.service';

const VEHICLE_A = 'veh-a';
const VEHICLE_B = 'veh-b';
const SETUP_A = 'setup-a';

function buildHarness(v3Prior?: Partial<TireWearV3PriorService>) {
  const wearModel = {
    calibrateFromMeasurement: jest.fn().mockResolvedValue({ FL: 1, FR: 1, RL: 1, RR: 1 }),
  };
  const tireHealthService = {
    recalculate: jest.fn().mockResolvedValue(undefined),
  };
  const tireIdentity = {} as TireIdentityService;
  const tireHealthAlertService = {
    resolveOpenAlertsForSetup: jest.fn().mockResolvedValue(0),
  };

  const measurementCreate = jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'meas-1',
    ...data,
  }));

  const prisma = {
    vehicle: {
      findUnique: jest.fn().mockImplementation(async ({ where, select }: { where: { id: string }; select?: Record<string, boolean> }) => {
        if (where.id === VEHICLE_A) {
          return select?.mileageKm ? { mileageKm: 10000 } : { organizationId: 'org-a' };
        }
        if (where.id === VEHICLE_B) {
          return select?.mileageKm ? { mileageKm: 1 } : { organizationId: 'org-b' };
        }
        return null;
      }),
    },
    vehicleTireSetup: {
      findUnique: jest.fn().mockResolvedValue({
        id: SETUP_A,
        vehicleId: VEHICLE_A,
        status: TireSetupStatus.ACTIVE,
        removedAt: null,
        installedAt: new Date('2026-01-01T00:00:00Z'),
        installedOdometerKm: 1000,
        odometerAnchorStatus: 'ANCHORED',
      }),
      findFirst: jest.fn().mockImplementation(async (args: { where?: { vehicleId?: string; removedOdometerKm?: unknown } }) => {
        if (args?.where?.removedOdometerKm) return null;
        return {
          id: SETUP_A,
          vehicleId: VEHICLE_A,
          status: TireSetupStatus.ACTIVE,
          removedAt: null,
          installedAt: new Date('2026-01-01T00:00:00Z'),
          installedOdometerKm: 1000,
          odometerAnchorStatus: 'ANCHORED',
        };
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    vehicleTireTreadMeasurement: {
      create: measurementCreate,
    },
    vehicleTireSetupMountPeriod: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'mp-1',
          installedAt: new Date('2026-01-01T00:00:00Z'),
          removedAt: null,
          installedOdometerKm: 1000,
          odometerAnchorStatus: 'ANCHORED',
        },
      ]),
    },
    tireEvent: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    vehicleLatestState: {
      findUnique: jest.fn().mockResolvedValue({
        odometerKm: 11000,
        odometerCapturedAt: new Date(),
      }),
    },
    vehicleTripLedgerAggregate: {
      findFirst: jest.fn().mockResolvedValue({ totalDistanceKm: 500 }),
    },
  } as any;

  const computeForSetup = jest.fn().mockResolvedValue({
    rated: true,
    setupFlags: ['RATE_INSUFFICIENT_POINTS'],
    verification: { status: 'CURRENT' },
  });

  const tireWearV3PriorService = {
    computeForSetup,
    ...v3Prior,
  } as TireWearV3PriorService;

  const svc = new TireLifecycleService(
    prisma,
    wearModel as unknown as TireWearModelService,
    tireHealthService as unknown as TireHealthService,
    tireHealthAlertService as never,
    tireIdentity,
    undefined,
    tireWearV3PriorService,
  );

  return { svc, prisma, measurementCreate, computeForSetup, tireHealthService, wearModel };
}

describe('TireLifecycleService.recordMeasurement — V3 ingestion P1', () => {
  it('persists explicit odometer for ground-truth manual confirm and triggers V3 recompute', async () => {
    const { svc, measurementCreate, computeForSetup, tireHealthService } = buildHarness();

    const result = await svc.recordMeasurement({
      vehicleId: VEHICLE_A,
      tireSetupId: SETUP_A,
      frontLeftMm: 6,
      frontRightMm: 6,
      rearLeftMm: 6,
      rearRightMm: 6,
      odometerKm: 12000,
      manualConfirmOdometer: true,
      measuredAt: new Date('2026-02-15T10:00:00Z'),
      source: 'manual',
    });

    expect(measurementCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          odometerAtMeasurement: 12000,
          evidenceSource: TireEvidenceSource.MANUAL_MEASUREMENT,
        }),
      }),
    );
    expect(tireHealthService.recalculate).toHaveBeenCalledWith(VEHICLE_A);
    expect(computeForSetup).toHaveBeenCalledWith(SETUP_A, { persistShadow: false });
    expect(result.v3Ingestion?.verificationEligible).toBe(true);
    expect(result.kFactors).toBeTruthy();
  });

  it('does not persist telemetry odometer for ground-truth without confirm', async () => {
    const { svc, measurementCreate, computeForSetup } = buildHarness();

    const result = await svc.recordMeasurement({
      vehicleId: VEHICLE_A,
      tireSetupId: SETUP_A,
      frontLeftMm: 5,
      odometerKm: 15000,
      measuredAt: new Date('2026-02-15T10:00:00Z'),
      source: 'manual',
    });

    expect(measurementCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ odometerAtMeasurement: null }),
      }),
    );
    expect(result.v3Ingestion?.verificationEligible).toBe(false);
    expect(result.v3Ingestion?.warnings.map((w) => w.code)).toContain('V3_ODOMETER_NOT_EXPLICIT');
    expect(computeForSetup).toHaveBeenCalled();
  });

  it('allows partial wheel measurement with explicit odometer', async () => {
    const { svc } = buildHarness();
    const result = await svc.recordMeasurement({
      vehicleId: VEHICLE_A,
      tireSetupId: SETUP_A,
      frontLeftMm: 4.2,
      odometerKm: 11000,
      manualConfirmOdometer: true,
      source: 'manual',
    });

    expect(result.measurement.frontLeftMm).toBe(4.2);
    expect(result.v3Ingestion?.verificationEligible).toBe(true);
  });

  it('excludes ai_confirmed from V3 verification while still saving', async () => {
    const { svc, measurementCreate } = buildHarness();

    const result = await svc.recordMeasurement({
      vehicleId: VEHICLE_A,
      tireSetupId: SETUP_A,
      frontLeftMm: 3,
      odometerKm: 12000,
      manualConfirmOdometer: true,
      source: 'ai_confirmed',
      documentExtractionId: 'doc-1',
    });

    expect(measurementCreate).toHaveBeenCalled();
    expect(result.v3Ingestion?.verificationEligible).toBe(false);
    expect(result.v3Ingestion?.warnings.map((w) => w.code)).toContain('V3_NOT_GROUND_TRUTH_SOURCE');
  });

  it('returns success when measurement persisted but V3 recompute fails', async () => {
    const computeForSetup = jest.fn().mockRejectedValue(new Error('v3 compute down'));
    const { svc, measurementCreate, tireHealthService } = buildHarness({ computeForSetup });

    const result = await svc.recordMeasurement({
      vehicleId: VEHICLE_A,
      tireSetupId: SETUP_A,
      frontLeftMm: 5,
      odometerKm: 12000,
      manualConfirmOdometer: true,
      source: 'manual',
    });

    expect(measurementCreate).toHaveBeenCalledTimes(1);
    expect(tireHealthService.recalculate).toHaveBeenCalledWith(VEHICLE_A);
    expect(result.measurement.id).toBe('meas-1');
    expect(result.v3Recompute?.status).toBe('failed');
    expect(result.v3Recompute?.code).toBe('V3_RECOMPUTE_FAILED');
    expect(result.v3Ingestion?.verificationEligible).toBe(false);
    expect(result.v3Ingestion?.warnings.map((w) => w.code)).toContain('V3_RECOMPUTE_FAILED');
  });

  it('rejects implausible confirmed odometer rollback', async () => {
    const { svc } = buildHarness();
    await expect(
      svc.recordMeasurement({
        vehicleId: VEHICLE_A,
        tireSetupId: SETUP_A,
        frontLeftMm: 5,
        odometerKm: 100,
        manualConfirmOdometer: true,
        source: 'manual',
      }),
    ).rejects.toThrow(/not plausible/i);
  });

  it('persists registration baseline without V3 verification eligibility', async () => {
    const { svc, measurementCreate } = buildHarness();
    const result = await svc.recordMeasurement({
      vehicleId: VEHICLE_A,
      tireSetupId: SETUP_A,
      frontLeftMm: 8,
      frontRightMm: 8,
      source: 'manual_registration',
    });
    expect(measurementCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'manual_registration',
          odometerAtMeasurement: null,
        }),
      }),
    );
    expect(result.v3Ingestion?.verificationEligible).toBe(false);
    expect(result.v3Ingestion?.evidenceClass).toBe('EXCLUDED_SOURCE');
  });

  it('flags workshop measurement without explicit odometer as unverified', async () => {
    const { svc, measurementCreate } = buildHarness();
    const result = await svc.recordMeasurement({
      vehicleId: VEHICLE_A,
      tireSetupId: SETUP_A,
      frontLeftMm: 5,
      source: 'workshop',
      workshopName: 'ACME Tyres',
    });
    expect(measurementCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ odometerAtMeasurement: null }),
      }),
    );
    expect(result.v3Ingestion?.evidenceClass).toBe('UNVERIFIED_GROUND_TRUTH');
    expect(result.v3Ingestion?.warnings.map((w) => w.code)).toContain('V3_WORKSHOP_ODOMETER_MISSING');
  });

  it('rejects wrong-vehicle setup (tenant isolation)', async () => {
    const { svc, prisma } = buildHarness();
    prisma.vehicleTireSetup.findUnique.mockResolvedValueOnce({
      id: SETUP_A,
      vehicleId: VEHICLE_B,
      status: TireSetupStatus.ACTIVE,
      removedAt: null,
      installedAt: new Date(),
      installedOdometerKm: 1,
      odometerAnchorStatus: 'ANCHORED',
    });

    await expect(
      svc.recordMeasurement({
        vehicleId: VEHICLE_A,
        tireSetupId: SETUP_A,
        frontLeftMm: 5,
        manualConfirmOdometer: true,
        odometerKm: 100,
      }),
    ).rejects.toThrow('Tire setup does not belong to this vehicle.');
  });
});
