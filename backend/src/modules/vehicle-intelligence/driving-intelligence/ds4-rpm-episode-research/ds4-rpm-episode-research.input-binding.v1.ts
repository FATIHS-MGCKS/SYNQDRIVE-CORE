import { resolveTelemetrySourceFamily } from '../../telemetry-source-family';
import {
  computeDs4RpmHfV1bInputFingerprint,
  computeDs4RpmHfV1bTierAwareInputFingerprint,
} from '../rpm-hf-v1b/ds4-rpm-hf-v1b-input-fingerprint';
import { DS4_RPM_HF_V1B_ENGINE_VERSION_TIER_AWARE } from '../rpm-hf-v1b/ds4-rpm-hf-v1b.contract';
import { computeDs4RpmHfV1bTemporalAnalysis } from '../rpm-hf-v1b/ds4-rpm-hf-v1b-temporal.engine';
import type {
  Ds4RpmEpisodeResearchBindingAbstainReason,
  Ds4RpmEpisodeResearchInputV1,
} from './ds4-rpm-episode-research.contract.v1';

const ELIGIBLE_ANALYSIS_MODES = new Set(['HIGH_RESOLUTION', 'CADENCE_AWARE']);

export type Ds4RpmEpisodeResearchBindingResultV1 =
  | {
      ok: true;
      telemetrySourceFamily: ReturnType<typeof resolveTelemetrySourceFamily>;
      cadenceProfile: NonNullable<
        NonNullable<Ds4RpmEpisodeResearchInputV1['v1bResult']>['tierEvidence']
      >['temporalCadenceProfile'];
      recomputedFingerprint: string;
    }
  | { ok: false; reasonCodes: readonly Ds4RpmEpisodeResearchBindingAbstainReason[] };

function fingerprintsMatch(input: Ds4RpmEpisodeResearchInputV1): {
  ok: boolean;
  expected: string;
} {
  const tierAware = input.v1bResult?.engineVersion === DS4_RPM_HF_V1B_ENGINE_VERSION_TIER_AWARE;
  const expected = tierAware
    ? computeDs4RpmHfV1bTierAwareInputFingerprint(input.tripInput)
    : computeDs4RpmHfV1bInputFingerprint(input.tripInput);
  const actual = input.v1bResult?.inputFingerprint ?? '';
  return { ok: actual === expected, expected };
}

export function validateDs4RpmEpisodeResearchInputBinding(
  input: Ds4RpmEpisodeResearchInputV1,
): Ds4RpmEpisodeResearchBindingResultV1 {
  const reasonCodes: Ds4RpmEpisodeResearchBindingAbstainReason[] = [];
  const { tripInput, v1bResult } = input;

  if (input.organizationId !== tripInput.organizationId) {
    reasonCodes.push('ORGANIZATION_ID_MISMATCH');
  }
  if (input.vehicleId !== tripInput.vehicleId) {
    reasonCodes.push('VEHICLE_ID_MISMATCH');
  }
  if (input.tripId !== tripInput.tripId) {
    reasonCodes.push('TRIP_ID_MISMATCH');
  }
  if (input.providerSourceLinkId !== tripInput.providerSourceLinkId) {
    reasonCodes.push('PROVIDER_SOURCE_LINK_MISMATCH');
  }
  if (!input.providerSourceLinkId || !tripInput.providerSourceLinkId) {
    reasonCodes.push('PROVIDER_SOURCE_LINK_NULL');
  }

  const tripStartMs = Date.parse(tripInput.tripStartIso);
  const tripEndMs = Date.parse(tripInput.tripEndIso);
  if (!Number.isFinite(tripStartMs) || !Number.isFinite(tripEndMs) || tripEndMs < tripStartMs) {
    reasonCodes.push('INVALID_TRIP_BOUNDS');
  }

  if (tripInput.clickHouseRead.tenantScopeViolation) {
    reasonCodes.push('TENANT_SCOPE_VIOLATION');
  }
  if (tripInput.dataQuality.completenessLabel !== 'COMPLETE') {
    reasonCodes.push('HF_READ_INCOMPLETE');
  }

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
  if (!tripInput.admission.processingAllowed) {
    reasonCodes.push('TRIP_ADMISSION_NOT_ALLOWED');
  }
  if (!v1bResult.admission.processingAllowed) {
    reasonCodes.push('V1B_ADMISSION_NOT_ALLOWED');
  }

  const tripIce = tripInput.admission.iceRpmApplicability;
  const v1bIce = v1bResult.admission.iceRpmApplicability;
  const refIce = input.reference.iceRpmApplicability;
  if (tripIce !== 'APPLICABLE') {
    reasonCodes.push('ICE_APPLICABILITY_NOT_ADMITTED');
  }
  if (v1bIce !== tripIce) {
    reasonCodes.push('ICE_APPLICABILITY_V1B_MISMATCH');
  }
  if (refIce !== tripIce) {
    reasonCodes.push('ICE_APPLICABILITY_REFERENCE_CONFLICT');
  }
  if (v1bResult.engineVersion !== DS4_RPM_HF_V1B_ENGINE_VERSION_TIER_AWARE) {
    reasonCodes.push('V1B_NOT_TIER_AWARE');
  }
  if (v1bResult.shadowVariant !== 'tier-aware') {
    reasonCodes.push('V1B_NOT_TIER_AWARE');
  }

  const tierSlice = v1bResult.tierEvidence;
  if (!tierSlice || tierSlice.availability !== 'AVAILABLE' || tierSlice.tripId !== input.tripId) {
    reasonCodes.push('V1B_TIER_EVIDENCE_UNAVAILABLE');
  }
  const cadenceProfile = tierSlice?.temporalCadenceProfile ?? null;
  if (!cadenceProfile) {
    reasonCodes.push('V1B_TEMPORAL_PROFILE_MISSING');
  }
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
  if (!fp.ok) {
    reasonCodes.push('V1B_INPUT_FINGERPRINT_MISMATCH');
  }

  const family = resolveTelemetrySourceFamily(input.dimoVehicleRawJson);
  if (family === 'UNKNOWN' && input.evidenceOrigin === 'OFFLINE_SEALED_BUNDLE') {
    reasonCodes.push('TELEMETRY_SOURCE_FAMILY_UNKNOWN');
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

  const seq = v1bResult!.sequenceStats;
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
    recomputedFingerprint: fp.expected,
  };
}
