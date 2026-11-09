import type { Ds4PowertrainDemandSustainedLoadResultV1 } from '../ds4-powertrain-demand-research/ds4-powertrain-demand-research.contract.v1';
import {
  DBI_P2C2_EVIDENCE_ADAPTER_CONTRACT_VERSION,
  type DbiP2c2AdapterOutcomeV1,
  type DbiP2c2PowertrainProxyCandidatesPlaneV1,
  type DbiP2c2ProxyCandidateEnvelopeV1,
} from './dbi-p2c2-evidence-adapter.contract.v1';
import {
  buildOrderingDigest,
  collectInvalidBucketLabels,
  computeAdapterClaimsPositiveEvidence,
  projectPowertrainProvenance,
} from './dbi-p2c2-evidence-adapter.shared.v1';

export function adaptDs4SustainedLoadResearchToP2c2Evidence(
  source: Ds4PowertrainDemandSustainedLoadResultV1,
): DbiP2c2AdapterOutcomeV1<DbiP2c2PowertrainProxyCandidatesPlaneV1> {
  const diagnostics: import('./dbi-p2c2-evidence-adapter.contract.v1').DbiP2c2AdapterDiagnosticCodeV1[] = [];
  if (!source.researchOnly) diagnostics.push('SOURCE_NOT_RESEARCH_ONLY');

  const labels = source.sustainedLoad.candidates.flatMap((c) => [
    c.startProviderBucketLabelIso,
    c.endProviderBucketLabelIso,
  ]);
  diagnostics.push(...collectInvalidBucketLabels(labels));
  if (diagnostics.length > 0) {
    return { ok: false, sourceModule: 'P2-B3', diagnosticCodes: diagnostics };
  }

  const sorted = [...source.sustainedLoad.candidates].sort((a, b) => {
    if (a.researchLabelSpanMs !== b.researchLabelSpanMs) return a.researchLabelSpanMs - b.researchLabelSpanMs;
    return a.episodeKey.localeCompare(b.episodeKey);
  });

  const candidates: DbiP2c2ProxyCandidateEnvelopeV1[] = sorted.map((originalCandidate) => ({
    sourceModule: 'P2-B3',
    originalCandidate,
    originalClassification: originalCandidate.classification,
    sourceEpisodeKey: originalCandidate.episodeKey,
  }));

  const adapterClaimsPositiveEvidence = computeAdapterClaimsPositiveEvidence({
    tripStatus: source.status,
    classifications: candidates.map((c) => c.originalClassification),
  });

  const participant = {
    contractVersion: DBI_P2C2_EVIDENCE_ADAPTER_CONTRACT_VERSION,
    sourceModule: 'P2-B3' as const,
    sourceContractVersion: source.contractVersion,
    sourcePolicyVersionOrKernelVersion: source.policyVersion,
    originalKernelStatus: source.status,
    originalAbstainReasons: [...source.abstainReasons],
    researchOnly: true as const,
    evidenceOrigin: source.evidenceOrigin,
    timeAuthority: source.timeAuthority,
    temporalMode: source.temporalMode,
    identity: {
      organizationId: source.bindings.organizationId,
      vehicleId: source.bindings.vehicleId,
      tripId: source.bindings.tripId,
      providerSourceLinkId: source.bindings.providerSourceLinkId,
      v1bInputFingerprint: source.bindings.v1bInputFingerprint,
      multichannelFingerprint: source.bindings.multichannelFingerprint,
      sourceBundleId: source.bindings.sourceBundleId,
    },
    provenance: projectPowertrainProvenance(source.provenance),
    unsupportedScientificClaims: [...source.unsupportedScientificClaims],
    scientificLimitationCodes: sorted.flatMap((c) => c.limitationCodes),
    adapterClaimsPositiveEvidence,
    tripEvidenceClassification: source.sustainedLoad.tripEvidenceClassification,
    partialCoverage: {
      loadPresentBucketCount: source.sustainedLoad.coverageEvidence.loadPresentBucketCount,
      loadMissingBucketCount: source.sustainedLoad.coverageEvidence.loadMissingBucketCount,
      gridBucketCount: source.sustainedLoad.coverageEvidence.gridBucketCount,
      entryLabelCount: source.sustainedLoad.entryLabelCount,
      distinctMsLabelsInTrip: source.sustainedLoad.distinctMsLabelsInTrip,
    },
  };

  const plane: DbiP2c2PowertrainProxyCandidatesPlaneV1 = {
    evidencePlane: 'POWERTRAIN_PROXY_CANDIDATES',
    participant,
    candidates,
  };

  return {
    ok: true,
    plane,
    orderingDigest: buildOrderingDigest(candidates.map((c) => c.sourceEpisodeKey)),
  };
}
