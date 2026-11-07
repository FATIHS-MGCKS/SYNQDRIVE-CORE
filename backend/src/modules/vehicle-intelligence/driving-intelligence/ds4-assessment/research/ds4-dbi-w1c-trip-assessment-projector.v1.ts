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

export type Ds4DbiW1cMetricAssessmentV1 = {
  metricId: Ds4DbiW1cMetricIdV1;
  eligibilityStatus: Ds4DbiW1cMetricEligibilityStatusV1;
  /** Value exposed for trip-level findings — null when integrity fail-closed. */
  value: number | null;
  unit: string | null;
  coverage: number | null;
  n: number | null;
  reasonCodes: Ds4DbiW0MbfReasonCodeV1[];
  kernelStatusPreserved: string;
};

export type Ds4DbiW1cTripAssessmentSummaryV1 = {
  assessmentVersion: typeof DS4_DBI_W1C_ASSESSMENT_VERSION;
  tripId: string;
  sourceMotionRunId: string;
  tripOutcome: Ds4DbiW1cTripOutcomeV1;
  qualityTier: Ds4DbiW0QualityTierV1;
  evidenceOrigin: Ds4DbiW0EvidenceOriginV1;
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

function kernelMetricStatus(
  kernel: Ds4DbiW0TripKernelResultV1,
  id: Ds4DbiW1cMetricIdV1,
): { status: string; value: number | null; coverage: number | null; n: number | null; reasonCodes: Ds4DbiW0MbfReasonCodeV1[] } {
  switch (id) {
    case 'D4': {
      const m = kernel.d4SpeedVariabilityRobustCv;
      return { status: m.status, value: m.value, coverage: m.coverage, n: m.n, reasonCodes: m.reasonCodes };
    }
    case 'D5': {
      const m = kernel.d5SpeedRoughnessMeanAbsDeltaKmhPerS;
      return { status: m.status, value: m.value, coverage: m.coverage, n: m.n, reasonCodes: m.reasonCodes };
    }
    case 'D6': {
      const m = kernel.d6StopStructure;
      return {
        status: m.status,
        value: m.stopsPerKm,
        coverage: null,
        n: m.directStopCount,
        reasonCodes: m.reasonCodes,
      };
    }
    case 'D8': {
      const m = kernel.d8Burstiness;
      return {
        status: m.status,
        value: m.indexOfDispersion,
        coverage: m.nonEmptyWindowCount,
        n: m.eventCount,
        reasonCodes: m.reasonCodes,
      };
    }
    default:
      return { status: 'ABSTAIN', value: null, coverage: null, n: null, reasonCodes: [] };
  }
}

const METRIC_UNITS: Record<Ds4DbiW1cMetricIdV1, string | null> = {
  D4: 'robust_cv',
  D5: 'kmh_per_s_mean_abs_delta',
  D6: 'stops_per_km',
  D8: 'index_of_dispersion',
};

function mapKernelToEligibility(kernelStatus: string): Ds4DbiW1cMetricEligibilityStatusV1 {
  if (kernelStatus === 'KNOWN') {
    return 'KNOWN';
  }
  if (kernelStatus === 'NOT_AVAILABLE') {
    return 'NOT_AVAILABLE';
  }
  return 'ABSTAIN';
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
): Ds4DbiW1cTripAssessmentSummaryV1 {
  const tripFailClosed = kernel.diagnostics.failClosedReasons.length > 0;
  const sourceIntegrityStatus: Ds4DbiW1cSourceIntegrityStatusV1 = tripFailClosed ? 'FAIL_CLOSED' : 'OK';

  const metricIds: Ds4DbiW1cMetricIdV1[] = ['D4', 'D5', 'D6', 'D8'];
  const metrics: Ds4DbiW1cMetricAssessmentV1[] = metricIds.map((metricId) => {
    const k = kernelMetricStatus(kernel, metricId);
    const baseEligibility = mapKernelToEligibility(k.status);
    const eligibilityStatus: Ds4DbiW1cMetricEligibilityStatusV1 = tripFailClosed
      ? 'BLOCKED_FAIL_CLOSED'
      : baseEligibility;
    const value = tripFailClosed ? null : k.value;
    return {
      metricId,
      eligibilityStatus,
      value,
      unit: METRIC_UNITS[metricId],
      coverage: tripFailClosed ? null : k.coverage,
      n: tripFailClosed ? null : k.n,
      reasonCodes: k.reasonCodes,
      kernelStatusPreserved: k.status,
    };
  });

  const outcomeEligibility: Ds4DbiW1cMetricEligibilityStatusV1[] = metricIds.map((metricId) => {
    const k = kernelMetricStatus(kernel, metricId);
    return tripFailClosed ? 'BLOCKED_FAIL_CLOSED' : mapKernelToEligibility(k.status);
  });
  const tripOutcome = deriveDs4DbiW1cTripOutcomeV1({
    metricEligibility: outcomeEligibility,
    tripFailClosed,
  });

  const knownMetricCount = metrics.filter((m) => m.eligibilityStatus === 'KNOWN').length;
  const unavailableMetricCount = metrics.filter((m) => m.eligibilityStatus !== 'KNOWN').length;

  const outcomeReasonCodes: Ds4DbiW0MbfReasonCodeV1[] = [];
  if (tripOutcome === 'COMPLETE') {
    outcomeReasonCodes.push('MBF_W0_OK');
  } else if (tripOutcome === 'PARTIAL') {
    outcomeReasonCodes.push('MBF_W0_OK');
  } else if (tripFailClosed) {
    outcomeReasonCodes.push(...kernel.diagnostics.failClosedReasons);
  }

  return {
    assessmentVersion: DS4_DBI_W1C_ASSESSMENT_VERSION,
    tripId: kernel.tripId,
    sourceMotionRunId: kernel.sourceMotionRunId,
    tripOutcome,
    qualityTier: kernel.qualityTier,
    evidenceOrigin: kernel.evidenceOrigin,
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
    tripFailClosedReasonCodes: kernel.diagnostics.failClosedReasons.filter((c) =>
      isDs4DbiW0FailClosedReasonCodeV1(c),
    ),
    outcomeReasonCodes,
    interpretationLimits: [
      'COMPLETE_IS_METRIC_AVAILABILITY_ONLY_NOT_SCIENTIFIC_VALIDATION',
      'NO_COMPOSITE_DBI_SCORE',
      'sealedRealC4StatisticalEligibility=false',
    ],
  };
}
