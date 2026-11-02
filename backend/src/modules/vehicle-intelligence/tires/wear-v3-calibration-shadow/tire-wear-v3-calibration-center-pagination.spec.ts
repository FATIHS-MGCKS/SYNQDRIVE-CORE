import { NotFoundException } from '@nestjs/common';
import {
  buildSnapshotListKeysetWhere,
  decodeSnapshotListCursor,
  encodeSnapshotListCursor,
  sanitizeCalibrationSnapshotPayloadForMasterRead,
} from './tire-wear-v3-calibration-center-read.util';
import { TIRE_WEAR_V3_CALIBRATION_SNAPSHOT_SCHEMA_VERSION } from './tire-wear-v3-calibration-snapshot.types';
import { TireWearV3CalibrationShadowMasterReadService } from './tire-wear-v3-calibration-shadow-master-read.service';

describe('calibration center snapshot list cursor', () => {
  it('encodes and decodes composite (predictionCreatedAt, id)', () => {
    const at = new Date('2026-06-01T12:00:00.000Z');
    const encoded = encodeSnapshotListCursor({ predictionCreatedAt: at, id: 'snap-b' });
    const decoded = decodeSnapshotListCursor(encoded);
    expect(decoded.id).toBe('snap-b');
    expect(decoded.predictionCreatedAt.toISOString()).toBe(at.toISOString());
  });

  it('rejects invalid cursor safely', () => {
    expect(() => decodeSnapshotListCursor('%%%')).toThrow(NotFoundException);
    expect(() => decodeSnapshotListCursor(Buffer.from('{"id":"x"}', 'utf8').toString('base64url'))).toThrow(
      NotFoundException,
    );
  });

  it('builds keyset OR for same-timestamp continuation', () => {
    const at = new Date('2026-06-01T12:00:00.000Z');
    const where = buildSnapshotListKeysetWhere({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tireSetupId: 'setup-1',
      wheelPosition: 'FL',
      mountPeriodId: 'mp-1',
      cursor: { predictionCreatedAt: at, id: 'snap-b' },
    });

    expect(where.AND).toBeDefined();
    const keyset = (where.AND as object[])[1] as { OR: unknown[] };
    expect(keyset.OR).toHaveLength(2);
  });
});

describe('TireWearV3CalibrationShadowMasterReadService snapshot pagination', () => {
  const sameAt = new Date('2026-06-01T12:00:00.000Z');

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
    prisma.vehicleTireSetup.findFirst.mockResolvedValue({ id: 'setup-1' });
  });

  it('pages four snapshots sharing predictionCreatedAt without skip or duplicate', async () => {
    const row = (id: string) => ({
      id,
      wheelPosition: 'FL',
      mountPeriodId: 'mp-1',
      physicalTireId: null,
      predictionCreatedAt: sameAt,
      sourceComputedAt: sameAt,
      pairingEligible: false,
      modelVersion: 'v3',
      snapshotSchemaVersion: 'v1',
      sourceOdometerKm: 100,
    });

    const ordered = [row('snap-d'), row('snap-c'), row('snap-b'), row('snap-a')];

    prisma.tireWearV3CalibrationSnapshotV1.findMany
      .mockImplementationOnce(({ take }: { take: number }) =>
        Promise.resolve(ordered.slice(0, take)),
      )
      .mockImplementationOnce(
        ({
          where,
          take,
        }: {
          where: { AND?: Array<{ OR?: unknown[] }> };
          take: number;
        }) => {
          expect(where.AND?.[1]?.OR).toHaveLength(2);
          return Promise.resolve([row('snap-b'), row('snap-a')].slice(0, take));
        },
      );

    const page1 = await service.listSnapshotsForSetup({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tireSetupId: 'setup-1',
      limit: 2,
    });

    expect(page1.items.map((i) => i.id)).toEqual(['snap-d', 'snap-c']);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await service.listSnapshotsForSetup({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tireSetupId: 'setup-1',
      limit: 2,
      cursor: page1.nextCursor,
    });

    expect(page2.items.map((i) => i.id)).toEqual(['snap-b', 'snap-a']);
    expect(page2.nextCursor).toBeNull();

    const ids = [...page1.items, ...page2.items].map((i) => i.id);
    expect(new Set(ids).size).toBe(4);
  });
});

describe('sanitizeCalibrationSnapshotPayloadForMasterRead', () => {
  it('strips full fingerprint digests from API payload', () => {
    const sanitized = sanitizeCalibrationSnapshotPayloadForMasterRead({
      schemaVersion: TIRE_WEAR_V3_CALIBRATION_SNAPSHOT_SCHEMA_VERSION,
      identity: {
        organizationId: 'o',
        vehicleId: 'v',
        tireSetupId: 's',
        mountPeriodId: null,
        wheelPosition: 'FL',
        physicalTireId: null,
      },
      prediction: {
        predictionCreatedAt: '2026-01-01T00:00:00.000Z',
        sourceComputedAt: '2026-01-01T00:00:00.000Z',
        sourceOdometerKm: null,
        modelVersion: 'v3',
        modelConfigHash: 'h',
        inputFingerprint: 'full-fingerprint-value',
        calibrationEligibilityDigest: 'full-digest-value',
        latestSourceMeasurementAt: null,
        sourceDataCutoffAt: '2026-01-01T00:00:00.000Z',
        measurementIdsUsed: [],
        pairingEligible: false,
        physicalIdentityAmbiguous: true,
        predictedTreadMm: null,
        displayTreadMm: null,
        remainingKm: null,
        anchor: {
          initialTreadMm: 8,
          odometerAnchorKm: null,
          distanceSinceAnchorKm: 0,
          measurementUncertaintyAssumption: 'NOT_AVAILABLE',
        },
        rate: null,
        treadEvidenceClass: 'MEASURED' as const,
        evidenceLevel: 'L1' as const,
        flags: [],
      },
      dataQuality: {
        dynamicBeta: 0,
        dynamicFactor: 1,
        ds4SeverityCoverage: 0,
        ds4SeveritySRel: null,
        setupFlags: [],
        wheelFlags: [],
        temporalQuality: 'NOT_AVAILABLE',
      },
      provenance: {
        rated: false,
        ledgerDistanceKm: 0,
        ledgerRowCount: 0,
        odometerAnchorStatus: null,
        rotationDuringMountPeriod: false,
      },
    });

    expect(sanitized.prediction).not.toHaveProperty('inputFingerprint');
    expect(sanitized.prediction).not.toHaveProperty('calibrationEligibilityDigest');
  });
});
