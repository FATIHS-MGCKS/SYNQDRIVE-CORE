/** Deterministic runtime isolation for reconciliation projections (inputs must not be mutated). */
export function deepIsolate<T>(value: T): T {
  return structuredClone(value);
}
