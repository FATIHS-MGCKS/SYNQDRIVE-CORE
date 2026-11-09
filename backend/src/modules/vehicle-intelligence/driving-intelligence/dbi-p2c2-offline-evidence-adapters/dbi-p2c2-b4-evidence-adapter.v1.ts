import type { Ds4PowertrainDemandRevvingIdleResultV1 } from '../ds4-powertrain-demand-research/ds4-powertrain-demand-research.contract.v1';
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

function facetCandidatesToEnvelopes(
  facet: 'HIGH_RPM_STATIONARY_LIKE_PROXY' | 'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY',
  items:
    | Ds4PowertrainDemandRevvingIdleResultV1['revvingIdle']['facetA']['candidates']
    | Ds4PowertrainDemandRevvingIdleResultV1['revvingIdle']['facetB']['candidates'],
): DbiP2c2ProxyCandidateEnvelopeV1[] {
  const sorted = [...items].sort((a, b) => {
    if (a.researchLabelSpanMs !== b.researchLabelSpanMs) return a.researchLabelSpanMs - b.researchLabelSpanMs;
    return a.episodeKey.localeCompare(b.episodeKey);
  });
  return sorted.map((originalCandidate) => ({
    sourceModule: 'P2-B4' as const,
    facet,
    originalCandidate,
    originalClassification: originalCandidate.classification,
    sourceEpisodeKey: originalCandidate.episodeKey,
  }));
}

export function adaptDs4RevvingIdleResearchToP2c2Evidence(
  source: Ds4PowertrainDemandRevvingIdleResultV1,
): DbiP2c2AdapterOutcomeV1<DbiP2c2PowertrainProxyCandidatesPlaneV1> {
  const diagnostics: import('./dbi-p2c2-evidence-adapter.contract.v1').DbiP2c2AdapterDiagnosticCodeV1[] = [];
  if (!source.researchOnly) diagnostics.push('SOURCE_NOT_RESEARCH_ONLY');

  const labels = [
    ...source.revvingIdle.facetA.candidates.flatMap((c) => [
      c.startProviderBucketLabelIso,
      c.endProviderBucketLabelIso,
    ]),
    ...source.revvingIdle.facetB.candidates.flatMap((c) => [
      c.startProviderBucketLabelIso,
      c.endProviderBucketLabelIso,
    ]),
  ];
  diagnostics.push(...collectInvalidBucketLabels(labels));
  if (diagnostics.length > 0) {
    return { ok: false, sourceModule: 'P2-B4', diagnosticCodes: diagnostics };
  }

  const facetAEnvelopes = facetCandidatesToEnvelopes(
    'HIGH_RPM_STATIONARY_LIKE_PROXY',
    source.revvingIdle.facetA.candidates,
  );
  const facetBEnvelopes = facetCandidatesToEnvelopes(
    'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY',
    source.revvingIdle.facetB.candidates,
  );
  const candidates = [...facetAEnvelopes, ...facetBEnvelopes];

  const bothFacetsNotAssessable =
    source.revvingIdle.facetA.assessability === 'NOT_ASSESSABLE' &&
    source.revvingIdle.facetB.assessability === 'NOT_ASSESSABLE';

  const adapterClaimsPositiveEvidence = computeAdapterClaimsPositiveEvidence({
    tripStatus: source.status,
    classifications: candidates.map((c) => c.originalClassification),
    extraBlock: bothFacetsNotAssessable,
  });

  const limitationCodes = [
    ...facetAEnvelopes.flatMap((c) =>
      'limitationCodes' in c.originalCandidate ? c.originalCandidate.limitationCodes : [],
    ),
    ...facetBEnvelopes.flatMap((c) =>
      'limitationCodes' in c.originalCandidate ? c.originalCandidate.limitationCodes : [],
    ),
  ];

  const participant = {
    contractVersion: DBI_P2C2_EVIDENCE_ADAPTER_CONTRACT_VERSION,
    sourceModule: 'P2-B4' as const,
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
    scientificLimitationCodes: limitationCodes,
    adapterClaimsPositiveEvidence,
    facetA: {
      facet: 'HIGH_RPM_STATIONARY_LIKE_PROXY' as const,
      assessability: source.revvingIdle.facetA.assessability,
      tripEvidenceClassification: source.revvingIdle.facetA.tripEvidenceClassification,
      assessabilityReasonCodes: [...source.revvingIdle.facetA.coverageDiagnostics.assessabilityReasonCodes],
      coverageDiagnostics: source.revvingIdle.facetA.coverageDiagnostics,
      entryLabelCount: source.revvingIdle.facetA.entryLabelCount,
      deduplicatedCandidateCount: source.revvingIdle.facetA.deduplicatedCandidateCount,
    },
    facetB: {
      facet: 'EXCESSIVE_STATIONARY_LIKE_SPAN_PROXY' as const,
      assessability: source.revvingIdle.facetB.assessability,
      tripEvidenceClassification: source.revvingIdle.facetB.tripEvidenceClassification,
      assessabilityReasonCodes: [...source.revvingIdle.facetB.coverageDiagnostics.assessabilityReasonCodes],
      coverageDiagnostics: source.revvingIdle.facetB.coverageDiagnostics,
      entryLabelCount: source.revvingIdle.facetB.entryLabelCount,
      deduplicatedCandidateCount: source.revvingIdle.facetB.deduplicatedCandidateCount,
    },
    coverageEvidence: { ...source.revvingIdle.coverageEvidence },
  };

  const plane: DbiP2c2PowertrainProxyCandidatesPlaneV1 = {
    evidencePlane: 'POWERTRAIN_PROXY_CANDIDATES',
    participant,
    candidates,
  };

  return {
    ok: true,
    plane,
    orderingDigest: buildOrderingDigest(
      candidates.map((c) =>
        c.sourceModule === 'P2-B4' ? `${c.facet}:${c.sourceEpisodeKey}` : c.sourceEpisodeKey,
      ),
    ),
  };
}
