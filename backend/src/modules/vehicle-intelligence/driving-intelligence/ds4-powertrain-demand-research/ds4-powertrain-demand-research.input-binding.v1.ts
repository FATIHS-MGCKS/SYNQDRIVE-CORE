import { resolveTelemetrySourceFamily } from '../../telemetry-source-family';
import { computeDs4RpmHfV1bTemporalAnalysis } from '../rpm-hf-v1b/ds4-rpm-hf-v1b-temporal.engine';
import { DS4_RPM_HF_V1B_ENGINE_VERSION_TIER_AWARE } from '../rpm-hf-v1b/ds4-rpm-hf-v1b.contract';
import type {
  Ds4PowertrainDemandBindingAbstainReason,
  Ds4PowertrainDemandResearchInputV1,
} from './ds4-powertrain-demand-research.contract.v1';
import {
  computeMovementScopedCoverageEvidence,
  DS4_POWERTRAIN_MOVING_CHANNEL_COVERAGE_MIN,
  DS4_POWERTRAIN_MOVING_OBSERVATION_MIN,
} from './ds4-powertrain-demand-movement-coverage.v1';
import { verifyMultichannelRpmParityWithV1a } from './ds4-powertrain-demand-multichannel-canonicalize.v1';
import {
  computeMultichannelContentFingerprint,
  fingerprintsMatch,
  validateCanonicalMultichannelGrid,
  validateMultichannelFingerprint,
  validateOfflineManifestAttestation,
  validatePowertrainIdentityAndTrip,
} from './ds4-powertrain-demand-binding-shared.v1';

export { computeMultichannelContentFingerprint } from './ds4-powertrain-demand-binding-shared.v1';

const ELIGIBLE_ANALYSIS_MODES = new Set(['HIGH_RESOLUTION', 'CADENCE_AWARE']);

export type Ds4PowertrainDemandBindingResultV1 =
  | {
      ok: true;
      telemetrySourceFamily: ReturnType<typeof resolveTelemetrySourceFamily>;
      cadenceProfile: NonNullable<
        NonNullable<Ds4PowertrainDemandResearchInputV1['v1bResult']>['tierEvidence']
      >['temporalCadenceProfile'];
      recomputedV1bFingerprint: string;
      recomputedMultichannelFingerprint: string;
      rpmTripCoverage: number;
      movementCoverage: ReturnType<typeof computeMovementScopedCoverageEvidence>;
    }
  | { ok: false; reasonCodes: readonly Ds4PowertrainDemandBindingAbstainReason[] };

export function validateDs4PowertrainDemandResearchInputBinding(
  input: Ds4PowertrainDemandResearchInputV1,
): Ds4PowertrainDemandBindingResultV1 {
  const reasonCodes: Ds4PowertrainDemandBindingAbstainReason[] = [];
  const { tripInput, v1bResult } = input;

  const bounds = validatePowertrainIdentityAndTrip(input, reasonCodes);
  const tripStartMs = bounds?.tripStartMs ?? Number.NaN;
  const tripEndMs = bounds?.tripEndMs ?? Number.NaN;

  if (v1bResult == null) {
    reasonCodes.push('V1B_RESULT_NULL');
    return { ok: false, reasonCodes: [...new Set(reasonCodes)] };
  }

  if (v1bResult.organizationId !== input.organizationId) reasonCodes.push('ORGANIZATION_ID_MISMATCH');
  if (v1bResult.vehicleId !== input.vehicleId) reasonCodes.push('VEHICLE_ID_MISMATCH');
  if (v1bResult.tripId !== input.tripId) reasonCodes.push('TRIP_ID_MISMATCH');
  if (v1bResult.providerSourceLinkId !== input.providerSourceLinkId) {
    reasonCodes.push('PROVIDER_SOURCE_LINK_MISMATCH');
  }

  if (v1bResult.processingOutcome !== 'SUCCEEDED') {
    reasonCodes.push('V1B_PROCESSING_NOT_SUCCEEDED');
  }
  if (!tripInput.admission.processingAllowed) reasonCodes.push('TRIP_ADMISSION_NOT_ALLOWED');
  if (!v1bResult.admission.processingAllowed) reasonCodes.push('V1B_ADMISSION_NOT_ALLOWED');

  const tripIce = tripInput.admission.iceRpmApplicability;
  const v1bIce = v1bResult.admission.iceRpmApplicability;
  if (tripIce !== 'APPLICABLE') reasonCodes.push('ICE_APPLICABILITY_NOT_ADMITTED');
  if (v1bIce !== tripIce) reasonCodes.push('ICE_APPLICABILITY_V1B_MISMATCH');

  if (v1bResult.engineVersion !== DS4_RPM_HF_V1B_ENGINE_VERSION_TIER_AWARE) {
    reasonCodes.push('V1B_NOT_TIER_AWARE');
  }
  if (v1bResult.shadowVariant !== 'tier-aware') reasonCodes.push('V1B_NOT_TIER_AWARE');

  const tierSlice = v1bResult.tierEvidence;
  if (!tierSlice || tierSlice.availability !== 'AVAILABLE' || tierSlice.tripId !== input.tripId) {
    reasonCodes.push('V1B_TIER_EVIDENCE_UNAVAILABLE');
  }
  const cadenceProfile = tierSlice?.temporalCadenceProfile ?? null;
  if (!cadenceProfile) reasonCodes.push('V1B_TEMPORAL_PROFILE_MISSING');
  const analysisMode = tierSlice?.analysisMode ?? null;
  if (!analysisMode || !ELIGIBLE_ANALYSIS_MODES.has(analysisMode)) {
    reasonCodes.push('V1B_ANALYSIS_MODE_NOT_ELIGIBLE');
  }

  if (
    v1bResult.temporalTripWindow.tripStartIso !== tripInput.tripStartIso ||
    v1bResult.temporalTripWindow.tripEndIso !== tripInput.tripEndIso
  ) {
    reasonCodes.push('V1B_TEMPORAL_WINDOW_MISMATCH');
  }

  const fp = fingerprintsMatch(input);
  if (!fp.ok) reasonCodes.push('V1B_INPUT_FINGERPRINT_MISMATCH');

  const family = resolveTelemetrySourceFamily(input.dimoVehicleRawJson);
  if (family === 'UNKNOWN') {
    reasonCodes.push('TELEMETRY_SOURCE_FAMILY_UNKNOWN');
  }

  const canon = validateCanonicalMultichannelGrid(input, tripStartMs, tripEndMs, reasonCodes);

  const parity = verifyMultichannelRpmParityWithV1a({
    buckets: canon.buckets,
    rpmPoints: tripInput.rpmPoints,
  });
  if (!parity.ok) reasonCodes.push(parity.reason);

  const bucketByEpoch = new Map(canon.buckets.map((b) => [b.recordedAtMs, b]));
  for (const p of tripInput.rpmPoints) {
    const ms = Date.parse(p.recordedAtIso);
    if (!Number.isFinite(ms)) continue;
    const bucket = bucketByEpoch.get(ms);
    if (bucket != null && bucket.rpm == null) {
      reasonCodes.push('RPM_V1A_UNMATCHED_LABEL');
      break;
    }
  }

  const expectedMcFp = validateMultichannelFingerprint(input, family, reasonCodes);
  validateOfflineManifestAttestation(input, family, expectedMcFp, canon, reasonCodes);

  const temporalCoverage = v1bResult.temporalCoverage;
  const rpmTripCoverage = temporalCoverage?.observedBucketCoverageRatio ?? null;
  if (cadenceProfile == null || rpmTripCoverage == null) {
    reasonCodes.push('CADENCE_EVIDENCE_NULL');
    reasonCodes.push('COVERAGE_EVIDENCE_NULL');
  }

  const movementCoverage = computeMovementScopedCoverageEvidence(canon.buckets);
  if (movementCoverage.observedMovingBucketCount === 0) {
    reasonCodes.push('NO_MOVING_OPPORTUNITY_EVIDENCE');
  }
  if (movementCoverage.observedMovingBucketCount < DS4_POWERTRAIN_MOVING_OBSERVATION_MIN) {
    reasonCodes.push('INSUFFICIENT_ELIGIBLE_OBSERVATIONS');
  }
  if (movementCoverage.movementObservedCompleteness < DS4_POWERTRAIN_MOVING_CHANNEL_COVERAGE_MIN) {
    reasonCodes.push('CHANNEL_COVERAGE_BELOW_MINIMUM');
  }

  if (input.isEvPowertrain) reasonCodes.push('POWERTRAIN_NOT_APPLICABLE');
  if (input.declaredIceOperationConfirmed === true) {
    reasonCodes.push('ICE_CONFIRMATION_CALLER_ONLY');
  }

  if (reasonCodes.length > 0) {
    return { ok: false, reasonCodes: [...new Set(reasonCodes)] };
  }

  const temporal = computeDs4RpmHfV1bTemporalAnalysis(
    {
      tripStartIso: tripInput.tripStartIso,
      tripEndIso: tripInput.tripEndIso,
      points: tripInput.rpmPoints,
      invalidValueCount: tripInput.dataQuality.invalidValueCount,
      duplicateTimestampCount: tripInput.dataQuality.duplicateTimestampCount,
    },
    cadenceProfile!,
  );
  const seq = v1bResult.sequenceStats;
  if (
    temporal.sequences.continuousSequenceCount !== seq.continuousSequenceCount ||
    temporal.sequences.observedSequenceDurationSeconds !== seq.observedSequenceDurationSeconds
  ) {
    return { ok: false, reasonCodes: ['V1B_SEQUENCE_PARITY_MISMATCH'] };
  }

  return {
    ok: true,
    telemetrySourceFamily: family,
    cadenceProfile: cadenceProfile!,
    recomputedV1bFingerprint: fp.expected,
    recomputedMultichannelFingerprint: expectedMcFp,
    rpmTripCoverage: rpmTripCoverage!,
    movementCoverage,
  };
}
