/** Deterministic JSON for approval signatures and execution capability MACs. */
export function stableStringifyFsd3OneShotV1(value: unknown): string {
  if (value === null || typeof value !== 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringifyFsd3OneShotV1).join(',')}]`;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringifyFsd3OneShotV1(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(null);
}
