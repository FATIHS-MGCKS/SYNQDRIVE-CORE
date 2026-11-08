import { hasUncertainHistoricalObdRecordTime, resolveTelemetrySourceFamily } from '../../telemetry-source-family';
import { DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-scientific-claims.v1';
import type {
  Ds4PowertrainDemandBindingAbstainReason,
  Ds4PowertrainDemandSustainedLoadResultV1,
  Ds4SustainedLoadResearchInputV1,
} from './ds4-powertrain-demand-research.contract.v1';
import {
  DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION,
  DS4_SUSTAINED_LOAD_GAP_AWARE_RESEARCH_POLICY_VERSION,
} from './ds4-powertrain-demand-research.contract.v1';
import {
  classifySustainedLoadTripEvidence,
  detectGapAwareSustainedLoadCandidates,
} from './ds4-powertrain-demand-sustained-load-gap-aware.v1';
import { canonicalizeMultichannelObservations } from './ds4-powertrain-demand-multichannel-canonicalize.v1';
import { validateDs4PowertrainDemandSustainedLoadInputBinding } from './ds4-powertrain-demand-sustained-load.input-binding.v1';

const SYNTHETIC_PROVENANCE_LIMITATION = 'SYNTHETIC_FIXTURE_NOT_SOURCE_ATTESTED';

type Ds4SustainedLoadAbstainCoverageV1 = {
  gridBucketCount: number;
  loadPresentBucketCount: number;
  loadMissingBucketCount: number;
  distinctMsLabelsInTrip: number;
  identicalDuplicateCollapsedCount: number;
};

const UNTRUSTED_ABSTAIN_COVERAGE: Ds4SustainedLoadAbstainCoverageV1 = {
  gridBucketCount: 0,
  loadPresentBucketCount: 0,
  loadMissingBucketCount: 0,
  distinctMsLabelsInTrip: 0,
  identicalDuplicateCollapsedCount: 0,
};

/** Insufficient load min is the only binding failure — integrity gates otherwise passed. */
export function isSoleInsufficientLoadLabelBindingFailure(
  reasonCodes: readonly Ds4PowertrainDemandBindingAbstainReason[],
): boolean {
  const unique = [...new Set(reasonCodes)];
  return unique.length === 1 && unique[0] === 'INSUFFICIENT_LOAD_LABEL_OBSERVATIONS';
}

function tripEvidenceForAbstain(
  reasonCodes: readonly Ds4PowertrainDemandBindingAbstainReason[],
): Ds4PowertrainDemandSustainedLoadResultV1['sustainedLoad']['tripEvidenceClassification'] {
  if (isSoleInsufficientLoadLabelBindingFailure(reasonCodes)) {
    return 'INSUFFICIENT_OBSERVATIONS';
  }
  return 'NOT_ASSESSABLE';
}

function buildAbstained(
  input: Ds4SustainedLoadResearchInputV1,
  reasonCodes: readonly Ds4PowertrainDemandBindingAbstainReason[],
  familyPreview: ReturnType<typeof resolveTelemetrySourceFamily>,
  coverage: Ds4SustainedLoadAbstainCoverageV1,
): Ds4PowertrainDemandSustainedLoadResultV1 {
  return {
    contractVersion: DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION,
    policyVersion: DS4_SUSTAINED_LOAD_GAP_AWARE_RESEARCH_POLICY_VERSION,
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
    sustainedLoad: {
      canonicalRowsFullKey: coverage.gridBucketCount,
      distinctMsLabelsInTrip: coverage.distinctMsLabelsInTrip,
      identicalDuplicateCollapsedCount: coverage.identicalDuplicateCollapsedCount,
      entryLabelCount: 0,
      deduplicatedCandidateCount: 0,
      candidates: [],
      tripEvidenceClassification: tripEvidenceForAbstain(reasonCodes),
      coverageEvidence: {
        loadPresentBucketCount: coverage.loadPresentBucketCount,
        loadMissingBucketCount: coverage.loadMissingBucketCount,
        gridBucketCount: coverage.gridBucketCount,
      },
    },
    unsupportedScientificClaims: [...DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS],
    r1HistoricalObdRecordTimeUncertain:
      familyPreview != null && hasUncertainHistoricalObdRecordTime(familyPreview),
    realDataValidation: 'NOT_EVALUATED',
  };
}

export function computeDs4PowertrainDemandSustainedLoadResearchV1(
  input: Ds4SustainedLoadResearchInputV1,
): Ds4PowertrainDemandSustainedLoadResultV1 {
  const familyPreview = resolveTelemetrySourceFamily(input.dimoVehicleRawJson);
  const binding = validateDs4PowertrainDemandSustainedLoadInputBinding(input);
  if (!binding.ok) {
    let coverageForAbstain = { ...UNTRUSTED_ABSTAIN_COVERAGE };
    if (isSoleInsufficientLoadLabelBindingFailure(binding.reasonCodes)) {
      const canonAbstain = canonicalizeMultichannelObservations(input.multichannelObservations);
      const loadPresentAbstain = canonAbstain.buckets.filter((b) => b.loadPct != null).length;
      coverageForAbstain = {
        gridBucketCount: 0,
        loadMissingBucketCount: 0,
        distinctMsLabelsInTrip: 0,
        identicalDuplicateCollapsedCount: 0,
        loadPresentBucketCount: loadPresentAbstain,
      };
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
  const loadPresentBucketCount = canon.buckets.filter((b) => b.loadPct != null).length;
  const loadMissingBucketCount = canon.buckets.length - loadPresentBucketCount;
  const distinctMs = new Set(canon.buckets.map((b) => b.recordedAtMs)).size;

  const detect = detectGapAwareSustainedLoadCandidates({
    tripId: input.tripId,
    providerSourceLinkId: input.providerSourceLinkId,
    fuelType: input.fuelType,
    canon,
  });

  const tripEvidenceClassification = classifySustainedLoadTripEvidence({
    entryLabelCount: detect.entryLabelCount,
    candidateCount: detect.candidates.length,
    longestRunLabelCount: detect.longestRunLabelCount,
  });

  const status =
    tripEvidenceClassification === 'NOT_OBSERVED' ? 'NOT_OBSERVED' : 'COMPUTED';

  const unsupportedScientificClaims: string[] = [...DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS];
  if (input.evidenceOrigin === 'SYNTHETIC_FIXTURE') {
    unsupportedScientificClaims.push('SYNTHETIC_FIXTURE_SUCCESS_NOT_FIELD_VALIDATION');
    unsupportedScientificClaims.push(SYNTHETIC_PROVENANCE_LIMITATION);
  }

  return {
    contractVersion: DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION,
    policyVersion: DS4_SUSTAINED_LOAD_GAP_AWARE_RESEARCH_POLICY_VERSION,
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
    sustainedLoad: {
      canonicalRowsFullKey: canon.buckets.length,
      distinctMsLabelsInTrip: distinctMs,
      identicalDuplicateCollapsedCount: canon.identicalDuplicateCollapsedCount,
      entryLabelCount: detect.entryLabelCount,
      deduplicatedCandidateCount: detect.candidates.length,
      candidates: detect.candidates,
      tripEvidenceClassification,
      coverageEvidence: {
        loadPresentBucketCount,
        loadMissingBucketCount,
        gridBucketCount: canon.buckets.length,
      },
    },
    unsupportedScientificClaims,
    r1HistoricalObdRecordTimeUncertain: hasUncertainHistoricalObdRecordTime(binding.telemetrySourceFamily),
    realDataValidation: input.evidenceOrigin === 'SYNTHETIC_FIXTURE' ? 'SYNTHETIC_ONLY' : 'NOT_EVALUATED',
  };
}
