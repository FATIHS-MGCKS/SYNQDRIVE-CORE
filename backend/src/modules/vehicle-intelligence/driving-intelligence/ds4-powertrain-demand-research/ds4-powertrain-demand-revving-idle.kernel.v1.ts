import { hasUncertainHistoricalObdRecordTime, resolveTelemetrySourceFamily } from '../../telemetry-source-family';
import { DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-scientific-claims.v1';
import type {
  Ds4PowertrainDemandBindingAbstainReason,
  Ds4PowertrainDemandRevvingIdleResultV1,
  Ds4RevvingIdleResearchInputV1,
} from './ds4-powertrain-demand-research.contract.v1';
import {
  DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION,
  DS4_REVIVING_IDLE_DUAL_FACET_RESEARCH_POLICY_VERSION,
} from './ds4-powertrain-demand-research.contract.v1';
import {
  classifyRevvingIdleFacetATripEvidence,
  classifyRevvingIdleFacetBTripEvidence,
  detectRevvingIdleDualFacetCandidates,
  DS4_REVIVING_IDLE_SCIENTIFIC_LIMITATION_CODES,
} from './ds4-powertrain-demand-revving-idle-dual-facet.v1';
import { canonicalizeMultichannelObservations } from './ds4-powertrain-demand-multichannel-canonicalize.v1';
import { validateDs4PowertrainDemandRevvingIdleInputBinding } from './ds4-powertrain-demand-revving-idle.input-binding.v1';

const SYNTHETIC_PROVENANCE_LIMITATION = 'SYNTHETIC_FIXTURE_NOT_SOURCE_ATTESTED';

type Ds4RevvingIdleAbstainCoverageV1 = {
  gridBucketCount: number;
  rpmAndSpeedPresentBucketCount: number;
  rpmMissingBucketCount: number;
  speedMissingBucketCount: number;
  loadPresentBucketCount: number;
  coolantPresentBucketCount: number;
  distinctMsLabelsInTrip: number;
  identicalDuplicateCollapsedCount: number;
};

const UNTRUSTED_ABSTAIN_COVERAGE: Ds4RevvingIdleAbstainCoverageV1 = {
  gridBucketCount: 0,
  rpmAndSpeedPresentBucketCount: 0,
  rpmMissingBucketCount: 0,
  speedMissingBucketCount: 0,
  loadPresentBucketCount: 0,
  coolantPresentBucketCount: 0,
  distinctMsLabelsInTrip: 0,
  identicalDuplicateCollapsedCount: 0,
};

export function isSoleInsufficientRpmSpeedLabelBindingFailure(
  reasonCodes: readonly Ds4PowertrainDemandBindingAbstainReason[],
): boolean {
  const unique = [...new Set(reasonCodes)];
  return unique.length === 1 && unique[0] === 'INSUFFICIENT_RPM_SPEED_LABEL_OBSERVATIONS';
}

function facetATripEvidenceForAbstain(
  reasonCodes: readonly Ds4PowertrainDemandBindingAbstainReason[],
): Ds4PowertrainDemandRevvingIdleResultV1['revvingIdle']['facetA']['tripEvidenceClassification'] {
  if (isSoleInsufficientRpmSpeedLabelBindingFailure(reasonCodes)) {
    return 'INSUFFICIENT_OBSERVATIONS';
  }
  return 'NOT_ASSESSABLE';
}

function facetBTripEvidenceForAbstain(
  reasonCodes: readonly Ds4PowertrainDemandBindingAbstainReason[],
): Ds4PowertrainDemandRevvingIdleResultV1['revvingIdle']['facetB']['tripEvidenceClassification'] {
  if (isSoleInsufficientRpmSpeedLabelBindingFailure(reasonCodes)) {
    return 'INSUFFICIENT_OBSERVATIONS';
  }
  return 'NOT_ASSESSABLE';
}

function buildCoverageFromCanon(canon: ReturnType<typeof canonicalizeMultichannelObservations>): {
  coverage: Ds4RevvingIdleAbstainCoverageV1;
  distinctMs: number;
} {
  const gridCount = canon.buckets.length;
  const rpmAndSpeed = canon.buckets.filter((b) => b.rpm != null && b.speedKmh != null).length;
  const rpmMissing = canon.buckets.filter((b) => b.rpm == null).length;
  const speedMissing = canon.buckets.filter((b) => b.speedKmh == null).length;
  const loadPresent = canon.buckets.filter((b) => b.loadPct != null).length;
  const coolantPresent = canon.buckets.filter((b) => b.coolantC != null).length;
  const distinctMs = new Set(canon.buckets.map((b) => b.recordedAtMs)).size;
  return {
    distinctMs,
    coverage: {
      gridBucketCount: gridCount,
      rpmAndSpeedPresentBucketCount: rpmAndSpeed,
      rpmMissingBucketCount: rpmMissing,
      speedMissingBucketCount: speedMissing,
      loadPresentBucketCount: loadPresent,
      coolantPresentBucketCount: coolantPresent,
      distinctMsLabelsInTrip: distinctMs,
      identicalDuplicateCollapsedCount: canon.identicalDuplicateCollapsedCount,
    },
  };
}

function buildAbstained(
  input: Ds4RevvingIdleResearchInputV1,
  reasonCodes: readonly Ds4PowertrainDemandBindingAbstainReason[],
  familyPreview: ReturnType<typeof resolveTelemetrySourceFamily>,
  coverage: Ds4RevvingIdleAbstainCoverageV1,
): Ds4PowertrainDemandRevvingIdleResultV1 {
  const facetTripA = facetATripEvidenceForAbstain(reasonCodes);
  const facetTripB = facetBTripEvidenceForAbstain(reasonCodes);
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
      canonicalRowsFullKey: coverage.gridBucketCount,
      distinctMsLabelsInTrip: coverage.distinctMsLabelsInTrip,
      identicalDuplicateCollapsedCount: coverage.identicalDuplicateCollapsedCount,
      facetA: {
        assessability: 'NOT_ASSESSABLE',
        entryLabelCount: 0,
        deduplicatedCandidateCount: 0,
        candidates: [],
        tripEvidenceClassification: facetTripA,
      },
      facetB: {
        assessability: 'NOT_ASSESSABLE',
        entryLabelCount: 0,
        deduplicatedCandidateCount: 0,
        candidates: [],
        tripEvidenceClassification: facetTripB,
      },
      coverageEvidence: {
        gridBucketCount: coverage.gridBucketCount,
        rpmAndSpeedPresentBucketCount: coverage.rpmAndSpeedPresentBucketCount,
        rpmMissingBucketCount: coverage.rpmMissingBucketCount,
        speedMissingBucketCount: coverage.speedMissingBucketCount,
        loadPresentBucketCount: coverage.loadPresentBucketCount,
        coolantPresentBucketCount: coverage.coolantPresentBucketCount,
      },
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
    let coverageForAbstain = { ...UNTRUSTED_ABSTAIN_COVERAGE };
    if (isSoleInsufficientRpmSpeedLabelBindingFailure(binding.reasonCodes)) {
      const canonAbstain = canonicalizeMultichannelObservations(input.multichannelObservations);
      const built = buildCoverageFromCanon(canonAbstain);
      coverageForAbstain = built.coverage;
    }
    const out = buildAbstained(input, binding.reasonCodes, familyPreview, coverageForAbstain);
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
  const { coverage, distinctMs } = buildCoverageFromCanon(canon);

  const detect = detectRevvingIdleDualFacetCandidates({
    tripId: input.tripId,
    providerSourceLinkId: input.providerSourceLinkId,
    fuelType: input.fuelType,
    isEvPowertrain: input.isEvPowertrain,
    canon,
  });

  const facetATripEvidence = classifyRevvingIdleFacetATripEvidence({
    entryLabelCount: detect.facetA.entryLabelCount,
    candidateCount: detect.facetA.candidates.length,
    longestRunLabelCount: detect.facetA.longestRunLabelCount,
  });
  const facetBTripEvidence = classifyRevvingIdleFacetBTripEvidence({
    entryLabelCount: detect.facetB.entryLabelCount,
    candidateCount: detect.facetB.candidates.length,
    longestRunLabelCount: detect.facetB.longestRunLabelCount,
  });

  const bothNotObserved =
    facetATripEvidence === 'NOT_OBSERVED' && facetBTripEvidence === 'NOT_OBSERVED';
  const status = bothNotObserved ? 'NOT_OBSERVED' : 'COMPUTED';

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
      distinctMsLabelsInTrip: distinctMs,
      identicalDuplicateCollapsedCount: canon.identicalDuplicateCollapsedCount,
      facetA: {
        assessability: 'ASSESSABLE',
        entryLabelCount: detect.facetA.entryLabelCount,
        deduplicatedCandidateCount: detect.facetA.candidates.length,
        candidates: detect.facetA.candidates,
        tripEvidenceClassification: facetATripEvidence,
      },
      facetB: {
        assessability: 'ASSESSABLE',
        entryLabelCount: detect.facetB.entryLabelCount,
        deduplicatedCandidateCount: detect.facetB.candidates.length,
        candidates: detect.facetB.candidates,
        tripEvidenceClassification: facetBTripEvidence,
      },
      coverageEvidence: {
        gridBucketCount: coverage.gridBucketCount,
        rpmAndSpeedPresentBucketCount: coverage.rpmAndSpeedPresentBucketCount,
        rpmMissingBucketCount: coverage.rpmMissingBucketCount,
        speedMissingBucketCount: coverage.speedMissingBucketCount,
        loadPresentBucketCount: coverage.loadPresentBucketCount,
        coolantPresentBucketCount: coverage.coolantPresentBucketCount,
      },
      scientificLimitationCodes: [...DS4_REVIVING_IDLE_SCIENTIFIC_LIMITATION_CODES],
    },
    unsupportedScientificClaims,
    r1HistoricalObdRecordTimeUncertain: hasUncertainHistoricalObdRecordTime(binding.telemetrySourceFamily),
    realDataValidation: input.evidenceOrigin === 'SYNTHETIC_FIXTURE' ? 'SYNTHETIC_ONLY' : 'NOT_EVALUATED',
  };
}
