import {
  evaluateTireWearV3CalibrationPairing,
  selectLatestProspectiveSnapshotBeforeMeasurement,
} from './tire-wear-v3-calibration-pairing.policy';

describe('tire-wear-v3-calibration-pairing.policy', () => {
  const mountPeriod = {
    id: 'mp-1',
    installedAt: new Date('2026-01-01T00:00:00Z'),
    removedAt: null,
    installedOdometerKm: 1000,
    odometerAnchorStatus: 'ANCHORED' as const,
  };

  const snapshot = {
    id: 'snap-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    tireSetupId: 'setup-1',
    mountPeriodId: 'mp-1',
    wheelPosition: 'FL',
    physicalTireId: 'tire-a',
    predictionCreatedAt: new Date('2026-06-01T10:00:00Z'),
    sourceComputedAt: new Date('2026-06-01T10:00:00Z'),
    sourceDataCutoffAt: new Date('2026-06-01T10:00:00Z'),
    sourceOdometerKm: 5000,
    latestSourceMeasurementAt: new Date('2026-05-01T10:00:00Z'),
    measurementIdsUsed: ['older-meas'],
    pairingEligible: true,
  };

  const measurement = {
    id: 'meas-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    tireSetupId: 'setup-1',
    measuredAt: new Date('2026-07-01T12:00:00Z'),
    odometerAtMeasurement: 6000,
    evidenceSource: 'WORKSHOP_MEASUREMENT' as const,
    treadMmByWheel: { FL: 5.2, FR: null, RL: null, RR: null },
  };

  it('accepts prospective snapshot before measurement', () => {
    const result = evaluateTireWearV3CalibrationPairing({
      snapshot,
      measurement,
      wheel: 'FL',
      mountPeriod,
      rotationDuringMountPeriod: false,
    });
    expect(result.eligible).toBe(true);
  });

  it('rejects snapshot after measurement (no retroactive pairing)', () => {
    const lateSnapshot = {
      ...snapshot,
      predictionCreatedAt: new Date('2026-08-01T00:00:00Z'),
      sourceComputedAt: new Date('2026-08-01T00:00:00Z'),
      sourceDataCutoffAt: new Date('2026-08-01T00:00:00Z'),
    };
    const result = evaluateTireWearV3CalibrationPairing({
      snapshot: lateSnapshot,
      measurement,
      wheel: 'FL',
      mountPeriod,
      rotationDuringMountPeriod: false,
    });
    expect(result.rejectionReason).toBe('SNAPSHOT_NOT_BEFORE_MEASUREMENT');
  });

  it('rejects rotation during mount period', () => {
    const result = evaluateTireWearV3CalibrationPairing({
      snapshot,
      measurement,
      wheel: 'FL',
      mountPeriod,
      rotationDuringMountPeriod: true,
    });
    expect(result.rejectionReason).toBe('ROTATION_DURING_MOUNT');
  });

  it('selects latest snapshot strictly before measurement', () => {
    const older = {
      ...snapshot,
      id: 'old',
      predictionCreatedAt: new Date('2026-05-01T00:00:00Z'),
      sourceComputedAt: new Date('2026-05-01T00:00:00Z'),
      sourceDataCutoffAt: new Date('2026-05-01T00:00:00Z'),
    };
    const newer = {
      ...snapshot,
      id: 'new',
      predictionCreatedAt: new Date('2026-06-15T00:00:00Z'),
      sourceComputedAt: new Date('2026-06-15T00:00:00Z'),
      sourceDataCutoffAt: new Date('2026-06-15T00:00:00Z'),
    };
    const picked = selectLatestProspectiveSnapshotBeforeMeasurement(
      [older, newer],
      measurement,
      'FL',
    );
    expect(picked?.id).toBe('new');
  });
});
