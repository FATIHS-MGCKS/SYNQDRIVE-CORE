export function limitationCodesGrouped(codes: readonly string[]): {
  attribution: string[];
  other: string[];
} {
  const KNOWN_LIMITATION_PREFIXES = ['RPM_HF_', 'CLICKHOUSE_', 'OPEN_TRIP_', 'LATEST_STATE_', 'PROVIDER_'];
  const attribution: string[] = [];
  const other: string[] = [];
  for (const code of codes) {
    if (KNOWN_LIMITATION_PREFIXES.some((p) => code.startsWith(p) || code.includes('ATTRIBUTION'))) {
      attribution.push(code);
    } else {
      other.push(code);
    }
  }
  return { attribution, other };
}
