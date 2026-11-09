import type { Ds4RpmEpisodeResearchResultV1 } from '../ds4-rpm-episode-research/ds4-rpm-episode-research.contract.v1';
import { checkA1DescriptiveEpisodeConsistency } from './dbi-p2c2-evidence-adapter.consistency.v1';
import {
  DBI_P2C2_EVIDENCE_ADAPTER_CONTRACT_VERSION,
  DBI_P2C2_NOT_REPORTED,
  type DbiP2c2AdapterDiagnosticCodeV1,
  type DbiP2c2AdapterOutcomeV1,
  type DbiP2c2DescriptiveRpmEpisodesPlaneV1,
} from './dbi-p2c2-evidence-adapter.contract.v1';
import { deepIsolate } from './dbi-p2c2-evidence-adapter.isolation.v1';
import {
  buildA1AdapterLocalReference,
  buildOrderingDigest,
  collectTemporalDiagnostics,
  projectA1ProvenanceNotReported,
} from './dbi-p2c2-evidence-adapter.shared.v1';

export function adaptDs4RpmEpisodeResearchToP2c2Evidence(
  source: Ds4RpmEpisodeResearchResultV1,
): DbiP2c2AdapterOutcomeV1<DbiP2c2DescriptiveRpmEpisodesPlaneV1> {
  const diagnostics: DbiP2c2AdapterDiagnosticCodeV1[] = [];

  if (!source.researchOnly) diagnostics.push('SOURCE_NOT_RESEARCH_ONLY');
  if (!source.semanticGuards.notEvidenceCandidate) diagnostics.push('A1_SEMANTIC_GUARD_NOT_EVIDENCE_CANDIDATE');
  if (!source.semanticGuards.labelsNotForCrossDomainJoin) {
    diagnostics.push('A1_SEMANTIC_GUARD_LABELS_NOT_FOR_CROSS_DOMAIN_JOIN');
  }

  diagnostics.push(
    ...collectTemporalDiagnostics(
      source.highEpisodes.items.flatMap((item) => [
        {
          startIso: item.providerBucketLabelStartIso,
          endIso: item.providerBucketLabelEndIso,
          startBucketIndex: item.startIdx,
          endBucketIndex: item.endIdx,
        },
      ]),
    ),
  );
  diagnostics.push(...checkA1DescriptiveEpisodeConsistency(source));

  if (diagnostics.length > 0) {
    return { ok: false, sourceModule: 'P2-A1', diagnosticCodes: diagnostics };
  }

  const sortedEpisodes = [...source.highEpisodes.items].sort((a, b) => a.sequenceIndex - b.sequenceIndex);

  const episodes = sortedEpisodes.map((item, ordinal) => ({
    adapterLocalReference: buildA1AdapterLocalReference(item.sequenceIndex),
    crossDomainJoinEligible: false as const,
    sourceSequenceIndex: item.sequenceIndex,
    sourceEpisode: deepIsolate(item),
  }));

  const semanticGuards = deepIsolate(source.semanticGuards);

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
    moduleScientificLimitationCodes: [],
    candidateLimitationCodes: [],
    adapterClaimsPositiveEvidence: false,
    moduleAssessability: {
      highEpisodesStatus: source.highEpisodes.status,
      normalizedEpisodesEligible: source.referenceContext.normalizedEpisodesEligible,
      semanticGuards,
    },
    referenceContext: deepIsolate({
      trustTier: source.referenceContext.trustTier,
      idleRpmProvenance: source.referenceContext.idleRpmProvenance,
      maxRpmProvenance: source.referenceContext.maxRpmProvenance,
      normalizedEpisodesEligible: source.referenceContext.normalizedEpisodesEligible,
      referenceObservationConflict: source.referenceContext.referenceObservationConflict,
      riAvailability: source.referenceContext.riAvailability,
      riReasonCodes: [...source.referenceContext.riReasonCodes],
    }),
    highEpisodesMeta: {
      status: source.highEpisodes.status,
      rejectedCandidateCount: source.highEpisodes.rejectedCandidateCount,
      countRange: deepIsolate(source.highEpisodes.countRange),
      thresholds: deepIsolate(source.highEpisodes.thresholds),
      massAccounting: source.highEpisodes.massAccounting
        ? deepIsolate(source.highEpisodes.massAccounting)
        : null,
    },
    denominators: deepIsolate({
      observedUniqueLabelCount: source.denominators.observedUniqueLabelCount,
      eligibleSequencePointCount: source.denominators.eligibleSequencePointCount,
      runningLabelCount: source.denominators.runningLabelCount,
      engineNotRotatingLabelCount: source.denominators.engineNotRotatingLabelCount,
      identicalDuplicateCollapsedCount: source.denominators.identicalDuplicateCollapsedCount,
      conflictingDuplicateLabelCount: source.denominators.conflictingDuplicateLabelCount,
      invalidTimestampOrRpmCount: source.denominators.invalidTimestampOrRpmCount,
      negativeOrNonFiniteRpmExcludedCount: source.denominators.negativeOrNonFiniteRpmExcludedCount,
    }),
  };

  const plane: DbiP2c2DescriptiveRpmEpisodesPlaneV1 = {
    evidencePlane: 'DESCRIPTIVE_RPM_EPISODES',
    participant,
    episodes,
  };

  return {
    ok: true,
    plane,
    orderingDigest: buildOrderingDigest(
      episodes.map((e, ordinal) => ({ ordinal, key: e.adapterLocalReference })),
    ),
  };
}
