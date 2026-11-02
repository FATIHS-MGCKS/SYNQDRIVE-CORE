const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/i;

export function normalizeVin(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const v = raw.trim().toUpperCase().replace(/\s+/g, '');
  return v.length > 0 ? v : null;
}

export function isValidVin(raw: string | null | undefined): boolean {
  const v = normalizeVin(raw);
  return v != null && VIN_REGEX.test(v);
}
