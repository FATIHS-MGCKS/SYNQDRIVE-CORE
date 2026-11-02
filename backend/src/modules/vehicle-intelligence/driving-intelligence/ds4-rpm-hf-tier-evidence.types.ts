import type { VsiRpmCadenceTierTripClassificationV1 } from '../vehicle-signal-intelligence/vsi-profile-cadence.types';

/** Max skew between canonical trip end and tier row endMs binding. */
export const DS4_RPM_HF_TIER_TRIP_END_BINDING_TOLERANCE_MS = 1000;

export type Ds4RpmHfTierEvidenceStatus =
  | 'AVAILABLE'
  | 'MISSING_ROW'
  | 'STALE_TRIP_BINDING'
  | 'HF_EVIDENCE_INCOMPLETE';

export type Ds4RpmHfTierEvidenceV1 = {
  contractVersion: 'ds4-rpm-hf-tier-evidence-v1';
  status: Ds4RpmHfTierEvidenceStatus;
  tripId: string;
  providerSourceLinkId: string | null;
  tripClassification: VsiRpmCadenceTierTripClassificationV1 | null;
  blockEvidenceObservedAt: string | null;
};

export type Ds4RpmHfTierAnalysisMode = 'HIGH_RESOLUTION' | 'CADENCE_AWARE' | 'OBSERVATION_ONLY';
