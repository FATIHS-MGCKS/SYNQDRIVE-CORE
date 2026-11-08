import { resolveTelemetrySourceFamily } from '../../telemetry-source-family';
import { computeDs4RpmHfV1bTemporalAnalysis } from '../rpm-hf-v1b/ds4-rpm-hf-v1b-temporal.engine';
import { DS4_RPM_HF_V1B_ENGINE_VERSION_TIER_AWARE } from '../rpm-hf-v1b/ds4-rpm-hf-v1b.contract';
import {
  computeColdEngineEctCoverageEvidence,
  DS4_POWERTRAIN_COLD_ENGINE_ECT_OBSERVATION_MIN,
} from './ds4-powertrain-demand-cold-engine-coverage.v1';
import type {
  Ds4PowertrainDemandBindingAbstainReason,
  Ds4PowertrainDemandColdEngineResearchInputV1,
} from './ds4-powertrain-demand-research.contract.v1';
import {
  fingerprintsMatch,
  validateCanonicalMultichannelGrid,
  validateConditionalRpmV1aParity,
  validateMultichannelFingerprint,
  validateOfflineManifestAttestation,
  validatePowertrainIdentityAndTrip,
} from './ds4-powertrain-demand-binding-shared.v1';
import type { Ds4CanonicalMultichannelBucketV1 } from './ds4-powertrain-demand-multichannel-canonicalize.v1';
import { canonicalizeMultichannelObservations } from './ds4-powertrain-demand-multichannel-canonicalize.v1';

const ELIGIBLE_ANALYSIS_MODES = new Set(['HIGH_RESOLUTION', 'CADENCE_AWARE']);

const FALLBACK_CADENCE = {
  nominalCadenceSeconds: 1,
  sequenceMaxGapSeconds: 2,
} as const;

export type Ds4ColdEngineBindingResultV1 =
  | {
      ok: true;
      telemetrySourceFamily: ReturnType<typeof resolveTelemetrySourceFamily>;
      cadenceProfile: { nominalCadenceSeconds: number; sequenceMaxGapSeconds: number };
      recomputedV1bFingerprint: string | null;
      recomputedMultichannelFingerprint: string;
      rpmTripCoverage: number | null;
      ectCoverage: ReturnType<typeof computeColdEngineEctCoverageEvidence>;
      rpmIntegrityBound: boolean;
      rpmEvidencePresent: boolean;
    }
  | { ok: false; reasonCodes: readonly Ds4PowertrainDemandBindingAbstainReason[] };

export function multichannelHasRpmLabels(canon: { buckets: readonly Ds4CanonicalMultichannelBucketV1[] }): boolean {
  return canon.buckets.some((b) => b.rpm != null);
}

export function tripHasRpmPoints(input: Ds4PowertrainDemandColdEngineResearchInputV1): boolean {
  return input.tripInput.rpmPoints.length > 0;
}

export function hasColdEngineRpmEvidence(input: Ds4PowertrainDemandColdEngineResearchInputV1): boolean {
  const canon = canonicalizeMultichannelObservations(input.multichannelObservations);
  return multichannelHasRpmLabels(canon) || tripHasRpmPoints(input);
}

function validateZeroRpmPathFailClosed(
  input: Ds4PowertrainDemandColdEngineResearchInputV1,
  reasonCodes: Ds4PowertrainDemandBindingAbstainReason[],
): void {
  const { tripInput } = input;
  const ch = tripInput.clickHouseRead;

  if (ch.status === 'QUERY_FAILED') reasonCodes.push('HF_CLICKHOUSE_QUERY_FAILED');
  if (ch.status === 'UNAVAILABLE' || !ch.available) reasonCodes.push('HF_CLICKHOUSE_UNAVAILABLE');
  if (ch.degradedReason != null && String(ch.degradedReason).trim().length > 0) {
    reasonCodes.push('HF_CLICKHOUSE_DEGRADED');
  }

  const dq = tripInput.dataQuality;
  if (dq.completenessLabel !== 'EMPTY') {
    reasonCodes.push('RPM_READ_NOT_GENUINELY_EMPTY');
  }
  if (dq.validPointCount !== 0) {
    reasonCodes.push('EMPTY_RPM_DATA_QUALITY_INCONSISTENT');
  }
  if (dq.returnedPointCount !== 0) {
    reasonCodes.push('EMPTY_RPM_DATA_QUALITY_INCONSISTENT');
  }
  if (dq.totalMatchingCount !== 0) {
    reasonCodes.push('EMPTY_RPM_DATA_QUALITY_INCONSISTENT');
  }
  if (dq.invalidValueCount !== 0 || dq.duplicateTimestampCount !== 0) {
    reasonCodes.push('EMPTY_RPM_DATA_QUALITY_INCONSISTENT');
  }
  if (tripInput.rpmPoints.length !== 0) {
    reasonCodes.push('EMPTY_RPM_DATA_QUALITY_INCONSISTENT');
  }

  if (input.v1bResult != null) {
    reasonCodes.push('V1B_UNEXPECTED_ON_ZERO_RPM_PATH');
  }
}

function applyV1bRpmIntegrityChecks(
  input: Ds4PowertrainDemandColdEngineResearchInputV1,
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
}

export function validateDs4PowertrainDemandColdEngineInputBinding(
  input: Ds4PowertrainDemandColdEngineResearchInputV1,
): Ds4ColdEngineBindingResultV1 {
  const reasonCodes: Ds4PowertrainDemandBindingAbstainReason[] = [];

  const bounds = validatePowertrainIdentityAndTrip(input, reasonCodes);
  const tripStartMs = bounds?.tripStartMs ?? Number.NaN;
  const tripEndMs = bounds?.tripEndMs ?? Number.NaN;

  const family = resolveTelemetrySourceFamily(input.dimoVehicleRawJson);
  if (family === 'UNKNOWN') {
    reasonCodes.push('TELEMETRY_SOURCE_FAMILY_UNKNOWN');
  }

  const canon = validateCanonicalMultichannelGrid(input, tripStartMs, tripEndMs, reasonCodes);
  const rpmEvidencePresent = multichannelHasRpmLabels(canon) || tripHasRpmPoints(input);

  if (rpmEvidencePresent) {
    if (input.v1bResult == null) {
      reasonCodes.push('V1B_REQUIRED_FOR_RPM_EVIDENCE');
    }
    validateConditionalRpmV1aParity(input, canon, reasonCodes);
    applyV1bRpmIntegrityChecks(input, reasonCodes);
  } else {
    if (input.tripInput.dataQuality.completenessLabel === 'EMPTY') {
      const hfIdx = reasonCodes.indexOf('HF_READ_INCOMPLETE');
      if (hfIdx >= 0) reasonCodes.splice(hfIdx, 1);
    }
    validateZeroRpmPathFailClosed(input, reasonCodes);
  }

  const expectedMcFp = validateMultichannelFingerprint(input, family, reasonCodes);
  validateOfflineManifestAttestation(input, family, expectedMcFp, canon, reasonCodes);

  const ectCoverage = computeColdEngineEctCoverageEvidence(canon.buckets);
  if (ectCoverage.ectPresentBucketCount === 0) {
    reasonCodes.push('COOLANT_CHANNEL_UNAVAILABLE');
  }
  if (ectCoverage.ectPresentBucketCount < DS4_POWERTRAIN_COLD_ENGINE_ECT_OBSERVATION_MIN) {
    reasonCodes.push('INSUFFICIENT_ECT_OBSERVATIONS');
  }

  if (input.isEvPowertrain) reasonCodes.push('POWERTRAIN_NOT_APPLICABLE');
  if (input.declaredIceOperationConfirmed === true) {
    reasonCodes.push('ICE_CONFIRMATION_CALLER_ONLY');
  }

  const uniqueReasons = [...new Set(reasonCodes)];
  if (uniqueReasons.length > 0) {
    return { ok: false, reasonCodes: uniqueReasons };
  }

  const rpmIntegrityBound = rpmEvidencePresent && input.v1bResult != null;
  const tierCadence = input.v1bResult?.tierEvidence?.temporalCadenceProfile ?? null;
  const cadenceProfile = {
    nominalCadenceSeconds: tierCadence?.nominalCadenceSeconds ?? FALLBACK_CADENCE.nominalCadenceSeconds,
    sequenceMaxGapSeconds: tierCadence?.sequenceMaxGapSeconds ?? FALLBACK_CADENCE.sequenceMaxGapSeconds,
  };

  if (rpmIntegrityBound && tierCadence) {
    const temporal = computeDs4RpmHfV1bTemporalAnalysis(
      {
        tripStartIso: input.tripInput.tripStartIso,
        tripEndIso: input.tripInput.tripEndIso,
        points: input.tripInput.rpmPoints,
        invalidValueCount: input.tripInput.dataQuality.invalidValueCount,
        duplicateTimestampCount: input.tripInput.dataQuality.duplicateTimestampCount,
      },
      tierCadence,
    );
    const seq = input.v1bResult!.sequenceStats;
    if (
      temporal.sequences.continuousSequenceCount !== seq.continuousSequenceCount ||
      temporal.sequences.observedSequenceDurationSeconds !== seq.observedSequenceDurationSeconds
    ) {
      return { ok: false, reasonCodes: ['V1B_SEQUENCE_PARITY_MISMATCH'] };
    }
  }

  const fp = fingerprintsMatch(input);
  const rpmTripCoverage = rpmIntegrityBound
    ? (input.v1bResult!.temporalCoverage?.observedBucketCoverageRatio ?? null)
    : null;

  return {
    ok: true,
    telemetrySourceFamily: family,
    cadenceProfile,
    recomputedV1bFingerprint: rpmIntegrityBound ? fp.expected : null,
    recomputedMultichannelFingerprint: expectedMcFp,
    rpmTripCoverage,
    ectCoverage,
    rpmIntegrityBound,
    rpmEvidencePresent,
  };
}
