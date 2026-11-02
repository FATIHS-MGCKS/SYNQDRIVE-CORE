import { TireEvidenceSource } from '@prisma/client';
import {
  assessPosteriorCalibrationEligibleFromPrior,
  filterTrustedV3NumericalMeasurementRows,
  wheelEmpiricalRateCalibrated,
} from './tire-wear-v3-numerical-evidence';
import type { TireWearV3PriorSetupResult, TireWearV3WheelProjection } from './tire-wear-v3-prior.types';
import type { RawTreadMeasurementRow } from './tire-wear-v3-verification.accepted';

function row(overrides: Partial<RawTreadMeasurementRow>): RawTreadMeasurementRow {
  return {
    id: 'm1',
    measuredAt: new Date('2026-02-01'),
    odometerAtMeasurement: 5000,
    frontLeftMm: 7,
    frontRightMm: null,
    rearLeftMm: null,
    rearRightMm: null,
    source: 'manual',
    evidenceSource: TireEvidenceSource.MANUAL_MEASUREMENT,
    ...overrides,
  };
}

function wheel(overrides: Partial<TireWearV3WheelProjection>): TireWearV3WheelProjection {
  return {
    position: 'FL',
    initialTreadMm: 8,
    initialTreadUsedDefaultFallback: false,
    replacementThresholdMm: 1.6,
    distanceSinceAnchorKm: 1000,
    estimatedTreadMm: { lo: 7, hi: 7 },
    estimatedWearMm: { lo: 0.5, hi: 0.5 },
    displayTreadMm: { lo: 7, hi: 7 },
    pointEstimateTreadMm: 7,
    treadEvidenceClass: 'MEASURED',
    remainingKm: { lo: 10000, hi: 12000 },
    wearRate: {
      mmPerKm: { lo: 0.0001, hi: 0.0002 },
      mmPer1000km: { lo: 0.1, hi: 0.2 },
      source: 'prior_life_table',
      modelUncertaintyMmPerKm: { lo: 0.00005, hi: 0.0003 },
      measurementUncertaintyMmPerKm: null,
      flags: [],
    },
    evidenceLevel: 'L1',
    dynamicFactor: {
      factor: 1,
      coverage: 0,
      sRel: null,
      applied: false,
      appliedToRateLo: false,
    },
    flags: [],
    ...overrides,
  };
}

describe('tire-wear-v3-numerical-evidence', () => {
  it('filterTrustedV3NumericalMeasurementRows drops excluded sources with finite odometer', () => {
    const rows = [
      row({ id: 'ok', source: 'manual' }),
      row({
        id: 'ai',
        source: 'ai_confirmed',
        evidenceSource: TireEvidenceSource.USER_CONFIRMED,
        odometerAtMeasurement: 6000,
      }),
      row({ id: 'reg', source: 'manual_registration', odometerAtMeasurement: null }),
      row({ id: 'cal', source: 'calibration' }),
    ];
    const trusted = filterTrustedV3NumericalMeasurementRows(rows);
    expect(trusted.map((r) => r.id)).toEqual(['ok']);
  });

  it('wheelEmpiricalRateCalibrated requires measurement_fused with uncertainty and no block flags', () => {
    expect(
      wheelEmpiricalRateCalibrated(
        wheel({
          wearRate: {
            ...wheel({}).wearRate,
            source: 'measurement_fused',
            measurementUncertaintyMmPerKm: { lo: 0.00001, hi: 0.00002 },
          },
        }),
      ),
    ).toBe(true);

    expect(
      wheelEmpiricalRateCalibrated(
        wheel({
          flags: ['RATE_INSUFFICIENT_POINTS'],
          wearRate: {
            ...wheel({}).wearRate,
            source: 'measurement_fused',
            measurementUncertaintyMmPerKm: { lo: 0.00001, hi: 0.00002 },
          },
        }),
      ),
    ).toBe(false);

    expect(
      wheelEmpiricalRateCalibrated(
        wheel({
          wearRate: {
            ...wheel({}).wearRate,
            source: 'prior_life_table',
            measurementUncertaintyMmPerKm: null,
          },
        }),
      ),
    ).toBe(false);
  });

  it('assessPosteriorCalibrationEligibleFromPrior ignores setupFlags and uses wheel rate state', () => {
    const priorWithFlagOnly: TireWearV3PriorSetupResult = {
      rated: true,
      setupFlags: [],
      wheels: [
        wheel({
          wearRate: {
            ...wheel({}).wearRate,
            source: 'prior_life_table',
          },
        }),
      ],
    } as never;

    expect(assessPosteriorCalibrationEligibleFromPrior(priorWithFlagOnly)).toBe(false);

    const priorCalibrated: TireWearV3PriorSetupResult = {
      rated: true,
      setupFlags: ['RATE_INSUFFICIENT_POINTS'],
      wheels: [
        wheel({
          flags: [],
          wearRate: {
            ...wheel({}).wearRate,
            source: 'measurement_fused',
            measurementUncertaintyMmPerKm: { lo: 0.00001, hi: 0.00003 },
          },
        }),
      ],
    } as never;

    expect(assessPosteriorCalibrationEligibleFromPrior(priorCalibrated)).toBe(true);
    expect(assessPosteriorCalibrationEligibleFromPrior(null)).toBe(false);
    expect(assessPosteriorCalibrationEligibleFromPrior({ rated: false } as never)).toBe(false);
  });
});
