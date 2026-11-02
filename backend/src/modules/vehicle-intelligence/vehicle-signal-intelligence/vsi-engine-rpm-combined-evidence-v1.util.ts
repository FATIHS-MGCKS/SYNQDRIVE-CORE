/**
 * Derived engine_rpm availability across Lane A (VLS snapshot) and Lane B (HF cadence).
 * Does not mutate lane-specific fields or cadence classification.
 */
import type { VsiProfileSignalFingerprintV1 } from './vsi-profile.types';

export const VSI_RPM_COMBINED_EVIDENCE_CONTRACT_V1 = 'vsi-rpm-combined-evidence-v1' as const;

export type VsiRpmCombinedEvidenceAvailabilityV1 =
  | 'PROVEN_LIVE'
  | 'PROVEN_HISTORICAL_ONLY'
  | 'NOT_PROVEN'
  | 'NOT_APPLICABLE';

export const VSI_RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN =
  'RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN';

const PROFILE_ATTRIBUTION_BLOCKERS = new Set([
  'MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS',
  'LATEST_STATE_NOT_ATTRIBUTED_TO_SOURCE_LINK',
  'PROVIDER_IDENTITY_MISMATCH_DECLARED_CATALOG_DIMO_ONLY',
]);

export type VsiRpmCombinedEvidenceLaneSnapshotV1 = {
  empiricalObservation: string;
  freshnessClassification: string | null;
  lastValidObservationAt: string | null;
  qualityClassification: string | null;
};

export type VsiRpmCombinedEvidenceLaneCadenceV1 = {
  observedSampleCount: number | null;
  finalizedTripCount: number | null;
  activeRpmProfile: string | null;
  provenance: string[];
  limitations: string[];
  tripClassificationCount: number;
};

export type VsiRpmCombinedEvidenceInputV1 = {
  rpmApplicability: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';
  powertrainApplicability: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN' | null;
  profileLimitations: string[];
  snapshot: VsiRpmCombinedEvidenceLaneSnapshotV1;
  cadence: VsiRpmCombinedEvidenceLaneCadenceV1;
};

export function isRpmCombinedNotApplicable(input: VsiRpmCombinedEvidenceInputV1): boolean {
  return (
    input.rpmApplicability === 'NOT_APPLICABLE' ||
    input.powertrainApplicability === 'NOT_APPLICABLE' ||
    input.snapshot.empiricalObservation === 'NOT_APPLICABLE'
  );
}

export function isRpmSnapshotLiveProven(input: VsiRpmCombinedEvidenceInputV1): boolean {
  const obs = input.snapshot.empiricalObservation;
  if (obs !== 'OBSERVED') {
    return false;
  }
  if (input.snapshot.freshnessClassification !== 'FRESH') {
    return false;
  }
  return Boolean(input.snapshot.lastValidObservationAt);
}

export function isRpmHfHistoricalAttributionProven(input: VsiRpmCombinedEvidenceInputV1): boolean {
  if (input.profileLimitations.some((l) => PROFILE_ATTRIBUTION_BLOCKERS.has(l))) {
    return false;
  }
  if (input.cadence.limitations.includes(VSI_RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN)) {
    return false;
  }
  const samples = input.cadence.observedSampleCount;
  if (samples == null || samples <= 0) {
    return false;
  }
  const hasHfProvenance = input.cadence.provenance.some(
    (p) => p.includes('CLICKHOUSE') || p.includes('HF') || p.includes('TELEMETRY'),
  );
  if (!hasHfProvenance) {
    return false;
  }
  const hasWindow =
    (input.cadence.finalizedTripCount ?? 0) > 0 || input.cadence.tripClassificationCount > 0;
  if (!hasWindow) {
    return false;
  }
  return true;
}

export function resolveVsiRpmCombinedEvidenceAvailabilityV1(
  input: VsiRpmCombinedEvidenceInputV1,
): {
  contractVersion: typeof VSI_RPM_COMBINED_EVIDENCE_CONTRACT_V1;
  availability: VsiRpmCombinedEvidenceAvailabilityV1;
  limitations: string[];
} {
  if (isRpmCombinedNotApplicable(input)) {
    return {
      contractVersion: VSI_RPM_COMBINED_EVIDENCE_CONTRACT_V1,
      availability: 'NOT_APPLICABLE',
      limitations: [],
    };
  }

  const limitations: string[] = [];
  if (isRpmSnapshotLiveProven(input)) {
    return {
      contractVersion: VSI_RPM_COMBINED_EVIDENCE_CONTRACT_V1,
      availability: 'PROVEN_LIVE',
      limitations,
    };
  }

  if (isRpmHfHistoricalAttributionProven(input)) {
    return {
      contractVersion: VSI_RPM_COMBINED_EVIDENCE_CONTRACT_V1,
      availability: 'PROVEN_HISTORICAL_ONLY',
      limitations,
    };
  }

  if (
    input.cadence.observedSampleCount != null &&
    input.cadence.observedSampleCount > 0 &&
    !isRpmHfHistoricalAttributionProven(input)
  ) {
    limitations.push(VSI_RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN);
  }

  return {
    contractVersion: VSI_RPM_COMBINED_EVIDENCE_CONTRACT_V1,
    availability: 'NOT_PROVEN',
    limitations,
  };
}

export function buildVsiRpmCombinedEvidenceInputFromProfileSignal(input: {
  rpmApplicability: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';
  profileLimitations: string[];
  signal: VsiProfileSignalFingerprintV1;
}): VsiRpmCombinedEvidenceInputV1 {
  const cadence = input.signal.cadenceIntelligence;
  const active = cadence?.activeRpmProfile;
  const tripClassifications = active?.tripClassifications;
  return {
    rpmApplicability: input.rpmApplicability,
    powertrainApplicability: input.signal.powertrainApplicability ?? null,
    profileLimitations: input.profileLimitations,
    snapshot: {
      empiricalObservation: input.signal.empiricalObservation,
      freshnessClassification: input.signal.freshnessClassification,
      lastValidObservationAt: input.signal.lastValidObservationAt,
      qualityClassification: input.signal.qualityClassification,
    },
    cadence: {
      observedSampleCount:
        cadence?.observedSampleCount ?? cadence?.distinctTimestampCount ?? null,
      finalizedTripCount: cadence?.finalizedTripCount ?? null,
      activeRpmProfile: active?.activeProfile ?? null,
      provenance: cadence?.provenance ?? [],
      limitations: cadence?.limitations ?? [],
      tripClassificationCount: Array.isArray(tripClassifications)
        ? tripClassifications.length
        : 0,
    },
  };
}
