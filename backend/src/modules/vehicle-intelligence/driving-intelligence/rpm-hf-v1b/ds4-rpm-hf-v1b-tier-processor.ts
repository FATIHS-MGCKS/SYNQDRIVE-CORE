import type { Ds4RpmHfV1aTripInputV1 } from '../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';
import { routeDs4RpmHfV1bTierAwareAdmission } from './ds4-rpm-hf-v1b-tier-admission-routing';
import {
  buildV1bResultFromV1aInput,
  DS4_RPM_HF_V1B_ENGINE_VERSION_TIER_AWARE,
  type Ds4RpmHfV1bTierEvidenceResultSlice,
} from './ds4-rpm-hf-v1b.contract';
import { computeDs4RpmHfV1bTierAwareInputFingerprint } from './ds4-rpm-hf-v1b-input-fingerprint';
import type { ProcessDs4RpmHfV1bShadowTripResult } from './ds4-rpm-hf-v1b-processor';
import {
  computeDs4RpmHfV1bTemporalAnalysis,
  resolveTemporalCadenceProfileForTier,
} from './ds4-rpm-hf-v1b-temporal.engine';
import { DS4_RPM_HF_V1B_TUNING } from './ds4-rpm-hf-v1b.config';
import { resolveTierEvidenceForTrip } from './ds4-rpm-hf-v1b-tier-evidence.util';

function buildTierEvidenceSlice(input: {
  tripInput: Ds4RpmHfV1aTripInputV1;
  analysisMode: Ds4RpmHfV1bTierEvidenceResultSlice['analysisMode'];
  rejectionReasonCode: string | null;
}): Ds4RpmHfV1bTierEvidenceResultSlice {
  const evidence =
    input.tripInput.tierEvidence ??
    resolveTierEvidenceForTrip({
      tripId: input.tripInput.tripId,
      tripEndIso: input.tripInput.tripEndIso,
      providerSourceLinkId: input.tripInput.providerSourceLinkId,
      tierSnapshot: input.tripInput.vsiRpmCadenceTierSnapshot,
      hfReadComplete: input.tripInput.dataQuality.completenessLabel === 'COMPLETE',
      hfDataPresent: input.tripInput.rpmPoints.length > 0,
    });

  const availability =
    evidence.status === 'AVAILABLE'
      ? evidence.status
      : input.rejectionReasonCode === 'TIER_EVIDENCE_NOT_AVAILABLE' ||
          input.rejectionReasonCode?.endsWith('_READINESS_WINDOW_EXHAUSTED')
        ? ('NOT_AVAILABLE' as const)
        : evidence.status;

  const row = evidence.tripClassification;
  const tier = row?.tier ?? null;
  const temporalCadenceProfile =
    tier === 'RPM_1S' || tier === 'RPM_2S' || tier === 'RPM_3S'
      ? resolveTemporalCadenceProfileForTier(tier)
      : null;

  return {
    availability,
    tripId: input.tripInput.tripId,
    tier,
    cadenceConfidence: row?.cadenceConfidence ?? null,
    tripCoverageBand: row?.tripCoverageBand ?? null,
    analysisReadiness: row?.analysisReadiness ?? null,
    decisionCode: row?.decisionCode ?? null,
    analysisMode: input.analysisMode,
    temporalCadenceProfile,
  };
}

/**
 * Tier-aware V1B shadow variant — legacy {@link processDs4RpmHfV1bShadowTrip} unchanged.
 */
export function processDs4RpmHfV1bShadowTripTierAware(input: {
  tripInput: Ds4RpmHfV1aTripInputV1;
  attemptCount: number;
  computedAt: Date;
  existingSucceededFingerprint: string | null;
}): ProcessDs4RpmHfV1bShadowTripResult {
  const fingerprint = computeDs4RpmHfV1bTierAwareInputFingerprint(input.tripInput);
  if (input.existingSucceededFingerprint === fingerprint) {
    return { kind: 'IDEMPOTENT', fingerprint };
  }

  const tierEvidence =
    input.tripInput.tierEvidence ??
    resolveTierEvidenceForTrip({
      tripId: input.tripInput.tripId,
      tripEndIso: input.tripInput.tripEndIso,
      providerSourceLinkId: input.tripInput.providerSourceLinkId,
      tierSnapshot: input.tripInput.vsiRpmCadenceTierSnapshot,
      hfReadComplete: input.tripInput.dataQuality.completenessLabel === 'COMPLETE',
      hfDataPresent: input.tripInput.rpmPoints.length > 0,
    });

  const routing = routeDs4RpmHfV1bTierAwareAdmission(
    input.tripInput,
    tierEvidence,
    input.attemptCount,
    {
      maxDeferAttempts: DS4_RPM_HF_V1B_TUNING.maxDeferAttempts,
      nowMs: input.computedAt.getTime(),
      postTripReadinessWindowMs: DS4_RPM_HF_V1B_TUNING.postTripReadinessWindowMs,
    },
  );

  const tierLabel = routing.tierEvidence.tripClassification?.tier;
  const cadenceProfile =
    tierLabel === 'RPM_1S' || tierLabel === 'RPM_2S' || tierLabel === 'RPM_3S'
      ? resolveTemporalCadenceProfileForTier(tierLabel)
      : resolveTemporalCadenceProfileForTier('RPM_1S');

  const temporal = computeDs4RpmHfV1bTemporalAnalysis(
    {
      tripStartIso: input.tripInput.tripStartIso,
      tripEndIso: input.tripInput.tripEndIso,
      points: input.tripInput.rpmPoints,
      invalidValueCount: input.tripInput.dataQuality.invalidValueCount,
      duplicateTimestampCount: input.tripInput.dataQuality.duplicateTimestampCount,
    },
    cadenceProfile,
  );

  const tierSlice = buildTierEvidenceSlice({
    tripInput: input.tripInput,
    analysisMode: routing.analysisMode,
    rejectionReasonCode: routing.rejectionReasonCode,
  });

  const result = buildV1bResultFromV1aInput({
    tripInput: input.tripInput,
    temporal,
    processingOutcome: routing.outcome,
    deferReasonCode: routing.deferReasonCode,
    rejectionReasonCode: routing.rejectionReasonCode,
    inputFingerprint: fingerprint,
    computedAt: input.computedAt,
    engineVersion: DS4_RPM_HF_V1B_ENGINE_VERSION_TIER_AWARE,
    shadowVariant: 'tier-aware',
    tierEvidence: tierSlice,
  });

  if (routing.outcome === 'DEFER_RETRY') {
    return {
      kind: 'DEFER',
      fingerprint,
      deferReasonCode: routing.deferReasonCode ?? 'DEFER',
      result: null,
    };
  }

  if (routing.outcome === 'SUCCEEDED' && routing.shouldPersistAnalysis) {
    return {
      kind: 'SUCCEEDED',
      fingerprint,
      result,
      persistStatus: 'SUCCEEDED',
    };
  }

  return {
    kind: 'TERMINAL',
    fingerprint,
    rejectionReasonCode: routing.rejectionReasonCode ?? 'INELIGIBLE',
    persistStatus: routing.outcome === 'TERMINAL_FAILED' ? 'TERMINAL_FAILED' : 'TERMINAL_INELIGIBLE',
    result: routing.shouldPersistAnalysis ? result : null,
  };
}
