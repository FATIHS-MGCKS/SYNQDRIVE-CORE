import type { VsiProfileSignalSnapshotV1 } from './vsi-profile.types';
import { VsiEmpiricalObservationStatus } from './vehicle-signal-evidence.contract';

export const VSI_SIGNAL_FINGERPRINT_CONTRACT_VERSION = 'vsi-signal-fingerprint-v1' as const;

export const VsiSignalQualityClassification = {
  OBSERVED_FRESH: 'OBSERVED_FRESH',
  OBSERVED_STALE: 'OBSERVED_STALE',
  OBSERVED_INTERMITTENT: 'OBSERVED_INTERMITTENT',
  NEVER_OBSERVED: 'NEVER_OBSERVED',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  INSUFFICIENT_HISTORY: 'INSUFFICIENT_HISTORY',
  UNKNOWN: 'UNKNOWN',
} as const;

export type VsiSignalQualityClassification =
  (typeof VsiSignalQualityClassification)[keyof typeof VsiSignalQualityClassification];

export const VsiSignalConfidenceLevel = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  UNKNOWN: 'UNKNOWN',
} as const;

export type VsiSignalConfidenceLevel =
  (typeof VsiSignalConfidenceLevel)[keyof typeof VsiSignalConfidenceLevel];

export const VSI_SIGNAL_CADENCE_MIN_SAMPLES = 3;

export type VsiBundleHistoricalEvidence = {
  bundleSourceTimestamps: readonly Date[];
};

export type VsiBundleAdvanceFingerprint = {
  provenSourceAdvances: number;
  observedCadenceMedianSeconds: number | null;
  observedCadenceSampleCount: number;
  maxStaleIntervalSeconds: number | null;
};

export type VsiSignalQualityInput = {
  signal: VsiProfileSignalSnapshotV1;
  profileLimitations: readonly string[];
};

function hasAttributionBlocker(limitations: readonly string[]): boolean {
  return limitations.some((l) =>
    [
      'LATEST_STATE_NOT_ATTRIBUTED_TO_SOURCE_LINK',
      'MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS',
      'PROVIDER_IDENTITY_MISMATCH_DECLARED_CATALOG_DIMO_ONLY',
    ].includes(l),
  );
}

function medianSeconds(deltas: number[]): number | null {
  if (deltas.length === 0) return null;
  const sorted = [...deltas].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Bundle-level source timestamp advancement (provider_source_timestamp only). */
export function computeBundleSourceAdvanceStats(
  bundleSourceTimestamps: readonly Date[],
): VsiBundleAdvanceFingerprint {
  const sorted = [...bundleSourceTimestamps].sort((a, b) => a.getTime() - b.getTime());
  let advances = 0;
  const deltas: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]!.getTime();
    const cur = sorted[i]!.getTime();
    if (cur > prev) {
      advances += 1;
      deltas.push((cur - prev) / 1000);
    }
  }
  return {
    provenSourceAdvances: advances,
    observedCadenceMedianSeconds: medianSeconds(deltas),
    observedCadenceSampleCount: deltas.length,
    maxStaleIntervalSeconds: deltas.length ? Math.max(...deltas) : null,
  };
}

/**
 * Current-observation quality only. Historical regularity is not inferred from bundle ledger.
 */
export function classifyVsiSignalQuality(input: VsiSignalQualityInput): VsiSignalQualityClassification {
  const { signal, profileLimitations } = input;

  if (hasAttributionBlocker([...signal.limitations, ...profileLimitations])) {
    return VsiSignalQualityClassification.UNKNOWN;
  }

  if (signal.empiricalObservation === VsiEmpiricalObservationStatus.NOT_APPLICABLE) {
    return VsiSignalQualityClassification.NOT_APPLICABLE;
  }

  if (signal.canonicalSignalKey === 'provider_last_successful_fetch') {
    if (signal.empiricalObservation === VsiEmpiricalObservationStatus.NEVER_OBSERVED) {
      return VsiSignalQualityClassification.NEVER_OBSERVED;
    }
    if (!signal.lastProviderFetchAt) {
      return VsiSignalQualityClassification.UNKNOWN;
    }
    if (signal.freshnessClassification === 'STALE') {
      return VsiSignalQualityClassification.OBSERVED_STALE;
    }
    if (
      signal.empiricalObservation === VsiEmpiricalObservationStatus.OBSERVED &&
      signal.freshnessClassification === 'FRESH'
    ) {
      return VsiSignalQualityClassification.OBSERVED_FRESH;
    }
    return VsiSignalQualityClassification.UNKNOWN;
  }

  if (signal.empiricalObservation === VsiEmpiricalObservationStatus.NEVER_OBSERVED) {
    return VsiSignalQualityClassification.NEVER_OBSERVED;
  }

  if (signal.empiricalObservation === VsiEmpiricalObservationStatus.OBSERVED_STALE) {
    return VsiSignalQualityClassification.OBSERVED_STALE;
  }

  if (signal.freshnessClassification === 'STALE') {
    return VsiSignalQualityClassification.OBSERVED_STALE;
  }

  if (
    signal.empiricalObservation === VsiEmpiricalObservationStatus.OBSERVED &&
    signal.freshnessClassification === 'FRESH'
  ) {
    return VsiSignalQualityClassification.OBSERVED_FRESH;
  }

  if (signal.empiricalObservation === VsiEmpiricalObservationStatus.OBSERVED) {
    return VsiSignalQualityClassification.UNKNOWN;
  }

  return VsiSignalQualityClassification.UNKNOWN;
}

export function classifyBundleHistoricalQuality(
  bundle: VsiBundleAdvanceFingerprint,
): VsiSignalQualityClassification {
  if (bundle.observedCadenceSampleCount < VSI_SIGNAL_CADENCE_MIN_SAMPLES) {
    return VsiSignalQualityClassification.INSUFFICIENT_HISTORY;
  }
  return VsiSignalQualityClassification.UNKNOWN;
}

export function resolveVsiSignalConfidence(
  quality: VsiSignalQualityClassification,
  signal: VsiProfileSignalSnapshotV1,
): VsiSignalConfidenceLevel {
  if (quality === VsiSignalQualityClassification.UNKNOWN) {
    return VsiSignalConfidenceLevel.UNKNOWN;
  }
  if (quality === VsiSignalQualityClassification.NEVER_OBSERVED) {
    return VsiSignalConfidenceLevel.LOW;
  }
  if (quality === VsiSignalQualityClassification.NOT_APPLICABLE) {
    return VsiSignalConfidenceLevel.LOW;
  }
  if (quality === VsiSignalQualityClassification.INSUFFICIENT_HISTORY) {
    return VsiSignalConfidenceLevel.LOW;
  }
  if (
    quality === VsiSignalQualityClassification.OBSERVED_FRESH &&
    signal.evidenceProvenance.includes('VEHICLE_LATEST_STATE') &&
    signal.lastSourceTimestamp != null
  ) {
    return VsiSignalConfidenceLevel.HIGH;
  }
  return VsiSignalConfidenceLevel.MEDIUM;
}
