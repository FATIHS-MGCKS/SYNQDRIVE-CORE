import { execSync } from 'node:child_process';
import * as path from 'node:path';
import {
  assertRejectedFingerprintNotRetried,
  buildFsdHistoricalSelectionForSignal,
  buildFsdHistoricalSignalsQueryDocument,
  classifyFsdSignalShape,
  classifyNumericObservation,
  computeExpectedBucketPositions,
  createDefaultFsdBudgetConfigV1,
  FSD_MALFORMED_FLAT_LOCATION_HISTORICAL_PATTERN,
  historicalPlanViolatesLocationIsolation,
  interpretFsdGraphqlProviderResponse,
  isTimestampWithinHistoricalWindow,
  mapTimestampToBucketSlot,
  normalizeDeclaredFieldNames,
  planFsdBinaryChunkSplit,
  planFsdFullSignalDiscoveryV1,
  planFsdHistoricalQueries,
  fieldsRemainSchemaCompatibleAfterWholeDocumentRejection,
  rejectInvalidGraphqlFieldNames,
  summarizeFromP2eAggregateFixture,
  summarizeSignalBucketObservations,
} from '../index';
import {
  FSD_P2C_GROUP_A_FIELDS_V1,
  FSD_P2E_AGGREGATE_EXPECTATIONS_V1,
  FSD_P2E_HISTORICAL_WINDOW_V1,
  FSD_TESLA_P2E_DECLARED_FIELDS_V1,
} from '../__fixtures__/fsd-p2e-tesla.fixture.v1';
import {
  FSD_CATALOG_PROVIDER_REQUEST_SLOTS_V1,
} from '../fsd-discovery.planner.v1';

describe('FSD-1 full signal discovery planner regression suite', () => {
  const tokenId = 424242;
  const window = FSD_P2E_HISTORICAL_WINDOW_V1;
  const budget = createDefaultFsdBudgetConfigV1();

  it('Test 1 — no flat location historical selection', () => {
    const location = classifyFsdSignalShape('currentLocationCoordinates')!;
    const selection = buildFsdHistoricalSelectionForSignal(location)!;
    expect(selection).toContain('{ latitude longitude }');
    expect(FSD_MALFORMED_FLAT_LOCATION_HISTORICAL_PATTERN.test(selection)).toBe(false);

    const doc = buildFsdHistoricalSignalsQueryDocument({
      tokenId,
      window,
      selections: [selection],
      fieldNames: ['currentLocationCoordinates'],
    });
    expect(doc.queryText).toMatch(/currentLocationCoordinates\s*\(\s*agg:\s*AVG\s*\)\s*\{\s*latitude\s+longitude\s*\}/);
  });

  it('Test 2 — location isolation in historical V1 chunks', () => {
    const plan = planFsdHistoricalQueries({
      tokenId,
      declaredFieldNames: FSD_P2C_GROUP_A_FIELDS_V1,
      window,
      budget,
      maxPlannedHistoricalRequests: 12,
    });
    expect(historicalPlanViolatesLocationIsolation(plan)).toBe(false);
    for (const chunk of plan.chunks) {
      if (chunk.shapeMix === 'LOCATION_ONLY') {
        expect(chunk.fieldNames).toEqual(['currentLocationCoordinates']);
      } else {
        expect(chunk.fieldNames).not.toContain('currentLocationCoordinates');
      }
    }
  });

  it('Test 3 — P2C Group A replay produces separate schema-correct chunks', () => {
    const plan = planFsdHistoricalQueries({
      tokenId,
      declaredFieldNames: FSD_P2C_GROUP_A_FIELDS_V1,
      window,
      budget,
      maxPlannedHistoricalRequests: 12,
    });
    expect(plan.chunks.length).toBeGreaterThanOrEqual(2);
    const locationChunk = plan.chunks.find((c) => c.shapeMix === 'LOCATION_ONLY');
    expect(locationChunk).toBeDefined();
    expect(locationChunk!.documents.queryText).toContain('latitude longitude');
    for (const chunk of plan.chunks) {
      expect(chunk.documents.queryText).not.toMatch(FSD_MALFORMED_FLAT_LOCATION_HISTORICAL_PATTERN);
    }
  });

  it('Test 4 — HTTP 422 split policy never retries identical fingerprint', () => {
    const plan = planFsdHistoricalQueries({
      tokenId,
      declaredFieldNames: FSD_P2C_GROUP_A_FIELDS_V1,
      window,
      budget,
      maxPlannedHistoricalRequests: 12,
    });
    const mixed = plan.chunks.find((c) => c.fieldNames.length > 1 && c.shapeMix === 'FLOAT_ONLY');
    expect(mixed).toBeDefined();
    const split = planFsdBinaryChunkSplit({
      failedDocument: mixed!.documents,
      reason: 'HTTP_422',
      remainingRequestBudget: 4,
      budget,
    });
    expect(split.ok).toBe(true);
    if (split.ok) {
      for (const child of split.childDocuments) {
        expect(assertRejectedFingerprintNotRetried(mixed!.documents.fingerprint, child.fingerprint)).toBe(
          true,
        );
      }
      expect(split.consumedRequestSlots).toBeLessThanOrEqual(4);
    }
  });

  it('Test 5 — partial GraphQL errors attribute failures at signal level', () => {
    const interpretation = interpretFsdGraphqlProviderResponse({
      fieldNamesInDocument: ['speed', 'exteriorAirTemperature'],
      dataPresent: true,
      errors: [{ path: ['signals', 0, 'exteriorAirTemperature'], message: 'failed' }],
    });
    expect(interpretation.documentAccepted).toBe(false);
    const speed = interpretation.fields.find((f) => f.fieldName === 'speed')!;
    const temp = interpretation.fields.find((f) => f.fieldName === 'exteriorAirTemperature')!;
    expect(speed.evidence.queryAccepted).toBe(false);
    expect(temp.evidence.queryFailed).toBe(true);
  });

  it('Test 6 — unknown shape remains catalog-visible but not executable', () => {
    const declared = ['speed', 'notInRegistrySignalX'];
    const full = planFsdFullSignalDiscoveryV1({
      tokenId,
      declaredFieldNames: declared,
      historicalWindow: window,
      budget,
    });
    const unknown = full.snapshot.catalogSignals.find((s) => s.fieldName === 'notInRegistrySignalX');
    expect(unknown?.evidence.declared).toBe(true);
    expect(unknown?.evidence.queryPlanned).toBe(false);
    expect(
      full.snapshot.documents.every((d) => !d.fieldNames.includes('notInRegistrySignalX')),
    ).toBe(true);
    expect(
      full.historical?.chunks.every((c) => !c.fieldNames.includes('notInRegistrySignalX')) ?? true,
    ).toBe(true);
  });

  it('Test 7 — boolean-as-float without SignalBoolean type', () => {
    const signal = classifyFsdSignalShape('cabinDoorRow1DriverSideIsOpen')!;
    expect(signal.shape).toBe('FLOAT');
    const historical = buildFsdHistoricalSelectionForSignal(signal);
    expect(historical).toBe('cabinDoorRow1DriverSideIsOpen(agg: AVG)');
  });

  it('Test 8 — deterministic fingerprints for equivalent inputs', () => {
    const input = {
      tokenId,
      declaredFieldNames: FSD_TESLA_P2E_DECLARED_FIELDS_V1,
      historicalWindow: window,
      budget,
    };
    const a = planFsdFullSignalDiscoveryV1(input);
    const b = planFsdFullSignalDiscoveryV1(input);
    expect(a.totalPlannedProviderRequests).toBe(b.totalPlannedProviderRequests);
    const fpsA = [
      ...a.snapshot.documents.map((d) => d.fingerprint),
      ...(a.historical?.chunks.map((c) => c.documents.fingerprint) ?? []),
    ];
    const fpsB = [
      ...b.snapshot.documents.map((d) => d.fingerprint),
      ...(b.historical?.chunks.map((c) => c.documents.fingerprint) ?? []),
    ];
    expect(fpsA).toEqual(fpsB);
    expect(new Set(fpsA).size).toBe(fpsA.length);
  });

  it('Test 9 — insufficient catalog budget yields non-executable plan with deferred signals', () => {
    const tightBudget = createDefaultFsdBudgetConfigV1({ maxRequestsPerRun: 0 });
    const plan = planFsdFullSignalDiscoveryV1({
      tokenId,
      declaredFieldNames: FSD_TESLA_P2E_DECLARED_FIELDS_V1,
      historicalWindow: window,
      budget: tightBudget,
    });
    expect(plan.executable).toBe(false);
    expect(plan.executableProviderRequestCount).toBe(0);
    expect(plan.snapshot.documents).toHaveLength(0);
    expect(plan.deferredByBudget.length).toBeGreaterThan(0);
    expect(plan.budgetValidation.ok).toBe(false);
    if (!plan.budgetValidation.ok) {
      expect(plan.budgetValidation.reason).toBe('REQUEST_BUDGET_EXCEEDED');
    }
  });

  it('Test 10 — P2E aggregate fixture parity for coverage and motion', () => {
    const expected = computeExpectedBucketPositions(window);
    expect(expected).toBe(FSD_P2E_AGGREGATE_EXPECTATIONS_V1.expectedBucketPositions);

    const summary = summarizeFromP2eAggregateFixture({
      window,
      speedValidBuckets: FSD_P2E_AGGREGATE_EXPECTATIONS_V1.speedValidBuckets,
      speedMovingBuckets: FSD_P2E_AGGREGATE_EXPECTATIONS_V1.speedMovingBuckets,
      speedStationaryBuckets: FSD_P2E_AGGREGATE_EXPECTATIONS_V1.speedStationaryBuckets,
      gpsValidBuckets: FSD_P2E_AGGREGATE_EXPECTATIONS_V1.gpsValidBuckets,
    });

    expect(summary.speedCoverageRatio).toBeCloseTo(64 / 1538, 6);
    expect(summary.gpsCoverageRatio).toBeCloseTo(1133 / 1538, 6);
    expect(summary.motion.unknownMotionPositions).toBe(1474);
    expect(summary.motion.movingValidBuckets).toBe(57);
    expect(summary.motion.stationaryValidBuckets).toBe(7);
  });

  it('Test 11 — zero is valid; null and missing are not valid-value coverage', () => {
    expect(classifyNumericObservation(0)).toBe('VALID_ZERO');
    expect(classifyNumericObservation(null)).toBe('NULL');
    expect(classifyNumericObservation(undefined)).toBe('MISSING');
    const summary = summarizeSignalBucketObservations({
      window,
      observations: [
        { timestampMs: Date.parse(window.fromUtc), numericValue: 0 },
        { timestampMs: Date.parse(window.fromUtc) + 1000, numericValue: null },
        { timestampMs: Date.parse(window.fromUtc) + 2000, numericValue: undefined },
        { timestampMs: Date.parse(window.fromUtc) + 3000, numericValue: 12 },
      ],
    });
    expect(summary.validValueBucketCount).toBe(2);
    expect(summary.zeroValueBucketCount).toBe(1);
    expect(summary.nullBucketCount).toBe(1);
    expect(summary.missingBucketCount).toBe(1);
  });

  it('Test 12 — timestamp boundaries, duplicates, and out-of-window observations', () => {
    const fromMs = Date.parse(window.fromUtc);
    const toMs = Date.parse(window.toUtc);
    expect(isTimestampWithinHistoricalWindow(window, fromMs)).toBe(true);
    expect(isTimestampWithinHistoricalWindow(window, toMs)).toBe(false);
    expect(isTimestampWithinHistoricalWindow(window, toMs - 1)).toBe(true);
    expect(isTimestampWithinHistoricalWindow(window, toMs + 1)).toBe(false);
    expect(mapTimestampToBucketSlot(window, fromMs + 1500)).toBe(1);

    const summary = summarizeSignalBucketObservations({
      window,
      observations: [
        { timestampMs: fromMs, numericValue: 1 },
        { timestampMs: fromMs, numericValue: 2 },
        { timestampMs: toMs + 5000, numericValue: 3 },
      ],
    });
    expect(summary.duplicateTimestampsIgnored).toBe(1);
    expect(summary.outOfWindowObservations).toBe(1);
    expect(summary.returnedBucketCount).toBe(1);
  });

  it('Test 13 — whole-document 422 rejection does not mark fields schema-incompatible', () => {
    const interpretation = interpretFsdGraphqlProviderResponse({
      fieldNamesInDocument: [...FSD_P2C_GROUP_A_FIELDS_V1],
      dataPresent: false,
      httpStatus: 422,
    });
    expect(fieldsRemainSchemaCompatibleAfterWholeDocumentRejection(interpretation.fields)).toBe(true);
    expect(interpretation.fields.every((f) => f.evidence.queryFailed)).toBe(true);
  });

  it('Test 14 — rejects invalid GraphQL identifiers', () => {
    const result = rejectInvalidGraphqlFieldNames(['speed', 'bad-field', '123bad', 'valid_name']);
    expect(result.valid).toEqual(['speed', 'valid_name']);
    expect(result.rejected).toEqual(['bad-field', '123bad']);
    expect(normalizeDeclaredFieldNames([' speed ', 'speed', 'valid'])).toEqual(['speed', 'valid']);
  });

  it('Test 15 — no production pipeline imports full-signal-discovery module', () => {
    const backendSrc = path.join(__dirname, '../../../..');
    // `fsd-integration` is the Nest wiring surface and may use @modules/.../full-signal-discovery paths.
    const output = execSync(
      `rg -l "full-signal-discovery" "${backendSrc}" --glob "!**/full-signal-discovery/**" --glob "!**/fsd-integration/**" --glob "!**/vehicle-onboarding/**" --glob "!**/dimo-vehicle-data-source-link.service.ts" --glob "!**/dimo-source-link-reactivation-fsd-fence.postgres.integration.spec.ts" || true`,
      { encoding: 'utf8' },
    ).trim();
    expect(output).toBe('');
  });

  it('planner never sets queryAccepted before provider response', () => {
    const plan = planFsdFullSignalDiscoveryV1({
      tokenId,
      declaredFieldNames: FSD_TESLA_P2E_DECLARED_FIELDS_V1,
      historicalWindow: window,
      budget,
    });
    for (const signal of plan.snapshot.catalogSignals) {
      expect(signal.evidence.queryAccepted).toBeUndefined();
    }
    for (const signal of plan.historical?.catalogSignals ?? []) {
      expect(signal.evidence.queryAccepted).toBeUndefined();
    }
  });

  it('full plan reserves catalog slot in request budget accounting', () => {
    const plan = planFsdFullSignalDiscoveryV1({
      tokenId,
      declaredFieldNames: FSD_TESLA_P2E_DECLARED_FIELDS_V1,
      historicalWindow: window,
      budget,
    });
    expect(plan.catalogReservedRequestSlots).toBe(FSD_CATALOG_PROVIDER_REQUEST_SLOTS_V1);
    expect(plan.executable).toBe(true);
    expect(plan.executableProviderRequestCount).toBeLessThanOrEqual(budget.maxRequestsPerRun);
    expect(plan.totalPlannedProviderRequests).toBeLessThanOrEqual(budget.maxRequestsPerRun);
  });
});
