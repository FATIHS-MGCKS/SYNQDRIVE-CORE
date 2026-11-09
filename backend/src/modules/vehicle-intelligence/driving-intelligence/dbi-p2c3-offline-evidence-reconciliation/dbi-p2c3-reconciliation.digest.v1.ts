import type { DbiP2c3ReconciliationSuccessV1 } from './dbi-p2c3-reconciliation.contract.v1';

/** Deterministic digest — excludes volatile metadata; not a cryptographic attestation digest. */
export function buildReconciliationResultDigest(result: Omit<DbiP2c3ReconciliationSuccessV1, 'resultDigest'>): string {
  const payload = {
    contractVersion: result.contractVersion,
    identityVerdict: result.identityAdmission.verdict,
    participantRefs: result.participantReferences.map((p) => p.participantRef).sort(),
    candidateRefs: result.candidateInventory.map((c) => c.internalCandidateRef).sort(),
    pairwise: result.pairwiseDecisions.map((d) => ({
      l: d.leftCandidateRef,
      r: d.rightCandidateRef,
      decision: d.relationshipDecision,
    })),
    unresolvedKinds: result.unresolvedRelationships.map((u) => u.kind).sort(),
    scientificLimitationCodes: [...result.scientificLimitationCodes].sort(),
  };
  return JSON.stringify(payload);
}
