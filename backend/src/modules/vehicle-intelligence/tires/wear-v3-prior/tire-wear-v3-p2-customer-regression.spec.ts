import {
  fitWearRateFromMeasurements,
  fuseRateWithPriorPosterior,
  priorWearRateIntervalMmPerKm,
  projectTreadMm,
  remainingKmInterval,
} from './tire-wear-v3-prior.math';
import { computeSetupDs4Severity } from './tire-wear-v3-dynamic.math';
import {
  extractTemporalDetailFromShadowPayload,
  resolveDs4TemporalTripWeight,
} from './tire-wear-v3-ds4-payload.util';

/**
 * Deterministic customer-visible deltas for P2 (C2/C3/C5) vs pre-P2 behavior documented in assertions.
 */
describe('tire-wear-v3-p2 customer regression fixtures', () => {
  const priorRate = priorWearRateIntervalMmPerKm(8, 3, { lo: 35000, hi: 45000 });

  it('C5: live-shaped DS4 row coverage differs from legacy 0.5 default', () => {
    const detail = extractTemporalDetailFromShadowPayload({
      temporalCoverageDetail: {
        tripWindowSeconds: 679,
        validDrivingSeconds: 404,
        accountableFraction: 0.5979381443298969,
      },
    });
    const weight = resolveDs4TemporalTripWeight({
      ds4ReadStatus: 'SUCCEEDED',
      temporalCoverage: 'PARTIAL',
      m3JPerKgPerKm: 30,
      detail,
    }).weight;
    const legacyDefaultWeight = 0.5;
    expect(weight).not.toBe(legacyDefaultWeight);
    const newSeverity = computeSetupDs4Severity(
      [
        {
          ledgerId: 'x',
          distanceKm: 100,
          ds4ReadStatus: 'SUCCEEDED',
          temporalCoverage: 'PARTIAL',
          m3JPerKgPerKm: 30,
          validDrivingSeconds: 404,
          tripDurationSeconds: null,
          temporalDetail: detail,
          temporalTripWeight: weight,
        },
      ],
      1000,
    );
    const oldSeverity = computeSetupDs4Severity(
      [
        {
          ledgerId: 'x',
          distanceKm: 100,
          ds4ReadStatus: 'SUCCEEDED',
          temporalCoverage: 'PARTIAL',
          m3JPerKgPerKm: 30,
          validDrivingSeconds: 404,
          tripDurationSeconds: null,
          temporalTripWeight: 0.5,
        },
      ],
      1000,
    );
    expect(newSeverity.coverage).toBeCloseTo(0.0598, 3);
    expect(oldSeverity.coverage).toBeCloseTo(0.05, 3);
    expect(newSeverity.coverage).toBeGreaterThan(oldSeverity.coverage);
    expect(newSeverity.sRel).toEqual(oldSeverity.sRel);
  });

  it('C2: measurement-anchored projection widens estimated tread vs exact anchor', () => {
    const exact = projectTreadMm({
      anchorTreadMm: 6,
      anchorOdometerKm: 10000,
      currentOdometerKm: 15000,
      rateMmPerKm: priorRate,
    });
    const withMeasUncertainty = projectTreadMm({
      anchorTreadMm: 6,
      anchorOdometerKm: 10000,
      currentOdometerKm: 15000,
      rateMmPerKm: priorRate,
      anchorUncertaintyMm: 0.4,
    });
    expect(withMeasUncertainty.lo).toBeLessThan(exact.lo);
    expect(withMeasUncertainty.hi).toBeGreaterThan(exact.hi);
    const remainingExact = remainingKmInterval(exact, 3, priorRate);
    const remainingWide = remainingKmInterval(withMeasUncertainty, 3, priorRate);
    expect(remainingWide.lo).toBeLessThanOrEqual(remainingExact.lo);
    expect(remainingWide.hi).toBeGreaterThanOrEqual(remainingExact.hi);
  });

  it('C2: mount-period initial-tread projection unchanged when anchorUncertainty omitted', () => {
    const baseline = projectTreadMm({
      anchorTreadMm: 8,
      anchorOdometerKm: 0,
      currentOdometerKm: 10000,
      rateMmPerKm: priorRate,
    });
    expect(baseline.lo).toBeCloseTo(8 - priorRate.hi * 10000, 6);
  });

  it('C3: OLS rate sigma floored for near-collinear triple (no zero posterior)', () => {
    const fit = fitWearRateFromMeasurements(
      [
        {
          measuredAt: new Date('2026-01-01'),
          odometerKm: 10000,
          treadMm: 7.0,
          source: 'manual',
          isCalibrationPoint: false,
        },
        {
          measuredAt: new Date('2026-03-01'),
          odometerKm: 15000,
          treadMm: 6.75,
          source: 'manual',
          isCalibrationPoint: false,
        },
        {
          measuredAt: new Date('2026-06-01'),
          odometerKm: 20000,
          treadMm: 6.5,
          source: 'manual',
          isCalibrationPoint: false,
        },
      ],
      0.4,
    );
    expect(fit.rateMmPerKm).not.toBeNull();
    expect(fit.rateSigmaMmPerKm).not.toBeNull();
    expect(fit.rateSigmaMmPerKm!).toBeGreaterThan(0);
    const prior = priorWearRateIntervalMmPerKm(8, 3, { lo: 35000, hi: 45000 });
    const fused = fuseRateWithPriorPosterior(
      prior,
      fit.rateMmPerKm!,
      fit.rateSigmaMmPerKm,
    );
    expect(fused.interval.hi - fused.interval.lo).toBeGreaterThan(0);
  });
});
