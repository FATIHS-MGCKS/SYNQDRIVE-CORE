import { hasUncertainHistoricalObdRecordTime, resolveTelemetrySourceFamily } from '../../telemetry-source-family';
import { DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-scientific-claims.v1';
import type {
  Ds4PowertrainDemandBindingAbstainReason,
  Ds4PowertrainDemandRevvingIdleResultV1,
  Ds4RevvingIdleFacetCoverageDiagnosticsV1,
  Ds4RevvingIdleResearchInputV1,
} from './ds4-powertrain-demand-research.contract.v1';
import {
  DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION,
  DS4_REVIVING_IDLE_DUAL_FACET_RESEARCH_POLICY_VERSION,
} from './ds4-powertrain-demand-research.contract.v1';
import {
  classifyFacetATripEvidenceAfterDetection,
  classifyFacetBTripEvidenceAfterDetection,
  evaluateRevvingIdleFacetAAssessability,
  evaluateRevvingIdleFacetBAssessability,
  resolveRevvingIdleTripStatus,
} from './ds4-powertrain-demand-revving-idle-assessability.v1';
import {
  detectRevvingIdleDualFacetCandidates,
  DS4_REVIVING_IDLE_SCIENTIFIC_LIMITATION_CODES,
} from './ds4-powertrain-demand-revving-idle-dual-facet.v1';
import { canonicalizeMultichannelObservations } from './ds4-powertrain-demand-multichannel-canonicalize.v1';
import { validateDs4PowertrainDemandRevvingIdleInputBinding } from './ds4-powertrain-demand-revving-idle.input-binding.v1';

const SYNTHETIC_PROVENANCE_LIMITATION = 'SYNTHETIC_FIXTURE_NOT_SOURCE_ATTESTED';

type Ds4RevvingIdleGlobalCoverageV1 = {
  gridBucketCount: number;
  rpmAndSpeedPresentBucketCount: number;
  rpmMissingBucketCount: number;
  speedMissingBucketCount: number;
  loadPresentBucketCount: number;
  coolantPresentBucketCount: number;
  distinctMsLabelsInTrip: number;
  identicalDuplicateCollapsedCount: number;
};

const UNTRUSTED_GLOBAL_COVERAGE: Ds4RevvingIdleGlobalCoverageV1 = {
  gridBucketCount: 0,
  rpmAndSpeedPresentBucketCount: 0,
  rpmMissingBucketCount: 0,
  speedMissingBucketCount: 0,
  loadPresentBucketCount: 0,
  coolantPresentBucketCount: 0,
  distinctMsLabelsInTrip: 0,
  identicalDuplicateCollapsedCount: 0,
};

const UNTRUSTED_FACET_DIAGNOSTICS: Ds4RevvingIdleFacetCoverageDiagnosticsV1 = {
  rpmSpeedCoObservedLabelCount: 0,
  rpmMissingRequiredChannelCount: 0,
  speedMissingRequiredChannelCount: 0,
  longestCoherentRunLabelCount: 0,
  longestCoherentResearchLabelSpanMs: 0,
  longestCoherentMaxAdjacentGapMs: 0,
  maxQualifyingCoherentResearchLabelSpanMs: 0,
  labelsInMaxSpanRun: 0,
  spanMsInMaxLabelCountRun: 0,
  assessabilityReasonCodes: ['INTEGRITY_NOT_ADMITTED'],
};

function buildGlobalCoverageFromCanon(
  canon: ReturnType<typeof canonicalizeMultichannelObservations>,
): Ds4RevvingIdleGlobalCoverageV1 {
  const gridCount = canon.buckets.length;
  const rpmAndSpeed = canon.buckets.filter((b) => b.rpm != null && b.speedKmh != null).length;
  return {
    gridBucketCount: gridCount,
    rpmAndSpeedPresentBucketCount: rpmAndSpeed,
    rpmMissingBucketCount: canon.buckets.filter((b) => b.rpm == null).length,
    speedMissingBucketCount: canon.buckets.filter((b) => b.speedKmh == null).length,
    loadPresentBucketCount: canon.buckets.filter((b) => b.loadPct != null).length,
    coolantPresentBucketCount: canon.buckets.filter((b) => b.coolantC != null).length,
    distinctMsLabelsInTrip: new Set(canon.buckets.map((b) => b.recordedAtMs)).size,
    identicalDuplicateCollapsedCount: canon.identicalDuplicateCollapsedCount,
  };
}

function buildAbstained(
  input: Ds4RevvingIdleResearchInputV1,
  reasonCodes: readonly Ds4PowertrainDemandBindingAbstainReason[],
  familyPreview: ReturnType<typeof resolveTelemetrySourceFamily>,
): Ds4PowertrainDemandRevvingIdleResultV1 {
  return {
    contractVersion: DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION,
    policyVersion: DS4_REVIVING_IDLE_DUAL_FACET_RESEARCH_POLICY_VERSION,
    researchOnly: true,
    timeAuthority: 'BUCKET_LABEL_UNVERIFIED',
    temporalMode: 'MODE_A',
    misuseEligibility: 'NOT_EVALUATED_BY_DESIGN',
    evidenceOrigin: input.evidenceOrigin,
    status: 'ABSTAINED',
    abstainReasons: [...reasonCodes],
    provenance: {
      contentConsistencyVerified: false,
      sourceProvenanceVerified: false,
      independentFieldValidation: false,
    },
    bindings: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      providerSourceLinkId: input.providerSourceLinkId,
      v1bInputFingerprint: input.v1bResult?.inputFingerprint ?? null,
      multichannelFingerprint: input.multichannelFingerprint,
      telemetrySourceFamily: familyPreview,
      sourceBundleId: input.sourceBundleId,
    },
    revvingIdle: {
      canonicalRowsFullKey: 0,
      distinctMsLabelsInTrip: 0,
      identicalDuplicateCollapsedCount: 0,
      facetA: {
        assessability: 'NOT_ASSESSABLE',
        coverageDiagnostics: { ...UNTRUSTED_FACET_DIAGNOSTICS },
        entryLabelCount: 0,
        deduplicatedCandidateCount: 0,
        candidates: [],
        tripEvidenceClassification: 'NOT_ASSESSABLE',
      },
      facetB: {
        assessability: 'NOT_ASSESSABLE',
        coverageDiagnostics: { ...UNTRUSTED_FACET_DIAGNOSTICS },
        entryLabelCount: 0,
        deduplicatedCandidateCount: 0,
        candidates: [],
        tripEvidenceClassification: 'NOT_ASSESSABLE',
      },
      coverageEvidence: { ...UNTRUSTED_GLOBAL_COVERAGE },
      scientificLimitationCodes: [...DS4_REVIVING_IDLE_SCIENTIFIC_LIMITATION_CODES],
    },
    unsupportedScientificClaims: [...DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS],
    r1HistoricalObdRecordTimeUncertain:
      familyPreview != null && hasUncertainHistoricalObdRecordTime(familyPreview),
    realDataValidation: 'NOT_EVALUATED',
  };
}

export function computeDs4PowertrainDemandRevvingIdleResearchV1(
  input: Ds4RevvingIdleResearchInputV1,
): Ds4PowertrainDemandRevvingIdleResultV1 {
  const familyPreview = resolveTelemetrySourceFamily(input.dimoVehicleRawJson);
  const binding = validateDs4PowertrainDemandRevvingIdleInputBinding(input);
  if (!binding.ok) {
    const out = buildAbstained(input, binding.reasonCodes, familyPreview);
    if (input.evidenceOrigin === 'SYNTHETIC_FIXTURE') {
      return {
        ...out,
        unsupportedScientificClaims: [
          ...out.unsupportedScientificClaims,
          'SYNTHETIC_FIXTURE_SUCCESS_NOT_FIELD_VALIDATION',
          SYNTHETIC_PROVENANCE_LIMITATION,
        ],
      };
    }
    return out;
  }

  const canon = binding.canon;
  const globalCoverage = buildGlobalCoverageFromCanon(canon);
  const facetAAssess = evaluateRevvingIdleFacetAAssessability(canon);
  const facetBAssess = evaluateRevvingIdleFacetBAssessability(canon);

  const detect = detectRevvingIdleDualFacetCandidates({
    tripId: input.tripId,
    providerSourceLinkId: input.providerSourceLinkId,
    fuelType: input.fuelType,
    isEvPowertrain: input.isEvPowertrain,
    canon,
    runFacetA: facetAAssess.assessable,
    runFacetB: facetBAssess.assessable,
  });

  const facetATripEvidence = classifyFacetATripEvidenceAfterDetection({
    assessable: facetAAssess.assessable,
    candidateCount: detect.facetA.candidates.length,
    assessabilityReasonCodes: facetAAssess.diagnostics.assessabilityReasonCodes,
  });
  const facetBTripEvidence = classifyFacetBTripEvidenceAfterDetection({
    assessable: facetBAssess.assessable,
    candidateCount: detect.facetB.candidates.length,
    assessabilityReasonCodes: facetBAssess.diagnostics.assessabilityReasonCodes,
  });

  const status = resolveRevvingIdleTripStatus({
    globalAbstained: false,
    facetATripEvidence,
    facetBTripEvidence,
  });

  const unsupportedScientificClaims: string[] = [...DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS];
  if (input.evidenceOrigin === 'SYNTHETIC_FIXTURE') {
    unsupportedScientificClaims.push('SYNTHETIC_FIXTURE_SUCCESS_NOT_FIELD_VALIDATION');
    unsupportedScientificClaims.push(SYNTHETIC_PROVENANCE_LIMITATION);
  }

  return {
    contractVersion: DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION,
    policyVersion: DS4_REVIVING_IDLE_DUAL_FACET_RESEARCH_POLICY_VERSION,
    researchOnly: true,
    timeAuthority: 'BUCKET_LABEL_UNVERIFIED',
    temporalMode: 'MODE_A',
    misuseEligibility: 'NOT_EVALUATED_BY_DESIGN',
    evidenceOrigin: input.evidenceOrigin,
    status,
    abstainReasons: [],
    provenance: {
      contentConsistencyVerified: input.evidenceOrigin === 'OFFLINE_SEALED_BUNDLE',
      sourceProvenanceVerified: false,
      independentFieldValidation: false,
    },
    bindings: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      providerSourceLinkId: input.providerSourceLinkId,
      v1bInputFingerprint: binding.recomputedV1bFingerprint,
      multichannelFingerprint: binding.recomputedMultichannelFingerprint,
      telemetrySourceFamily: binding.telemetrySourceFamily,
      sourceBundleId: input.sourceBundleId,
    },
    revvingIdle: {
      canonicalRowsFullKey: canon.buckets.length,
      distinctMsLabelsInTrip: globalCoverage.distinctMsLabelsInTrip,
      identicalDuplicateCollapsedCount: canon.identicalDuplicateCollapsedCount,
      facetA: {
        assessability: facetAAssess.assessable ? 'ASSESSABLE' : 'NOT_ASSESSABLE',
        coverageDiagnostics: {
          ...facetAAssess.diagnostics,
          assessabilityReasonCodes: [...facetAAssess.diagnostics.assessabilityReasonCodes],
        },
        entryLabelCount: detect.facetA.entryLabelCount,
        deduplicatedCandidateCount: detect.facetA.candidates.length,
        candidates: detect.facetA.candidates,
        tripEvidenceClassification: facetATripEvidence,
      },
      facetB: {
        assessability: facetBAssess.assessable ? 'ASSESSABLE' : 'NOT_ASSESSABLE',
        coverageDiagnostics: {
          ...facetBAssess.diagnostics,
          assessabilityReasonCodes: [...facetBAssess.diagnostics.assessabilityReasonCodes],
        },
        entryLabelCount: detect.facetB.entryLabelCount,
        deduplicatedCandidateCount: detect.facetB.candidates.length,
        candidates: detect.facetB.candidates,
        tripEvidenceClassification: facetBTripEvidence,
      },
      coverageEvidence: {
        gridBucketCount: globalCoverage.gridBucketCount,
        rpmAndSpeedPresentBucketCount: globalCoverage.rpmAndSpeedPresentBucketCount,
        rpmMissingBucketCount: globalCoverage.rpmMissingBucketCount,
        speedMissingBucketCount: globalCoverage.speedMissingBucketCount,
        loadPresentBucketCount: globalCoverage.loadPresentBucketCount,
        coolantPresentBucketCount: globalCoverage.coolantPresentBucketCount,
      },
      scientificLimitationCodes: [...DS4_REVIVING_IDLE_SCIENTIFIC_LIMITATION_CODES],
    },
    unsupportedScientificClaims,
    r1HistoricalObdRecordTimeUncertain: hasUncertainHistoricalObdRecordTime(binding.telemetrySourceFamily),
    realDataValidation: input.evidenceOrigin === 'SYNTHETIC_FIXTURE' ? 'SYNTHETIC_ONLY' : 'NOT_EVALUATED',
  };
}
