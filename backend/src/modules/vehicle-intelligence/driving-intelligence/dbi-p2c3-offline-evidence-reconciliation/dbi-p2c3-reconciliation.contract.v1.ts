import { DBI_P2C2_EVIDENCE_ADAPTER_CONTRACT_VERSION } from '../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.contract.v1';
import type {
  DbiP2c2EvidencePlaneV1,
  DbiP2c2OfflineEvidenceBundleV1,
  DbiP2c2ProxyCandidateEnvelopeV1,
  DbiP2c2SourceModuleV1,
} from '../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.contract.v1';

export const DBI_P2C3_RECONCILIATION_CONTRACT_VERSION = 'dbi-p2c3-reconciliation-v1' as const;

export type DbiP2c3IdentityAdmissionVerdictV1 = 'ADMITTED' | 'REJECTED' | 'INCONCLUSIVE';

export type DbiP2c3PairwiseRelationshipDecisionV1 =
  | 'SAME_SOURCE_DUPLICATE'
  | 'INSUFFICIENT_ALIGNMENT_EVIDENCE'
  | 'POTENTIAL_SEMANTIC_CONFLICT'
  | 'POSSIBLE_LABEL_INTERVAL_OVERLAP'
  | 'COMPATIBLE_CO_OBSERVATION'
  | 'UNRELATED';

/** Decisions that may be emitted as positive relationship edges in P2-C3 V1. */
export const DBI_P2C3_V1_AUTHORIZED_POSITIVE_RELATIONSHIPS: readonly DbiP2c3PairwiseRelationshipDecisionV1[] = [
  'SAME_SOURCE_DUPLICATE',
] as const;

export type DbiP2c3ReconciliationDiagnosticCodeV1 =
  | 'BUDGET_PARTICIPANT_COUNT_EXCEEDED'
  | 'BUDGET_CANDIDATE_PAIR_COUNT_EXCEEDED'
  | 'IDENTITY_FIELD_CONTRADICTION'
  | 'IDENTITY_ALIGNMENT_INCONCLUSIVE'
  | 'INVALID_PARTICIPANT_PLANE'
  | 'MISSING_PARTICIPANT_HEADER'
  | 'A1_DESCRIPTIVE_AUTHORITY_VIOLATION';

export type DbiP2c3ReconciliationOptionsV1 = {
  readonly maxParticipants?: number;
  readonly maxCandidatePairs?: number;
};

export const DBI_P2C3_DEFAULT_MAX_PARTICIPANTS = 6;
export const DBI_P2C3_DEFAULT_MAX_CANDIDATE_PAIRS = 4096;

export type DbiP2c3ParticipantReferenceV1 = {
  readonly participantRef: string;
  readonly sourceModule: DbiP2c2SourceModuleV1;
  readonly evidencePlane: DbiP2c2EvidencePlaneV1;
  readonly adapterContractVersion: typeof DBI_P2C2_EVIDENCE_ADAPTER_CONTRACT_VERSION;
};

export type DbiP2c3ModuleAssessabilitySummaryV1 = {
  readonly participantRef: string;
  readonly sourceModule: DbiP2c2SourceModuleV1;
  readonly originalKernelStatus: string;
  readonly originalAbstainReasons: readonly string[];
  readonly adapterClaimsPositiveEvidence: boolean;
  readonly descriptiveOnly: boolean;
};

export type DbiP2c3CandidateInventoryRecordV1 = {
  readonly internalCandidateRef: string;
  readonly sourceModule: DbiP2c2SourceModuleV1;
  readonly sourcePlaneIndex: number;
  readonly sourceCandidateIndex: number;
  readonly sourceEpisodeKey: string;
  readonly originalClassification: string;
  readonly candidateEnvelope: DbiP2c2ProxyCandidateEnvelopeV1;
};

export type DbiP2c3PairwiseReconciliationDecisionV1 = {
  readonly leftCandidateRef: string;
  readonly rightCandidateRef: string;
  readonly leftSourceModule: DbiP2c2SourceModuleV1;
  readonly rightSourceModule: DbiP2c2SourceModuleV1;
  readonly relationshipDecision: DbiP2c3PairwiseRelationshipDecisionV1;
  readonly decisionRationaleCodes: readonly string[];
};

export type DbiP2c3UnresolvedRelationshipV1 =
  | {
      readonly kind: 'EPISODE_KEY_COLLISION';
      readonly leftCandidateRef: string;
      readonly rightCandidateRef: string;
      readonly sharedSourceEpisodeKey: string;
      readonly detailCodes: readonly string[];
    }
  | {
      readonly kind: 'CROSS_MODULE_ALIGNMENT_UNAVAILABLE';
      readonly leftCandidateRef: string;
      readonly rightCandidateRef: string;
      readonly detailCodes: readonly string[];
    }
  | {
      readonly kind: 'IDENTITY_ALIGNMENT_UNRESOLVED';
      readonly detailCodes: readonly string[];
    };

export type DbiP2c3ProvenanceLimitationProjectionV1 = {
  readonly participantRef: string;
  readonly sourceModule: DbiP2c2SourceModuleV1;
  readonly provenanceCarriedAsReported: true;
  readonly attestationNotEstablishedByReconciliation: true;
};

export type DbiP2c3IdentityAdmissionDetailV1 = {
  readonly verdict: DbiP2c3IdentityAdmissionVerdictV1;
  readonly contradictionFields: readonly string[];
  readonly inconclusiveFields: readonly string[];
  readonly limitationCodes: readonly string[];
};

export type DbiP2c3ReconciliationSuccessV1 = {
  readonly ok: true;
  readonly contractVersion: typeof DBI_P2C3_RECONCILIATION_CONTRACT_VERSION;
  readonly inputAdapterContractVersion: typeof DBI_P2C2_EVIDENCE_ADAPTER_CONTRACT_VERSION;
  readonly participantReferences: readonly DbiP2c3ParticipantReferenceV1[];
  readonly identityAdmission: DbiP2c3IdentityAdmissionDetailV1;
  readonly provenanceLimitations: readonly DbiP2c3ProvenanceLimitationProjectionV1[];
  readonly moduleAssessabilitySummary: readonly DbiP2c3ModuleAssessabilitySummaryV1[];
  readonly candidateInventory: readonly DbiP2c3CandidateInventoryRecordV1[];
  readonly pairwiseDecisions: readonly DbiP2c3PairwiseReconciliationDecisionV1[];
  readonly unresolvedRelationships: readonly DbiP2c3UnresolvedRelationshipV1[];
  readonly scientificLimitationCodes: readonly string[];
  readonly resultDigest: string;
};

export type DbiP2c3ReconciliationFailureV1 = {
  readonly ok: false;
  readonly contractVersion: typeof DBI_P2C3_RECONCILIATION_CONTRACT_VERSION;
  readonly diagnosticCodes: readonly DbiP2c3ReconciliationDiagnosticCodeV1[];
};

export type DbiP2c3ReconciliationOutcomeV1 = DbiP2c3ReconciliationSuccessV1 | DbiP2c3ReconciliationFailureV1;

export type DbiP2c3ReconciliationInputV1 = DbiP2c2OfflineEvidenceBundleV1;
