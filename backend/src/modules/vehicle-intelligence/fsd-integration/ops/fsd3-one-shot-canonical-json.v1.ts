/** Deterministic JSON for approval signatures and execution capability MACs. */

function serializeFsd3OneShotCanonicalValueV1(value: unknown): string {
  if (value === undefined) {
    throw new Error('FSD3_CANONICAL_JSON_UNDEFINED');
  }
  if (value === null) {
    return 'null';
  }
  const valueType = typeof value;
  if (valueType === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (valueType === 'number') {
    if (!Number.isFinite(value as number)) {
      throw new Error('FSD3_CANONICAL_JSON_NON_FINITE');
    }
    return JSON.stringify(value);
  }
  if (valueType === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => serializeFsd3OneShotCanonicalValueV1(entry)).join(',')}]`;
  }
  if (valueType === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${serializeFsd3OneShotCanonicalValueV1(record[key])}`).join(',')}}`;
  }
  throw new Error('FSD3_CANONICAL_JSON_UNSUPPORTED');
}

export function stableStringifyFsd3OneShotV1(value: unknown): string {
  return serializeFsd3OneShotCanonicalValueV1(value);
}
