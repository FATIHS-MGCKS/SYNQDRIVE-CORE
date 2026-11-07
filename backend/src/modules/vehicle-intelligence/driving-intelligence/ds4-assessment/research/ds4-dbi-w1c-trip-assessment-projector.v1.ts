/**
 * W1C — Trip-level partial assessment projector (pure; no kernel math changes).
 */

import { isDs4DbiW0FailClosedReasonCodeV1 } from './ds4-dbi-w0-fail-closed-codes.v1';
import type {
  Ds4DbiW0EvidenceOriginV1,
  Ds4DbiW0MbfReasonCodeV1,
  Ds4DbiW0QualityTierV1,
  Ds4DbiW0TripKernelResultV1,
} from './ds4-dbi-w0-mbf.types.v1';

export const DS4_DBI_W1C_ASSESSMENT_VERSION = 'ds4-dbi-w1c-trip-assessment-v1' as const;

export type Ds4DbiW1cMetricIdV1 = 'D4' | 'D5' | 'D6' | 'D8';

export type Ds4DbiW1cMetricEligibilityStatusV1 =
  | 'KNOWN'
  | 'ABSTAIN'
  | 'NOT_AVAILABLE'
  | 'BLOCKED_FAIL_CLOSED';

export type Ds4DbiW1cTripOutcomeV1 = 'COMPLETE' | 'PARTIAL' | 'NOT_EVALUABLE';

export type Ds4DbiW1cSourceIntegrityStatusV1 = 'OK' | 'FAIL_CLOSED';

export type Ds4DbiW1cKernelInputValidationStatusV1 = 'OK' | 'REJECTED';

export type Ds4DbiW1cSourceAuthenticationStatusV1 = 'NOT_AUTHENTICATED';

export type Ds4DbiW1cProjectionFailureCodeV1 =
  | 'UNKNOWN_KERNEL_METRIC_STATUS'
  | 'KNOWN_METRIC_VALUE_INCONSISTENT'
  | 'CONTRADICTORY_FAIL_CLOSED_DIAGNOSTICS'
  | 'INVALID_FAIL_CLOSED_REASON_CODE';

export type Ds4DbiW1cMetricAssessmentV1 = {
  metricId: Ds4DbiW1cMetricIdV1;
  eligibilityStatus: Ds4DbiW1cMetricEligibilityStatusV1;
  /** Primary scalar for trip summary — null when integrity fail-closed. */
  value: number | null;
  unit: string | null;
  /** Fraction-style coverage (D4/D5 only). */
  coverage: number | null;
  n: number | null;
  reasonCodes: Ds4DbiW0MbfReasonCodeV1[];
  kernelStatusPreserved: string;
  d6Multidimensional: {
    directStopCount: number | null;
    stopsPerKm: number | null;
    medianMovingRunDurationSeconds: number | null;
    sustainedMovementShare: number | null;
  } | null;
  d8WindowEvidence: {
    nonEmptyWindowCount: number | null;
    totalWindowSlots: number | null;
    eventCount: number | null;
    observationWindowDurationSeconds: number | null;
  } | null;
};

export type Ds4DbiW1cTripAssessmentSummaryV1 = {
  assessmentVersion: typeof DS4_DBI_W1C_ASSESSMENT_VERSION;
  tripId: string;
  sourceMotionRunId: string;
  tripOutcome: Ds4DbiW1cTripOutcomeV1;
  qualityTier: Ds4DbiW0QualityTierV1;
  evidenceOrigin: Ds4DbiW0EvidenceOriginV1;
  kernelInputValidationStatus: Ds4DbiW1cKernelInputValidationStatusV1;
  sourceAuthenticationStatus: Ds4DbiW1cSourceAuthenticationStatusV1;
  sourceIntegrityStatus: Ds4DbiW1cSourceIntegrityStatusV1;
  scientificValidationStatus: 'NOT_EVALUATED';
  sealedRealC4StatisticalEligibility: false;
  metrics: Ds4DbiW1cMetricAssessmentV1[];
  knownMetricCount: number;
  unavailableMetricCount: number;
  metricCoverage: {
    known: number;
    abstain: number;
    notAvailable: number;
    blockedFailClosed: number;
    total: 4;
  };
  tripFailClosedReasonCodes: Ds4DbiW0MbfReasonCodeV1[];
  outcomeReasonCodes: Ds4DbiW0MbfReasonCodeV1[];
  interpretationLimits: string[];
};

export type Ds4DbiW1cProjectionResultV1 =
  | { ok: true; summary: Ds4DbiW1cTripAssessmentSummaryV1 }
  | { ok: false; codes: Ds4DbiW1cProjectionFailureCodeV1[]; detail: string };

const METRIC_UNITS: Record<'D4' | 'D5' | 'D8', string> = {
  D4: 'robust_cv',
  D5: 'kmh_per_s_mean_abs_delta',
  D8: 'index_of_dispersion',
};

const D4_D5_D8_STATUSES = new Set(['KNOWN', 'ABSTAIN']);
const D6_STATUSES = new Set(['KNOWN', 'ABSTAIN', 'NOT_AVAILABLE']);

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function assertKnownValueConsistency(
  metricId: Ds4DbiW1cMetricIdV1,
  status: string,
  value: number | null,
  codes: Ds4DbiW1cProjectionFailureCodeV1[],
): void {
  if (status !== 'KNOWN') {
    return;
  }
  if (metricId === 'D6') {
    if (!isFiniteNumber(value)) {
      codes.push('KNOWN_METRIC_VALUE_INCONSISTENT');
    }
    return;
  }
  if (!isFiniteNumber(value)) {
    codes.push('KNOWN_METRIC_VALUE_INCONSISTENT');
  }
}

function parseKernelMetricStatus(
  kernel: Ds4DbiW0TripKernelResultV1,
  id: Ds4DbiW1cMetricIdV1,
): {
  status: string;
  value: number | null;
  coverage: number | null;
  n: number | null;
  reasonCodes: Ds4DbiW0MbfReasonCodeV1[];
  d6Multidimensional: Ds4DbiW1cMetricAssessmentV1['d6Multidimensional'];
  d8WindowEvidence: Ds4DbiW1cMetricAssessmentV1['d8WindowEvidence'];
} {
  switch (id) {
    case 'D4': {
      const m = kernel.d4SpeedVariabilityRobustCv;
      return {
        status: m.status,
        value: m.value,
        coverage: m.coverage,
        n: m.n,
        reasonCodes: m.reasonCodes,
        d6Multidimensional: null,
        d8WindowEvidence: null,
      };
    }
    case 'D5': {
      const m = kernel.d5SpeedRoughnessMeanAbsDeltaKmhPerS;
      return {
        status: m.status,
        value: m.value,
        coverage: m.coverage,
        n: m.n,
        reasonCodes: m.reasonCodes,
        d6Multidimensional: null,
        d8WindowEvidence: null,
      };
    }
    case 'D6': {
      const m = kernel.d6StopStructure;
      return {
        status: m.status,
        value: m.stopsPerKm,
        coverage: null,
        n: m.directStopCount,
        reasonCodes: m.reasonCodes,
        d6Multidimensional: {
          directStopCount: m.directStopCount,
          stopsPerKm: m.stopsPerKm,
          medianMovingRunDurationSeconds: m.medianMovingRunDurationSeconds,
          sustainedMovementShare: m.sustainedMovementShare,
        },
        d8WindowEvidence: null,
      };
    }
    case 'D8': {
      const m = kernel.d8Burstiness;
      return {
        status: m.status,
        value: m.indexOfDispersion,
        coverage: null,
        n: m.eventCount,
        reasonCodes: m.reasonCodes,
        d6Multidimensional: null,
        d8WindowEvidence: {
          nonEmptyWindowCount: m.nonEmptyWindowCount,
          totalWindowSlots: m.totalWindowSlots,
          eventCount: m.eventCount,
          observationWindowDurationSeconds: m.observationWindowDurationSeconds,
        },
      };
    }
    default:
      return {
        status: '__invalid__',
        value: null,
        coverage: null,
        n: null,
        reasonCodes: [],
        d6Multidimensional: null,
        d8WindowEvidence: null,
      };
  }
}

function mapKernelToEligibility(
  metricId: Ds4DbiW1cMetricIdV1,
  kernelStatus: string,
  failures: Ds4DbiW1cProjectionFailureCodeV1[],
): Ds4DbiW1cMetricEligibilityStatusV1 | null {
  const allowed = metricId === 'D6' ? D6_STATUSES : D4_D5_D8_STATUSES;
  if (!allowed.has(kernelStatus)) {
    failures.push('UNKNOWN_KERNEL_METRIC_STATUS');
    return null;
  }
  if (kernelStatus === 'KNOWN') {
    return 'KNOWN';
  }
  if (kernelStatus === 'NOT_AVAILABLE') {
    return 'NOT_AVAILABLE';
  }
  return 'ABSTAIN';
}

export function deriveTripFailClosedFromDiagnosticsV1(kernel: Ds4DbiW0TripKernelResultV1): {
  tripFailClosed: boolean;
  typedReasons: Ds4DbiW0MbfReasonCodeV1[];
  projectionFailures: Ds4DbiW1cProjectionFailureCodeV1[];
} {
  const reasons = kernel.diagnostics.failClosedReasons;
  const projectionFailures: Ds4DbiW1cProjectionFailureCodeV1[] = [];
  const typed: Ds4DbiW0MbfReasonCodeV1[] = [];
  for (const r of reasons) {
    if (isDs4DbiW0FailClosedReasonCodeV1(r)) {
      typed.push(r);
    } else {
      projectionFailures.push('INVALID_FAIL_CLOSED_REASON_CODE');
    }
  }
  if (projectionFailures.length > 0) {
    projectionFailures.push('CONTRADICTORY_FAIL_CLOSED_DIAGNOSTICS');
    return { tripFailClosed: true, typedReasons: typed, projectionFailures };
  }
  return { tripFailClosed: typed.length > 0, typedReasons: typed, projectionFailures: [] };
}

export function deriveDs4DbiW1cTripOutcomeV1(input: {
  metricEligibility: readonly Ds4DbiW1cMetricEligibilityStatusV1[];
  tripFailClosed: boolean;
}): Ds4DbiW1cTripOutcomeV1 {
  if (input.tripFailClosed) {
    return 'NOT_EVALUABLE';
  }
  const known = input.metricEligibility.filter((s) => s === 'KNOWN').length;
  if (known === 0) {
    return 'NOT_EVALUABLE';
  }
  if (known === 4) {
    return 'COMPLETE';
  }
  return 'PARTIAL';
}

export function projectDs4DbiW1cTripAssessmentFromW0KernelV1(
  kernel: Ds4DbiW0TripKernelResultV1,
): Ds4DbiW1cProjectionResultV1 {
  const projectionFailures: Ds4DbiW1cProjectionFailureCodeV1[] = [];
  const failClosedDerivation = deriveTripFailClosedFromDiagnosticsV1(kernel);
  if (failClosedDerivation.projectionFailures.length > 0) {
    return {
      ok: false,
      codes: [...new Set(failClosedDerivation.projectionFailures)],
      detail: 'W1C rejected contradictory kernel diagnostics',
    };
  }

  const tripFailClosed = failClosedDerivation.tripFailClosed;
  const sourceIntegrityStatus: Ds4DbiW1cSourceIntegrityStatusV1 = tripFailClosed ? 'FAIL_CLOSED' : 'OK';

  const metricIds: Ds4DbiW1cMetricIdV1[] = ['D4', 'D5', 'D6', 'D8'];
  const metrics: Ds4DbiW1cMetricAssessmentV1[] = [];

  for (const metricId of metricIds) {
    const k = parseKernelMetricStatus(kernel, metricId);
    const baseEligibility = mapKernelToEligibility(metricId, k.status, projectionFailures);
    if (baseEligibility == null) {
      return {
        ok: false,
        codes: [...new Set(projectionFailures)],
        detail: `W1C rejected unknown kernel status for ${metricId}`,
      };
    }
    assertKnownValueConsistency(metricId, k.status, k.value, projectionFailures);
  }

  if (projectionFailures.length > 0) {
    return {
      ok: false,
      codes: [...new Set(projectionFailures)],
      detail: 'W1C rejected inconsistent KNOWN metric values',
    };
  }

  for (const metricId of metricIds) {
    const k = parseKernelMetricStatus(kernel, metricId);
    const baseEligibility = mapKernelToEligibility(metricId, k.status, [])!;
    const eligibilityStatus: Ds4DbiW1cMetricEligibilityStatusV1 = tripFailClosed
      ? 'BLOCKED_FAIL_CLOSED'
      : baseEligibility;
    const value = tripFailClosed ? null : k.value;
    metrics.push({
      metricId,
      eligibilityStatus,
      value,
      unit: metricId === 'D6' ? null : METRIC_UNITS[metricId as 'D4' | 'D5' | 'D8'],
      coverage: metricId === 'D6' || metricId === 'D8' ? null : tripFailClosed ? null : k.coverage,
      n: tripFailClosed ? null : k.n,
      reasonCodes: k.reasonCodes,
      kernelStatusPreserved: k.status,
      d6Multidimensional: tripFailClosed ? null : k.d6Multidimensional,
      d8WindowEvidence: tripFailClosed ? null : k.d8WindowEvidence,
    });
  }

  const outcomeEligibility: Ds4DbiW1cMetricEligibilityStatusV1[] = metricIds.map((metricId) => {
    const k = parseKernelMetricStatus(kernel, metricId);
    const base = mapKernelToEligibility(metricId, k.status, [])!;
    return tripFailClosed ? 'BLOCKED_FAIL_CLOSED' : base;
  });
  const tripOutcome = deriveDs4DbiW1cTripOutcomeV1({
    metricEligibility: outcomeEligibility,
    tripFailClosed,
  });

  const knownMetricCount = metrics.filter((m) => m.eligibilityStatus === 'KNOWN').length;
  const unavailableMetricCount = metrics.filter((m) => m.eligibilityStatus !== 'KNOWN').length;

  const outcomeReasonCodes: Ds4DbiW0MbfReasonCodeV1[] = [];
  if (tripOutcome === 'COMPLETE' || tripOutcome === 'PARTIAL') {
    outcomeReasonCodes.push('MBF_W0_OK');
  } else if (tripFailClosed) {
    outcomeReasonCodes.push(...failClosedDerivation.typedReasons);
  }

  return {
    ok: true,
    summary: {
      assessmentVersion: DS4_DBI_W1C_ASSESSMENT_VERSION,
      tripId: kernel.tripId,
      sourceMotionRunId: kernel.sourceMotionRunId,
      tripOutcome,
      qualityTier: kernel.qualityTier,
      evidenceOrigin: kernel.evidenceOrigin,
      kernelInputValidationStatus: 'OK',
      sourceAuthenticationStatus: 'NOT_AUTHENTICATED',
      sourceIntegrityStatus,
      scientificValidationStatus: 'NOT_EVALUATED',
      sealedRealC4StatisticalEligibility: false,
      metrics,
      knownMetricCount,
      unavailableMetricCount,
      metricCoverage: {
        known: metrics.filter((m) => m.eligibilityStatus === 'KNOWN').length,
        abstain: metrics.filter((m) => m.eligibilityStatus === 'ABSTAIN').length,
        notAvailable: metrics.filter((m) => m.eligibilityStatus === 'NOT_AVAILABLE').length,
        blockedFailClosed: metrics.filter((m) => m.eligibilityStatus === 'BLOCKED_FAIL_CLOSED').length,
        total: 4,
      },
      tripFailClosedReasonCodes: failClosedDerivation.typedReasons,
      outcomeReasonCodes,
      interpretationLimits: [
        'COMPLETE_IS_METRIC_AVAILABILITY_ONLY_NOT_SCIENTIFIC_VALIDATION',
        'SOURCE_NOT_AUTHENTICATED_IN_W1C',
        'NO_COMPOSITE_DBI_SCORE',
        'sealedRealC4StatisticalEligibility=false',
      ],
    },
  };
}
