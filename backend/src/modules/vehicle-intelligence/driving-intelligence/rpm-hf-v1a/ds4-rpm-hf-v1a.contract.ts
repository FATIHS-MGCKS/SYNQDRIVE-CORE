import type { HfTripRpmPointsReadResult } from '@modules/clickhouse/clickhouse-hf.types';
import type {
  VsiActiveRpmProfileLabel,
  VsiActiveRpmProfileResolutionV1,
  VsiIceRpmApplicability,
  VsiRpmCadenceTierResolutionV1,
} from '../../vehicle-signal-intelligence/vsi-profile-cadence.types';
import type { Ds4RpmHfTierEvidenceV1 } from '../ds4-rpm-hf-tier-evidence.types';

export const DS4_RPM_HF_V1A_CONTRACT_VERSION = 'ds4-rpm-hf-v1a-v1' as const;

export type Ds4RpmHfV1aProcessingStatus =
  | 'ENABLED'
  | 'DISABLED_PROFILE'
  | 'DISABLED_NO_HF_DATA'
  | 'DISABLED_NOT_APPLICABLE'
  | 'DISABLED_CH_UNAVAILABLE'
  | 'DISABLED_TENANT_SCOPE'
  | 'DISABLED_TRIP_NOT_CLASSIFIED'
  | 'DISABLED_TRIP_IDENTITY'
  | 'DISABLED_INCOMPLETE_HF_READ';

export type Ds4RpmHfV1aCompletenessLabel =
  | 'COMPLETE'
  | 'INCOMPLETE_MORE_POINTS_AVAILABLE'
  | 'EMPTY'
  | 'NOT_READ';

export type Ds4RpmHfV1aGapDescriptor = {
  /** Gap start (last observed point time). */
  fromRecordedAtIso: string;
  /** Gap end (next observed point time). */
  toRecordedAtIso: string;
  gapDurationSeconds: number;
  /** Descriptive only — not engine stop inference. */
  interpretationPolicy: 'MISSING_DATA_ONLY';
};

export type Ds4RpmHfV1aObservedIntervalStats = {
  intervalCount: number;
  intervalMedianSeconds: number | null;
  intervalP95Seconds: number | null;
  minIntervalSeconds: number | null;
  maxIntervalSeconds: number | null;
};

export type Ds4RpmHfV1aDataQualityV1 = {
  contractVersion: 'ds4-rpm-hf-data-quality-v1';
  validPointCount: number;
  invalidValueCount: number;
  duplicateTimestampCount: number;
  earliestRecordedAtIso: string | null;
  latestRecordedAtIso: string | null;
  observedIntervals: Ds4RpmHfV1aObservedIntervalStats;
  identifiedGaps: Ds4RpmHfV1aGapDescriptor[];
  completenessLabel: Ds4RpmHfV1aCompletenessLabel;
  totalMatchingCount: number | null;
  returnedPointCount: number;
  readLimit: number;
  readOffset: number;
  bucketSemanticsNote: 'DIMO_1S_AVG_BUCKETS_NOT_OEM_CAN_HZ';
  gapInterpretationPolicy: 'MISSING_POINTS_NOT_ENGINE_STOP';
};

export type Ds4RpmHfV1aAdmissionV1 = {
  contractVersion: 'ds4-rpm-hf-admission-v1';
  iceRpmApplicability: VsiIceRpmApplicability;
  /** Per-trip VSI classification when present in rolling window. */
  tripRpmProfile: VsiActiveRpmProfileLabel | 'UNCLASSIFIED';
  /** Vehicle-level active profile (informational — not used to admit historical trips). */
  vehicleActiveRpmProfile: VsiActiveRpmProfileLabel | null;
  processingStatus: Ds4RpmHfV1aProcessingStatus;
  processingAllowed: boolean;
  reasonCode: string;
  reasonSummary: string;
};

export type Ds4RpmHfV1aTripInputV1 = {
  contractVersion: typeof DS4_RPM_HF_V1A_CONTRACT_VERSION;
  organizationId: string;
  vehicleId: string;
  tripId: string;
  providerSourceLinkId: string | null;
  tripStartIso: string;
  tripEndIso: string;
  admission: Ds4RpmHfV1aAdmissionV1;
  dataQuality: Ds4RpmHfV1aDataQualityV1;
  clickHouseRead: Pick<
    HfTripRpmPointsReadResult,
    'status' | 'available' | 'degradedReason' | 'tenantScopeViolation'
  >;
  /** Valid RPM points when processing allowed and read succeeded. */
  rpmPoints: Array<{ recordedAtIso: string; valueRpm: number }>;
  vsiActiveRpmProfileSnapshot: VsiActiveRpmProfileResolutionV1 | null;
  /** Link-scoped operational tier block (Phase 2); not used for legacy V1A admission. */
  vsiRpmCadenceTierSnapshot: VsiRpmCadenceTierResolutionV1 | null;
  /** Per-trip tier row + freshness binding for tier-aware V1B only. */
  tierEvidence: Ds4RpmHfTierEvidenceV1 | null;
  readOnly: true;
  productionActivationForbidden: true;
};
