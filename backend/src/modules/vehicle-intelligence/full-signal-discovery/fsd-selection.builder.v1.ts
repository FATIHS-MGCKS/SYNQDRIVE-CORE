import type { FsdClassifiedSignalV1 } from './fsd-signal-shape.classifier.v1';

export const FSD_HISTORICAL_AGGREGATION_V1 = 'AVG' as const;

/** Malformed P2C pattern — must never be emitted by FSD planners. */
export const FSD_MALFORMED_FLAT_LOCATION_HISTORICAL_PATTERN =
  /currentLocationCoordinates\s*\(\s*agg\s*:\s*AVG\s*\)(?!\s*\{)/;

export function buildFsdSnapshotSelectionForSignal(signal: FsdClassifiedSignalV1): string | null {
  if (!signal.latestSelectionSupported) {
    return null;
  }
  if (signal.shape === 'UNKNOWN') {
    return null;
  }
  if (signal.shape === 'LOCATION') {
    return `${signal.fieldName} { timestamp value { latitude longitude } }`;
  }
  if (signal.shape === 'STRING' || signal.shape === 'FLOAT') {
    return `${signal.fieldName} { timestamp value }`;
  }
  return null;
}

export function buildFsdHistoricalSelectionForSignal(signal: FsdClassifiedSignalV1): string | null {
  if (!signal.historicalAggregationSupported) {
    return null;
  }
  if (signal.shape === 'UNKNOWN') {
    return null;
  }
  if (signal.shape === 'STRING') {
    return null;
  }
  if (signal.shape === 'FLOAT') {
    return `${signal.fieldName}(agg: ${FSD_HISTORICAL_AGGREGATION_V1})`;
  }
  if (signal.shape === 'LOCATION') {
    return `${signal.fieldName}(agg: ${FSD_HISTORICAL_AGGREGATION_V1}) { latitude longitude }`;
  }
  return null;
}

export function assertFsdHistoricalSelectionIsSchemaSafe(selection: string): void {
  if (FSD_MALFORMED_FLAT_LOCATION_HISTORICAL_PATTERN.test(selection)) {
    throw new Error('Malformed flat SignalLocation historical selection detected');
  }
}

export function buildFsdHistoricalSelectionsForFields(
  signals: readonly FsdClassifiedSignalV1[],
): { selections: string[]; fieldNames: string[] } {
  const selections: string[] = [];
  const fieldNames: string[] = [];
  for (const signal of signals) {
    const selection = buildFsdHistoricalSelectionForSignal(signal);
    if (!selection) {
      continue;
    }
    assertFsdHistoricalSelectionIsSchemaSafe(selection);
    selections.push(selection);
    fieldNames.push(signal.fieldName);
  }
  return { selections, fieldNames };
}
