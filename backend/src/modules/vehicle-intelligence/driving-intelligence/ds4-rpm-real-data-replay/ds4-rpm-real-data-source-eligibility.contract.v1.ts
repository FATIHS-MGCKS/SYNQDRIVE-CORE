import type { TelemetrySourceFamily } from '../../telemetry-source-family';
import type { Ds4RpmShadowCorrelationSourceTimestampPhase } from '../ds4-rpm-shadow-correlation/ds4-rpm-shadow-correlation-v1.contract';

export const DS4_RPM_REAL_DATA_SOURCE_ELIGIBILITY_CONTRACT_VERSION =
  'ds4-rpm-real-data-source-eligibility-v1' as const;

/** Research cohort label — not a production vehicleId. */
export type Ds4RpmRealDataReferenceCohortVehicleLabel =
  | 'AUDI_A4'
  | 'VW_ARTEON'
  | 'VW_TIGUAN'
  | 'TESLA_MODEL_3';

export type Ds4RpmRealDataEligibilityVerdict =
  | 'ELIGIBLE'
  | 'BLOCKED'
  | 'UNPROVEN'
  | 'NOT_APPLICABLE';

export type Ds4RpmRealDataEvidenceAttestationLevel =
  | 'PROVEN_FROM_DIMO_IDENTITY'
  | 'PROVEN_FROM_AUTHORIZED_READ'
  | 'UNPROVEN'
  | 'NOT_COLLECTED';

/**
 * Bounded attestation bundle for read-only eligibility audit.
 * No field may be inferred from vehicle make/model or hardwareType.
 */
export type Ds4RpmRealDataSourceEligibilityInputV1 = {
  contractVersion: typeof DS4_RPM_REAL_DATA_SOURCE_ELIGIBILITY_CONTRACT_VERSION;
  cohortVehicleLabel: Ds4RpmRealDataReferenceCohortVehicleLabel;
  organizationId: string | null;
  vehicleId: string | null;
  tripId: string | null;
  providerSourceLinkId: string | null;
  telemetrySourceFamily: TelemetrySourceFamily | null;
  sourceFamilyAttestation: Ds4RpmRealDataEvidenceAttestationLevel;
  iceRpmApplicability: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';
  v1bProcessingAllowed: boolean | null;
  v1bAdmissionSucceeded: boolean | null;
  vsiCadenceTier: 'RPM_1S' | 'RPM_2S' | 'RPM_3S' | 'SPARSE' | 'UNKNOWN' | null;
  vsiTierAnalyticsReady: boolean | null;
  sourceTimestampPhase: Ds4RpmShadowCorrelationSourceTimestampPhase;
  rpmObservationSupportWidthSeconds: 'UNKNOWN';
  dimoQueryFromIso: string | null;
  dimoQueryToIso: string | null;
  dimoBucketIntervalSeconds: 1;
  speedCoBucketedWithRpm: boolean | null;
  motionEventCountInTrip: number | null;
  authorizedRealDataReadDeclared: boolean;
};

export type Ds4RpmRealDataSourceEligibilityDimensionV1 = {
  dimension:
    | 'ICE_RPM_AVAILABILITY'
    | 'HISTORICAL_SOURCE_TIMESTAMP_AUTHORITY'
    | 'LOCAL_EVENT_CADENCE'
    | 'MOTION_EVENT_TEMPORAL_QUALITY'
    | 'V1B_ADMITTED_EVIDENCE'
    | 'VSI_EFFECTIVE_RESOLUTION'
    | 'CAN_SPEED_CO_BUCKETING'
    | 'TENANT_VEHICLE_TRIP_BINDING'
    | 'SOURCE_FAMILY_ATTESTATION';
  verdict: Ds4RpmRealDataEligibilityVerdict;
  reasonCode: string;
};

export type Ds4RpmRealDataSourceEligibilityResultV1 = {
  contractVersion: typeof DS4_RPM_REAL_DATA_SOURCE_ELIGIBILITY_CONTRACT_VERSION;
  cohortVehicleLabel: Ds4RpmRealDataReferenceCohortVehicleLabel;
  overallVerdict: Ds4RpmRealDataEligibilityVerdict;
  dimensions: readonly Ds4RpmRealDataSourceEligibilityDimensionV1[];
  abstainReasons: readonly string[];
};

/** Read-only replay loader contract (design only — no I/O in PR-B1). */
export type Ds4RpmRealDataReplayLoaderManifestV1 = {
  contractVersion: 'ds4-rpm-real-data-replay-loader-v1';
  loaderMode: 'READ_ONLY_REPLAY';
  organizationId: string;
  vehicleId: string;
  tripId: string;
  providerSourceLinkId: string;
  telemetrySourceFamily: TelemetrySourceFamily;
  sourceFamilyAttestation: 'PROVEN_FROM_DIMO_IDENTITY';
  inputFingerprint: string;
  dimoQueryFromIso: string;
  dimoQueryToIso: string;
  dimoBucketIntervalSeconds: 1;
  aggregationSemantics: 'DIMO_1S_AVG_PER_SIGNAL';
  rpmObservationSupportWidthSeconds: 'UNKNOWN';
  sourceTimestampPhase: 'UNKNOWN';
  interpolationPolicy: 'NONE';
  persistencePolicy: 'NONE';
  productionMutationPolicy: 'FORBIDDEN';
};
