import type { Ds4RpmEpisodeResearchResultV1 } from '../ds4-rpm-episode-research/ds4-rpm-episode-research.contract.v1';
import {
  DBI_P2C2_EVIDENCE_ADAPTER_CONTRACT_VERSION,
  DBI_P2C2_NOT_REPORTED,
  type DbiP2c2AdapterOutcomeV1,
  type DbiP2c2DescriptiveRpmEpisodesPlaneV1,
} from './dbi-p2c2-evidence-adapter.contract.v1';
import {
  buildA1AdapterLocalReference,
  buildOrderingDigest,
  collectInvalidBucketLabels,
  projectA1ProvenanceNotReported,
} from './dbi-p2c2-evidence-adapter.shared.v1';

export function adaptDs4RpmEpisodeResearchToP2c2Evidence(
  source: Ds4RpmEpisodeResearchResultV1,
): DbiP2c2AdapterOutcomeV1<DbiP2c2DescriptiveRpmEpisodesPlaneV1> {
  const diagnostics: import('./dbi-p2c2-evidence-adapter.contract.v1').DbiP2c2AdapterDiagnosticCodeV1[] = [];

  if (!source.researchOnly) diagnostics.push('SOURCE_NOT_RESEARCH_ONLY');
  if (!source.semanticGuards.notEvidenceCandidate) diagnostics.push('A1_SEMANTIC_GUARD_NOT_EVIDENCE_CANDIDATE');
  if (!source.semanticGuards.labelsNotForCrossDomainJoin) {
    diagnostics.push('A1_SEMANTIC_GUARD_LABELS_NOT_FOR_CROSS_DOMAIN_JOIN');
  }

  const labelFields = source.highEpisodes.items.flatMap((item) => [
    item.providerBucketLabelStartIso,
    item.providerBucketLabelEndIso,
  ]);
  diagnostics.push(...collectInvalidBucketLabels(labelFields));

  if (diagnostics.length > 0) {
    return { ok: false, sourceModule: 'P2-A1', diagnosticCodes: diagnostics };
  }

  const sortedEpisodes = [...source.highEpisodes.items].sort((a, b) => a.sequenceIndex - b.sequenceIndex);

  const episodes = sortedEpisodes.map((item) => ({
    adapterLocalReference: buildA1AdapterLocalReference(item.sequenceIndex),
    crossDomainJoinEligible: false as const,
    sourceSequenceIndex: item.sequenceIndex,
    sourceEpisode: item,
  }));

  const participant = {
    contractVersion: DBI_P2C2_EVIDENCE_ADAPTER_CONTRACT_VERSION,
    sourceModule: 'P2-A1' as const,
    sourceContractVersion: source.contractVersion,
    sourcePolicyVersionOrKernelVersion: source.kernelVersion,
    originalKernelStatus: source.status,
    originalAbstainReasons: [...source.abstainReasons],
    researchOnly: true as const,
    evidenceOrigin: source.evidenceOrigin,
    timeAuthority: source.timeAuthority,
    temporalMode: DBI_P2C2_NOT_REPORTED,
    identity: {
      organizationId: source.bindings.organizationId,
      vehicleId: source.bindings.vehicleId,
      tripId: source.bindings.tripId,
      providerSourceLinkId: source.bindings.providerSourceLinkId,
      v1bInputFingerprint: source.bindings.v1bInputFingerprint,
      multichannelFingerprint: DBI_P2C2_NOT_REPORTED,
      sourceBundleId: source.bindings.sourceBundleId,
    },
    provenance: projectA1ProvenanceNotReported(),
    unsupportedScientificClaims: [...source.unsupportedScientificClaims],
    scientificLimitationCodes: [],
    adapterClaimsPositiveEvidence: false,
    moduleAssessability: {
      highEpisodesStatus: source.highEpisodes.status,
      normalizedEpisodesEligible: source.referenceContext.normalizedEpisodesEligible,
      semanticGuards: source.semanticGuards,
    },
    referenceContext: {
      trustTier: source.referenceContext.trustTier,
      idleRpmProvenance: source.referenceContext.idleRpmProvenance,
      maxRpmProvenance: source.referenceContext.maxRpmProvenance,
      referenceObservationConflict: source.referenceContext.referenceObservationConflict,
      riAvailability: source.referenceContext.riAvailability,
      riReasonCodes: [...source.referenceContext.riReasonCodes],
    },
    highEpisodesMassAccounting: {
      status: source.highEpisodes.status,
      rejectedCandidateCount: source.highEpisodes.rejectedCandidateCount,
      countRange: { ...source.highEpisodes.countRange },
    },
  };

  const plane: DbiP2c2DescriptiveRpmEpisodesPlaneV1 = {
    evidencePlane: 'DESCRIPTIVE_RPM_EPISODES',
    participant,
    episodes,
  };

  return {
    ok: true,
    plane,
    orderingDigest: buildOrderingDigest(episodes.map((e) => e.adapterLocalReference)),
  };
}
