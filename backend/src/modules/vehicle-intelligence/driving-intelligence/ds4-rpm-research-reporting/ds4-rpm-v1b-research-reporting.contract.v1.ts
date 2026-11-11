export const DS4_RPM_V1B_RESEARCH_REPORTING_CONTRACT_VERSION =
  'ds4-rpm-v1b-research-reporting-v1' as const;

/** Reporting interpretation only — persisted V1B field name unchanged. */
export const DS4_RPM_TRIP_TIME_OBSERVATION_DENSITY_SEMANTICS =
  'FULL_TRIP_ONE_SECOND_BUCKET_DENSITY_NOT_POLL_SUCCESS' as const;

export const DS4_RPM_POLL_SUCCESS_NOT_DERIVED_FROM_TRIP_TIME_DENSITY =
  'NOT_DERIVED_FROM_TRIP_TIME_OBSERVATION_DENSITY' as const;

export type Ds4RpmV1bResearchTierEvidenceProvenanceV1 =
  | 'PERSISTED_V1B_PAIR'
  | 'RECONSTRUCTED_OFFLINE'
  | 'NOT_PROVIDED';

export type Ds4RpmV1bResearchTierReportingV1 = {
  tierEvidenceVerification: 'VERIFIED' | 'UNVERIFIED';
  cadenceTier: string | 'UNVERIFIED';
  cadenceConfidence: string | 'UNVERIFIED';
  analysisReadiness: string | 'UNVERIFIED';
  tripCoverageBand: string | 'UNVERIFIED';
  tierAvailability: string | 'UNVERIFIED';
  legacyShadowVariant: string;
  tierAwareShadowVariant: string;
  tierEvidenceDecisionCode: string | 'UNVERIFIED';
};

export type Ds4RpmV1bResearchRpmReportV1 = {
  contractVersion: typeof DS4_RPM_V1B_RESEARCH_REPORTING_CONTRACT_VERSION;
  organizationId: string;
  vehicleId: string;
  tripId: string;
  providerSourceLinkId: string | null;
  vsiTripProfile: string | 'UNVERIFIED';
  vsiVehicleProfile: string | 'UNVERIFIED' | null;
  tripTimeObservationDensity: number | null;
  tripTimeObservationDensitySemantics: typeof DS4_RPM_TRIP_TIME_OBSERVATION_DENSITY_SEMANTICS;
  pollSuccessVerdict: typeof DS4_RPM_POLL_SUCCESS_NOT_DERIVED_FROM_TRIP_TIME_DENSITY;
  tierEvidenceProvenance: Ds4RpmV1bResearchTierEvidenceProvenanceV1;
  tierReporting: Ds4RpmV1bResearchTierReportingV1;
  unknownGapCause: readonly string[];
  r1TemporalVeto: 'ACTIVE' | 'NOT_APPLICABLE';
  crossDomainTimestampFusion: 'FORBIDDEN';
};
