import type { VsiSignalConfidenceLevel } from './vsi-profile.types';
import type {
  VsiRpmAnalysisReadiness,
  VsiRpmCadenceConfidenceLevel,
  VsiRpmCadenceTierDecisionCode,
  VsiRpmCadenceTierLabel,
  VsiRpmTripCoverageBand,
} from './vsi-rpm-cadence-tier.types';

export const VSI_SIGNAL_CADENCE_CONTRACT_VERSION = 'vsi-signal-cadence-v2' as const;

export type VsiCadenceRegimeKind =
  | 'POLL_BOUND_ACTIVE'
  | 'PERIODIC_RESTING_HEARTBEAT'
  | 'IRREGULAR'
  | 'INSUFFICIENT_EVIDENCE';

export type VsiCadenceObservedDensityLabel =
  | 'UNKNOWN'
  | 'NOT_APPLICABLE'
  | 'IRREGULAR'
  | 'SUB_ONE_HZ'
  | 'ONE_SECOND_BUCKETS_UNPROVEN';

export type VsiIceRpmApplicability = 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';

export type VsiHfCadenceReadStatus =
  | 'SUCCESS'
  | 'UNAVAILABLE'
  | 'QUERY_FAILED'
  | 'EMPTY'
  | 'SKIPPED';

export type VsiCadenceRegimeV2 = {
  kind: VsiCadenceRegimeKind;
  intervalMedianSeconds: number | null;
  intervalP95Seconds: number | null;
  sampleCount: number;
  confidence: VsiSignalConfidenceLevel;
};

export type VsiActiveRpmProfileLabel = 'RPM_1HZ' | 'RPM_STANDARD' | 'UNKNOWN';

export type VsiActiveRpmProfileResolutionV1 = {
  contractVersion: 'vsi-active-rpm-profile-v1';
  activeProfile: VsiActiveRpmProfileLabel;
  evaluatedTripIds: string[];
  qualifyingTripCount: number;
  agreementRatio: number | null;
  classificationDecisionCode: string;
  classificationDecisionSummary: string;
  tripClassifications: readonly {
    tripId: string;
    endMs: number;
    profile: VsiActiveRpmProfileLabel;
    intervalMedianSeconds: number | null;
    intervalP95Seconds: number | null;
    intervalCount: number;
    rpmPointCount: number;
    fractionIntervalsLe2s: number | null;
    decisionCode: string;
  }[];
  profileSemanticFingerprint: string;
};

export const VSI_RPM_CADENCE_TIER_RESOLUTION_CONTRACT_VERSION =
  'vsi-rpm-cadence-tier-resolution-v1' as const;

/** Operational multi-cadence tier block (Phase 2); does not affect cadenceSemanticFingerprint. */
export type VsiRpmCadenceTierTripClassificationV1 = {
  tripId: string;
  endMs: number;
  tier: VsiRpmCadenceTierLabel;
  cadenceConfidence: VsiRpmCadenceConfidenceLevel | null;
  tripCoverageBand: VsiRpmTripCoverageBand | null;
  analysisReadiness: VsiRpmAnalysisReadiness;
  decisionCode: VsiRpmCadenceTierDecisionCode;
  intervalEvidenceUsed: {
    rpmPointCount: number;
    activeIntervalCount: number;
    tripDurationSeconds: number;
  };
  p50ActiveSeconds: number | null;
  p75ActiveSeconds: number | null;
  p90ActiveSeconds: number | null;
  activeSpanRatio: number | null;
  activeDensityVsTier: number | null;
  tierPuritySharePlusOne: number | null;
  longestSequenceIntervals: number;
};

export type VsiRpmCadenceTierRollingSummaryV1 = {
  tier: VsiRpmCadenceTierLabel | null;
  agreementRatio: number | null;
  classificationDecisionCode: string;
  classificationDecisionSummary: string;
  sufficientEvidence: boolean;
};

export type VsiRpmCadenceTierResolutionV1 = {
  contractVersion: typeof VSI_RPM_CADENCE_TIER_RESOLUTION_CONTRACT_VERSION;
  evaluatedTripIds: string[];
  tripClassifications: readonly VsiRpmCadenceTierTripClassificationV1[];
  rollingVehicleTierSummary: VsiRpmCadenceTierRollingSummaryV1 | null;
  provenance: string[];
  /** Latest HF observation timestamp used for tier resolution (ISO-8601). */
  evidenceObservedAt: string | null;
};

export type VsiSignalCadenceIntelligenceV2 = {
  contractVersion: typeof VSI_SIGNAL_CADENCE_CONTRACT_VERSION;
  evidenceConfidence: VsiSignalConfidenceLevel;
  provenance: string[];
  limitations: string[];
  observedSampleCount: number;
  distinctTimestampCount: number;
  intervalMedianSeconds: number | null;
  intervalP95Seconds: number | null;
  maxIntraWindowGapSeconds: number | null;
  activeWindowCoverageRatio: number | null;
  finalizedTripCount: number | null;
  regimes: VsiCadenceRegimeV2[];
  observedDensityLabel: VsiCadenceObservedDensityLabel;
  /** Rolling-trip resolver for the active provider source link (not 14 d pooled). */
  activeRpmProfile?: VsiActiveRpmProfileResolutionV1;
  /** Multi-cadence effective resolution tiers (operational-only; no semantic fingerprint impact). */
  rpmCadenceTierResolution?: VsiRpmCadenceTierResolutionV1;
  /** Observed R1/LV standby transmission cadence (not native device config). */
  lvStandbyTransmissionProfile?: VsiLvStandbyTransmissionProfileV1;
  /** Stable semantic identity for cadence dimension (excludes raw counters). */
  cadenceSemanticFingerprint: string;
};

export type VsiRpmCadenceSamplePoint = {
  recordedAtMs: number;
  value: number;
  tripId?: string;
};

export type VsiRpmCadenceTripWindow = {
  tripId: string;
  startMs: number;
  endMs: number;
};

export type VsiRpmCadenceEvidenceInput = {
  iceRpmApplicability: VsiIceRpmApplicability;
  tripWindows: readonly VsiRpmCadenceTripWindow[];
  points: readonly VsiRpmCadenceSamplePoint[];
  provenance: string[];
  hfReadStatus: VsiHfCadenceReadStatus;
  /** Fail-closed HF source-link attribution limitations (P1-F). */
  attributionLimitations?: readonly string[];
};

export type VsiLvCadenceEvidencePoint = {
  observedAtMs: number;
  providerTimestampMs: number | null;
};

export type VsiLvCadenceEvidenceInput = {
  points: readonly VsiLvCadenceEvidencePoint[];
  provenance: string[];
  linkActivatedAtMs: number;
  linkDeactivatedAtMs: number | null;
};

export type VsiLvStandbyTransmissionMeasurementPoint = {
  observedAtMs: number;
  providerTimestampMs: number;
  providerObservationOutcome: string | null;
};

export type VsiLvStandbyTransmissionEvidenceLoadIntegrity = {
  sourceLinkAttribution: 'VERIFIED' | 'FAILED';
  sourceLinkAttributionCode: string;
  lvMeasurementWindowComplete: boolean;
  tripHistoryWindowComplete: boolean;
  activeOrIncompleteTripBlocksClassification: boolean;
};

export type VsiLvStandbyTransmissionEvidenceInput = {
  contractVersion: 'vsi-lv-standby-transmission-evidence-v1';
  points: readonly VsiLvStandbyTransmissionMeasurementPoint[];
  tripWindows: readonly VsiRpmCadenceTripWindow[];
  linkActivatedAtMs: number;
  linkDeactivatedAtMs: number | null;
  evidenceWindowDays: number;
  windowStartMs: number;
  windowEndMs: number;
  provenance: string[];
  loadIntegrity: VsiLvStandbyTransmissionEvidenceLoadIntegrity;
};

export type VsiLvStandbyTransmissionProfileLabel =
  | 'LV_8H_OBSERVED'
  | 'LV_24H_OBSERVED'
  | 'UNKNOWN';

export type VsiLvStandbyTransmissionProfileV1 = {
  contractVersion: 'vsi-lv-standby-transmission-profile-v1';
  profile: VsiLvStandbyTransmissionProfileLabel;
  classificationDecisionCode: string;
  evidenceConfidence: VsiSignalConfidenceLevel;
  qualifyingPairCount: number;
  independentRestPeriodCount: number;
  evidenceWindow: {
    days: number;
    fromMs: number;
    toMs: number;
  };
  provenance: string[];
  limitations: string[];
  profileSemanticFingerprint: string;
};
