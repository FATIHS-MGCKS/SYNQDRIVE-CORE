import {
  extractTemporalDetailFromShadowPayload,
  resolveDs4TemporalTripWeight,
} from './tire-wear-v3-ds4-payload.util';
import { computeSetupDs4Severity, tripTemporalWeight } from './tire-wear-v3-dynamic.math';

/** Shape from production tire-ds4-shadow-input-v1.1.1 (read-only sample). */
const LIVE_PARTIAL_PAYLOAD = {
  schemaVersion: 3,
  tripDistanceKm: 3,
  speedAuthority: 'C5_1_PREFERRED',
  temporalCoverage: 'PARTIAL',
  acceleration: {
    okM3JPerKgPerKmSum: 26.05144032921811,
    okCount: 4,
  },
  deceleration: {
    okM3JPerKgPerKmSum: 0,
    okCount: 0,
  },
  temporalCoverageDetail: {
    verified: false,
    tripWindowSeconds: 679,
    validDrivingSeconds: 404,
    confirmedStationarySeconds: 2,
    accountableFraction: 0.5979381443298969,
    labelledFraction: 0.9985272459499264,
  },
} as const;

describe('tire-wear-v3-ds4-payload temporal weight (C5)', () => {
  it('extracts live adapter fields (tripWindowSeconds, accountableFraction)', () => {
    const detail = extractTemporalDetailFromShadowPayload(LIVE_PARTIAL_PAYLOAD);
    expect(detail.tripWindowSeconds).toBe(679);
    expect(detail.validDrivingSeconds).toBe(404);
    expect(detail.accountableFraction).toBeCloseTo(0.598, 3);
    expect(detail.tripDurationSeconds).toBeNull();
  });

  it('prefers accountableFraction over valid/tripWindow for PARTIAL live payload', () => {
    const detail = extractTemporalDetailFromShadowPayload(LIVE_PARTIAL_PAYLOAD);
    const resolved = resolveDs4TemporalTripWeight({
      ds4ReadStatus: 'SUCCEEDED',
      temporalCoverage: 'PARTIAL',
      m3JPerKgPerKm: 26.05,
      detail,
      speedAuthority: 'C5_1_PREFERRED',
    });
    expect(resolved.source).toBe('accountable_fraction');
    expect(resolved.weight).toBeCloseTo(0.5979381443298969, 6);
    expect(resolved.weight).not.toBeCloseTo(0.5, 2);
  });

  it('supports legacy payload with observedTripDurationSeconds', () => {
    const legacy = {
      temporalCoverageDetail: {
        validDrivingSeconds: 100,
        observedTripDurationSeconds: 200,
      },
    };
    const detail = extractTemporalDetailFromShadowPayload(legacy);
    expect(detail.tripDurationSeconds).toBe(200);
    const resolved = resolveDs4TemporalTripWeight({
      ds4ReadStatus: 'SUCCEEDED',
      temporalCoverage: 'PARTIAL',
      m3JPerKgPerKm: 10,
      detail,
    });
    expect(resolved.source).toBe('valid_over_legacy_duration');
    expect(resolved.weight).toBe(0.5);
  });

  it('returns zero weight when duration missing (no silent 0.5 default)', () => {
    const detail = extractTemporalDetailFromShadowPayload({
      temporalCoverageDetail: {
        validDrivingSeconds: 50,
        tripWindowSeconds: 0,
      },
    });
    const resolved = resolveDs4TemporalTripWeight({
      ds4ReadStatus: 'SUCCEEDED',
      temporalCoverage: 'PARTIAL',
      m3JPerKgPerKm: 5,
      detail,
    });
    expect(resolved.weight).toBe(0);
    expect(resolved.flags).toContain('DS4_TEMPORAL_WEIGHT_UNAVAILABLE');
  });

  it('rejects invalid accountableFraction without falling back to full coverage', () => {
    const detail = extractTemporalDetailFromShadowPayload({
      temporalCoverageDetail: {
        accountableFraction: 1.5,
        validDrivingSeconds: 100,
        tripWindowSeconds: 200,
      },
    });
    expect(detail.accountableFraction).toBeNull();
    const resolved = resolveDs4TemporalTripWeight({
      ds4ReadStatus: 'SUCCEEDED',
      temporalCoverage: 'PARTIAL',
      m3JPerKgPerKm: 5,
      detail,
    });
    expect(resolved.source).toBe('valid_over_trip_window');
    expect(resolved.weight).toBe(0.5);
  });

  it('handles null accountableFraction with valid/tripWindow fallback', () => {
    const detail = extractTemporalDetailFromShadowPayload({
      temporalCoverageDetail: {
        accountableFraction: null,
        validDrivingSeconds: 80,
        tripWindowSeconds: 160,
      },
    });
    const resolved = resolveDs4TemporalTripWeight({
      ds4ReadStatus: 'SUCCEEDED',
      temporalCoverage: 'PARTIAL',
      m3JPerKgPerKm: 12,
      detail,
    });
    expect(resolved.source).toBe('valid_over_trip_window');
    expect(resolved.weight).toBe(0.5);
  });

  it('C4_ONLY and C5.1 PARTIAL rows use same weight rules', () => {
    const baseDetail = extractTemporalDetailFromShadowPayload(LIVE_PARTIAL_PAYLOAD);
    for (const speedAuthority of ['C4_ONLY', 'C5_1_PREFERRED'] as const) {
      const w = resolveDs4TemporalTripWeight({
        ds4ReadStatus: 'SUCCEEDED',
        temporalCoverage: 'PARTIAL',
        m3JPerKgPerKm: 20,
        detail: baseDetail,
        speedAuthority,
      });
      expect(w.weight).toBeCloseTo(0.5979381443298969, 6);
    }
  });

  it('aggregates setup coverage using resolved weight (live payload row)', () => {
    const detail = extractTemporalDetailFromShadowPayload(LIVE_PARTIAL_PAYLOAD);
    const row = {
      ledgerId: 'l-live',
      distanceKm: 100,
      ds4ReadStatus: 'SUCCEEDED',
      temporalCoverage: 'PARTIAL',
      m3JPerKgPerKm: 26.05,
      validDrivingSeconds: detail.validDrivingSeconds,
      tripDurationSeconds: null,
      temporalDetail: detail,
      speedAuthority: 'C5_1_PREFERRED',
      temporalTripWeight: resolveDs4TemporalTripWeight({
        ds4ReadStatus: 'SUCCEEDED',
        temporalCoverage: 'PARTIAL',
        m3JPerKgPerKm: 26.05,
        detail,
        speedAuthority: 'C5_1_PREFERRED',
      }).weight,
    };
    expect(tripTemporalWeight(row)).toBeCloseTo(0.598, 3);
    const severity = computeSetupDs4Severity([row], 1000);
    expect(severity.coverage).toBeCloseTo(0.0598, 3);
  });
});
