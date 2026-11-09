/** Deterministic runtime isolation for adapter projections (readonly types alone are insufficient). */
export function deepIsolate<T>(value: T): T {
  return structuredClone(value);
}
