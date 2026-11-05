import {
  createDefaultFsdBudgetConfigV1,
  normalizeFsdBudgetConfigV1,
  planFsdFullSignalDiscoveryV1,
  planFsdHistoricalQueries,
  validateHistoricalWindowForPlanning,
  computeExpectedBucketPositions,
  isTimestampWithinHistoricalWindow,
  parseUtcIsoToEpochMs,
  FSD_BUDGET_DEFAULTS_V1,
} from '../index';
import {
  FSD_P2E_HISTORICAL_WINDOW_V1,
  FSD_TESLA_P2E_DECLARED_FIELDS_V1,
} from '../__fixtures__/fsd-p2e-tesla.fixture.v1';
import { buildFsdSyntheticFloatCatalog } from '../__fixtures__/fsd-p2e-tesla.fixture.v1';

describe('FSD-1 edge safety hardening', () => {
  const tokenId = 4242;

  it('normalizes invalid budget overrides to safe defaults', () => {
    const normalized = normalizeFsdBudgetConfigV1({
      maxRequestsPerRun: Number.NaN,
      maxHistoricalWindowSeconds: -10,
      maxSnapshotFieldsPerDocument: 0,
      maxHistoricalFloatFieldsPerChunk: Number.POSITIVE_INFINITY,
      maxResponseBytes: Number.NaN,
    });
    expect(normalized.maxRequestsPerRun).toBe(0);
    expect(normalized.maxHistoricalWindowSeconds).toBe(
      FSD_BUDGET_DEFAULTS_V1.MAX_HISTORICAL_WINDOW_SECONDS,
    );
    expect(normalized.maxSnapshotFieldsPerDocument).toBe(
      FSD_BUDGET_DEFAULTS_V1.MAX_SNAPSHOT_FIELDS_PER_DOCUMENT,
    );
    expect(normalized.maxHistoricalFloatFieldsPerChunk).toBe(
      FSD_BUDGET_DEFAULTS_V1.MAX_HISTORICAL_FLOAT_FIELDS_PER_CHUNK,
    );
  });

  it('sanitizes zero maxHistoricalFloatFieldsPerChunk and completes planning safely', () => {
    const budget = createDefaultFsdBudgetConfigV1({ maxHistoricalFloatFieldsPerChunk: 0 });
    expect(budget.maxHistoricalFloatFieldsPerChunk).toBe(
      FSD_BUDGET_DEFAULTS_V1.MAX_HISTORICAL_FLOAT_FIELDS_PER_CHUNK,
    );
    const floats = buildFsdSyntheticFloatCatalog(24);
    const started = Date.now();
    const plan = planFsdHistoricalQueries({
      tokenId,
      declaredFieldNames: ['speed', ...floats],
      window: FSD_P2E_HISTORICAL_WINDOW_V1,
      budget,
    });
    expect(Date.now() - started).toBeLessThan(5000);
    expect(plan.chunks.length).toBeGreaterThan(0);
  });

  it('rejects inverted historical window without executable chunks', () => {
    const plan = planFsdHistoricalQueries({
      tokenId,
      declaredFieldNames: ['speed'],
      window: { fromUtc: '2026-11-04T05:00:00.000Z', toUtc: '2026-11-04T04:00:00.000Z' },
      budget: createDefaultFsdBudgetConfigV1(),
    });
    expect(plan.chunks).toHaveLength(0);
    expect(plan.budgetValidation.ok).toBe(false);
    if (!plan.budgetValidation.ok) {
      expect(plan.budgetValidation.reason).toBe('HISTORICAL_WINDOW_INVALID');
    }
  });

  it('rejects zero-length historical window', () => {
    const validation = validateHistoricalWindowForPlanning(
      { fromUtc: '2026-11-04T04:00:00.000Z', toUtc: '2026-11-04T04:00:00.000Z' },
      createDefaultFsdBudgetConfigV1(),
    );
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.reason).toBe('HISTORICAL_WINDOW_INVALID');
    }
  });

  it('rejects invalid ISO timestamps without throwing from historical planner', () => {
    const plan = planFsdHistoricalQueries({
      tokenId,
      declaredFieldNames: ['speed'],
      window: { fromUtc: 'not-an-iso', toUtc: '2026-11-04T05:00:00.000Z' },
      budget: createDefaultFsdBudgetConfigV1(),
    });
    expect(plan.chunks).toHaveLength(0);
    expect(plan.budgetValidation.ok).toBe(false);
  });

  it('full plan fail-closed on invalid historical window', () => {
    const plan = planFsdFullSignalDiscoveryV1({
      tokenId,
      declaredFieldNames: FSD_TESLA_P2E_DECLARED_FIELDS_V1,
      historicalWindow: {
        fromUtc: '2026-11-04T05:00:00.000Z',
        toUtc: '2026-11-04T04:00:00.000Z',
      },
      budget: createDefaultFsdBudgetConfigV1(),
    });
    expect(plan.executable).toBe(false);
    expect(plan.nonExecutableReason).toBe('HISTORICAL_WINDOW_INVALID');
    expect(plan.snapshot.documents).toHaveLength(0);
  });

  it('preserves half-open observation window and ceil bucket denominator (P2E)', () => {
    const window = FSD_P2E_HISTORICAL_WINDOW_V1;
    expect(computeExpectedBucketPositions(window)).toBe(1538);
    const toMs = parseUtcIsoToEpochMs(window.toUtc);
    expect(isTimestampWithinHistoricalWindow(window, toMs)).toBe(false);
    expect(isTimestampWithinHistoricalWindow(window, toMs - 1)).toBe(true);
  });
});
