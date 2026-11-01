import { ConfigService } from '@nestjs/config';
import { TireWearV3CalibrationShadowWriterService } from './tire-wear-v3-calibration-shadow-writer.service';
import { TireWearV3CalibrationSnapshotRepository } from './tire-wear-v3-calibration-snapshot.repository';
import { TireWearV3CalibrationEligibilityService } from './tire-wear-v3-calibration-eligibility.service';
import { TireWearV3PriorService } from '../wear-v3-prior/tire-wear-v3-prior.service';
import { TIRE_WEAR_V3_PRIOR_DYNAMIC_BETA } from '../wear-v3-prior/tire-wear-v3-prior.config';

describe('TireWearV3CalibrationShadowWriterService', () => {
  const priorService = {
    computeForSetup: jest.fn(),
  } as unknown as TireWearV3PriorService;

  const snapshotRepository = {
    findSetupCandidatesForSnapshotBatch: jest.fn(),
    findLatestCalibrationEligibilityDigest: jest.fn(),
    insertSnapshotIdempotent: jest.fn(),
  } as unknown as TireWearV3CalibrationSnapshotRepository;

  const eligibilityService = {
    resolveForSetup: jest.fn(),
  } as unknown as TireWearV3CalibrationEligibilityService;

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

  it('flag OFF => no writes', async () => {
    const service = buildService(false);
    const stats = await service.runBoundedSnapshotTick();
    expect(stats.lastResult).toBe('FLAG_OFF');
    expect(priorService.computeForSetup).not.toHaveBeenCalled();
    expect(snapshotRepository.insertSnapshotIdempotent).not.toHaveBeenCalled();
  });

  it('uses computeForSetup with persistShadow false and beta zero in result path', async () => {
    const service = buildService(true);
    (snapshotRepository.findSetupCandidatesForSnapshotBatch as jest.Mock).mockResolvedValue([
      { tireSetupId: 'setup-1', organizationId: 'org-1' },
    ]);
    (eligibilityService.resolveForSetup as jest.Mock).mockResolvedValue({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tireSetupId: 'setup-1',
      calibrationEligibilityDigest: 'digest-new',
      activePeriod: { id: 'mp-1' },
      rotationDuringMountPeriod: false,
      physicalTireIdByWheel: { FL: 'tire-1', FR: null, RL: null, RR: null },
      physicalIdentityAmbiguous: false,
      measurementIdsUsed: [],
      latestSourceMeasurementAt: null,
      sourceDataCutoffAt: new Date(),
    });
    (snapshotRepository.findLatestCalibrationEligibilityDigest as jest.Mock).mockResolvedValue(
      'digest-old',
    );
    (priorService.computeForSetup as jest.Mock).mockResolvedValue({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tireSetupId: 'setup-1',
      modelVersion: 'v3',
      modelConfigHash: 'hash',
      inputFingerprint: 'fp-1',
      computedAt: new Date().toISOString(),
      currentOdometerKm: 100,
      rated: true,
      dynamicBeta: TIRE_WEAR_V3_PRIOR_DYNAMIC_BETA,
      ds4SeverityCoverage: 0.5,
      ds4SeveritySRel: 1,
      setupFlags: [],
      odometerAnchorStatus: 'ANCHORED',
      ledgerDistanceKm: 10,
      ledgerRowCount: 1,
      wheels: [
        {
          position: 'FL',
          initialTreadMm: 8,
          estimatedTreadMm: { lo: 7, hi: 7.5 },
          displayTreadMm: { lo: 7, hi: 7.5 },
          remainingKm: { lo: 1000, hi: 2000 },
          wearRate: {
            mmPerKm: { lo: 0, hi: 0.001 },
            mmPer1000km: { lo: 0, hi: 1 },
            source: 'prior_life_table',
            modelUncertaintyMmPerKm: { lo: 0, hi: 0.001 },
            measurementUncertaintyMmPerKm: null,
            flags: [],
          },
          treadEvidenceClass: 'BASELINE_ESTIMATE',
          evidenceLevel: 'L1',
          dynamicFactor: {
            factor: 1,
            coverage: 0,
            sRel: null,
            applied: false,
            appliedToRateLo: false,
          },
          flags: [],
          distanceSinceAnchorKm: 10,
          replacementThresholdMm: 3,
          initialTreadUsedDefaultFallback: false,
          pointEstimateTreadMm: null,
          estimatedWearMm: { lo: 0.1, hi: 0.2 },
        },
      ],
    });
    (snapshotRepository.insertSnapshotIdempotent as jest.Mock).mockResolvedValue({
      id: 'row-1',
      created: true,
    });

    await service.runBoundedSnapshotTick();

    expect(priorService.computeForSetup).toHaveBeenCalledWith(
      'setup-1',
      expect.objectContaining({ persistShadow: false }),
    );
    expect(snapshotRepository.insertSnapshotIdempotent).toHaveBeenCalled();
    const row = (snapshotRepository.insertSnapshotIdempotent as jest.Mock).mock.calls[0][0];
    expect(row.calibrationEligibilityDigest).toBe('digest-new');
    expect(row.snapshotPayload.dataQuality.dynamicBeta).toBe(0);
    expect(row.snapshotPayload.dataQuality.dynamicFactor).toBe(1);
  });
});
