import {
  classifyBundleHistoricalQuality,
  classifyVsiSignalQuality,
  computeBundleSourceAdvanceStats,
  resolveVsiSignalConfidence,
  VsiSignalConfidenceLevel,
  VsiSignalQualityClassification,
} from './vsi-signal-quality.classifier';
import { VsiEmpiricalObservationStatus } from './vehicle-signal-evidence.contract';
import type { VsiProfileSignalSnapshotV1 } from './vsi-profile.types';

function baseSignal(
  overrides: Partial<VsiProfileSignalSnapshotV1> = {},
): VsiProfileSignalSnapshotV1 {
  return {
    canonicalSignalKey: 'lv_voltage',
    providerNativeSignalName: 'lowVoltageBatteryCurrentVoltage',
    declaredSupport: 'LISTED',
    empiricalObservation: VsiEmpiricalObservationStatus.OBSERVED,
    lastValidObservationAt: '2026-10-15T12:00:00.000Z',
    lastSourceTimestamp: '2026-10-15T12:00:00.000Z',
    lastProviderFetchAt: '2026-10-15T12:00:01.000Z',
    lastProvenStrictSourceAdvanceAt: null,
    strictSourceAdvanced: 'UNKNOWN',
    freshnessClassification: 'FRESH',
    evidenceProvenance: ['VEHICLE_LATEST_STATE'],
    limitations: [],
    ...overrides,
  };
}

describe('vsi-signal-quality.classifier', () => {
  it('classifies listed-but-never-observed as NEVER_OBSERVED (not unsupported)', () => {
    const quality = classifyVsiSignalQuality({
      signal: baseSignal({
        empiricalObservation: VsiEmpiricalObservationStatus.NEVER_OBSERVED,
        declaredSupport: 'LISTED',
      }),
      profileLimitations: [],
    });
    expect(quality).toBe(VsiSignalQualityClassification.NEVER_OBSERVED);
    expect(resolveVsiSignalConfidence(quality, baseSignal())).toBe(VsiSignalConfidenceLevel.LOW);
  });

  it('classifies stale empirical axis as OBSERVED_STALE', () => {
    const quality = classifyVsiSignalQuality({
      signal: baseSignal({
        empiricalObservation: VsiEmpiricalObservationStatus.OBSERVED_STALE,
        freshnessClassification: 'STALE',
      }),
      profileLimitations: [],
    });
    expect(quality).toBe(VsiSignalQualityClassification.OBSERVED_STALE);
  });

  it('classifies NOT_APPLICABLE empirical axis', () => {
    const quality = classifyVsiSignalQuality({
      signal: baseSignal({
        empiricalObservation: VsiEmpiricalObservationStatus.NOT_APPLICABLE,
      }),
      profileLimitations: [],
    });
    expect(quality).toBe(VsiSignalQualityClassification.NOT_APPLICABLE);
  });

  it('classifies provider_last_successful_fetch from fetch recency, not sensor FRESH axis', () => {
    const freshMeta = classifyVsiSignalQuality({
      signal: baseSignal({
        canonicalSignalKey: 'provider_last_successful_fetch',
        providerNativeSignalName: 'provider_last_successful_fetch',
        empiricalObservation: VsiEmpiricalObservationStatus.OBSERVED,
        freshnessClassification: 'FRESH',
        lastSourceTimestamp: null,
        lastProviderFetchAt: '2026-10-30T11:59:00.000Z',
        limitations: ['PROVIDER_FETCH_TIME_NOT_SOURCE_ADVANCE_PROOF'],
      }),
      profileLimitations: [],
    });
    expect(freshMeta).toBe(VsiSignalQualityClassification.OBSERVED_FRESH);

    const staleMeta = classifyVsiSignalQuality({
      signal: baseSignal({
        canonicalSignalKey: 'provider_last_successful_fetch',
        empiricalObservation: VsiEmpiricalObservationStatus.OBSERVED,
        freshnessClassification: 'STALE',
        lastProviderFetchAt: '2026-10-01T00:00:00.000Z',
      }),
      profileLimitations: [],
    });
    expect(staleMeta).toBe(VsiSignalQualityClassification.OBSERVED_STALE);
  });

  it('lv_voltage sensor quality path unchanged (requires sensor freshness FRESH)', () => {
    const quality = classifyVsiSignalQuality({
      signal: baseSignal({
        canonicalSignalKey: 'vehicle_speed',
        freshnessClassification: 'FRESH',
        empiricalObservation: VsiEmpiricalObservationStatus.OBSERVED,
      }),
      profileLimitations: [],
    });
    expect(quality).toBe(VsiSignalQualityClassification.OBSERVED_FRESH);
  });

  it('UNKNOWN attribution overrides optimistic quality', () => {
    const quality = classifyVsiSignalQuality({
      signal: baseSignal({ freshnessClassification: 'FRESH' }),
      profileLimitations: ['LATEST_STATE_NOT_ATTRIBUTED_TO_SOURCE_LINK'],
    });
    expect(quality).toBe(VsiSignalQualityClassification.UNKNOWN);
    expect(
      resolveVsiSignalConfidence(quality, baseSignal({ freshnessClassification: 'FRESH' })),
    ).toBe(VsiSignalConfidenceLevel.UNKNOWN);
  });

  it('bundle historical helper returns INSUFFICIENT_HISTORY when cadence samples too low', () => {
    const stats = computeBundleSourceAdvanceStats([
      new Date('2026-10-15T10:00:00Z'),
      new Date('2026-10-15T10:05:00Z'),
    ]);
    expect(stats.observedCadenceSampleCount).toBe(1);
    expect(classifyBundleHistoricalQuality(stats)).toBe(
      VsiSignalQualityClassification.INSUFFICIENT_HISTORY,
    );
  });

  it('deduplicates repeated provider timestamps when counting bundle advances', () => {
    const stats = computeBundleSourceAdvanceStats([
      new Date('2026-10-15T10:00:00Z'),
      new Date('2026-10-15T10:00:00Z'),
      new Date('2026-10-15T10:05:00Z'),
    ]);
    expect(stats.provenSourceAdvances).toBe(1);
  });

  it('handles out-of-order bundle timestamps deterministically', () => {
    const stats = computeBundleSourceAdvanceStats([
      new Date('2026-10-15T10:10:00Z'),
      new Date('2026-10-15T10:00:00Z'),
      new Date('2026-10-15T10:05:00Z'),
    ]);
    expect(stats.provenSourceAdvances).toBe(2);
    expect(stats.observedCadenceMedianSeconds).toBe(300);
  });
});
