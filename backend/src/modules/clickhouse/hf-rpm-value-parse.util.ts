/**
 * Parse HF RPM value_float without treating null/empty as 0 rpm (engine idle).
 * Returns null for missing, non-finite, or negative values; allows 0.
 */
export function parseHfRpmValueFloat(raw: unknown): number | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed === '') {
      return null;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    if (parsed < 0) {
      return null;
    }
    return parsed;
  }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      return null;
    }
    if (raw < 0) {
      return null;
    }
    return raw;
  }
  return null;
}
