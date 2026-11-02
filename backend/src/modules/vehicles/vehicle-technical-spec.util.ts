/**
 * Canonical vehicle technical specification helpers (displacement, cylinders, F/R weight).
 */

export function formatFrontRearWeightDistribution(
  frontWeightDistributionPct: number | null | undefined,
): string {
  if (frontWeightDistributionPct == null || !Number.isFinite(frontWeightDistributionPct)) {
    return '';
  }
  const front = Math.round(frontWeightDistributionPct);
  if (front <= 0 || front >= 100) {
    return String(front);
  }
  const rear = 100 - front;
  return `${front}/${rear}`;
}

/**
 * Parses Master form values such as "58/42", "58", or "58% front" into front axle percent.
 */
export function parseFrontWeightDistributionPct(input: unknown): number | null {
  if (input == null) return null;
  if (typeof input === 'number') {
    return Number.isFinite(input) ? input : null;
  }
  const raw = String(input).trim();
  if (!raw) return null;
  const slash = raw.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (slash) {
    const front = Number(slash[1]);
    if (!Number.isFinite(front) || front <= 0 || front >= 100) return null;
    return front;
  }
  const leading = raw.match(/^(\d+(?:\.\d+)?)/);
  if (!leading) return null;
  const front = Number(leading[1]);
  if (!Number.isFinite(front) || front <= 0 || front >= 100) return null;
  return front;
}

export function parsePositiveIntegerField(input: unknown): number | null {
  if (input == null || input === '') return null;
  const n = typeof input === 'number' ? input : Number(String(input).trim());
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/** Non-negative tank capacity (liters); zero is valid for BEV. */
export function parseTankCapacityLiters(input: unknown): number | null {
  if (input == null || input === '') return null;
  const n = typeof input === 'number' ? input : Number(String(input).replace(',', '.').trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Engine idle/max RPM — positive integer within plausible engine range. */
export function parseVehicleRpmField(input: unknown): number | null {
  const n = parsePositiveIntegerField(input);
  if (n == null || n > 20_000) return null;
  return n;
}

/**
 * Front brake force percent (not F/R weight distribution). Rejects slash ratio strings.
 */
export function parseBrakeForceFrontPercent(input: unknown): number | null {
  if (input == null || input === '') return null;
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input <= 0 || input >= 100) return null;
    return Math.round(input);
  }
  const raw = String(input).trim();
  if (!raw || /\//.test(raw)) return null;
  const pctMatch = raw.match(/(\d+(?:\.\d+)?)/);
  if (!pctMatch) return null;
  const n = Number(pctMatch[1]);
  if (!Number.isFinite(n) || n <= 0 || n >= 100) return null;
  return Math.round(n);
}

export function vehicleRpmPairIsConsistent(
  idleRpm: number | null | undefined,
  maxRpm: number | null | undefined,
): boolean {
  if (idleRpm == null || maxRpm == null) return true;
  return maxRpm > idleRpm;
}

export function valuesEqualScalar(
  a: number | null | undefined,
  b: number | null | undefined,
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return a === b;
}
