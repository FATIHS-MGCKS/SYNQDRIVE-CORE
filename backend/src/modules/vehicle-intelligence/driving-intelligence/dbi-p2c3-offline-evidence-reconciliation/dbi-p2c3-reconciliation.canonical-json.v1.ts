const CANONICAL_UNSUPPORTED = '__DBI_P2C3_CANONICAL_UNSUPPORTED__' as const;

/** Recursive deterministic JSON-safe canonicalization (sorted object keys; array order preserved). */
export function canonicalizeJsonValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'boolean') {
    return value;
  }
  if (valueType === 'number') {
    if (!Number.isFinite(value)) return null;
    return value;
  }
  if (valueType === 'bigint') {
    return `bigint:${value.toString()}`;
  }
  if (valueType === 'object') {
    if (Array.isArray(value)) {
      return value.map((entry) => canonicalizeJsonValue(entry));
    }
    const record = value as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort();
    const canonical: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      canonical[key] = canonicalizeJsonValue(record[key]);
    }
    return canonical;
  }
  return CANONICAL_UNSUPPORTED;
}

export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalizeJsonValue(value));
}
