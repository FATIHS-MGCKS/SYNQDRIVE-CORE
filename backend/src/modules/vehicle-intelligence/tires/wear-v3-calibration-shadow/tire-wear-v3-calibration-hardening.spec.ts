import { ConfigService } from '@nestjs/config';
import { TireWearV3CalibrationShadowWriterService } from './tire-wear-v3-calibration-shadow-writer.service';
import { TireWearV3CalibrationSnapshotRepository } from './tire-wear-v3-calibration-snapshot.repository';
import { TireWearV3CalibrationEligibilityService } from './tire-wear-v3-calibration-eligibility.service';
import { TireWearV3PriorService } from '../wear-v3-prior/tire-wear-v3-prior.service';
import { TIRE_WEAR_V3_PRIOR_DYNAMIC_BETA } from '../wear-v3-prior/tire-wear-v3-prior.config';
import {
  evaluateTireWearV3CalibrationPairing,
} from './tire-wear-v3-calibration-pairing.policy';

describe('TireWearV3CalibrationShadow hardening', () => {
  const priorService = { computeForSetup: jest.fn() } as unknown as TireWearV3PriorService;
  const eligibilityService = {
    resolveForSetup: jest.fn(),
  } as unknown as TireWearV3CalibrationEligibilityService;
  const snapshotRepository = {
    findSetupCandidatesForSnapshotBatch: jest.fn(),
    findLatestCalibrationEligibilityDigest: jest.fn(),
    insertSnapshotIdempotent: jest.fn(),
  } as unknown as TireWearV3CalibrationSnapshotRepository;

  function buildService(writeEnabled: boolean) {
    const configService = {
      get: (key: string) => {
        if (key === 'tireWearV3CalibrationShadow.writeEnabled') return writeEnabled;
        if (key === 'tireWearV3CalibrationShadow.batchSize') return 10;
        return undefined;
      },
    } as unknown as ConfigService;
    return new TireWearV3CalibrationShadowWriterService(
      configService,
      priorService,
      eligibilityService,
      snapshotRepository,
    );
  }

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('writer OFF => zero writes', async () => {
    const service = buildService(false);
    await service.runBoundedSnapshotTick();
    expect(eligibilityService.resolveForSetup).not.toHaveBeenCalled();
    expect(priorService.computeForSetup).not.toHaveBeenCalled();
  });

  it('unchanged calibration eligibility digest skips compute and inserts', async () => {
    const service = buildService(true);
    (snapshotRepository.findSetupCandidatesForSnapshotBatch as jest.Mock).mockResolvedValue([
      { tireSetupId: 'setup-1', organizationId: 'org-1' },
    ]);
    (eligibilityService.resolveForSetup as jest.Mock).mockResolvedValue({
      organizationId: 'org-1',
      calibrationEligibilityDigest: 'digest-a',
      activePeriod: { id: 'mp-1' },
    });
    (snapshotRepository.findLatestCalibrationEligibilityDigest as jest.Mock).mockResolvedValue(
      'digest-a',
    );

    await service.runBoundedSnapshotTick();

    expect(priorService.computeForSetup).not.toHaveBeenCalled();
    expect(snapshotRepository.insertSnapshotIdempotent).not.toHaveBeenCalled();
  });

  it('cross-tenant setup access rejected when eligibility returns null', async () => {
    const service = buildService(true);
    (eligibilityService.resolveForSetup as jest.Mock).mockResolvedValue(null);
    const outcome = await service.snapshotSetupIfChanged('setup-1', 'org-other');
    expect(outcome.skipped).toBe(true);
    expect(priorService.computeForSetup).not.toHaveBeenCalled();
  });

  it('rejects target measurement present in snapshot measurementIdsUsed', () => {
    const result = evaluateTireWearV3CalibrationPairing({
      snapshot: {
        id: 's1',
        organizationId: 'org-1',
        vehicleId: 'v1',
        tireSetupId: 'setup-1',
        mountPeriodId: 'mp-1',
        wheelPosition: 'FL',
        physicalTireId: 'tire-1',
        predictionCreatedAt: new Date('2026-06-01T10:00:00Z'),
        sourceComputedAt: new Date('2026-06-01T10:00:00Z'),
        sourceDataCutoffAt: new Date('2026-06-01T10:00:00Z'),
        sourceOdometerKm: 1000,
        latestSourceMeasurementAt: null,
        measurementIdsUsed: ['meas-target'],
        pairingEligible: true,
      },
      measurement: {
        id: 'meas-target',
        organizationId: 'org-1',
        vehicleId: 'v1',
        tireSetupId: 'setup-1',
        measuredAt: new Date('2026-07-01T00:00:00Z'),
        odometerAtMeasurement: 2000,
        evidenceSource: 'WORKSHOP_MEASUREMENT',
        treadMmByWheel: { FL: 5 },
      },
      wheel: 'FL',
      mountPeriod: {
        id: 'mp-1',
        installedAt: new Date('2026-01-01'),
        removedAt: null,
        installedOdometerKm: 0,
        odometerAnchorStatus: 'ANCHORED',
      },
      rotationDuringMountPeriod: false,
    });
    expect(result.rejectionReason).toBe('TARGET_MEASUREMENT_IN_PREDICTION_INPUT');
  });

  it('beta remains zero in prior config constant', () => {
    expect(TIRE_WEAR_V3_PRIOR_DYNAMIC_BETA).toBe(0);
  });
});
