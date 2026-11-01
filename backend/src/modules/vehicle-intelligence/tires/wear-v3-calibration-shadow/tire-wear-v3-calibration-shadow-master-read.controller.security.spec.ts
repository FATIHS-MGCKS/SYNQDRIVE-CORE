import { NotFoundException } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MASTER_ADMIN_MFA_ACTION_KEY } from '@shared/decorators/require-master-admin-mfa.decorator';
import { ROLES_KEY } from '@shared/decorators/roles.decorator';
import { TireWearV3CalibrationShadowMasterReadController } from './tire-wear-v3-calibration-shadow-master-read.controller';
import { TireWearV3CalibrationShadowMasterReadService } from './tire-wear-v3-calibration-shadow-master-read.service';

describe('TireWearV3CalibrationShadowMasterReadController security', () => {
  it('requires MASTER_ADMIN and RolesGuard without MFA step-up', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      TireWearV3CalibrationShadowMasterReadController,
    ) as string[];
    expect(roles).toContain('MASTER_ADMIN');
    const guards = Reflect.getMetadata(
      '__guards__',
      TireWearV3CalibrationShadowMasterReadController,
    ) as Array<{ name: string }>;
    expect(guards?.map((g) => g.name)).toEqual([RolesGuard.name]);
    expect(
      Reflect.getMetadata(
        MASTER_ADMIN_MFA_ACTION_KEY,
        TireWearV3CalibrationShadowMasterReadController,
      ),
    ).toBeUndefined();
  });
});

describe('TireWearV3CalibrationShadowMasterReadService scoping', () => {
  const prisma = {
    vehicle: { findFirst: jest.fn() },
    vehicleTireSetup: { findFirst: jest.fn() },
    tireWearV3CalibrationSnapshotV1: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn(),
    },
  };
  const snapshots = {
    latestSnapshotTimestampForSetup: jest.fn(),
    listRecentSnapshotsForSetup: jest.fn(),
  };
  const writer = {
    getWriterStats: jest.fn().mockReturnValue({
      lastTickAt: null,
      lastResult: 'IDLE',
      lastError: null,
      lastCandidateSetups: 0,
      lastSnapshotsInserted: 0,
      lastSnapshotsExisting: 0,
      lastSetupsSkipped: 0,
    }),
    isWriteEnabled: jest.fn().mockReturnValue(false),
  };

  const service = new TireWearV3CalibrationShadowMasterReadService(
    prisma as never,
    snapshots as never,
    writer as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    writer.isWriteEnabled.mockReturnValue(false);
    writer.getWriterStats.mockReturnValue({
      lastTickAt: null,
      lastResult: 'IDLE',
      lastError: null,
      lastCandidateSetups: 0,
      lastSnapshotsInserted: 0,
      lastSnapshotsExisting: 0,
      lastSetupsSkipped: 0,
    });
  });

  it('writer health is replica-local telemetry', () => {
    const health = service.getWriterHealth();
    expect(health.telemetryScope).toBe('REPLICA_LOCAL');
    expect(health.writeEnabled).toBe(false);
  });

  it('rejects snapshot detail when row missing for scope', async () => {
    prisma.vehicleTireSetup.findFirst.mockResolvedValue({ id: 'setup-1' });
    prisma.tireWearV3CalibrationSnapshotV1.findFirst.mockResolvedValue(null);

    await expect(
      service.getSnapshotDetail({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        tireSetupId: 'setup-1',
        snapshotId: 'snap-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('marks physical identity UNCONFIRMED when physicalTireId is null', async () => {
    prisma.vehicleTireSetup.findFirst.mockResolvedValue({ id: 'setup-1' });
    prisma.tireWearV3CalibrationSnapshotV1.findFirst.mockResolvedValue({
      id: 'snap-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tireSetupId: 'setup-1',
      mountPeriodId: 'mp-1',
      wheelPosition: 'FL',
      physicalTireId: null,
      predictionCreatedAt: new Date('2026-06-01T10:00:00Z'),
      sourceComputedAt: new Date('2026-06-01T10:00:00Z'),
      sourceDataCutoffAt: new Date('2026-06-01T10:00:00Z'),
      sourceOdometerKm: 1000,
      latestSourceMeasurementAt: null,
      modelVersion: 'v3',
      modelConfigHash: 'cfg',
      snapshotSchemaVersion: 'v1',
      calibrationEligibilityDigest: 'abcdef0123456789',
      inputFingerprint: '1234567890abcdef',
      pairingEligible: false,
      measurementIdsUsed: [],
      snapshotPayload: {
        schemaVersion: 'v1',
        identity: {
          organizationId: 'org-1',
          vehicleId: 'veh-1',
          tireSetupId: 'setup-1',
          mountPeriodId: 'mp-1',
          wheelPosition: 'FL',
          physicalTireId: null,
        },
        prediction: {
          physicalIdentityAmbiguous: true,
          inputFingerprint: 'secret-full-fingerprint',
          calibrationEligibilityDigest: 'secret-full-digest',
          pairingEligible: false,
        },
        dataQuality: { temporalQuality: 'NOT_AVAILABLE', ds4SeverityCoverage: 0 },
        provenance: { rotationDuringMountPeriod: false, ledgerRowCount: 0, ledgerDistanceKm: 0 },
      },
    });

    const detail = await service.getSnapshotDetail({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tireSetupId: 'setup-1',
      snapshotId: 'snap-1',
    });

    expect(detail.physicalIdentityStatus).toBe('UNCONFIRMED');
    expect(detail.physicalTireId).toBeNull();
    expect(detail.payload.prediction).not.toHaveProperty('inputFingerprint');
    expect(detail.payload.prediction).not.toHaveProperty('calibrationEligibilityDigest');
  });

  it('rejects vehicle listing when vehicle not in organization', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);

    await expect(
      service.listSetupsForVehicle({ organizationId: 'org-1', vehicleId: 'veh-other' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
