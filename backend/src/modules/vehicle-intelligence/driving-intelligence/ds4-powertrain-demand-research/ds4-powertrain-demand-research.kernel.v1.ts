import { hasUncertainHistoricalObdRecordTime, resolveTelemetrySourceFamily } from '../../telemetry-source-family';
import { DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-scientific-claims.v1';
import { detectKickdownBucketGridCandidates } from './ds4-powertrain-demand-kickdown-bucket-grid.v1';
import { validateDs4PowertrainDemandResearchInputBinding } from './ds4-powertrain-demand-research.input-binding.v1';
import type {
  Ds4PowertrainDemandBindingAbstainReason,
  Ds4PowertrainDemandKickdownResultV1,
  Ds4PowertrainDemandResearchInputV1,
} from './ds4-powertrain-demand-research.contract.v1';
import {
  DS4_KICKDOWN_BUCKET_GRID_RESEARCH_POLICY_VERSION,
  DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION,
} from './ds4-powertrain-demand-research.contract.v1';
import {
  canonicalizeMultichannelObservations,
} from './ds4-powertrain-demand-multichannel-canonicalize.v1';
import type { Ds4MovementScopedCoverageEvidenceV1 } from './ds4-powertrain-demand-movement-coverage.v1';

const R1_OBD_RECORD_TIME_UNCERTAIN = 'R1_HISTORICAL_OBD_RECORD_TIME_UNCERTAIN';
const SYNTHETIC_PROVENANCE_LIMITATION = 'SYNTHETIC_FIXTURE_NOT_SOURCE_ATTESTED';
function buildCoverageEvidence(
  mc: Ds4MovementScopedCoverageEvidenceV1,
  rpmTripCoverage: number,
  gridBucketCount: number,
): Ds4PowertrainDemandKickdownResultV1['kickdown']['coverageEvidence'] {
  return {
    rpmTripCoverage,
    multichannelObservedGridCoverage: mc.multichannelObservedGridCoverage,
    movementObservedCompleteness: mc.movementObservedCompleteness,
    localCoverageScope: mc.localCoverageScope,
    fullTripMovementCoverageVerdict: mc.fullTripMovementCoverageVerdict,
    observedMovingBucketCount: mc.observedMovingBucketCount,
    observedStationaryBucketCount: mc.observedStationaryBucketCount,
    unknownSpeedBucketCount: mc.unknownSpeedBucketCount,
    eligibleObservationCount: gridBucketCount,
    eligibleMovingObservationCount: mc.eligibleMovingObservationCount,
  };
}

function buildAbstained(
  input: Ds4PowertrainDemandResearchInputV1,
  reasonCodes: readonly Ds4PowertrainDemandBindingAbstainReason[],
  familyPreview: ReturnType<typeof resolveTelemetrySourceFamily>,
): Ds4PowertrainDemandKickdownResultV1 {
  return {
    contractVersion: DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION,
    policyVersion: DS4_KICKDOWN_BUCKET_GRID_RESEARCH_POLICY_VERSION,
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
    kickdown: {
      rawWindowCount: 0,
      deduplicatedCandidateCount: 0,
      candidates: [],
      coverageEvidence: {
        rpmTripCoverage: null,
        multichannelObservedGridCoverage: null,
        movementObservedCompleteness: null,
        localCoverageScope: null,
        fullTripMovementCoverageVerdict: null,
        observedMovingBucketCount: 0,
        observedStationaryBucketCount: 0,
        unknownSpeedBucketCount: 0,
        eligibleObservationCount: 0,
        eligibleMovingObservationCount: 0,
      },
    },
    unsupportedScientificClaims: [...DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS],
    r1HistoricalObdRecordTimeUncertain:
      familyPreview != null && hasUncertainHistoricalObdRecordTime(familyPreview),
    realDataValidation: 'NOT_EVALUATED',
  };
}

export function computeDs4PowertrainDemandResearchV1(
  input: Ds4PowertrainDemandResearchInputV1,
): Ds4PowertrainDemandKickdownResultV1 {
  const familyPreview = resolveTelemetrySourceFamily(input.dimoVehicleRawJson);

  const binding = validateDs4PowertrainDemandResearchInputBinding(input);
  if (!binding.ok) {
    const out = buildAbstained(input, binding.reasonCodes, familyPreview);
    if (input.evidenceOrigin === 'SYNTHETIC_FIXTURE') {
      out.unsupportedScientificClaims.push('SYNTHETIC_FIXTURE_SUCCESS_NOT_FIELD_VALIDATION');
      out.unsupportedScientificClaims.push(SYNTHETIC_PROVENANCE_LIMITATION);
    }
    return out;
  }

  const canon = canonicalizeMultichannelObservations(input.multichannelObservations);
  const cadence = binding.cadenceProfile!;
  const nominalMs = (cadence.nominalCadenceSeconds ?? 1) * 1000;
  const detect = detectKickdownBucketGridCandidates({
    tripId: input.tripId,
    providerSourceLinkId: input.providerSourceLinkId,
    canon,
    sequenceMaxGapSeconds: cadence.sequenceMaxGapSeconds,
    nominalCadenceMs: nominalMs,
    movementObservedCompleteness: binding.movementCoverage.movementObservedCompleteness,
    r1HistoricalObdRecordTimeUncertain: hasUncertainHistoricalObdRecordTime(binding.telemetrySourceFamily),
    fuelType: input.fuelType,
  });

  const kickdownCandidates = detect.candidates.filter(
    (c) => c.classification === 'KICKDOWN_LIKE_PROXY_CANDIDATE',
  );

  const claims: string[] = [
    ...DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS,
    'NO_OEM_KICKDOWN_CONFIRMATION',
    'KICKDOWN_LIKE_PROXY_ONLY',
    'BUCKET_LABEL_UNVERIFIED',
    'BUCKET_CO_OBSERVED_NOT_SYNCHRONIZED',
    'SOURCE_ATTESTATION_NOT_INDEPENDENTLY_VERIFIED',
    'MOVEMENT_COVERAGE_OBSERVED_BUCKETS_ONLY',
    'FULL_TRIP_MOVEMENT_COVERAGE_UNKNOWN',
  ];
  if (input.evidenceOrigin === 'SYNTHETIC_FIXTURE') {
    claims.push('SYNTHETIC_FIXTURE_SUCCESS_NOT_FIELD_VALIDATION');
    claims.push(SYNTHETIC_PROVENANCE_LIMITATION);
  }
  if (hasUncertainHistoricalObdRecordTime(binding.telemetrySourceFamily)) {
    claims.push(R1_OBD_RECORD_TIME_UNCERTAIN);
  }

  const status = kickdownCandidates.length > 0 ? 'COMPUTED' : 'NOT_OBSERVED';

  return {
    contractVersion: DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION,
    policyVersion: DS4_KICKDOWN_BUCKET_GRID_RESEARCH_POLICY_VERSION,
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
    },
    kickdown: {
      rawWindowCount: detect.rawWindowCount,
      deduplicatedCandidateCount: kickdownCandidates.length,
      candidates: kickdownCandidates,
      coverageEvidence: buildCoverageEvidence(
        binding.movementCoverage,
        binding.rpmTripCoverage,
        canon.buckets.length,
      ),
    },
    unsupportedScientificClaims: claims,
    r1HistoricalObdRecordTimeUncertain: hasUncertainHistoricalObdRecordTime(binding.telemetrySourceFamily),
    realDataValidation:
      input.evidenceOrigin === 'SYNTHETIC_FIXTURE' ? 'SYNTHETIC_ONLY' : 'NOT_EVALUATED',
  };
}
