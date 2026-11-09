import type { Ds4PowertrainDemandColdEngineResultV1 } from '../ds4-powertrain-demand-research/ds4-powertrain-demand-research.contract.v1';
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

export function adaptDs4ColdEngineResearchToP2c2Evidence(
  source: Ds4PowertrainDemandColdEngineResultV1,
): DbiP2c2AdapterOutcomeV1<DbiP2c2PowertrainProxyCandidatesPlaneV1> {
  const diagnostics: import('./dbi-p2c2-evidence-adapter.contract.v1').DbiP2c2AdapterDiagnosticCodeV1[] = [];
  if (!source.researchOnly) diagnostics.push('SOURCE_NOT_RESEARCH_ONLY');

  const labels = source.coldEngine.candidates.flatMap((c) => [
    c.providerBucketLabelStartIso,
    c.providerBucketLabelEndIso,
  ]);
  diagnostics.push(...collectInvalidBucketLabels(labels));
  if (diagnostics.length > 0) {
    return { ok: false, sourceModule: 'P2-B2', diagnosticCodes: diagnostics };
  }

  const sorted = [...source.coldEngine.candidates].sort((a, b) => {
    if (a.proxyKind !== b.proxyKind) return a.proxyKind.localeCompare(b.proxyKind);
    if (a.startBucketIndex !== b.startBucketIndex) return a.startBucketIndex - b.startBucketIndex;
    return a.episodeKey.localeCompare(b.episodeKey);
  });

  const candidates: DbiP2c2ProxyCandidateEnvelopeV1[] = sorted.map((originalCandidate) => ({
    sourceModule: 'P2-B2',
    originalCandidate,
    originalClassification: originalCandidate.classification,
    proxyKind: originalCandidate.proxyKind,
    sourceEpisodeKey: originalCandidate.episodeKey,
  }));

  const adapterClaimsPositiveEvidence = computeAdapterClaimsPositiveEvidence({
    tripStatus: source.status,
    classifications: candidates.map((c) => c.originalClassification),
  });

  const participant = {
    contractVersion: DBI_P2C2_EVIDENCE_ADAPTER_CONTRACT_VERSION,
    sourceModule: 'P2-B2' as const,
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
    subtypeAssessability: { ...source.coldEngine.subtypeAssessability },
    moduleCoverage: {
      localCoverageScope: source.coldEngine.coverageEvidence.localCoverageScope,
      fullTripColdStateCoverageVerdict: source.coldEngine.coverageEvidence.fullTripColdStateCoverageVerdict,
      referenceTrustTier: source.bindings.highRpmReferenceTrustTier,
      vehicleRpmReferenceBinding: source.bindings.vehicleRpmReferenceBinding,
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
