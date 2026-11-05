import {
  createDefaultFsdBudgetConfigV1,
  normalizeFsdBudgetConfigV1,
  planFsdHistoricalQueries,
  computeExpectedBucketPositions,
  isTimestampWithinHistoricalWindow,
  summarizeSignalBucketObservations,
  parseUtcIsoToEpochMs,
  FSD_BUDGET_DEFAULTS_V1,
} from '../index';
import { buildFsdSyntheticFloatCatalog } from '../__fixtures__/fsd-p2e-tesla.fixture.v1';
import { FSD_P2E_HISTORICAL_WINDOW_V1 } from '../__fixtures__/fsd-p2e-tesla.fixture.v1';

describe('FSD-1 E1/E2 correctness patch', () => {
  const tokenId = 4242;

  it('E1 — fractional maxHistoricalFloatFieldsPerChunk falls back to default (not zero stride)', () => {
    const normalized = normalizeFsdBudgetConfigV1({
      maxRequestsPerRun: 12,
      maxHistoricalWindowSeconds: 3600,
      maxSnapshotFieldsPerDocument: 26,
      maxHistoricalFloatFieldsPerChunk: 0.5,
      maxResponseBytes: 524_288,
    });
    expect(normalized.maxHistoricalFloatFieldsPerChunk).toBe(
      FSD_BUDGET_DEFAULTS_V1.MAX_HISTORICAL_FLOAT_FIELDS_PER_CHUNK,
    );
    const floats = buildFsdSyntheticFloatCatalog(16);
    const plan = planFsdHistoricalQueries({
      tokenId,
      declaredFieldNames: ['speed', ...floats],
      window: FSD_P2E_HISTORICAL_WINDOW_V1,
      budget: createDefaultFsdBudgetConfigV1({ maxHistoricalFloatFieldsPerChunk: 0.5 }),
    });
    const plannedFloatFields = new Set(
      plan.chunks.filter((c) => c.shapeMix === 'FLOAT_ONLY').flatMap((c) => c.fieldNames),
    );
    expect(plannedFloatFields.size).toBeGreaterThan(1);
    expect(plan.chunks.length).toBeGreaterThan(0);
  });

  it('E2 — one-second window counts start observation only under [fromUtc, toUtc)', () => {
    const window = {
      fromUtc: '2026-11-04T04:00:00.000Z',
      toUtc: '2026-11-04T04:00:01.000Z',
    };
    expect(computeExpectedBucketPositions(window)).toBe(1);
    const fromMs = parseUtcIsoToEpochMs(window.fromUtc);
    const toMs = parseUtcIsoToEpochMs(window.toUtc);
    expect(isTimestampWithinHistoricalWindow(window, fromMs)).toBe(true);
    expect(isTimestampWithinHistoricalWindow(window, toMs)).toBe(false);

    const summary = summarizeSignalBucketObservations({
      window,
      observations: [
        { timestampMs: fromMs, numericValue: 10 },
        { timestampMs: toMs, numericValue: 20 },
      ],
    });
    expect(summary.validValueBucketCount).toBe(1);
    expect(summary.outOfWindowObservations).toBe(1);
    expect(summary.validValueCoverageRatio).toBeLessThanOrEqual(1);
    expect(summary.validValueCoverageRatio).toBe(1);
  });

  it('E2 — P2E bucket denominator parity unchanged at 1538 positions', () => {
    expect(computeExpectedBucketPositions(FSD_P2E_HISTORICAL_WINDOW_V1)).toBe(1538);
  });
});
