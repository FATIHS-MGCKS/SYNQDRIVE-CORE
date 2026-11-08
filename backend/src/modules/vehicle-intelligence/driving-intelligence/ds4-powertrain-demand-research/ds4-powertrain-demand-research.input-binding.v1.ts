import { createHash } from 'crypto';
import { resolveTelemetrySourceFamily } from '../../telemetry-source-family';
import {
  computeDs4RpmHfV1bInputFingerprint,
  computeDs4RpmHfV1bTierAwareInputFingerprint,
} from '../rpm-hf-v1b/ds4-rpm-hf-v1b-input-fingerprint';
import { DS4_RPM_HF_V1B_ENGINE_VERSION_TIER_AWARE } from '../rpm-hf-v1b/ds4-rpm-hf-v1b.contract';
import { computeDs4RpmHfV1bTemporalAnalysis } from '../rpm-hf-v1b/ds4-rpm-hf-v1b-temporal.engine';
import type {
  Ds4MultichannelBucketObservationV1,
  Ds4PowertrainDemandBindingAbstainReason,
  Ds4PowertrainDemandResearchInputV1,
} from './ds4-powertrain-demand-research.contract.v1';
import {
  DS4_KICKDOWN_BUCKET_GRID_RESEARCH_POLICY_VERSION,
  DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION,
} from './ds4-powertrain-demand-research.contract.v1';
import {
  canonicalizeMultichannelObservations,
  verifyMultichannelRpmParityWithV1a,
} from './ds4-powertrain-demand-multichannel-canonicalize.v1';

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
      rpmCoverage: number;
      requiredChannelCoverage: number;
    }
  | { ok: false; reasonCodes: readonly Ds4PowertrainDemandBindingAbstainReason[] };

function fingerprintsMatch(input: Ds4PowertrainDemandResearchInputV1): {
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

export function computeMultichannelContentFingerprint(input: {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  providerSourceLinkId: string;
  telemetrySourceFamily: string;
  observations: readonly Ds4MultichannelBucketObservationV1[];
}): string {
  const canon = canonicalizeMultichannelObservations(input.observations);
  const channelPresence = {
    speed: canon.buckets.some((b) => b.speedKmh != null),
    rpm: canon.buckets.some((b) => b.rpm != null),
    throttle: canon.buckets.some((b) => b.throttlePct != null),
    load: canon.buckets.some((b) => b.loadPct != null),
    coolant: canon.buckets.some((b) => b.coolantC != null),
  };
  const payload = {
    contractVersion: DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION,
    policyVersion: DS4_KICKDOWN_BUCKET_GRID_RESEARCH_POLICY_VERSION,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    providerSourceLinkId: input.providerSourceLinkId,
    telemetrySourceFamily: input.telemetrySourceFamily,
    channelNames: ['speed', 'powertrainCombustionEngineSpeed', 'obdThrottlePosition', 'obdEngineLoad', 'powertrainCombustionEngineECT'],
    channelPresence,
    buckets: canon.buckets.map((b) => ({
      ms: b.recordedAtMs,
      speedKmh: b.speedKmh,
      rpm: b.rpm,
      throttlePct: b.throttlePct,
      loadPct: b.loadPct,
      coolantC: b.coolantC,
    })),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function requiredChannelCoverage(
  buckets: ReturnType<typeof canonicalizeMultichannelObservations>['buckets'],
): number {
  if (buckets.length === 0) return 0;
  let complete = 0;
  for (const b of buckets) {
    if (
      b.throttlePct != null &&
      b.speedKmh != null &&
      b.rpm != null &&
      b.loadPct != null
    ) {
      complete += 1;
    }
  }
  return complete / buckets.length;
}

export function validateDs4PowertrainDemandResearchInputBinding(
  input: Ds4PowertrainDemandResearchInputV1,
): Ds4PowertrainDemandBindingResultV1 {
  const reasonCodes: Ds4PowertrainDemandBindingAbstainReason[] = [];
  const { tripInput, v1bResult } = input;

  if (input.organizationId !== tripInput.organizationId) {
    reasonCodes.push('ORGANIZATION_ID_MISMATCH');
  }
  if (input.vehicleId !== tripInput.vehicleId) reasonCodes.push('VEHICLE_ID_MISMATCH');
  if (input.tripId !== tripInput.tripId) reasonCodes.push('TRIP_ID_MISMATCH');
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

  if (tripInput.clickHouseRead.tenantScopeViolation) reasonCodes.push('TENANT_SCOPE_VIOLATION');
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
  if (family === 'UNKNOWN' && input.evidenceOrigin === 'OFFLINE_SEALED_BUNDLE') {
    reasonCodes.push('TELEMETRY_SOURCE_FAMILY_UNKNOWN');
  }

  const canon = canonicalizeMultichannelObservations(input.multichannelObservations);
  if (canon.r1ForbiddenFieldCount > 0) reasonCodes.push('R1_FORBIDDEN_CHANNEL_POPULATED');
  if (canon.hasConflictingDuplicates) reasonCodes.push('CONFLICTING_DUPLICATE_BUCKETS');

  const parity = verifyMultichannelRpmParityWithV1a({
    buckets: canon.buckets,
    rpmPoints: tripInput.rpmPoints,
  });
  if (!parity.ok) reasonCodes.push('RPM_V1A_GRID_MISMATCH');

  const familyStr = family ?? 'UNKNOWN';
  const expectedMcFp = computeMultichannelContentFingerprint({
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    providerSourceLinkId: input.providerSourceLinkId,
    telemetrySourceFamily: familyStr,
    observations: input.multichannelObservations,
  });
  if (input.multichannelFingerprint !== expectedMcFp) {
    reasonCodes.push('MULTICHANNEL_FINGERPRINT_MISMATCH');
  }

  if (input.evidenceOrigin === 'OFFLINE_SEALED_BUNDLE') {
    const m = input.multichannelManifest;
    if (m == null) {
      reasonCodes.push('MULTICHANNEL_MANIFEST_MISSING');
    } else {
      if (
        m.organizationId !== input.organizationId ||
        m.vehicleId !== input.vehicleId ||
        m.tripId !== input.tripId ||
        m.providerSourceLinkId !== input.providerSourceLinkId
      ) {
        reasonCodes.push('MULTICHANNEL_MANIFEST_MISMATCH');
      }
      if (m.expectedMultichannelFingerprint !== expectedMcFp) {
        reasonCodes.push('MULTICHANNEL_MANIFEST_TAMPERED');
      }
    }
  }

  const temporalCoverage = v1bResult.temporalCoverage;
  const rpmCoverage = temporalCoverage?.observedBucketCoverageRatio ?? null;
  if (cadenceProfile == null || rpmCoverage == null) {
    reasonCodes.push('CADENCE_EVIDENCE_NULL');
    reasonCodes.push('COVERAGE_EVIDENCE_NULL');
  }

  const reqCov = requiredChannelCoverage(canon.buckets);
  if (reqCov < 0.7) reasonCodes.push('CHANNEL_COVERAGE_BELOW_MINIMUM');
  if (canon.buckets.length < 8) reasonCodes.push('INSUFFICIENT_ELIGIBLE_OBSERVATIONS');

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
    rpmCoverage: rpmCoverage!,
    requiredChannelCoverage: reqCov,
  };
}
