import {
  computeExpectedBucketPositions,
  parseUtcIsoToEpochMs,
  summarizeSignalBucketObservations,
} from '../fsd-coverage.calculator.v1';
import { FSD_P2E_HISTORICAL_WINDOW_V1 } from '../__fixtures__/fsd-p2e-tesla.fixture.v1';

describe('FSD-1 bucket collision coverage invariant', () => {
  const oneSecondWindow = {
    fromUtc: '2026-11-04T04:00:00.000Z',
    toUtc: '2026-11-04T04:00:01.000Z',
  };

  it('mandatory — sub-second collisions count as one valid bucket at coverage 1.0', () => {
    const fromMs = parseUtcIsoToEpochMs(oneSecondWindow.fromUtc);
    const summary = summarizeSignalBucketObservations({
      window: oneSecondWindow,
      observations: [
        { timestampMs: fromMs + 100, numericValue: 11 },
        { timestampMs: fromMs + 700, numericValue: 22 },
      ],
    });
    expect(summary.expectedBucketPositions).toBe(1);
    expect(summary.validValueBucketCount).toBe(1);
    expect(summary.returnedBucketCount).toBe(1);
    expect(summary.collidingBucketObservationsIgnored).toBe(1);
    expect(summary.validValueCoverageRatio).toBe(1);
  });

  it('valid zero wins over null/missing in same bucket regardless of order', () => {
    const fromMs = parseUtcIsoToEpochMs(oneSecondWindow.fromUtc);
    const forward = summarizeSignalBucketObservations({
      window: oneSecondWindow,
      observations: [
        { timestampMs: fromMs + 50, numericValue: null },
        { timestampMs: fromMs + 900, numericValue: 0 },
      ],
    });
    const reverse = summarizeSignalBucketObservations({
      window: oneSecondWindow,
      observations: [
        { timestampMs: fromMs + 900, numericValue: 0 },
        { timestampMs: fromMs + 50, numericValue: null },
      ],
    });
    expect(forward.validValueBucketCount).toBe(1);
    expect(forward.zeroValueBucketCount).toBe(1);
    expect(forward.nullBucketCount).toBe(0);
    expect(reverse).toEqual(forward);
  });

  it('tracks exact timestamp duplicates separately from bucket collisions', () => {
    const fromMs = parseUtcIsoToEpochMs(oneSecondWindow.fromUtc);
    const summary = summarizeSignalBucketObservations({
      window: oneSecondWindow,
      observations: [
        { timestampMs: fromMs, numericValue: 1 },
        { timestampMs: fromMs, numericValue: 2 },
        { timestampMs: fromMs + 200, numericValue: 3 },
      ],
    });
    expect(summary.duplicateTimestampsIgnored).toBe(1);
    expect(summary.collidingBucketObservationsIgnored).toBe(1);
    expect(summary.validValueBucketCount).toBe(1);
    expect(summary.returnedBucketCount).toBe(1);
  });

  it('never exceeds expected bucket positions or 100% coverage', () => {
    const fromMs = parseUtcIsoToEpochMs(oneSecondWindow.fromUtc);
    const summary = summarizeSignalBucketObservations({
      window: oneSecondWindow,
      observations: Array.from({ length: 20 }, (_, index) => ({
        timestampMs: fromMs + index * 50,
        numericValue: index,
      })),
    });
    expect(summary.returnedBucketCount).toBeLessThanOrEqual(summary.expectedBucketPositions);
    expect(summary.validValueBucketCount).toBeLessThanOrEqual(summary.expectedBucketPositions);
    expect(summary.validValueCoverageRatio).toBeGreaterThanOrEqual(0);
    expect(summary.validValueCoverageRatio).toBeLessThanOrEqual(1);
  });

  it('P2E denominator parity remains 1538 expected positions', () => {
    expect(computeExpectedBucketPositions(FSD_P2E_HISTORICAL_WINDOW_V1)).toBe(1538);
  });
});
