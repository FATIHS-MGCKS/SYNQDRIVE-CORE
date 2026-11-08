import { resolveTelemetrySourceFamily } from '../../telemetry-source-family';
import { computeDs4RpmHfV1bTemporalAnalysis } from '../rpm-hf-v1b/ds4-rpm-hf-v1b-temporal.engine';
import { DS4_RPM_HF_V1B_ENGINE_VERSION_TIER_AWARE } from '../rpm-hf-v1b/ds4-rpm-hf-v1b.contract';
import type {
  Ds4PowertrainDemandBindingAbstainReason,
  Ds4RevvingIdleResearchInputV1,
} from './ds4-powertrain-demand-research.contract.v1';
import {
  fingerprintsMatch,
  validateCanonicalMultichannelGrid,
  validateConditionalRpmV1aParity,
  validateMultichannelFingerprint,
  validateOfflineManifestAttestation,
  validatePowertrainIdentityAndTrip,
} from './ds4-powertrain-demand-binding-shared.v1';
import { multichannelHasRpmLabels, validateZeroRpmPathFailClosed } from './ds4-powertrain-demand-cold-engine.input-binding.v1';
import { canonicalizeMultichannelObservations, verifyMultichannelRpmParityWithV1a } from './ds4-powertrain-demand-multichannel-canonicalize.v1';
import {
  validateRevvingIdlePowertrainBindingAllPaths,
  validateRevvingIdleZeroRpmConventionalIceAdmission,
  validateRevvingIdleZeroRpmTripAdmission,
} from './ds4-powertrain-demand-revving-idle-powertrain.v1';

export { DS4_COLD_ENGINE_ZERO_RPM_CLICKHOUSE_ALLOWED_STATUSES as DS4_REVIVING_IDLE_ZERO_RPM_CLICKHOUSE_ALLOWED_STATUSES } from './ds4-powertrain-demand-cold-engine.input-binding.v1';

const ELIGIBLE_ANALYSIS_MODES = new Set(['HIGH_RESOLUTION', 'CADENCE_AWARE']);

const FALLBACK_CADENCE = {
  nominalCadenceSeconds: 1,
  sequenceMaxGapSeconds: 2,
} as const;

export type Ds4RevvingIdleBindingResultV1 =
  | {
      ok: true;
      telemetrySourceFamily: ReturnType<typeof resolveTelemetrySourceFamily>;
      cadenceProfile: { nominalCadenceSeconds: number; sequenceMaxGapSeconds: number };
      recomputedV1bFingerprint: string | null;
      recomputedMultichannelFingerprint: string;
      rpmTripCoverage: number | null;
      canon: ReturnType<typeof canonicalizeMultichannelObservations>;
    }
  | { ok: false; reasonCodes: readonly Ds4PowertrainDemandBindingAbstainReason[] };

function applyV1bIntegrityChecks(
  input: Ds4RevvingIdleResearchInputV1,
  reasonCodes: Ds4PowertrainDemandBindingAbstainReason[],
): void {
  const { tripInput, v1bResult } = input;
  if (v1bResult == null) return;

  if (v1bResult.organizationId !== input.organizationId) reasonCodes.push('ORGANIZATION_ID_MISMATCH');
  if (v1bResult.vehicleId !== input.vehicleId) reasonCodes.push('VEHICLE_ID_MISMATCH');
  if (v1bResult.tripId !== input.tripId) reasonCodes.push('TRIP_ID_MISMATCH');
  if (v1bResult.providerSourceLinkId !== input.providerSourceLinkId) {
    reasonCodes.push('PROVIDER_SOURCE_LINK_MISMATCH');
  }

  if (v1bResult.processingOutcome !== 'SUCCEEDED') reasonCodes.push('V1B_PROCESSING_NOT_SUCCEEDED');
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
}

function enforceRevvingIdleV1aRpmGridBinding(
  input: Ds4RevvingIdleResearchInputV1,
  canon: ReturnType<typeof canonicalizeMultichannelObservations>,
  reasonCodes: Ds4PowertrainDemandBindingAbstainReason[],
): void {
  const { tripInput } = input;
  if (tripInput.rpmPoints.length === 0) return;

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
    if (bucket == null || bucket.rpm == null) {
      reasonCodes.push('RPM_V1A_UNMATCHED_LABEL');
      break;
    }
  }
}

function appendV1bSequenceParityMismatchIfApplicable(
  input: Ds4RevvingIdleResearchInputV1,
  rpmEvidencePresent: boolean,
  reasonCodes: Ds4PowertrainDemandBindingAbstainReason[],
): void {
  const { tripInput, v1bResult } = input;
  if (!rpmEvidencePresent || v1bResult == null) return;

  const tierCadence = v1bResult.tierEvidence?.temporalCadenceProfile ?? null;
  if (!tierCadence) return;

  const temporal = computeDs4RpmHfV1bTemporalAnalysis(
    {
      tripStartIso: tripInput.tripStartIso,
      tripEndIso: tripInput.tripEndIso,
      points: tripInput.rpmPoints,
      invalidValueCount: tripInput.dataQuality.invalidValueCount,
      duplicateTimestampCount: tripInput.dataQuality.duplicateTimestampCount,
    },
    tierCadence,
  );
  const seq = v1bResult.sequenceStats;
  if (
    temporal.sequences.continuousSequenceCount !== seq.continuousSequenceCount ||
    temporal.sequences.observedSequenceDurationSeconds !== seq.observedSequenceDurationSeconds
  ) {
    reasonCodes.push('V1B_SEQUENCE_PARITY_MISMATCH');
  }
}

export function validateDs4PowertrainDemandRevvingIdleInputBinding(
  input: Ds4RevvingIdleResearchInputV1,
): Ds4RevvingIdleBindingResultV1 {
  const reasonCodes: Ds4PowertrainDemandBindingAbstainReason[] = [];
  const { tripInput, v1bResult } = input;

  const bounds = validatePowertrainIdentityAndTrip(input, reasonCodes);
  const tripStartMs = bounds?.tripStartMs ?? Number.NaN;
  const tripEndMs = bounds?.tripEndMs ?? Number.NaN;

  const family = resolveTelemetrySourceFamily(input.dimoVehicleRawJson);
  if (family === 'UNKNOWN') reasonCodes.push('TELEMETRY_SOURCE_FAMILY_UNKNOWN');

  const powertrainClass = validateRevvingIdlePowertrainBindingAllPaths(input, reasonCodes);

  const canonPreview = validateCanonicalMultichannelGrid(input, tripStartMs, tripEndMs, reasonCodes);
  const v1aHasRpm = tripInput.rpmPoints.length > 0;
  const multichannelHasRpm = multichannelHasRpmLabels(canonPreview);
  const rpmEvidencePresent = v1aHasRpm || multichannelHasRpm;

  if (rpmEvidencePresent) {
    if (v1bResult == null) {
      reasonCodes.push('V1B_REQUIRED_FOR_RPM_EVIDENCE');
    }
    if (multichannelHasRpm) {
      validateConditionalRpmV1aParity(input, canonPreview, reasonCodes);
    }
    enforceRevvingIdleV1aRpmGridBinding(input, canonPreview, reasonCodes);
    applyV1bIntegrityChecks(input, reasonCodes);

    if (v1bResult != null) {
      const cadenceProfile = v1bResult.tierEvidence?.temporalCadenceProfile ?? null;
      const rpmTripCoverage = v1bResult.temporalCoverage?.observedBucketCoverageRatio ?? null;
      if (cadenceProfile == null || rpmTripCoverage == null) {
        reasonCodes.push('CADENCE_EVIDENCE_NULL');
        reasonCodes.push('COVERAGE_EVIDENCE_NULL');
      }
    }
  } else {
    if (tripInput.dataQuality.completenessLabel === 'EMPTY') {
      const hfIdx = reasonCodes.indexOf('HF_READ_INCOMPLETE');
      if (hfIdx >= 0) reasonCodes.splice(hfIdx, 1);
    }
    validateRevvingIdleZeroRpmTripAdmission(input, reasonCodes);
    validateZeroRpmPathFailClosed(input, reasonCodes);
    validateRevvingIdleZeroRpmConventionalIceAdmission(input, powertrainClass, reasonCodes);
    if (v1bResult != null) {
      const fp = fingerprintsMatch(input);
      if (!fp.ok) reasonCodes.push('V1B_INPUT_FINGERPRINT_MISMATCH');
    }
  }

  const expectedMcFp = validateMultichannelFingerprint(input, family, reasonCodes);
  validateOfflineManifestAttestation(input, family, expectedMcFp, canonPreview, reasonCodes);

  if (input.declaredIceOperationConfirmed === true) reasonCodes.push('ICE_CONFIRMATION_CALLER_ONLY');

  appendV1bSequenceParityMismatchIfApplicable(input, rpmEvidencePresent, reasonCodes);

  const uniqueReasons = [...new Set(reasonCodes)];
  if (uniqueReasons.length > 0) {
    return { ok: false, reasonCodes: uniqueReasons };
  }

  const rpmIntegrityBound = rpmEvidencePresent && v1bResult != null;
  const tierCadence = v1bResult?.tierEvidence?.temporalCadenceProfile ?? null;
  const cadenceProfile = {
    nominalCadenceSeconds: tierCadence?.nominalCadenceSeconds ?? FALLBACK_CADENCE.nominalCadenceSeconds,
    sequenceMaxGapSeconds: tierCadence?.sequenceMaxGapSeconds ?? FALLBACK_CADENCE.sequenceMaxGapSeconds,
  };

  const fp = fingerprintsMatch(input);
  const fullCanon = canonicalizeMultichannelObservations(input.multichannelObservations);
  const rpmTripCoverage = rpmIntegrityBound
    ? (v1bResult!.temporalCoverage?.observedBucketCoverageRatio ?? null)
    : null;

  return {
    ok: true,
    telemetrySourceFamily: family,
    cadenceProfile,
    recomputedV1bFingerprint: rpmIntegrityBound ? fp.expected : null,
    recomputedMultichannelFingerprint: expectedMcFp,
    rpmTripCoverage,
    canon: fullCanon,
  };
}
