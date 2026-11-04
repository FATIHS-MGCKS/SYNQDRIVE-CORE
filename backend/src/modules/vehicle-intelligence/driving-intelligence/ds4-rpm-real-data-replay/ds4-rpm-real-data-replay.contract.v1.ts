import type { DiV0MotionCoreShadowPayloadV1 } from '../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import type { Ds4RpmHfV1aTripInputV1 } from '../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';
import type { Ds4RpmHfV1bShadowResultV1 } from '../rpm-hf-v1b/ds4-rpm-hf-v1b.contract';
import type { Ds4RpmShadowCorrelationTripReportV1 } from '../ds4-rpm-shadow-correlation/ds4-rpm-shadow-correlation-v1.contract';
import type {
  Ds4RpmRealDataReferenceCohortVehicleLabel,
  Ds4RpmRealDataSourceEligibilityResultV1,
} from './ds4-rpm-real-data-source-eligibility.contract.v1';

export const DS4_RPM_REAL_DATA_REPLAY_EXECUTOR_CONTRACT_VERSION =
  'ds4-rpm-real-data-replay-executor-v1' as const;

/** Offline-only boundary — no production I/O in PR-B2. */
export type Ds4RpmRealDataExecutionBoundaryV1 =
  | 'OFFLINE_INJECTED_BUNDLE_ONLY'
  | 'OWNER_AUTHORIZED_PRODUCTION_READ_NOT_IMPLEMENTED';

export type Ds4RpmRealDataCanSpeedObservationV1 = {
  recordedAtIso: string;
  valueKmh: number;
};

/**
 * Explicitly supplied offline evidence bundle.
 * `dimoVehicleRawJson` is the only permitted source for telemetry family resolution.
 */
export type Ds4RpmRealDataOfflineInputBundleV1 = {
  contractVersion: typeof DS4_RPM_REAL_DATA_REPLAY_EXECUTOR_CONTRACT_VERSION;
  bundleId: string;
  executionBoundary: 'OFFLINE_INJECTED_BUNDLE_ONLY';
  /** Must remain false in development, tests, and PR-B2 CI. Never opens production I/O. */
  ownerAuthorizedProductionExecutionDeclared: false;
  cohortVehicleLabel: Ds4RpmRealDataReferenceCohortVehicleLabel;
  organizationId: string;
  vehicleId: string;
  tripId: string;
  providerSourceLinkId: string;
  dimoVehicleRawJson: unknown;
  dimoQueryFromIso: string;
  dimoQueryToIso: string;
  dimoBucketIntervalSeconds: 1;
  speedCoBucketedWithRpm: boolean;
  motionRunId: string;
  motionPayload: DiV0MotionCoreShadowPayloadV1;
  tripInput: Ds4RpmHfV1aTripInputV1;
  v1bRunId: string;
  v1bResult: Ds4RpmHfV1bShadowResultV1 | null;
  canSpeedObservations: readonly Ds4RpmRealDataCanSpeedObservationV1[];
  scenarioLabel: string | null;
};

export type Ds4RpmRealDataReplayExecutorAbstainReason =
  | 'PRODUCTION_EXECUTION_BOUNDARY_VIOLATION'
  | 'BUNDLE_IDENTITY_BINDING_FAILED'
  | 'SOURCE_FAMILY_RAWJSON_MISMATCH'
  | 'SOURCE_FAMILY_UNKNOWN'
  | 'ELIGIBILITY_BLOCKED'
  | 'ELIGIBILITY_NOT_APPLICABLE'
  | 'SHADOW_PROVENANCE_GATE_FAILED'
  | 'OFFLINE_BUNDLE_ONLY';

export type Ds4RpmRealDataReplayTripArtifactV1 = {
  contractVersion: typeof DS4_RPM_REAL_DATA_REPLAY_EXECUTOR_CONTRACT_VERSION;
  bundleId: string;
  inputFingerprint: string;
  eligibility: Ds4RpmRealDataSourceEligibilityResultV1;
  resolvedTelemetrySourceFamily: string;
  abstainReasons: readonly Ds4RpmRealDataReplayExecutorAbstainReason[];
  shadowTripReport: Ds4RpmShadowCorrelationTripReportV1 | null;
  unsupportedScientificClaims: readonly string[];
};

export type Ds4RpmRealDataResearchReportV1 = {
  contractVersion: typeof DS4_RPM_REAL_DATA_REPLAY_EXECUTOR_CONTRACT_VERSION;
  reportId: string;
  generatedAtIso: string;
  codeSha: string;
  executionBoundary: Ds4RpmRealDataExecutionBoundaryV1;
  inputBundleFingerprints: readonly string[];
  eligibilityCounts: {
    eligible: number;
    blocked: number;
    unproven: number;
    notApplicable: number;
  };
  contextClassificationTotals: Record<string, number>;
  sourceFamilyDistribution: Record<string, number>;
  localCadenceTierDistribution: Record<string, number>;
  alignmentStabilityDistribution: Record<string, number>;
  abstentionReasonHistogram: Record<string, number>;
  gapDeficiencySecondsSum: number;
  gapDeficiencyEventCount: number;
  tripArtifacts: readonly Ds4RpmRealDataReplayTripArtifactV1[];
  unsupportedScientificClaims: readonly string[];
};
