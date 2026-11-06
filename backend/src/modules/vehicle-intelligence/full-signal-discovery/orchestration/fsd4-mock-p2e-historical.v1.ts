import {
  FSD_P2E_AGGREGATE_EXPECTATIONS_V1,
  FSD_P2E_HISTORICAL_WINDOW_V1,
} from '../__fixtures__/fsd-p2e-tesla.fixture.v1';
import {
  bucketSlotStartMs,
  computeExpectedBucketPositions,
  parseUtcIsoToEpochMs,
} from '../fsd-coverage.calculator.v1';
import type { FsdHistoricalWindowV1 } from '../fsd-query-document.builder.v1';
import type { Fsd4HistoricalObservationV1 } from './fsd4-provider.port.v1';

export function isP2eSpeedValidBucketSlot(slotIndex: number): boolean {
  return slotIndex < FSD_P2E_AGGREGATE_EXPECTATIONS_V1.speedValidBuckets;
}

export function isP2eGpsValidBucketSlot(slotIndex: number): boolean {
  return slotIndex < FSD_P2E_AGGREGATE_EXPECTATIONS_V1.gpsValidBuckets;
}

export function p2eSpeedKmhForSlot(slotIndex: number): number {
  if (!isP2eSpeedValidBucketSlot(slotIndex)) {
    return NaN;
  }
  const moving = slotIndex < FSD_P2E_AGGREGATE_EXPECTATIONS_V1.speedMovingBuckets;
  return moving ? 12.5 : 0;
}

export function buildP2eObservationsForField(input: {
  window: FsdHistoricalWindowV1;
  fieldName: string;
  duplicateFirstTimestamp?: boolean;
}): Fsd4HistoricalObservationV1[] {
  const { fieldName } = input;
  const expected = computeExpectedBucketPositions(input.window);
  const observations: Fsd4HistoricalObservationV1[] = [];

  if (fieldName === 'powertrainRange') {
    for (let slot = 0; slot < Math.min(32, expected); slot += 1) {
      observations.push({
        timestampMs: bucketSlotStartMs(input.window, slot) + 100,
        numericValue: null,
      });
    }
    return observations;
  }

  if (fieldName === 'speed') {
    for (let slot = 0; slot < expected; slot += 1) {
      if (!isP2eSpeedValidBucketSlot(slot)) {
        continue;
      }
      const ts = bucketSlotStartMs(input.window, slot) + 250;
      observations.push({ timestampMs: ts, numericValue: p2eSpeedKmhForSlot(slot) });
      if (input.duplicateFirstTimestamp && slot === 0) {
        observations.push({ timestampMs: ts, numericValue: 99 });
      }
    }
    return observations;
  }

  if (fieldName === 'currentLocationCoordinates') {
    for (let slot = 0; slot < expected; slot += 1) {
      if (!isP2eGpsValidBucketSlot(slot)) {
        continue;
      }
      const ts = bucketSlotStartMs(input.window, slot) + 500;
      observations.push({
        timestampMs: ts,
        latitude: 51.33 + slot * 0.00001,
        longitude: 9.5 + slot * 0.00001,
      });
    }
    return observations;
  }

  let h = 0;
  for (let i = 0; i < input.fieldName.length; i += 1) {
    h = (h * 31 + input.fieldName.charCodeAt(i)) >>> 0;
  }
  const slotIndex = expected > 0 ? h % expected : 0;
  observations.push({
    timestampMs: bucketSlotStartMs(input.window, slotIndex) + 300,
    numericValue: 1,
  });
  return observations;
}

export const FSD4_MOCK_P2E_WINDOW_V1 = FSD_P2E_HISTORICAL_WINDOW_V1;

export function assertP2eExpectedBucketDenominator(window: FsdHistoricalWindowV1): number {
  const n = computeExpectedBucketPositions(window);
  if (n !== FSD_P2E_AGGREGATE_EXPECTATIONS_V1.expectedBucketPositions) {
    throw new Error(`P2E bucket denominator mismatch: ${n}`);
  }
  return n;
}

export function p2eWindowFromMsOffset(base: FsdHistoricalWindowV1, offsetMs: number): FsdHistoricalWindowV1 {
  return {
    fromUtc: new Date(parseUtcIsoToEpochMs(base.fromUtc) + offsetMs).toISOString(),
    toUtc: new Date(parseUtcIsoToEpochMs(base.toUtc) + offsetMs).toISOString(),
  };
}
