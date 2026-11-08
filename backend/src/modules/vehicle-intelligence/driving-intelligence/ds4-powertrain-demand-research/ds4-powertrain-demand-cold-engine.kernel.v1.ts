import { hasUncertainHistoricalObdRecordTime, resolveTelemetrySourceFamily } from '../../telemetry-source-family';
import { DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-scientific-claims.v1';
import {
  computeColdEngineSubtypeAssessability,
  detectColdEngineBucketGridCandidates,
} from './ds4-powertrain-demand-cold-engine-bucket-grid.v1';
import { evaluateColdEngineHighRpmReferenceAdmission } from './ds4-powertrain-demand-cold-engine-reference.v1';
import { validateDs4PowertrainDemandColdEngineInputBinding } from './ds4-powertrain-demand-cold-engine.input-binding.v1';
import { canonicalizeMultichannelObservations } from './ds4-powertrain-demand-multichannel-canonicalize.v1';
import type {
  Ds4PowertrainDemandBindingAbstainReason,
  Ds4PowertrainDemandColdEngineResearchInputV1,
  Ds4PowertrainDemandColdEngineResultV1,
} from './ds4-powertrain-demand-research.contract.v1';
import {
  DS4_COLD_ENGINE_BUCKET_GRID_RESEARCH_POLICY_VERSION,
  DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION,
} from './ds4-powertrain-demand-research.contract.v1';

const R1_OBD_RECORD_TIME_UNCERTAIN = 'R1_HISTORICAL_OBD_RECORD_TIME_UNCERTAIN';
const SYNTHETIC_PROVENANCE_LIMITATION = 'SYNTHETIC_FIXTURE_NOT_SOURCE_ATTESTED';

function buildAbstained(
  input: Ds4PowertrainDemandColdEngineResearchInputV1,
  reasonCodes: readonly Ds4PowertrainDemandBindingAbstainReason[],
  familyPreview: ReturnType<typeof resolveTelemetrySourceFamily>,
): Ds4PowertrainDemandColdEngineResultV1 {
  return {
    contractVersion: DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION,
    policyVersion: DS4_COLD_ENGINE_BUCKET_GRID_RESEARCH_POLICY_VERSION,
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
      vehicleRpmReferenceBinding: input.vehicleRpmReferenceBinding,
      highRpmReferenceTrustTier: null,
    },
    coldEngine: {
      rawWindowCount: 0,
      deduplicatedCandidateCount: 0,
      candidates: [],
      subtypeAssessability: {
        COLD_ENGINE_HIGH_LOAD: { status: 'NOT_ASSESSABLE', reasonCodes: ['BINDING_ABSTAINED'] },
        COLD_ENGINE_HIGH_RPM: { status: 'NOT_ASSESSABLE', reasonCodes: ['BINDING_ABSTAINED'] },
        COLD_ENGINE_FULL_THROTTLE: { status: 'NOT_ASSESSABLE', reasonCodes: ['BINDING_ABSTAINED'] },
      },
      coverageEvidence: {
        rpmTripCoverage: null,
        localCoverageScope: null,
        fullTripColdStateCoverageVerdict: null,
        ectPresentBucketCount: 0,
        ectMissingBucketCount: 0,
        ectColdObservedBucketCount: 0,
        ectWarmObservedBucketCount: 0,
        gridBucketCount: 0,
      },
    },
    unsupportedScientificClaims: [...DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS],
    r1HistoricalObdRecordTimeUncertain:
      familyPreview != null && hasUncertainHistoricalObdRecordTime(familyPreview),
    realDataValidation: 'NOT_EVALUATED',
  };
}

export function computeDs4PowertrainDemandColdEngineResearchV1(
  input: Ds4PowertrainDemandColdEngineResearchInputV1,
): Ds4PowertrainDemandColdEngineResultV1 {
  const familyPreview = resolveTelemetrySourceFamily(input.dimoVehicleRawJson);

  const binding = validateDs4PowertrainDemandColdEngineInputBinding(input);
  if (!binding.ok) {
    const out = buildAbstained(input, binding.reasonCodes, familyPreview);
    if (input.evidenceOrigin === 'SYNTHETIC_FIXTURE') {
      out.unsupportedScientificClaims.push('SYNTHETIC_FIXTURE_SUCCESS_NOT_FIELD_VALIDATION');
      out.unsupportedScientificClaims.push(SYNTHETIC_PROVENANCE_LIMITATION);
    }
    return out;
  }

  const canon = canonicalizeMultichannelObservations(input.multichannelObservations);
  const nominalMs = (binding.cadenceProfile.nominalCadenceSeconds ?? 1) * 1000;

  const highRpmReference = evaluateColdEngineHighRpmReferenceAdmission({
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    vehicleRpmReferenceBinding: input.vehicleRpmReferenceBinding,
    reference: input.vehicleRpmReference,
    evidenceOrigin: input.evidenceOrigin,
  });

  const subtypeAssessability = computeColdEngineSubtypeAssessability({
    buckets: canon.buckets,
    highRpmReference,
    rpmEvidencePresent: binding.rpmEvidencePresent,
  });

  const detect = detectColdEngineBucketGridCandidates({
    tripId: input.tripId,
    providerSourceLinkId: input.providerSourceLinkId,
    canon,
    sequenceMaxGapSeconds: binding.cadenceProfile.sequenceMaxGapSeconds,
    nominalCadenceMs: nominalMs,
    fuelType: input.fuelType,
    subtypeAssessability,
    highRpmReference,
  });

  const claims: string[] = [
    ...DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS,
    'NO_OEM_COLD_ENGINE_DAMAGE_CONFIRMATION',
    'COLD_ENGINE_PROXY_CANDIDATE_ONLY',
    'BUCKET_LABEL_UNVERIFIED',
    'BUCKET_CO_OBSERVED_NOT_SYNCHRONIZED',
    'SOURCE_ATTESTATION_NOT_INDEPENDENTLY_VERIFIED',
    'FULL_TRIP_COLD_STATE_COVERAGE_UNKNOWN',
    'EXTERIOR_TEMP_NOT_COOLANT',
    'NO_MEASURED_DURATION_CLAIM',
    'NO_HARMFUL_OPERATION_INFERENCE',
  ];
  if (input.evidenceOrigin === 'SYNTHETIC_FIXTURE') {
    claims.push('SYNTHETIC_FIXTURE_SUCCESS_NOT_FIELD_VALIDATION');
    claims.push(SYNTHETIC_PROVENANCE_LIMITATION);
  }
  if (hasUncertainHistoricalObdRecordTime(binding.telemetrySourceFamily)) {
    claims.push(R1_OBD_RECORD_TIME_UNCERTAIN);
  }
  if (input.fuelType != null) {
    claims.push('FUEL_TYPE_CALLER_DECLARED_UNVERIFIED');
  }

  const status =
    detect.candidates.length > 0
      ? 'COMPUTED'
      : binding.ectCoverage.ectColdObservedBucketCount > 0
        ? 'NOT_OBSERVED'
        : 'NOT_OBSERVED';

  return {
    contractVersion: DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION,
    policyVersion: DS4_COLD_ENGINE_BUCKET_GRID_RESEARCH_POLICY_VERSION,
    researchOnly: true,
    timeAuthority: 'BUCKET_LABEL_UNVERIFIED',
    temporalMode: 'MODE_A',
    misuseEligibility: 'NOT_EVALUATED_BY_DESIGN',
    evidenceOrigin: input.evidenceOrigin,
    status,
    abstainReasons: [],
    provenance: {
      contentConsistencyVerified: true,
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
      vehicleRpmReferenceBinding: input.vehicleRpmReferenceBinding,
      highRpmReferenceTrustTier: highRpmReference.referenceTrustTier,
    },
    coldEngine: {
      rawWindowCount: detect.rawWindowCount,
      deduplicatedCandidateCount: detect.candidates.length,
      candidates: detect.candidates,
      subtypeAssessability: detect.subtypeAssessability,
      coverageEvidence: {
        rpmTripCoverage: binding.rpmTripCoverage,
        localCoverageScope: binding.ectCoverage.localCoverageScope,
        fullTripColdStateCoverageVerdict: binding.ectCoverage.fullTripColdStateCoverageVerdict,
        ectPresentBucketCount: binding.ectCoverage.ectPresentBucketCount,
        ectMissingBucketCount: binding.ectCoverage.ectMissingBucketCount,
        ectColdObservedBucketCount: binding.ectCoverage.ectColdObservedBucketCount,
        ectWarmObservedBucketCount: binding.ectCoverage.ectWarmObservedBucketCount,
        gridBucketCount: binding.ectCoverage.gridBucketCount,
      },
    },
    unsupportedScientificClaims: claims,
    r1HistoricalObdRecordTimeUncertain: hasUncertainHistoricalObdRecordTime(binding.telemetrySourceFamily),
    realDataValidation:
      input.evidenceOrigin === 'SYNTHETIC_FIXTURE' ? 'SYNTHETIC_ONLY' : 'NOT_EVALUATED',
  };
}
