/** Fail-closed recursion cap for adversarial deeply nested candidate payloads. */
export const DBI_P2C3_CANONICAL_MAX_DEPTH = 64;

export type DbiP2c3CanonicalJsonFailureReasonV1 =
  | 'UNDEFINED'
  | 'NON_FINITE_NUMBER'
  | 'BIGINT'
  | 'FUNCTION'
  | 'SYMBOL'
  | 'UNSUPPORTED_OBJECT'
  | 'CYCLIC_REFERENCE';

export type DbiP2c3CanonicalJsonResultV1 =
  | { readonly ok: true; readonly canonical: unknown }
  | { readonly ok: false; readonly reason: DbiP2c3CanonicalJsonFailureReasonV1 };

function isPlainRecord(value: object): boolean {
  if (Array.isArray(value)) return false;
  const tag = Object.prototype.toString.call(value);
  if (tag !== '[object Object]') return false;
  const ctorName = (value as { constructor?: { name?: string } }).constructor?.name;
  if (ctorName !== undefined && ctorName !== 'Object') return false;
  return true;
}

/** Recursive deterministic JSON-safe canonicalization (sorted object keys; array order preserved). Fail-closed on ambiguous values. */
export function tryCanonicalizeJsonValue(
  value: unknown,
  ancestors: Set<object> = new Set(),
  depth = 0,
): DbiP2c3CanonicalJsonResultV1 {
  if (depth > DBI_P2C3_CANONICAL_MAX_DEPTH) {
    return { ok: false, reason: 'UNSUPPORTED_OBJECT' };
  }
  if (value === undefined) {
    return { ok: false, reason: 'UNDEFINED' };
  }
  if (value === null) {
    return { ok: true, canonical: null };
  }
  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'boolean') {
    return { ok: true, canonical: value };
  }
  if (valueType === 'number') {
    if (!Number.isFinite(value)) {
      return { ok: false, reason: 'NON_FINITE_NUMBER' };
    }
    return { ok: true, canonical: value };
  }
  if (valueType === 'bigint') {
    return { ok: false, reason: 'BIGINT' };
  }
  if (valueType === 'function') {
    return { ok: false, reason: 'FUNCTION' };
  }
  if (valueType === 'symbol') {
    return { ok: false, reason: 'SYMBOL' };
  }
  if (valueType === 'object') {
    if (!Array.isArray(value) && !isPlainRecord(value)) {
      return { ok: false, reason: 'UNSUPPORTED_OBJECT' };
    }
    if (ancestors.has(value)) {
      return { ok: false, reason: 'CYCLIC_REFERENCE' };
    }
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        const canonical: unknown[] = [];
        for (const entry of value) {
          const next = tryCanonicalizeJsonValue(entry, ancestors, depth + 1);
          if (!next.ok) return next;
          canonical.push(next.canonical);
        }
        return { ok: true, canonical };
      }
      const record = value as Record<string, unknown>;
      const sortedKeys = Object.keys(record).sort();
      const canonical: Record<string, unknown> = {};
      for (const key of sortedKeys) {
        const field = record[key];
        if (field === undefined) {
          return { ok: false, reason: 'UNDEFINED' };
        }
        const next = tryCanonicalizeJsonValue(field, ancestors, depth + 1);
        if (!next.ok) return next;
        canonical[key] = next.canonical;
      }
      return { ok: true, canonical };
    } finally {
      ancestors.delete(value);
    }
  }
  return { ok: false, reason: 'UNSUPPORTED_OBJECT' };
}

export type DbiP2c3CanonicalJsonStringifyResultV1 =
  | { readonly ok: true; readonly json: string }
  | { readonly ok: false; readonly reason: DbiP2c3CanonicalJsonFailureReasonV1 };

export function tryCanonicalJsonStringify(value: unknown): DbiP2c3CanonicalJsonStringifyResultV1 {
  const canonical = tryCanonicalizeJsonValue(value);
  if (!canonical.ok) {
    return { ok: false, reason: canonical.reason };
  }
  return { ok: true, json: JSON.stringify(canonical.canonical) };
}

/** Use only after fail-closed validation has proved JSON-safe input. */
export function canonicalJsonStringify(value: unknown): string {
  const result = tryCanonicalJsonStringify(value);
  if (!result.ok) {
    throw new Error(`DBI_P2C3_CANONICAL_INVARIANT_VIOLATION:${result.reason}`);
  }
  return result.json;
}
