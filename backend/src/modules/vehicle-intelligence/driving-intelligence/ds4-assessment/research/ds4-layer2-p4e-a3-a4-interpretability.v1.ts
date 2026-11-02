import type { Ds4EventIntensityEligibilityRecordV1 } from '../ds4-assessment-event-intensity-eligibility.v1';
import type {
  Ds4LongitudinalLoadKindObservablesV1,
  Ds4LongitudinalLoadObservablesV1,
} from '../ds4-longitudinal-load-observables.v1.contract';
import type {
  Ds4Layer2P4eA3IntensityDecompositionV1,
  Ds4Layer2P4eA4EvidenceSupportAnnotationV1,
  Ds4Layer2P4eCohortInterpretabilitySummaryV1,
  Ds4Layer2P4eFullEventEvidenceQuantityTierV1,
  Ds4Layer2P4eKindInterpretabilityV1,
  Ds4Layer2P4eTripInterpretabilityV1,
} from './ds4-layer2-p4e-a3-a4-interpretability.v1.contract';
import { DS4_LAYER2_P4E_A3_A4_INTERPRETABILITY_SCHEMA_VERSION_V1 } from './ds4-layer2-p4e-a3-a4-interpretability.v1.contract';

const ADMISSIBLE = new Set(['ADMISSIBLE_FULL', 'ADMISSIBLE_BIN_ONLY']);
const IDENTITY_TOLERANCE_MPS2 = 1e-5;

function kindFilter(
  records: readonly Ds4EventIntensityEligibilityRecordV1[],
  kind: 'ACCELERATION' | 'DECELERATION',
): Ds4EventIntensityEligibilityRecordV1[] {
  return records.filter((r) => r.kind === kind && ADMISSIBLE.has(r.classification));
}

/** Research-only: Σ T_i and B_k over admissible events of one kind (matches load-model secant sums). */
export function computeDs4Layer2P4eAdmissibleKindDurationAndImpulseV1(
  records: readonly Ds4EventIntensityEligibilityRecordV1[],
  kind: 'acceleration' | 'deceleration',
): { durationSumS: number; impulseMps: number; valid: boolean } {
  const motionKind = kind === 'acceleration' ? 'ACCELERATION' : 'DECELERATION';
  let durationSumS = 0;
  let impulseMps = 0;
  for (const record of kindFilter(records, motionKind)) {
    const a = record.meanAccelMps2;
    const t = record.durationS;
    if (a == null || t == null || !Number.isFinite(a) || !Number.isFinite(t) || a <= 0 || t < 0) {
      return { durationSumS: 0, impulseMps: 0, valid: false };
    }
    durationSumS += t;
    impulseMps += a * t;
  }
  return { durationSumS, impulseMps, valid: true };
}

export function computeDs4Layer2P4eA3IntensityDecompositionV1(input: {
  kindObservables: Ds4LongitudinalLoadKindObservablesV1;
  durationSumS: number;
  impulseValid: boolean;
}): Ds4Layer2P4eA3IntensityDecompositionV1 {
  const i = input.kindObservables.normalizedMeanAccelMps2;
  const s = input.kindObservables.maneuverTimeShare;
  const b = input.kindObservables.specificLongitudinalImpulseMps;

  if (
    input.kindObservables.impulseSemantics !== 'SPECIFIC_LONGITUDINAL_IMPULSE_MPS' ||
    i == null ||
    s == null ||
    b == null ||
    !input.impulseValid
  ) {
    return {
      exposureNormalizedIntensityMps2: i,
      admissibleEventTimeShare: s,
      meanEventAccelerationMps2: null,
      admissibleDurationSumS: input.impulseValid ? input.durationSumS : null,
      reconstructedIntensityMps2: null,
      identityResidualMps2: null,
      identityHoldsWithinTolerance: null,
    };
  }

  if (input.durationSumS <= 0) {
    const zeroLoad = b === 0 && i === 0 && s === 0;
    return {
      exposureNormalizedIntensityMps2: i,
      admissibleEventTimeShare: s,
      meanEventAccelerationMps2: zeroLoad ? 0 : null,
      admissibleDurationSumS: input.durationSumS,
      reconstructedIntensityMps2: zeroLoad ? 0 : null,
      identityResidualMps2: zeroLoad ? 0 : null,
      identityHoldsWithinTolerance: zeroLoad ? true : null,
    };
  }

  const mean = b / input.durationSumS;
  const reconstructed = s * mean;
  const residual = i - reconstructed;
  const holds = Math.abs(residual) <= IDENTITY_TOLERANCE_MPS2;

  return {
    exposureNormalizedIntensityMps2: i,
    admissibleEventTimeShare: s,
    meanEventAccelerationMps2: mean,
    admissibleDurationSumS: input.durationSumS,
    reconstructedIntensityMps2: reconstructed,
    identityResidualMps2: residual,
    identityHoldsWithinTolerance: holds,
  };
}

export function resolveDs4Layer2P4eFullEventEvidenceQuantityTierV1(input: {
  fullEventCount: number;
  metricsAvailable: boolean;
}): Ds4Layer2P4eFullEventEvidenceQuantityTierV1 {
  if (!input.metricsAvailable) return 'UNAVAILABLE';
  if (input.fullEventCount < 3) return 'FULL_EVENT_COUNT_LT_3';
  if (input.fullEventCount < 10) return 'FULL_EVENT_COUNT_3_TO_9';
  return 'FULL_EVENT_COUNT_GTE_10';
}

const TIER_LABEL: Record<Ds4Layer2P4eFullEventEvidenceQuantityTierV1, string> = {
  UNAVAILABLE: 'Evidence quantity unavailable (load metrics gated)',
  FULL_EVENT_COUNT_LT_3: 'Fewer than 3 FULL-duration admissible events (N_FULL < 3)',
  FULL_EVENT_COUNT_3_TO_9: '3–9 FULL-duration admissible events (3 ≤ N_FULL < 10)',
  FULL_EVENT_COUNT_GTE_10: 'At least 10 FULL-duration admissible events (N_FULL ≥ 10)',
};

export function buildDs4Layer2P4eA4EvidenceSupportAnnotationV1(
  kindObservables: Ds4LongitudinalLoadKindObservablesV1,
): Ds4Layer2P4eA4EvidenceSupportAnnotationV1 {
  const metricsAvailable =
    kindObservables.impulseSemantics === 'SPECIFIC_LONGITUDINAL_IMPULSE_MPS' &&
    kindObservables.normalizedMeanAccelMps2 != null;
  const tier = resolveDs4Layer2P4eFullEventEvidenceQuantityTierV1({
    fullEventCount: kindObservables.fullEventCount,
    metricsAvailable,
  });
  return {
    fullEventCount: kindObservables.fullEventCount,
    admissibleEventCount: kindObservables.admissibleEventCount,
    evidenceQuantityTier: tier,
    evidenceQuantityLabel: TIER_LABEL[tier],
    medianFullIntensitySupported: metricsAvailable && kindObservables.fullEventCount >= 3,
    p90FullIntensitySupported: metricsAvailable && kindObservables.fullEventCount >= 10,
  };
}

export function buildDs4Layer2P4eKindInterpretabilityV1(input: {
  kind: 'acceleration' | 'deceleration';
  kindObservables: Ds4LongitudinalLoadKindObservablesV1;
  records: readonly Ds4EventIntensityEligibilityRecordV1[];
}): Ds4Layer2P4eKindInterpretabilityV1 {
  const sums = computeDs4Layer2P4eAdmissibleKindDurationAndImpulseV1(input.records, input.kind);
  return {
    kind: input.kind,
    loadKindObservables: input.kindObservables,
    intensityDecomposition: computeDs4Layer2P4eA3IntensityDecompositionV1({
      kindObservables: input.kindObservables,
      durationSumS: sums.durationSumS,
      impulseValid: sums.valid,
    }),
    evidenceSupport: buildDs4Layer2P4eA4EvidenceSupportAnnotationV1(input.kindObservables),
  };
}

export function buildDs4Layer2P4eTripInterpretabilityV1(input: {
  tripId: string;
  longitudinalLoad: Ds4LongitudinalLoadObservablesV1;
  eventIntensityRecords: readonly Ds4EventIntensityEligibilityRecordV1[];
}): Ds4Layer2P4eTripInterpretabilityV1 {
  return {
    tripId: input.tripId,
    exposureSeconds: input.longitudinalLoad.exposureSeconds,
    longitudinalLoad: input.longitudinalLoad,
    acceleration: buildDs4Layer2P4eKindInterpretabilityV1({
      kind: 'acceleration',
      kindObservables: input.longitudinalLoad.acceleration,
      records: input.eventIntensityRecords,
    }),
    deceleration: buildDs4Layer2P4eKindInterpretabilityV1({
      kind: 'deceleration',
      kindObservables: input.longitudinalLoad.deceleration,
      records: input.eventIntensityRecords,
    }),
  };
}

export function summarizeDs4Layer2P4eCohortInterpretabilityV1(input: {
  trips: readonly Ds4Layer2P4eTripInterpretabilityV1[];
  admissibleEventCount: number;
}): Ds4Layer2P4eCohortInterpretabilitySummaryV1 {
  const a4SupportDistribution: Ds4Layer2P4eCohortInterpretabilitySummaryV1['a4SupportDistribution'] = {
    UNAVAILABLE: 0,
    FULL_EVENT_COUNT_LT_3: 0,
    FULL_EVENT_COUNT_3_TO_9: 0,
    FULL_EVENT_COUNT_GTE_10: 0,
  };
  let a3IdentityPassCount = 0;
  let a3IdentityFailCount = 0;
  let a3IdentityUnavailableCount = 0;

  for (const trip of input.trips) {
    for (const kind of [trip.acceleration, trip.deceleration]) {
      a4SupportDistribution[kind.evidenceSupport.evidenceQuantityTier] += 1;
      const holds = kind.intensityDecomposition.identityHoldsWithinTolerance;
      if (holds === true) a3IdentityPassCount += 1;
      else if (holds === false) a3IdentityFailCount += 1;
      else a3IdentityUnavailableCount += 1;
    }
  }

  return {
    schemaVersion: DS4_LAYER2_P4E_A3_A4_INTERPRETABILITY_SCHEMA_VERSION_V1,
    tripCount: input.trips.length,
    admissibleEventCount: input.admissibleEventCount,
    a3IdentityPassCount,
    a3IdentityFailCount,
    a3IdentityUnavailableCount,
    a4SupportDistribution,
  };
}
