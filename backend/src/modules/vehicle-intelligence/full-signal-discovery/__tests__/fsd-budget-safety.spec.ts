import {
  createDefaultFsdBudgetConfigV1,
  planFsdBinaryChunkSplit,
  planFsdFullSignalDiscoveryV1,
  planFsdHistoricalQueries,
  planFsdSnapshotQueries,
  sanitizeNonNegativeRequestBudget,
  FSD_MALFORMED_FLAT_LOCATION_HISTORICAL_PATTERN,
} from '../index';
import {
  buildFsdSyntheticFloatCatalog,
  FSD_P2C_GROUP_A_FIELDS_V1,
  FSD_P2E_HISTORICAL_WINDOW_V1,
  FSD_TESLA_P2E_DECLARED_FIELDS_V1,
} from '../__fixtures__/fsd-p2e-tesla.fixture.v1';
import { FSD_CATALOG_PROVIDER_REQUEST_SLOTS_V1 } from '../fsd-discovery.planner.v1';

describe('FSD-1 budget safety hardening', () => {
  const tokenId = 4242;
  const window = FSD_P2E_HISTORICAL_WINDOW_V1;

  it('caps snapshot documents to remaining request budget (52+ fields)', () => {
    const budget = createDefaultFsdBudgetConfigV1({ maxRequestsPerRun: 12 });
    const declared = buildFsdSyntheticFloatCatalog(60);
    const snapshot = planFsdSnapshotQueries({
      tokenId,
      declaredFieldNames: declared,
      budget,
      maxSnapshotDocuments: 2,
    });
    expect(snapshot.documents.length).toBe(2);
    expect(snapshot.deferredSignals.length).toBe(60 - 52);
    expect(snapshot.documents[0]!.fieldNames.length).toBeLessThanOrEqual(26);
  });

  it('never exceeds 12 snapshot documents even with 312-field catalog', () => {
    const budget = createDefaultFsdBudgetConfigV1({ maxRequestsPerRun: 12 });
    const declared = buildFsdSyntheticFloatCatalog(312);
    const snapshot = planFsdSnapshotQueries({
      tokenId,
      declaredFieldNames: declared,
      budget,
      maxSnapshotDocuments: 12,
    });
    expect(snapshot.documents.length).toBe(12);
    expect(snapshot.deferredSignals.length).toBe(312 - 12 * 26);
  });

  it('handles zero remaining snapshot document budget safely', () => {
    const budget = createDefaultFsdBudgetConfigV1();
    const snapshot = planFsdSnapshotQueries({
      tokenId,
      declaredFieldNames: FSD_TESLA_P2E_DECLARED_FIELDS_V1,
      budget,
      maxSnapshotDocuments: 0,
    });
    expect(snapshot.documents).toHaveLength(0);
    expect(snapshot.deferredSignals.length).toBeGreaterThan(0);
  });

  it('sanitizes invalid negative snapshot document budget input', () => {
    expect(sanitizeNonNegativeRequestBudget(-5)).toBe(0);
    const snapshot = planFsdSnapshotQueries({
      tokenId,
      declaredFieldNames: ['speed'],
      budget: createDefaultFsdBudgetConfigV1(),
      maxSnapshotDocuments: -3,
    });
    expect(snapshot.documents).toHaveLength(0);
  });

  it('aggregate plan is non-executable when budget cannot fit catalog slot', () => {
    const plan = planFsdFullSignalDiscoveryV1({
      tokenId,
      declaredFieldNames: FSD_TESLA_P2E_DECLARED_FIELDS_V1,
      historicalWindow: window,
      budget: createDefaultFsdBudgetConfigV1({ maxRequestsPerRun: 0 }),
    });
    expect(plan.executable).toBe(false);
    expect(plan.executableProviderRequestCount).toBe(0);
    expect(plan.snapshot.documents).toHaveLength(0);
    expect(plan.historical?.chunks ?? []).toHaveLength(0);
    expect(plan.budgetValidation.ok).toBe(false);
  });

  it('aggregate plan becomes executable after deterministic deferral under tight budget', () => {
    const budget = createDefaultFsdBudgetConfigV1({ maxRequestsPerRun: 1 });
    const plan = planFsdFullSignalDiscoveryV1({
      tokenId,
      declaredFieldNames: FSD_TESLA_P2E_DECLARED_FIELDS_V1,
      historicalWindow: window,
      budget,
    });
    expect(plan.executable).toBe(true);
    expect(plan.executableProviderRequestCount).toBe(1);
    expect(plan.totalPlannedProviderRequests).toBe(1);
    expect(plan.snapshot.documents).toHaveLength(0);
    expect(plan.deferredByBudget.length).toBeGreaterThan(0);
  });

  it('plans separate historical chunks for multiple LOCATION signals', () => {
    const plan = planFsdHistoricalQueries({
      tokenId,
      declaredFieldNames: [
        'currentLocationCoordinates',
        'currentLocationApproximateCoordinates',
        'speed',
      ],
      window,
      budget: createDefaultFsdBudgetConfigV1(),
      maxPlannedHistoricalRequests: 12,
    });
    const locationChunks = plan.chunks.filter((c) => c.shapeMix === 'LOCATION_ONLY');
    expect(locationChunks).toHaveLength(2);
    expect(locationChunks[0]!.fieldNames).not.toEqual(locationChunks[1]!.fieldNames);
  });

  it('HTTP 422 split rejects two-child split when remainingRequestBudget=1', () => {
    const historical = planFsdHistoricalQueries({
      tokenId,
      declaredFieldNames: FSD_P2C_GROUP_A_FIELDS_V1,
      window,
      budget: createDefaultFsdBudgetConfigV1(),
      maxPlannedHistoricalRequests: 12,
    });
    const mixed = historical.chunks.find((c) => c.fieldNames.length > 1 && c.shapeMix === 'FLOAT_ONLY');
    expect(mixed).toBeDefined();
    const split = planFsdBinaryChunkSplit({
      failedDocument: mixed!.documents,
      reason: 'HTTP_422',
      remainingRequestBudget: 1,
      budget: createDefaultFsdBudgetConfigV1(),
    });
    expect(split.ok).toBe(false);
    if (!split.ok) {
      expect(split.reason).toBe('REQUEST_BUDGET_EXCEEDED');
    }
  });

  it('preserves stable fingerprints for executable subset after deferral', () => {
    const budget = createDefaultFsdBudgetConfigV1({ maxRequestsPerRun: 12 });
    const declared = buildFsdSyntheticFloatCatalog(80);
    const first = planFsdFullSignalDiscoveryV1({
      tokenId,
      declaredFieldNames: declared,
      historicalWindow: window,
      budget,
    });
    const second = planFsdFullSignalDiscoveryV1({
      tokenId,
      declaredFieldNames: declared,
      historicalWindow: window,
      budget,
    });
    expect(first.executable).toBe(true);
    expect(first.snapshot.documents.map((d) => d.fingerprint)).toEqual(
      second.snapshot.documents.map((d) => d.fingerprint),
    );
  });

  it('Tesla 26-signal full plan parity under default budget', () => {
    const budget = createDefaultFsdBudgetConfigV1();
    const plan = planFsdFullSignalDiscoveryV1({
      tokenId,
      declaredFieldNames: FSD_TESLA_P2E_DECLARED_FIELDS_V1,
      historicalWindow: window,
      budget,
    });
    expect(plan.executable).toBe(true);
    expect(plan.catalogReservedRequestSlots).toBe(FSD_CATALOG_PROVIDER_REQUEST_SLOTS_V1);
    expect(plan.totalPlannedProviderRequests).toBe(7);
    expect(plan.snapshot.documents).toHaveLength(1);
    expect(plan.historical?.chunks).toHaveLength(5);
  });

  it('GPS 422 regression — no malformed location historical selection in chunks', () => {
    const plan = planFsdHistoricalQueries({
      tokenId,
      declaredFieldNames: FSD_P2C_GROUP_A_FIELDS_V1,
      window,
      budget: createDefaultFsdBudgetConfigV1(),
      maxPlannedHistoricalRequests: 12,
    });
    for (const chunk of plan.chunks) {
      expect(chunk.documents.queryText).not.toMatch(FSD_MALFORMED_FLAT_LOCATION_HISTORICAL_PATTERN);
    }
  });
});
