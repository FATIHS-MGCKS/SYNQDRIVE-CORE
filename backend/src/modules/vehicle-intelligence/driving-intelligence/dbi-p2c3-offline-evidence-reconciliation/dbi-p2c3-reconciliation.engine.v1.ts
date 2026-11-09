import {
  DBI_P2C2_EVIDENCE_ADAPTER_CONTRACT_VERSION,
  type DbiP2c2A1EvidenceParticipantV1,
  type DbiP2c2OfflineEvidenceBundleV1,
  type DbiP2c2PowertrainProxyCandidatesPlaneV1,
  type DbiP2c2SourceModuleV1,
} from '../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.contract.v1';
import {
  DBI_P2C3_RECONCILIATION_CONTRACT_VERSION,
  type DbiP2c3CandidateInventoryRecordV1,
  type DbiP2c3ModuleAssessabilitySummaryV1,
  type DbiP2c3ParticipantReferenceV1,
  type DbiP2c3ProvenanceLimitationProjectionV1,
  type DbiP2c3ReconciliationFailureV1,
  type DbiP2c3ReconciliationOptionsV1,
  type DbiP2c3ReconciliationOutcomeV1,
  type DbiP2c3ReconciliationSuccessV1,
  type DbiP2c3RelationshipReconciliationStatusV1,
} from './dbi-p2c3-reconciliation.contract.v1';
import { countBundleFootprint, resolveReconciliationBudget } from './dbi-p2c3-reconciliation.budget.v1';
import { buildCandidateEnvelopeIdentityPayload } from './dbi-p2c3-reconciliation.canonical.v1';
import {
  projectA1ModuleAssessability,
  projectProxyModuleAssessability,
} from './dbi-p2c3-reconciliation.assessability.v1';
import { buildReconciliationResultDigest } from './dbi-p2c3-reconciliation.digest.v1';
import { evaluateProxyIdentityAdmission } from './dbi-p2c3-reconciliation.identity.v1';
import { deepIsolate, tryDeepIsolate } from './dbi-p2c3-reconciliation.isolation.v1';
import { buildCanonicalParticipantIdentity } from './dbi-p2c3-reconciliation.identity-canon.v1';
import { tryCanonicalJsonStringify } from './dbi-p2c3-reconciliation.canonical-json.v1';
import { computePairwiseReconciliation } from './dbi-p2c3-reconciliation.pairwise.v1';
import { validateBundleInputShape } from './dbi-p2c3-reconciliation.bundle-shape.v1';
import { validateParticipantEvidenceIntegrity } from './dbi-p2c3-reconciliation.participant-integrity.v1';
import { validateBundleAndParticipants } from './dbi-p2c3-reconciliation.validation.v1';

const MODULE_ORDER: readonly DbiP2c2SourceModuleV1[] = ['P2-A1', 'P2-B1', 'P2-B2', 'P2-B3', 'P2-B4'] as const;

function participantRef(module: DbiP2c2SourceModuleV1, planeIndex: number): string {
  return `dbi-p2c3:part/${module}/${planeIndex}`;
}

function candidateRef(module: DbiP2c2SourceModuleV1, planeIndex: number, candidateIndex: number): string {
  return `dbi-p2c3:cand/${module}/${planeIndex}/${candidateIndex}`;
}

function isPowertrainPlane(
  plane: DbiP2c2PowertrainProxyCandidatesPlaneV1,
): plane is DbiP2c2PowertrainProxyCandidatesPlaneV1 {
  return plane.evidencePlane === 'POWERTRAIN_PROXY_CANDIDATES';
}

function buildFailure(
  diagnosticCodes: DbiP2c3ReconciliationFailureV1['diagnosticCodes'],
): DbiP2c3ReconciliationFailureV1 {
  return {
    ok: false,
    contractVersion: DBI_P2C3_RECONCILIATION_CONTRACT_VERSION,
    diagnosticCodes: [...diagnosticCodes].sort(),
  };
}

export function reconcileDbiP2c2OfflineEvidenceBundleV1(
  bundleInput: DbiP2c2OfflineEvidenceBundleV1,
  options: DbiP2c3ReconciliationOptionsV1 = {},
): DbiP2c3ReconciliationOutcomeV1 {
  const budget = resolveReconciliationBudget(options);
  if (!budget.ok) {
    return buildFailure(['BUDGET_OPTION_INVALID']);
  }

  const isolated = tryDeepIsolate(bundleInput);
  if (!isolated.ok) {
    return buildFailure([isolated.code]);
  }
  const bundle = isolated.value;

  const shapeDiagnostics = validateBundleInputShape(bundle);
  if (shapeDiagnostics.length > 0) {
    return buildFailure(shapeDiagnostics);
  }

  const structureDiagnostics = validateBundleAndParticipants(bundle);
  if (structureDiagnostics.length > 0) {
    return buildFailure(structureDiagnostics);
  }

  const integrityDiagnostics = validateParticipantEvidenceIntegrity(bundle);
  if (integrityDiagnostics.length > 0) {
    return buildFailure(integrityDiagnostics);
  }

  const footprint = countBundleFootprint(bundle);
  if (footprint.participantCount > budget.maxParticipants) {
    return buildFailure(['BUDGET_PARTICIPANT_COUNT_EXCEEDED']);
  }
  if (footprint.pairCount === null || footprint.pairCount > budget.maxCandidatePairs) {
    return buildFailure(['BUDGET_CANDIDATE_PAIR_COUNT_EXCEEDED']);
  }

  const participantReferences: DbiP2c3ParticipantReferenceV1[] = [];
  const moduleAssessabilitySummary: DbiP2c3ModuleAssessabilitySummaryV1[] = [];
  const provenanceLimitations: DbiP2c3ProvenanceLimitationProjectionV1[] = [];
  const scientificCodes = new Set<string>();
  const candidateInventory: DbiP2c3CandidateInventoryRecordV1[] = [];

  let a1Participant: DbiP2c2A1EvidenceParticipantV1 | null = null;

  if (bundle.descriptive) {
    const part = bundle.descriptive.participant;
    a1Participant = part;
    participantReferences.push({
      participantRef: participantRef('P2-A1', 0),
      sourceModule: 'P2-A1',
      evidencePlane: 'DESCRIPTIVE_RPM_EPISODES',
      adapterContractVersion: DBI_P2C2_EVIDENCE_ADAPTER_CONTRACT_VERSION,
    });
    moduleAssessabilitySummary.push(
      projectA1ModuleAssessability({
        participantRef: participantRef('P2-A1', 0),
        participant: part,
      }),
    );
    provenanceLimitations.push({
      participantRef: participantRef('P2-A1', 0),
      sourceModule: 'P2-A1',
      provenanceCarriedAsReported: true,
      attestationNotEstablishedByReconciliation: true,
    });
    for (const code of part.moduleScientificLimitationCodes) scientificCodes.add(code);
    for (const code of part.unsupportedScientificClaims) scientificCodes.add(code);
  }

  const proxyParticipants: DbiP2c2OfflineEvidenceBundleV1['powertrainProxies'][number]['participant'][] = [];

  const planesSorted = [...bundle.powertrainProxies].sort((a, b) => {
    const order = (m: DbiP2c2SourceModuleV1) =>
      MODULE_ORDER.indexOf(m) >= 0 ? MODULE_ORDER.indexOf(m) : 99;
    const moduleCmp = order(a.participant.sourceModule) - order(b.participant.sourceModule);
    if (moduleCmp !== 0) return moduleCmp;
    const leftId = tryCanonicalJsonStringify(buildCanonicalParticipantIdentity(a.participant.identity));
    const rightId = tryCanonicalJsonStringify(buildCanonicalParticipantIdentity(b.participant.identity));
    if (!leftId.ok || !rightId.ok) {
      return 0;
    }
    return leftId.json.localeCompare(rightId.json);
  });

  for (let planeIndex = 0; planeIndex < planesSorted.length; planeIndex++) {
    const plane = planesSorted[planeIndex]!;
    const part = plane.participant;
    participantReferences.push({
      participantRef: participantRef(part.sourceModule, planeIndex),
      sourceModule: part.sourceModule,
      evidencePlane: 'POWERTRAIN_PROXY_CANDIDATES',
      adapterContractVersion: DBI_P2C2_EVIDENCE_ADAPTER_CONTRACT_VERSION,
    });
    moduleAssessabilitySummary.push(
      projectProxyModuleAssessability({
        participantRef: participantRef(part.sourceModule, planeIndex),
        participant: part,
      }),
    );
    provenanceLimitations.push({
      participantRef: participantRef(part.sourceModule, planeIndex),
      sourceModule: part.sourceModule,
      provenanceCarriedAsReported: true,
      attestationNotEstablishedByReconciliation: true,
    });
    for (const code of part.moduleScientificLimitationCodes) scientificCodes.add(code);
    for (const code of part.candidateLimitationCodes) scientificCodes.add(code);

    proxyParticipants.push(part);

    const candidatesSorted = [...plane.candidates]
      .map((c, originalIdx) => ({ c, originalIdx }))
      .sort((a, b) => {
        if (a.c.sourceEpisodeKey !== b.c.sourceEpisodeKey) {
          return a.c.sourceEpisodeKey.localeCompare(b.c.sourceEpisodeKey);
        }
        const payloadCmp = buildCandidateEnvelopeIdentityPayload(a.c).localeCompare(
          buildCandidateEnvelopeIdentityPayload(b.c),
        );
        if (payloadCmp !== 0) return payloadCmp;
        return a.originalIdx - b.originalIdx;
      });

    for (let candidateIndex = 0; candidateIndex < candidatesSorted.length; candidateIndex++) {
      const entry = candidatesSorted[candidateIndex]!;
      candidateInventory.push({
        internalCandidateRef: candidateRef(part.sourceModule, planeIndex, candidateIndex),
        sourceModule: part.sourceModule,
        sourcePlaneIndex: planeIndex,
        sourceCandidateIndex: entry.originalIdx,
        sourceEpisodeKey: entry.c.sourceEpisodeKey,
        originalClassification: entry.c.originalClassification,
        candidateEnvelope: deepIsolate(entry.c),
      });
    }
  }

  participantReferences.sort((a, b) => {
    const oa = MODULE_ORDER.indexOf(a.sourceModule);
    const ob = MODULE_ORDER.indexOf(b.sourceModule);
    if (oa !== ob) return oa - ob;
    return a.participantRef.localeCompare(b.participantRef);
  });

  moduleAssessabilitySummary.sort((a, b) => a.participantRef.localeCompare(b.participantRef));

  const identityAdmission = evaluateProxyIdentityAdmission({
    proxyParticipants,
    a1CoreBindings: a1Participant
      ? {
          organizationId: a1Participant.identity.organizationId,
          vehicleId: a1Participant.identity.vehicleId,
          tripId: a1Participant.identity.tripId,
          providerSourceLinkId: a1Participant.identity.providerSourceLinkId,
          v1bInputFingerprint: a1Participant.identity.v1bInputFingerprint,
        }
      : null,
  });

  if (identityAdmission.verdict === 'REJECTED') {
    for (const field of identityAdmission.contradictionFields) {
      scientificCodes.add(`IDENTITY_CONTRADICTION_${field}`);
    }
  }

  let relationshipReconciliation: DbiP2c3RelationshipReconciliationStatusV1;
  let pairwiseDecisions: DbiP2c3ReconciliationSuccessV1['pairwiseDecisions'] = [];
  let unresolvedRelationships: DbiP2c3ReconciliationSuccessV1['unresolvedRelationships'] = [];

  if (identityAdmission.verdict === 'ADMITTED') {
    if (candidateInventory.length < 2) {
      relationshipReconciliation = {
        performed: false,
        skipReason: 'NO_PROXY_CANDIDATES_FOR_RELATIONSHIP_PASS',
      };
    } else {
      const pairwise = computePairwiseReconciliation({
        candidates: candidateInventory,
        maxPairs: budget.maxCandidatePairs,
      });
      if (pairwise.budgetExceeded) {
        return buildFailure(['BUDGET_CANDIDATE_PAIR_COUNT_EXCEEDED']);
      }
      pairwiseDecisions = pairwise.pairwiseDecisions;
      unresolvedRelationships = pairwise.unresolvedRelationships;
      relationshipReconciliation = { performed: true };
    }
  } else if (identityAdmission.verdict === 'REJECTED') {
    relationshipReconciliation = { performed: false, skipReason: 'IDENTITY_REJECTED' };
  } else {
    relationshipReconciliation = { performed: false, skipReason: 'IDENTITY_INCONCLUSIVE' };
    unresolvedRelationships = [
      {
        kind: 'IDENTITY_ALIGNMENT_UNRESOLVED',
        detailCodes: [...identityAdmission.inconclusiveFields],
      },
    ];
  }

  unresolvedRelationships = [...unresolvedRelationships].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return JSON.stringify(a).localeCompare(JSON.stringify(b));
  });

  const scientificLimitationCodes = [...scientificCodes].sort();

  const withoutDigest: Omit<DbiP2c3ReconciliationSuccessV1, 'resultDigest'> = {
    ok: true,
    contractVersion: DBI_P2C3_RECONCILIATION_CONTRACT_VERSION,
    inputAdapterContractVersion: DBI_P2C2_EVIDENCE_ADAPTER_CONTRACT_VERSION,
    participantReferences,
    identityAdmission,
    provenanceLimitations: [...provenanceLimitations].sort((a, b) =>
      a.participantRef.localeCompare(b.participantRef),
    ),
    moduleAssessabilitySummary,
    candidateInventory: [...candidateInventory].sort((a, b) =>
      a.internalCandidateRef.localeCompare(b.internalCandidateRef),
    ),
    pairwiseDecisions: [...pairwiseDecisions].sort((a, b) =>
      `${a.leftCandidateRef}:${a.rightCandidateRef}`.localeCompare(
        `${b.leftCandidateRef}:${b.rightCandidateRef}`,
      ),
    ),
    unresolvedRelationships,
    relationshipReconciliation,
    scientificLimitationCodes,
  };

  return {
    ...withoutDigest,
    resultDigest: buildReconciliationResultDigest(withoutDigest),
  };
}
