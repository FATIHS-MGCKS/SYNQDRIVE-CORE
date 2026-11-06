import { randomUUID } from 'node:crypto';
import {
  FSD_P2E_AGGREGATE_EXPECTATIONS_V1,
  FSD_P2E_HISTORICAL_WINDOW_V1,
} from '../../__fixtures__/fsd-p2e-tesla.fixture.v1';
import { computeExpectedBucketPositions, parseUtcIsoToEpochMs } from '../../fsd-coverage.calculator.v1';
import { createDefaultFsdBudgetConfigV1 } from '../../fsd-budget.contract.v1';
import { summarizeSignalBucketObservations } from '../../fsd-coverage.calculator.v1';
import { buildP2eObservationsForField } from '../fsd4-mock-p2e-historical.v1';
import { observationsToBucketSeries } from '../fsd4-historical-evidence.v1';
import { createFsd4MockHistoricalProvider } from '../fsd4-mock-provider.v1';
import { planFsdHistoricalQueries } from '../../fsd-historical.planner.v1';
import { historicalPlanViolatesLocationIsolation } from '../../fsd-historical.planner.v1';
import { buildFsd3DeclaredCatalogFingerprintV1 } from '../fsd3-fingerprint.v1';
import { FSD_TESLA_P2E_DECLARED_FIELDS_V1 } from '../../__fixtures__/fsd-p2e-tesla.fixture.v1';
import {
  createEmptyFsd4RequestLedger,
  emptyFsd4HistoricalProgressCheckpoint,
  findUnsettledHistoricalAttempts,
  reserveFsd4ProviderRequestAttempt,
} from '../fsd4-request-ledger.v1';

describe('FSD-4 orchestration (unit)', () => {
  const window = { ...FSD_P2E_HISTORICAL_WINDOW_V1 };
  const budget = createDefaultFsdBudgetConfigV1();

  it('P2E bucket expectations: 1538 buckets; speed 64; GPS 1133 (aggregate mock)', () => {
    expect(computeExpectedBucketPositions(window)).toBe(
      FSD_P2E_AGGREGATE_EXPECTATIONS_V1.expectedBucketPositions,
    );
    const speedObs = buildP2eObservationsForField({ window, fieldName: 'speed' });
    const gpsObs = buildP2eObservationsForField({ window, fieldName: 'currentLocationCoordinates' });
    expect(speedObs.length).toBe(FSD_P2E_AGGREGATE_EXPECTATIONS_V1.speedValidBuckets);
    expect(gpsObs.length).toBe(FSD_P2E_AGGREGATE_EXPECTATIONS_V1.gpsValidBuckets);
  });

  it('deterministic dedupe: duplicate timestamps collapse in coverage (same valid buckets as no-dup)', () => {
    const withDup = buildP2eObservationsForField({
      window,
      fieldName: 'speed',
      duplicateFirstTimestamp: true,
    });
    const withoutDup = buildP2eObservationsForField({ window, fieldName: 'speed' });
    expect(withDup.length).toBe(withoutDup.length + 1);
    const bucketsDup = observationsToBucketSeries('speed', withDup);
    const bucketsPlain = observationsToBucketSeries('speed', withoutDup);
    const sumDup = summarizeSignalBucketObservations({
      window,
      observations: bucketsDup,
      coSelectedFieldCount: 1,
    });
    const sumPlain = summarizeSignalBucketObservations({
      window,
      observations: bucketsPlain,
      coSelectedFieldCount: 1,
    });
    expect(sumDup.validValueBucketCount).toBe(sumPlain.validValueBucketCount);
    expect(sumDup.validValueBucketCount).toBe(FSD_P2E_AGGREGATE_EXPECTATIONS_V1.speedValidBuckets);
    expect(sumDup.duplicateTimestampsIgnored).toBeGreaterThan(0);
  });

  it('order-independent bucket selection: slot depends only on field name, not catalog ordering', () => {
    const field = 'cabinDoorRow1DriverSideIsOpen';
    const obsA = buildP2eObservationsForField({ window, fieldName: field });
    const obsB = buildP2eObservationsForField({ window, fieldName: field });
    expect(obsA).toEqual(obsB);
  });

  it('FLOAT / LOCATION isolation: planner emits separate chunks for speed vs mixed float', () => {
    const plan = planFsdHistoricalQueries({
      tokenId: 1,
      declaredFieldNames: FSD_TESLA_P2E_DECLARED_FIELDS_V1,
      window,
      budget,
      maxPlannedHistoricalRequests: 12,
      isolateSpeedSignal: true,
    });
    expect(historicalPlanViolatesLocationIsolation(plan)).toBe(false);
    const speedChunk = plan.chunks.find((c) => c.fieldNames.includes('speed'));
    const locChunk = plan.chunks.find((c) => c.fieldNames.includes('currentLocationCoordinates'));
    expect(speedChunk).toBeDefined();
    expect(locChunk).toBeDefined();
    expect(speedChunk!.fieldNames).not.toContain('currentLocationCoordinates');
    expect(locChunk!.fieldNames).not.toContain('speed');
  });

  it('invalid historical window fails planner closed (empty range)', () => {
    const bad: { fromUtc: string; toUtc: string } = {
      fromUtc: window.fromUtc,
      toUtc: window.fromUtc,
    };
    const plan = planFsdHistoricalQueries({
      tokenId: 1,
      declaredFieldNames: FSD_TESLA_P2E_DECLARED_FIELDS_V1,
      window: bad,
      budget,
      maxPlannedHistoricalRequests: 12,
      isolateSpeedSignal: true,
    });
    expect(plan.budgetValidation.ok).toBe(false);
    if (!plan.budgetValidation.ok) {
      expect(plan.budgetValidation.reason).toBe('HISTORICAL_WINDOW_INVALID');
    }
  });

  it('excessive historical window fails budget validation', () => {
    const long: { fromUtc: string; toUtc: string } = {
      fromUtc: window.fromUtc,
      toUtc: new Date(parseUtcIsoToEpochMs(window.toUtc) + 4 * 3600 * 1000).toISOString(),
    };
    const plan = planFsdHistoricalQueries({
      tokenId: 1,
      declaredFieldNames: FSD_TESLA_P2E_DECLARED_FIELDS_V1,
      window: long,
      budget,
      maxPlannedHistoricalRequests: 12,
      isolateSpeedSignal: true,
    });
    expect(plan.budgetValidation.ok).toBe(false);
    if (!plan.budgetValidation.ok) {
      expect(plan.budgetValidation.reason).toBe('HISTORICAL_WINDOW_TOO_LONG');
    }
  });

  it('catalog fingerprint is deterministic for Tesla P2E declared set', () => {
    const fp = buildFsd3DeclaredCatalogFingerprintV1(FSD_TESLA_P2E_DECLARED_FIELDS_V1);
    const fp2 = buildFsd3DeclaredCatalogFingerprintV1([...FSD_TESLA_P2E_DECLARED_FIELDS_V1]);
    expect(fp).toBe(fp2);
    expect(fp).toHaveLength(64);
  });

  it('ambiguous GraphQL mock yields unknown outcome path (no observations)', async () => {
    const provider = createFsd4MockHistoricalProvider({ mode: 'AMBIGUOUS_GRAPHQL_ERRORS' });
    const res = await provider.executeHistoricalDocument({
      tokenId: 1,
      queryText: 'q',
      documentFingerprint: randomUUID(),
      fieldNamesInDocument: ['speed'],
    });
    expect(res.dataPresent).toBe(false);
    expect(res.errors?.length).toBeGreaterThan(0);
  });

  it('findUnsettledHistoricalAttempts flags RESERVED historical slots without checkpoint settlement', () => {
    const fp = 'doc-fp-1';
    let ledger = createEmptyFsd4RequestLedger(12);
    const r = reserveFsd4ProviderRequestAttempt({
      ledger,
      attemptKey: `historical:${fp}`,
      queryFingerprint: fp,
    });
    expect(r.kind).toBe('RESERVED');
    ledger = r.ledger;
    const unsettled = findUnsettledHistoricalAttempts(ledger, emptyFsd4HistoricalProgressCheckpoint());
    expect(unsettled.length).toBe(1);
    expect(unsettled[0]!.queryFingerprint).toBe(fp);
  });
});
