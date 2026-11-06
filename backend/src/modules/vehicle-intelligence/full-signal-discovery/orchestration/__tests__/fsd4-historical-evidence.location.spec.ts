import { FSD_P2E_HISTORICAL_WINDOW_V1 } from '../../__fixtures__/fsd-p2e-tesla.fixture.v1';
import { parseUtcIsoToEpochMs } from '../../fsd-coverage.calculator.v1';
import {
  mapHistoricalFieldEvidence,
  observationsToBucketSeries,
} from '../fsd4-historical-evidence.v1';
import { mapHistoricalRowToObservations } from '../fsd-dimo-live-discovery.adapter.v1';

describe('FSD-4 historical evidence — LOCATION fields (precise + approximate)', () => {
  const window = {
    fromUtc: '2026-11-04T04:00:00.000Z',
    toUtc: '2026-11-04T04:00:02.000Z',
  };
  const fromMs = parseUtcIsoToEpochMs(window.fromUtc);
  const coSelected = 2;

  const baseInterpretation = {
    fieldName: 'speed',
    attribution: 'RELIABLE' as const,
    evidence: {
      declared: true,
      schemaCompatible: true,
      queryPlanned: true,
      queryAccepted: true,
    },
  };

  function rowSpeedValid(tsExtra: number) {
    return { timestamp: new Date(fromMs + tsExtra).toISOString(), speed: 1 };
  }

  it('currentLocationCoordinates: valid lat/lon => valid bucket', () => {
    const field = 'currentLocationCoordinates';
    const row = {
      ...rowSpeedValid(100),
      [field]: { latitude: 52.5, longitude: 13.4 },
    };
    const obs = mapHistoricalRowToObservations(field, row, 'timestamp');
    const buckets = observationsToBucketSeries(field, obs);
    const mapped = mapHistoricalFieldEvidence({
      window,
      fieldName: field,
      observations: obs,
      coSelectedFieldCount: coSelected,
      fieldInterpretation: { ...baseInterpretation, fieldName: field },
    });
    expect(buckets).toEqual([{ timestampMs: fromMs + 100, numericValue: 1 }]);
    expect(mapped.coverage.validValueBucketCount).toBe(1);
    expect(mapped.coverage.nullBucketCount).toBe(0);
    expect(mapped.coverage.missingBucketCount).toBe(0);
    expect(mapped.coverage.invalidBucketCount).toBe(0);
  });

  it('currentLocationApproximateCoordinates: explicit null => NULL bucket', () => {
    const field = 'currentLocationApproximateCoordinates';
    const row = { ...rowSpeedValid(100), [field]: null };
    const obs = mapHistoricalRowToObservations(field, row, 'timestamp');
    const buckets = observationsToBucketSeries(field, obs);
    const mapped = mapHistoricalFieldEvidence({
      window,
      fieldName: field,
      observations: obs,
      coSelectedFieldCount: coSelected,
      fieldInterpretation: { ...baseInterpretation, fieldName: field },
    });
    expect(buckets[0].numericValue).toBeNull();
    expect(mapped.coverage.nullBucketCount).toBe(1);
    expect(mapped.coverage.validValueBucketCount).toBe(0);
  });

  it('currentLocationApproximateCoordinates: missing column => MISSING bucket', () => {
    const field = 'currentLocationApproximateCoordinates';
    const row = rowSpeedValid(100);
    const obs = mapHistoricalRowToObservations(field, row, 'timestamp');
    const buckets = observationsToBucketSeries(field, obs);
    const mapped = mapHistoricalFieldEvidence({
      window,
      fieldName: field,
      observations: obs,
      coSelectedFieldCount: coSelected,
      fieldInterpretation: { ...baseInterpretation, fieldName: field },
    });
    expect(buckets[0].numericValue).toBeUndefined();
    expect(mapped.coverage.missingBucketCount).toBe(1);
    expect(mapped.coverage.nullBucketCount).toBe(0);
  });

  it('currentLocationCoordinates: invalid coordinates => INVALID + queryFailed', () => {
    const field = 'currentLocationCoordinates';
    const row = {
      ...rowSpeedValid(100),
      [field]: { latitude: 'north', longitude: 13.4 },
    };
    const obs = mapHistoricalRowToObservations(field, row, 'timestamp');
    const buckets = observationsToBucketSeries(field, obs);
    const mapped = mapHistoricalFieldEvidence({
      window,
      fieldName: field,
      observations: obs,
      coSelectedFieldCount: coSelected,
      fieldInterpretation: { ...baseInterpretation, fieldName: field },
    });
    expect(buckets[0].numericValue).toBe(Number.POSITIVE_INFINITY);
    expect(mapped.coverage.invalidBucketCount).toBe(1);
    expect(mapped.evidenceState).toBe('QUERY_FAILED');
  });
});

describe('observationsToBucketSeries parity on P2E window (both location fields)', () => {
  it('maps valid GPS rows to one valid bucket per field name', () => {
    const w = FSD_P2E_HISTORICAL_WINDOW_V1;
    const fromMs = parseUtcIsoToEpochMs(w.fromUtc);
    const obs = [
      { timestampMs: fromMs + 500, latitude: 1, longitude: 2 },
      { timestampMs: fromMs + 1500, latitude: 1, longitude: 2 },
    ];
    const b1 = observationsToBucketSeries('currentLocationCoordinates', obs);
    const b2 = observationsToBucketSeries('currentLocationApproximateCoordinates', obs);
    expect(b1.length).toBe(2);
    expect(b2.length).toBe(2);
    expect(b1.every((o) => o.numericValue === 1)).toBe(true);
    expect(b2.every((o) => o.numericValue === 1)).toBe(true);
  });
});
