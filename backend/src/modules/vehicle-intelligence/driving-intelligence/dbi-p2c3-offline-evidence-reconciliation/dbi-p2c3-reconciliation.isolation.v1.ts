import type { DbiP2c3ReconciliationDiagnosticCodeV1 } from './dbi-p2c3-reconciliation.contract.v1';

export type DbiP2c3DeepIsolateResultV1<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: DbiP2c3ReconciliationDiagnosticCodeV1 };

/** Deterministic runtime isolation for reconciliation projections (inputs must not be mutated). */
export function deepIsolate<T>(value: T): T {
  return structuredClone(value);
}

export function tryDeepIsolate<T>(value: T): DbiP2c3DeepIsolateResultV1<T> {
  try {
    return { ok: true, value: structuredClone(value) };
  } catch {
    return { ok: false, code: 'BUNDLE_INPUT_ISOLATION_FAILED' };
  }
}
