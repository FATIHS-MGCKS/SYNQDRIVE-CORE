import { hasUncertainHistoricalObdRecordTime, resolveTelemetrySourceFamily } from '../../telemetry-source-family';
import {
  confirmIceOperation,
  isPhevFuelType,
} from '../../shadow-detector/detectors/cold-engine-shadow.policy';
import type { ShadowDetectorHfSample } from '../../shadow-detector/shadow-detector.types';
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

const R1_OBD_RECORD_TIME_UNCERTAIN = 'R1_HISTORICAL_OBD_RECORD_TIME_UNCERTAIN';

function buildAbstained(
  input: Ds4PowertrainDemandResearchInputV1,
  reasonCodes: readonly Ds4PowertrainDemandBindingAbstainReason[],
  familyPreview: ReturnType<typeof resolveTelemetrySourceFamily>,
): Ds4PowertrainDemandKickdownResultV1 {
  const independent =
    input.evidenceOrigin === 'OFFLINE_SEALED_BUNDLE' &&
    input.multichannelManifest?.independentFieldValidation === true;
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
      sourceProvenanceVerified: input.evidenceOrigin === 'OFFLINE_SEALED_BUNDLE',
      independentFieldValidation: independent,
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
        requiredChannelCoverage: null,
        rpmCoverageEcho: null,
        eligibleObservationCount: 0,
      },
    },
    unsupportedScientificClaims: [...DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS],
    r1HistoricalObdRecordTimeUncertain:
      familyPreview != null && hasUncertainHistoricalObdRecordTime(familyPreview),
    realDataValidation: input.evidenceOrigin === 'SYNTHETIC_FIXTURE' ? 'SYNTHETIC_ONLY' : 'NOT_EVALUATED',
  };
}

function bucketsToIceSamples(
  buckets: ReturnType<typeof canonicalizeMultichannelObservations>['buckets'],
): ShadowDetectorHfSample[] {
  return buckets.map((b) => ({
    timestamp: b.recordedAtIso,
    speedKmh: b.speedKmh,
    coolantC: b.coolantC,
    rpm: b.rpm,
    throttlePct: b.throttlePct,
    loadPct: b.loadPct,
    engineRuntimeSec: null,
    torqueNm: null,
    torquePct: null,
    exteriorTempC: null,
    tractionBatteryPowerKw: null,
    socPct: null,
    tractionBatteryTemperatureC: null,
    altitudeM: null,
    gear: null,
    ignitionOn: null,
  }));
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
    }
    return out;
  }

  const canon = canonicalizeMultichannelObservations(input.multichannelObservations);
  if (isPhevFuelType(input.fuelType)) {
    const ice = confirmIceOperation(bucketsToIceSamples(canon.buckets));
    if (!ice.confirmed) {
      const out = buildAbstained(input, ['ICE_OPERATION_NOT_CONFIRMED'], familyPreview);
      out.status = 'ABSTAINED';
      return out;
    }
  }

  const cadence = binding.cadenceProfile!;
  const nominalMs = (cadence.nominalCadenceSeconds ?? 1) * 1000;
  const detect = detectKickdownBucketGridCandidates({
    tripId: input.tripId,
    providerSourceLinkId: input.providerSourceLinkId,
    canon,
    sequenceMaxGapSeconds: cadence.sequenceMaxGapSeconds,
    nominalCadenceMs: nominalMs,
    requiredChannelCoverage: binding.requiredChannelCoverage,
    r1HistoricalObdRecordTimeUncertain: hasUncertainHistoricalObdRecordTime(binding.telemetrySourceFamily),
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
  ];
  if (input.evidenceOrigin === 'SYNTHETIC_FIXTURE') {
    claims.push('SYNTHETIC_FIXTURE_SUCCESS_NOT_FIELD_VALIDATION');
  }
  if (hasUncertainHistoricalObdRecordTime(binding.telemetrySourceFamily)) {
    claims.push(R1_OBD_RECORD_TIME_UNCERTAIN);
  }

  const independent =
    input.evidenceOrigin === 'OFFLINE_SEALED_BUNDLE' &&
    input.multichannelManifest?.independentFieldValidation === true;

  return {
    contractVersion: DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION,
    policyVersion: DS4_KICKDOWN_BUCKET_GRID_RESEARCH_POLICY_VERSION,
    researchOnly: true,
    timeAuthority: 'BUCKET_LABEL_UNVERIFIED',
    temporalMode: 'MODE_A',
    misuseEligibility: 'NOT_EVALUATED_BY_DESIGN',
    evidenceOrigin: input.evidenceOrigin,
    status: kickdownCandidates.length > 0 ? 'COMPUTED' : 'NOT_OBSERVED',
    abstainReasons: [],
    provenance: {
      contentConsistencyVerified: true,
      sourceProvenanceVerified:
        input.evidenceOrigin === 'SYNTHETIC_FIXTURE' || input.multichannelManifest != null,
      independentFieldValidation: independent,
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
      coverageEvidence: {
        requiredChannelCoverage: binding.requiredChannelCoverage,
        rpmCoverageEcho: binding.rpmCoverage,
        eligibleObservationCount: canon.buckets.length,
      },
    },
    unsupportedScientificClaims: claims,
    r1HistoricalObdRecordTimeUncertain: hasUncertainHistoricalObdRecordTime(binding.telemetrySourceFamily),
    realDataValidation: input.evidenceOrigin === 'SYNTHETIC_FIXTURE' ? 'SYNTHETIC_ONLY' : 'NOT_EVALUATED',
  };
}
