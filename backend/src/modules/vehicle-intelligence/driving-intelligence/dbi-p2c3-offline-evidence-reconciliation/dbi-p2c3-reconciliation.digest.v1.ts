import type { DbiP2c3ReconciliationSuccessV1 } from './dbi-p2c3-reconciliation.contract.v1';
import { buildCandidateEnvelopeIdentityPayload } from './dbi-p2c3-reconciliation.canonical.v1';

/** Deterministic digest — excludes volatile metadata; not a cryptographic attestation digest. */
export function buildReconciliationResultDigest(result: Omit<DbiP2c3ReconciliationSuccessV1, 'resultDigest'>): string {
  const payload = {
    contractVersion: result.contractVersion,
    identity: {
      verdict: result.identityAdmission.verdict,
      contradictionFields: [...result.identityAdmission.contradictionFields].sort(),
      inconclusiveFields: [...result.identityAdmission.inconclusiveFields].sort(),
      requiredBindingAssessment: result.identityAdmission.requiredBindingAssessment,
      limitationCodes: [...result.identityAdmission.limitationCodes].sort(),
    },
    relationshipReconciliation: result.relationshipReconciliation,
    participantRefs: result.participantReferences.map((p) => p.participantRef).sort(),
    candidateIdentity: result.candidateInventory
      .map((c) => ({
        ref: c.internalCandidateRef,
        episodeKey: c.sourceEpisodeKey,
        module: c.sourceModule,
        classification: c.originalClassification,
        payload: buildCandidateEnvelopeIdentityPayload(c.candidateEnvelope),
      }))
      .sort((a, b) => a.ref.localeCompare(b.ref)),
    pairwise: result.pairwiseDecisions.map((d) => ({
      l: d.leftCandidateRef,
      r: d.rightCandidateRef,
      decision: d.relationshipDecision,
      rationale: [...d.decisionRationaleCodes].sort(),
    })),
    unresolved: result.unresolvedRelationships.map((u) => u),
    scientificLimitationCodes: [...result.scientificLimitationCodes].sort(),
  };
  return JSON.stringify(payload);
}
