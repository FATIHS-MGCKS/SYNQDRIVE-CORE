import type { TelemetrySourceFamily } from '../../telemetry-source-family';
import type { Ds4RpmRealDataReferenceCohortVehicleLabel } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-source-eligibility.contract.v1';

export const DS4_RPM_PILOT_PREPARATION_CONTRACT_VERSION = 'ds4-rpm-pilot-preparation-v1' as const;

/** Active P2-D2B pilot cohorts — Arteon and Tesla explicitly out of scope. */
export type Ds4RpmPilotPreparationTargetCohortV1 = 'AUDI_A4' | 'VW_TIGUAN';

export type Ds4RpmPilotEpistemicStatusV1 =
  | 'UNVERIFIED'
  | 'UNKNOWN'
  | 'HISTORICAL_UNVERIFIED'
  | 'PROVEN_REPOSITORY_CITATION_ONLY';

export type Ds4RpmPilotScientificPlanningClassificationV1 =
  | 'RPM_ONLY_DESCRIPTIVE'
  | 'DS4_ONLY_DESCRIPTIVE'
  | 'DATA_QUALITY_ASSESSED'
  | 'TEMPORAL_FUSION_BLOCKED_R1'
  | 'TEMPORAL_FUSION_UNVERIFIED'
  | 'REAL_OBSERVATION_NOT_AUTHORIZED'
  | 'OUT_OF_SCOPE_COHORT';

export type Ds4RpmPilotCadenceReadinessTierV1 = 'RPM_1S' | 'RPM_2S' | 'RPM_3S' | 'SPARSE' | 'UNKNOWN';

export type Ds4RpmPilotHistoricalIdentityReferenceV1 = {
  plateLabel: string | null;
  historicalVehicleIdHint: string | null;
  historicalDimoTokenHint: string | null;
  epistemicStatus: Ds4RpmPilotEpistemicStatusV1;
  repositoryCitation: string;
  notes: readonly string[];
};

export type Ds4RpmPilotIdentityReadinessV1 = {
  cohortVehicleLabel: Ds4RpmPilotPreparationTargetCohortV1;
  organizationId: Ds4RpmPilotEpistemicStatusV1;
  vehicleId: Ds4RpmPilotEpistemicStatusV1;
  providerSourceLinkId: Ds4RpmPilotEpistemicStatusV1;
  historicalReferences: readonly Ds4RpmPilotHistoricalIdentityReferenceV1[];
  abstainReasons: readonly string[];
};

export type Ds4RpmPilotSourceFamilyReadinessV1 = {
  cohortVehicleLabel: Ds4RpmPilotPreparationTargetCohortV1;
  resolvedFamily: TelemetrySourceFamily | 'UNKNOWN';
  attestationStatus: Ds4RpmPilotEpistemicStatusV1;
  r1ContainmentRequired: boolean;
  temporalFusionEligibleIfProvenR1: false;
  requiredEvidenceForResolution: readonly string[];
  abstainReasons: readonly string[];
};

export type Ds4RpmPilotRpmEvidenceReadinessV1 = {
  cohortVehicleLabel: Ds4RpmPilotPreparationTargetCohortV1;
  byCadenceTier: Record<Ds4RpmPilotCadenceReadinessTierV1, Ds4RpmPilotEpistemicStatusV1>;
  rpm3sEventLocalFusionEligible: false;
  futureReadRequirements: readonly string[];
  abstainReasons: readonly string[];
};

export type Ds4RpmPilotDs4MotionReadinessV1 = {
  cohortVehicleLabel: Ds4RpmPilotPreparationTargetCohortV1;
  persistedMotionRunAttestation: Ds4RpmPilotEpistemicStatusV1;
  eventMaterialParityRequired: true;
  futureReadRequirements: readonly string[];
  abstainReasons: readonly string[];
};

export type Ds4RpmPilotTripCandidateDescriptorV1 = {
  candidateTripId: string;
  cohortVehicleLabel: Ds4RpmPilotPreparationTargetCohortV1;
  organizationId: string | null;
  vehicleId: string | null;
  providerSourceLinkId: string | null;
  v1bAdmissionSucceeded: boolean;
  v1bInputFingerprintPresent: boolean;
  motionRunPresent: boolean;
  ds4AccelDecelEventCount: number;
  rpmPointCount: number;
  duplicateTimestampCount: number;
  conflictingRpmValueCount: number;
  estimatedMissingRpmBuckets: number;
  vsiCadenceTier: Ds4RpmPilotCadenceReadinessTierV1 | null;
  telemetrySourceFamily: TelemetrySourceFamily | null;
  sourceFamilyAttestation: 'PROVEN' | 'UNPROVEN' | 'UNKNOWN';
};

export type Ds4RpmPilotRankedTripCandidateV1 = {
  rank: number;
  candidate: Ds4RpmPilotTripCandidateDescriptorV1;
  selectionScore: number;
  planningClassifications: readonly Ds4RpmPilotScientificPlanningClassificationV1[];
  tripSelected: false;
  abstainReasons: readonly string[];
};

export type Ds4RpmPilotMinimalReadPlanSliceV1 = {
  cohortVehicleLabel: Ds4RpmPilotPreparationTargetCohortV1;
  sources: readonly {
    evidenceContract: string;
    tableOrEndpoint: string;
    identityFilters: readonly string[];
    allowedTimestampWindow: 'OWNER_BOUNDED_ISO_WINDOW_ONLY';
    maxPlannedResponseRows: number;
    queryBudgetUnits: number;
    snapshotConsistency: string;
    integrityFingerprint: string;
    redactionRules: readonly string[];
  }[];
  authorizationMetadataRequired: readonly string[];
  auditTrailRequirements: readonly string[];
  productionReadPermitted: false;
  ownerApprovalRequired: true;
};

export type Ds4RpmPilotPreparationReportV1 = {
  contractVersion: typeof DS4_RPM_PILOT_PREPARATION_CONTRACT_VERSION;
  operation: 'DBI_P2D2B_AUDI_TIGUAN_REAL_DATA_PILOT_PREPARATION';
  baseSha: string;
  excludedCohorts: readonly Ds4RpmRealDataReferenceCohortVehicleLabel[];
  targetCohorts: readonly Ds4RpmPilotPreparationTargetCohortV1[];
  noProductionReadsPerformed: true;
  noProviderCallsPerformed: true;
  identityReadiness: Record<Ds4RpmPilotPreparationTargetCohortV1, Ds4RpmPilotIdentityReadinessV1>;
  sourceFamilyReadiness: Record<Ds4RpmPilotPreparationTargetCohortV1, Ds4RpmPilotSourceFamilyReadinessV1>;
  rpmReadiness: Record<Ds4RpmPilotPreparationTargetCohortV1, Ds4RpmPilotRpmEvidenceReadinessV1>;
  ds4Readiness: Record<Ds4RpmPilotPreparationTargetCohortV1, Ds4RpmPilotDs4MotionReadinessV1>;
  candidateRankingByCohort: Record<
    Ds4RpmPilotPreparationTargetCohortV1,
    readonly Ds4RpmPilotRankedTripCandidateV1[]
  >;
  minimalReadPlan: Record<Ds4RpmPilotPreparationTargetCohortV1, Ds4RpmPilotMinimalReadPlanSliceV1>;
  missingEvidenceInventory: readonly string[];
  goNoGoMatrix: readonly {
    gate: string;
    audi: 'GO' | 'NO_GO' | 'CONDITIONAL';
    tiguan: 'GO' | 'NO_GO' | 'CONDITIONAL';
    notes: string;
  }[];
  ownerApprovalChecklist: readonly string[];
};
