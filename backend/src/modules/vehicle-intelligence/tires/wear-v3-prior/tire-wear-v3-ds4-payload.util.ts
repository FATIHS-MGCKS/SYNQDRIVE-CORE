/** Read-only helpers for persisted DS4 shadow JSON (no DS4 algorithm changes). */

export type TireWearV3Ds4ShadowTemporalDetail = {
  validDrivingSeconds: number | null;
  /** Legacy / alternate duration keys (optional in payload). */
  tripDurationSeconds: number | null;
  /** Live adapter v1.1.x window length (seconds). */
  tripWindowSeconds: number | null;
  confirmedStationarySeconds: number | null;
  /** Accountable (valid driving + confirmed stationary) / tripWindow — trust weight, not “gentle driving”. */
  accountableFraction: number | null;
  labelledFraction: number | null;
  verified: boolean | null;
};

export type TireWearV3Ds4TemporalTripWeightResult = {
  weight: number;
  flags: string[];
  /** Which rule produced the weight (diagnostics / tests). */
  source:
    | 'none'
    | 'verified'
    | 'accountable_fraction'
    | 'valid_over_trip_window'
    | 'valid_over_legacy_duration';
};

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeUnitFraction(value: number | null): number | null {
  if (value == null) return null;
  if (value < 0 || value > 1 || !Number.isFinite(value)) return null;
  return value;
}

export function extractM3JPerKgPerKmFromShadowPayload(payload: unknown): number | null {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const p = payload as Record<string, unknown>;
  const acc = p.acceleration as { okM3JPerKgPerKmSum?: number } | undefined;
  const dec = p.deceleration as { okM3JPerKgPerKmSum?: number } | undefined;
  const sum =
    (typeof acc?.okM3JPerKgPerKmSum === 'number' ? acc.okM3JPerKgPerKmSum : 0) +
    (typeof dec?.okM3JPerKgPerKmSum === 'number' ? dec.okM3JPerKgPerKmSum : 0);
  if (!Number.isFinite(sum)) return null;
  return sum;
}

export function extractTemporalDetailFromShadowPayload(
  payload: unknown,
): TireWearV3Ds4ShadowTemporalDetail {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      validDrivingSeconds: null,
      tripDurationSeconds: null,
      tripWindowSeconds: null,
      confirmedStationarySeconds: null,
      accountableFraction: null,
      labelledFraction: null,
      verified: null,
    };
  }
  const p = payload as Record<string, unknown>;
  const detail = p.temporalCoverageDetail as Record<string, unknown> | undefined;
  const duration =
    readFiniteNumber(detail?.observedTripDurationSeconds) ??
    readFiniteNumber(detail?.tripDurationSeconds);
  return {
    validDrivingSeconds: readFiniteNumber(detail?.validDrivingSeconds),
    tripDurationSeconds: duration,
    tripWindowSeconds: readFiniteNumber(detail?.tripWindowSeconds),
    confirmedStationarySeconds: readFiniteNumber(detail?.confirmedStationarySeconds),
    accountableFraction: normalizeUnitFraction(readFiniteNumber(detail?.accountableFraction)),
    labelledFraction: normalizeUnitFraction(readFiniteNumber(detail?.labelledFraction)),
    verified: typeof detail?.verified === 'boolean' ? detail.verified : null,
  };
}

/** Backward-compatible seconds extract (legacy callers). */
export function extractTemporalSecondsFromShadowPayload(payload: unknown): {
  validDrivingSeconds: number | null;
  tripDurationSeconds: number | null;
} {
  const detail = extractTemporalDetailFromShadowPayload(payload);
  const duration =
    detail.tripDurationSeconds ??
    (detail.tripWindowSeconds != null && detail.tripWindowSeconds > 0
      ? detail.tripWindowSeconds
      : null);
  return {
    validDrivingSeconds: detail.validDrivingSeconds,
    tripDurationSeconds: duration,
  };
}

/**
 * Per-trip trust weight for DS4 severity aggregation.
 * Prefer accountableFraction (accountable time / trip window). Never assume full coverage when unknown.
 */
export function resolveDs4TemporalTripWeight(args: {
  ds4ReadStatus: string;
  temporalCoverage: string | null;
  m3JPerKgPerKm: number | null;
  detail: TireWearV3Ds4ShadowTemporalDetail;
  speedAuthority?: string | null;
}): TireWearV3Ds4TemporalTripWeightResult {
  const flags: string[] = [];
  if (args.ds4ReadStatus !== 'SUCCEEDED') {
    return { weight: 0, flags, source: 'none' };
  }
  if (args.m3JPerKgPerKm == null || !Number.isFinite(args.m3JPerKgPerKm)) {
    return { weight: 0, flags, source: 'none' };
  }

  if (args.temporalCoverage === 'VERIFIED' || args.detail.verified === true) {
    return { weight: 1, flags, source: 'verified' };
  }

  if (args.temporalCoverage === 'PARTIAL') {
    const accountable = args.detail.accountableFraction;
    if (accountable != null) {
      return { weight: accountable, flags, source: 'accountable_fraction' };
    }

    const valid = args.detail.validDrivingSeconds;
    const window = args.detail.tripWindowSeconds;
    if (valid != null && window != null && window > 0 && valid >= 0) {
      flags.push('DS4_TEMPORAL_WEIGHT_VALID_OVER_TRIP_WINDOW');
      return {
        weight: Math.min(1, valid / window),
        flags,
        source: 'valid_over_trip_window',
      };
    }

    const legacyDuration = args.detail.tripDurationSeconds;
    if (valid != null && legacyDuration != null && legacyDuration > 0 && valid >= 0) {
      flags.push('DS4_TEMPORAL_WEIGHT_LEGACY_DURATION_DENOMINATOR');
      return {
        weight: Math.min(1, valid / legacyDuration),
        flags,
        source: 'valid_over_legacy_duration',
      };
    }

    flags.push('DS4_TEMPORAL_WEIGHT_UNAVAILABLE');
    return { weight: 0, flags, source: 'none' };
  }

  if (args.speedAuthority === 'C4_ONLY' || args.speedAuthority === 'C5_1_PREFERRED') {
    flags.push('DS4_TEMPORAL_WEIGHT_NON_PARTIAL_COVERAGE');
  }
  return { weight: 0, flags, source: 'none' };
}
