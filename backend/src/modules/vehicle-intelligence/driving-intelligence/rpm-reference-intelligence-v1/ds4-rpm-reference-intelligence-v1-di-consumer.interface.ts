import {
  DS4_RPM_REFERENCE_INTELLIGENCE_V1_CONTRACT_VERSION,
  type Ds4RpmReferenceIntelligenceV1Result,
} from './ds4-rpm-reference-intelligence-v1.contract';

/**
 * Future Driving Intelligence consumer boundary (types only — no Nest wiring in Phase 5A).
 * DS4 and other modules opt in explicitly per contract version.
 */
export type Ds4RpmReferenceIntelligenceV1ConsumerContractRef = {
  contractVersion: typeof DS4_RPM_REFERENCE_INTELLIGENCE_V1_CONTRACT_VERSION;
  /** V1B shadow run id when metrics were computed from an admitted run (future). */
  rpmHfV1bRunId?: string | null;
  /** Input fingerprint from admitting V1B run (future). */
  inputFingerprint?: string | null;
  /** Trip window alignment anchor — must match admitting run. */
  tripId: string;
  vehicleId: string;
  organizationId: string;
};

export type Ds4RpmReferenceIntelligenceV1OptionalAttachment = {
  ref: Ds4RpmReferenceIntelligenceV1ConsumerContractRef;
  payload: Ds4RpmReferenceIntelligenceV1Result | null;
};

/** Absence of this block on a DI artifact must not be interpreted as zero reference exposure. */
export type Ds4RpmReferenceIntelligenceV1ConsumerReadModel = {
  rpmReferenceIntelligenceV1?: Ds4RpmReferenceIntelligenceV1OptionalAttachment;
};
