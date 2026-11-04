import type { TelemetrySourceFamily } from '../../telemetry-source-family';
import type { Ds4RpmRealDataReferenceCohortVehicleLabel } from './ds4-rpm-real-data-source-eligibility.contract.v1';

export const DS4_RPM_REAL_DATA_SOURCE_ATTESTATION_CONTRACT_VERSION =
  'ds4-rpm-real-data-source-attestation-v1' as const;

/** Orthogonal research states — must never be collapsed into one boolean. */
export type Ds4RpmRealDataAttestationStateV1 =
  | 'PROVEN'
  | 'UNPROVEN'
  | 'BLOCKED'
  | 'NOT_APPLICABLE';

export type Ds4RpmRealDataHistoricalTimestampTrustLevelV1 =
  | 'UNKNOWN'
  | 'R1_HISTORICAL_OBD_UNCERTAIN'
  | 'API_SYNTHETIC_BUCKET_LABEL_ONLY'
  | 'UNPROVEN';

export type Ds4RpmRealDataDimoDeviceIdentityEvidenceV1 = {
  /** SHA-256 of canonical material slice — never raw serial in artifacts. */
  dimoRawJsonMaterialDigest: string;
  resolvedTelemetrySourceFamily: TelemetrySourceFamily;
  attestationLevel: 'PROVEN_FROM_INJECTED_FIXTURE' | 'PROVEN_FROM_AUTHORIZED_READ' | 'UNPROVEN';
};

export type Ds4RpmRealDataQueryProvenanceV1 = {
  dimoQueryFromIso: string;
  dimoQueryToIso: string;
  dimoBucketIntervalSeconds: 1;
  aggregationSemantics: 'DIMO_1S_AVG_PER_SIGNAL';
  speedCoBucketedWithRpm: boolean;
  rpmObservationSupportWidthSeconds: 'UNKNOWN';
};

export type Ds4RpmRealDataEvidenceIdentityRefsV1 = {
  v1aInputFingerprint: string | null;
  v1bRunId: string | null;
  v1bInputFingerprint: string | null;
  motionRunId: string | null;
  motionEventCount: number;
  rpmPointCount: number;
  canSpeedObservationCount: number;
};

/**
 * Offline attestation bundle — injected fixtures or future authorized read outputs.
 * Must not infer family from hardwareType or vehicle model.
 */
export type Ds4RpmRealDataSourceAttestationBundleV1 = {
  contractVersion: typeof DS4_RPM_REAL_DATA_SOURCE_ATTESTATION_CONTRACT_VERSION;
  attestationBundleId: string;
  cohortVehicleLabel: Ds4RpmRealDataReferenceCohortVehicleLabel;
  organizationId: string;
  vehicleId: string;
  tripId: string;
  providerSourceLinkId: string;
  dimoDeviceIdentity: Ds4RpmRealDataDimoDeviceIdentityEvidenceV1;
  queryProvenance: Ds4RpmRealDataQueryProvenanceV1;
  evidenceIdentities: Ds4RpmRealDataEvidenceIdentityRefsV1;
  historicalTimestampTrust: Ds4RpmRealDataHistoricalTimestampTrustLevelV1;
  iceRpmApplicability: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';
  v1bAdmissionSucceeded: boolean;
  v1bProcessingAllowed: boolean;
  vsiCadenceTier: 'RPM_1S' | 'RPM_2S' | 'RPM_3S' | 'SPARSE' | 'UNKNOWN' | null;
  eventLocalCadenceAssessed: boolean;
  provenanceFingerprint: string;
};

export type Ds4RpmRealDataSourceAttestationDimensionV1 = {
  dimension:
    | 'SOURCE_FAMILY_PROVEN'
    | 'SOURCE_TIMESTAMP_AUTHORITY_PROVEN'
    | 'EVENT_LOCAL_CADENCE_ASSESSABLE'
    | 'CORRELATION_ELIGIBLE';
  state: Ds4RpmRealDataAttestationStateV1;
  reasonCode: string;
};

export type Ds4RpmRealDataSourceAttestationResultV1 = {
  contractVersion: typeof DS4_RPM_REAL_DATA_SOURCE_ATTESTATION_CONTRACT_VERSION;
  attestationBundleId: string;
  cohortVehicleLabel: Ds4RpmRealDataReferenceCohortVehicleLabel;
  dimensions: readonly Ds4RpmRealDataSourceAttestationDimensionV1[];
  abstainReasons: readonly string[];
  /** Explicitly not equivalent to shadow AVAILABLE or field accuracy. */
  correlationEligible: boolean;
};
