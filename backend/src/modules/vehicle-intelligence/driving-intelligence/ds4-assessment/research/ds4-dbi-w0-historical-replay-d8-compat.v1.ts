/**
 * Historical Motion-Core replay — D8 observation-window compatibility (research only).
 *
 * Canonical W0 kernel reads `payload.contract.speedAuthority` for B3 clock construction.
 * Frozen TIG22 bytes omit that field; trip meta exposure may still be derived offline with
 * an explicit RELAXED binding. This module compares canonical vs research-adapted D8
 * without mutating fixture bytes or promoting F04/W1 trust.
 */

import type { DiV0MotionCoreShadowPayloadV1 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import {
  computeDs4DbiW0D8BurstinessFromObservationWindowV1,
} from './ds4-dbi-w0-mbf-kernel.v1';
import type { Ds4DbiW0TripMetaV1 } from './ds4-dbi-w0-mbf-kernel.v1';
import type { Ds4DbiW0MbfReasonCodeV1 } from './ds4-dbi-w0-mbf.types.v1';
import {
  buildDs4DbiW0MovingExposureClockEvidenceV1,
  computeDs4DbiW0D8BurstinessTauNativeV1,
} from './ds4-dbi-w0-moving-exposure-clock.v1';
import type {
  Ds4DbiW0HistoricalReplayLoadSuccessV1,
  Ds4DbiW0HistoricalSpeedAuthorityBindingV1,
} from './ds4-dbi-w0-historical-replay.loader.v1';

type Ds4SpeedAuthorityPartitionForClockV1 = 'C4_ONLY' | 'C5_1_PREFERRED' | null;

export type Ds4DbiW0HistoricalD8ClockDiagnosticsV1 = {
  movingExposureSeconds: number;
  derivable: boolean;
  metadataMismatch: boolean;
  admittedEventCount: number;
  excludedEventCount: number;
  nonEmptyWindowCount: number | null;
  payloadContractSpeedAuthority: string | null;
  speedAuthorityUsedForClock: string | null;
  eventMappingReasonCodes: string[];
};

export type Ds4DbiW0HistoricalD8CompatibilityReportV1 = {
  contractVersion: 'ds4-dbi-w0-historical-d8-compat-v1';
  rootCause: {
    payloadOmitsContractSpeedAuthority: boolean;
    canonicalClockDerivable: boolean;
    canonicalMovingExposureSeconds: number;
    tripMetaExposureSecondsEs: number;
    confirmedFailurePath: string;
  };
  historicalAuthorityBinding: Ds4DbiW0HistoricalSpeedAuthorityBindingV1 | null;
  originalPayloadUnchanged: true;
  canonical: {
    clock: Ds4DbiW0HistoricalD8ClockDiagnosticsV1;
    d8: ReturnType<typeof computeDs4DbiW0D8BurstinessFromObservationWindowV1>;
  };
  researchAdapted: {
    eligible: boolean;
    ineligibleReason: string | null;
    clock: Ds4DbiW0HistoricalD8ClockDiagnosticsV1 | null;
    d8: ReturnType<typeof computeDs4DbiW0D8BurstinessTauNativeV1> | null;
    provenanceLimitations: string[];
  };
};

function clockDiagnosticsV1(input: {
  payload: DiV0MotionCoreShadowPayloadV1;
  tripMeta: Ds4DbiW0TripMetaV1;
  researchOverride?: Ds4SpeedAuthorityPartitionForClockV1;
}): {
  clock: ReturnType<typeof buildDs4DbiW0MovingExposureClockEvidenceV1>;
  diag: Ds4DbiW0HistoricalD8ClockDiagnosticsV1;
} {
  const clock = buildDs4DbiW0MovingExposureClockEvidenceV1({
    payload: input.payload,
    suppliedExposureSecondsEs: input.tripMeta.exposureSecondsEs,
    ...(input.researchOverride !== undefined
      ? { researchSpeedAuthorityPartitionOverride: input.researchOverride }
      : {}),
  });

  const d8Preview =
    clock.derivable && clock.movingExposureSeconds >= 60
      ? computeDs4DbiW0D8BurstinessTauNativeV1({
          clock,
          tripMetaSuppliedEs: input.tripMeta.exposureSecondsEs,
          failClosedTrip: false,
        })
      : null;

  return {
    clock,
    diag: {
      movingExposureSeconds: clock.movingExposureSeconds,
      derivable: clock.derivable,
      metadataMismatch: clock.metadataMismatch,
      admittedEventCount: clock.dualTime.admittedEventCount,
      excludedEventCount: clock.dualTime.excludedEventCount,
      nonEmptyWindowCount: d8Preview?.nonEmptyWindowCount ?? null,
      payloadContractSpeedAuthority: input.payload.contract?.speedAuthority ?? null,
      speedAuthorityUsedForClock:
        input.researchOverride !== undefined
          ? input.researchOverride
          : input.payload.contract?.speedAuthority ?? null,
      eventMappingReasonCodes: clock.dualTime.eventMappingReasonCodes,
    },
  };
}

export function buildDs4DbiW0HistoricalD8CompatibilityReportV1(
  load: Ds4DbiW0HistoricalReplayLoadSuccessV1,
): Ds4DbiW0HistoricalD8CompatibilityReportV1 {
  const payloadOmits = !load.payload.contract?.speedAuthority;
  const canonicalClock = clockDiagnosticsV1({ payload: load.payload, tripMeta: load.tripMeta });
  const canonicalD8 = computeDs4DbiW0D8BurstinessFromObservationWindowV1({
    tripMeta: load.tripMeta,
    payload: load.payload,
    failClosedTrip: false,
  });

  const binding = load.speedAuthorityBinding;
  const researchEligible = binding.ok && payloadOmits;
  const researchLimitations = [...load.provenanceLimitations];

  let researchClock: ReturnType<typeof clockDiagnosticsV1> | null = null;
  let researchD8: ReturnType<typeof computeDs4DbiW0D8BurstinessTauNativeV1> | null = null;
  let ineligibleReason: string | null = null;

  if (!binding.ok) {
    ineligibleReason = 'SPEED_AUTHORITY_BINDING_FAILED';
  } else if (!payloadOmits) {
    ineligibleReason = 'PAYLOAD_ALREADY_HAS_CONTRACT_SPEED_AUTHORITY';
    researchLimitations.push('RESEARCH_ADAPTED_PATH_NOT_REQUIRED');
  } else {
    researchLimitations.push('RESEARCH_D8_USES_EXPLICIT_BOUND_PARTITION_NOT_PAYLOAD_MUTATION');
    researchClock = clockDiagnosticsV1({
      payload: load.payload,
      tripMeta: load.tripMeta,
      researchOverride: binding.partition,
    });
    researchD8 = computeDs4DbiW0D8BurstinessTauNativeV1({
      clock: researchClock.clock,
      tripMetaSuppliedEs: load.tripMeta.exposureSecondsEs,
      failClosedTrip: false,
    });
  }

  const confirmedPath = payloadOmits
    ? canonicalClock.diag.derivable === false && canonicalClock.diag.movingExposureSeconds === 0
      ? 'MISSING_contract.speedAuthority → clock partition null → exposure not derivable → D8 ABSTAIN'
      : 'MISSING_contract.speedAuthority with unexpected clock state'
    : 'contract.speedAuthority present';

  return {
    contractVersion: 'ds4-dbi-w0-historical-d8-compat-v1',
    rootCause: {
      payloadOmitsContractSpeedAuthority: payloadOmits,
      canonicalClockDerivable: canonicalClock.diag.derivable,
      canonicalMovingExposureSeconds: canonicalClock.diag.movingExposureSeconds,
      tripMetaExposureSecondsEs: load.tripMeta.exposureSecondsEs,
      confirmedFailurePath: confirmedPath,
    },
    historicalAuthorityBinding: binding,
    originalPayloadUnchanged: true,
    canonical: {
      clock: canonicalClock.diag,
      d8: canonicalD8,
    },
    researchAdapted: {
      eligible: researchEligible,
      ineligibleReason,
      clock: researchClock?.diag ?? null,
      d8: researchD8,
      provenanceLimitations: researchLimitations,
    },
  };
}

/** Validates that override is only applied when historical binding succeeded — for tests. */
export function historicalResearchPartitionOverrideV1(
  binding: Ds4DbiW0HistoricalSpeedAuthorityBindingV1,
): Ds4SpeedAuthorityPartitionForClockV1 | undefined {
  if (!binding.ok) {
    return undefined;
  }
  return binding.partition;
}

export function summarizeD8ReasonCodesV1(codes: readonly Ds4DbiW0MbfReasonCodeV1[]): string {
  return codes.length > 0 ? codes.join(',') : 'MBF_W0_OK';
}
