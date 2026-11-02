import { TireOdometerAnchorStatus } from '@prisma/client';
import { TIRE_WEAR_V3_PRIOR_CONFIG, TIRE_WEAR_V3_PRIOR_DYNAMIC_BETA } from './tire-wear-v3-prior.config';
import {
  deriveEvidenceLevel,
  fitWearRateFromMeasurements,
  priorWearRateIntervalMmPerKm,
  projectTreadMm,
  rateSigmaFromTwoPoints,
  remainingKmInterval,
  resolvePriorLifeKmInterval,
} from './tire-wear-v3-prior.math';

describe('tire-wear-v3-prior.math', () => {
  it('keeps DS4 dynamic beta at 0 for P3A', () => {
    expect(TIRE_WEAR_V3_PRIOR_DYNAMIC_BETA).toBe(0);
    expect(TIRE_WEAR_V3_PRIOR_CONFIG.dynamicBeta).toBe(0);
  });

  it('computes conservative prior wear rate interval from life span (mm/km)', () => {
    const life = { lo: 35000, hi: 45000 };
    const rate = priorWearRateIntervalMmPerKm(8.0, 3.0, life);
    expect(rate.lo).toBeCloseTo(5 / 45000, 6);
    expect(rate.hi).toBeCloseTo(5 / 35000, 6);
    expect(rate.lo).toBeLessThan(rate.hi);
  });

  it('uses 6800 km as 3σ minimum odometer spacing reference', () => {
    const sigma = 0.2;
    const r = 0.125 / 1000;
    const minKm = (3 * Math.SQRT2 * sigma) / r;
    expect(minKm).toBeGreaterThan(6750);
    expect(minKm).toBeLessThan(6850);
    expect(TIRE_WEAR_V3_PRIOR_CONFIG.reference3SigmaSpacingExampleKm).toBe(6800);
  });

  it('rejects a single measurement for wear-rate inference', () => {
    const fit = fitWearRateFromMeasurements(
      [
        {
          measuredAt: new Date('2026-01-01'),
          odometerKm: 10000,
          treadMm: 7.5,
          source: 'manual',
          isCalibrationPoint: false,
        },
      ],
      0.4,
    );
    expect(fit.rateMmPerKm).toBeNull();
    expect(fit.flags).toContain('RATE_INSUFFICIENT_POINTS');
  });

  it('rejects increasing tread (negative wear) slopes', () => {
    const fit = fitWearRateFromMeasurements(
      [
        {
          measuredAt: new Date('2026-01-01'),
          odometerKm: 10000,
          treadMm: 6.0,
          source: 'manual',
          isCalibrationPoint: false,
        },
        {
          measuredAt: new Date('2026-06-01'),
          odometerKm: 20000,
          treadMm: 7.0,
          source: 'manual',
          isCalibrationPoint: false,
        },
      ],
      0.4,
    );
    expect(fit.rateMmPerKm).toBeNull();
    expect(fit.flags).toContain('RATE_NEGATIVE_WEAR_REJECTED');
  });

  it('derives L1 with one measurement and anchored odometer', () => {
    const level = deriveEvidenceLevel({
      anchorStatus: TireOdometerAnchorStatus.ANCHORED,
      measurementCount: 1,
      ratePointCount: 1,
      empiricalRateMmPerKm: null,
      empiricalRateSigmaMmPerKm: null,
      measurementSpanKm: null,
      meets3SigmaSpacing: false,
      rateRejected: true,
      priorOnlyForRate: true,
    });
    expect(level).toBe('L1');
  });

  it('projects tread conservatively (high rate lowers lo bound)', () => {
    const tread = projectTreadMm({
      anchorTreadMm: 8,
      anchorOdometerKm: 0,
      currentOdometerKm: 10000,
      rateMmPerKm: { lo: 0.0001, hi: 0.00015 },
    });
    expect(tread.lo).toBeLessThan(tread.hi);
    expect(tread.lo).toBeCloseTo(8 - 0.00015 * 10000, 2);
  });

  it('widens projection when measurement anchor uncertainty is provided (C2)', () => {
    const tread = projectTreadMm({
      anchorTreadMm: 7,
      anchorOdometerKm: 5000,
      currentOdometerKm: 8000,
      rateMmPerKm: { lo: 0.0001, hi: 0.00012 },
      anchorUncertaintyMm: 0.4,
    });
    const narrow = projectTreadMm({
      anchorTreadMm: 7,
      anchorOdometerKm: 5000,
      currentOdometerKm: 8000,
      rateMmPerKm: { lo: 0.0001, hi: 0.00012 },
    });
    expect(tread.lo).toBeLessThan(narrow.lo);
    expect(tread.hi).toBeGreaterThan(narrow.hi);
  });

  it('floors OLS rate sigma with measurement noise (C3)', () => {
    const fit = fitWearRateFromMeasurements(
      [
        {
          measuredAt: new Date('2026-01-01'),
          odometerKm: 10000,
          treadMm: 7.2,
          source: 'manual',
          isCalibrationPoint: false,
        },
        {
          measuredAt: new Date('2026-04-01'),
          odometerKm: 15000,
          treadMm: 7.0,
          source: 'manual',
          isCalibrationPoint: false,
        },
        {
          measuredAt: new Date('2026-07-01'),
          odometerKm: 20000,
          treadMm: 6.8,
          source: 'manual',
          isCalibrationPoint: false,
        },
      ],
      0.4,
    );
    expect(fit.rateSigmaMmPerKm).not.toBeNull();
    expect(fit.rateSigmaMmPerKm!).toBeGreaterThan(1e-8);
  });

  it('computes remaining km interval with consistent units', () => {
    const remaining = remainingKmInterval(
      { lo: 4.0, hi: 5.0 },
      3.0,
      { lo: 0.0001, hi: 0.0002 },
    );
    expect(remaining.lo).toBeLessThanOrEqual(remaining.hi);
    expect(remaining.hi).toBeGreaterThan(0);
  });

  it('widens life prior when baseline is default-assumption', () => {
    const life = resolvePriorLifeKmInterval({
      spec: null,
      archetype: 'default',
      season: 'SUMMER',
      setupExpectedLifeKm: null,
      axleExpectedLifeKm: null,
      widenedBaseline: true,
    });
    expect(life.interval.lo).toBe(TIRE_WEAR_V3_PRIOR_CONFIG.unknownLifeKmSpan.lo);
    expect(life.source).toBe('prior_life_widened');
  });

  it('computes two-point rate sigma', () => {
    const sigmaR = rateSigmaFromTwoPoints(0.85, 6800, 0.2);
    expect(sigmaR).toBeCloseTo((Math.SQRT2 * 0.2) / 6800, 8);
  });
});
