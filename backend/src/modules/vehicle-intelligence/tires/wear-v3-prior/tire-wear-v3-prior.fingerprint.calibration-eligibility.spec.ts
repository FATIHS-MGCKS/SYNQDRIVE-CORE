import {
  computeTireWearV3CalibrationEligibilityDigest,
  computeTireWearV3PriorInputFingerprint,
  type TireWearV3PriorFingerprintInput,
} from './tire-wear-v3-prior.fingerprint';

describe('tire-wear-v3-prior.fingerprint calibration eligibility', () => {
  const base: TireWearV3PriorFingerprintInput = {
    tireSetupId: 'setup-1',
    vehicleId: 'veh-1',
    organizationId: 'org-1',
    setupRevision: {
      installedOdometerKm: 1000,
      odometerAnchorStatus: 'ANCHORED',
      initialTreadFrontMm: 8,
      initialTreadRearMm: 8,
      initialTreadDepthMm: 8,
      expectedLifeKm: 40000,
      tireSeason: 'ALL_SEASON',
    },
    mountPeriod: {
      id: 'mp-1',
      installedAtIso: '2026-01-01T00:00:00Z',
      removedAtIso: null,
      installedOdometerKm: 1000,
    },
    ledger: {
      activeRowCount: 2,
      totalDistanceKm: 120,
      contentDigest: 'trip-a|trip-b',
    },
    measurements: [],
    currentOdometerKm: 5000,
    dataCutoffIso: null,
  };

  it('customer fingerprint changes when only currentOdometerKm changes', () => {
    const a = computeTireWearV3PriorInputFingerprint(base);
    const b = computeTireWearV3PriorInputFingerprint({
      ...base,
      currentOdometerKm: 5100,
    });
    expect(a).not.toBe(b);
  });

  it('calibration eligibility digest ignores currentOdometerKm-only churn', () => {
    const a = computeTireWearV3CalibrationEligibilityDigest({
      ...base,
      currentOdometerKm: 5000,
    });
    const b = computeTireWearV3CalibrationEligibilityDigest({
      ...base,
      currentOdometerKm: 99999,
    });
    expect(a).toBe(b);
  });

  it('calibration eligibility digest changes when ledger digest changes', () => {
    const a = computeTireWearV3CalibrationEligibilityDigest(base);
    const b = computeTireWearV3CalibrationEligibilityDigest({
      ...base,
      ledger: { ...base.ledger, contentDigest: 'changed' },
    });
    expect(a).not.toBe(b);
  });
});
