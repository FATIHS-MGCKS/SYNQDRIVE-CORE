import type { Ds4ReferenceDistributionLookupV1 } from './ds4-reference-distribution.v1';
import { DS4_REFERENCE_DISTRIBUTION_V1_UNCALIBRATED } from './ds4-reference-distribution.v1';
import {
  DS4_IMPACT_V2_MODEL_VERSION,
  DS4_IMPACT_V2_PUBLICATION_REASON_MODEL_NOT_CALIBRATED,
  DS4_IMPACT_V2_SCORE_AUTHORITY,
  type Ds4ImpactV2ScorePublicationStatusV1,
} from './ds4-trip-assessment-v1.contract';
import type { Ds4TripAssessmentComputeResultV1 } from './ds4-trip-assessment-v1.engine';

/**
 * Future calibrated score activation (pre-#2218 hardening note):
 * `resolveOperationalLoadIndexPercentile` must run only when `assessment.assessmentStatus === 'RATED'`.
 * Until then publication remains DISABLED_MODEL_NOT_CALIBRATED with operationalLoadIndex=null.
 */

export type Ds4DrivingImpactV2ComputeResultV1 = {
  modelVersion: typeof DS4_IMPACT_V2_MODEL_VERSION;
  scoreAuthority: typeof DS4_IMPACT_V2_SCORE_AUTHORITY;
  operationalLoadIndex: number | null;
  scorePublicationStatus: Ds4ImpactV2ScorePublicationStatusV1;
  publicationReason: string | null;
  evidenceCompleteness: {
    assessmentStatus: string;
    assessmentVersion: string;
    speedAuthority: string | null;
    reasonCodes: string[];
    ratedEventCount: number;
    unratedEventCount: number;
  };
  operationalLoad: {
    accelerationOrdinalLoad: 'UNAVAILABLE' | 'RAW_ORDINALS_PRESENT';
    decelerationOrdinalLoad: 'UNAVAILABLE' | 'RAW_ORDINALS_PRESENT';
    eventFrequency: 'UNAVAILABLE';
    exposureNormalization: 'UNAVAILABLE';
    unavailableDimensions: string[];
    rawAccelerationOrdinalValues: number[];
    rawDecelerationOrdinalValues: number[];
  };
  sourceAssessmentFingerprint: string;
};

export function computeDs4DrivingImpactV2(input: {
  assessment: Ds4TripAssessmentComputeResultV1;
  referenceDistribution?: Ds4ReferenceDistributionLookupV1;
}): Ds4DrivingImpactV2ComputeResultV1 {
  const reference = input.referenceDistribution ?? DS4_REFERENCE_DISTRIBUTION_V1_UNCALIBRATED;
  const { assessment } = input;

  const evidenceCompleteness = {
    assessmentStatus: assessment.assessmentStatus,
    assessmentVersion: assessment.assessmentVersion,
    speedAuthority: assessment.speedAuthority,
    reasonCodes: assessment.reasonCodes,
    ratedEventCount: assessment.eventSummaries.ratedEventCount,
    unratedEventCount: assessment.eventSummaries.unratedEventCount,
  };

  const hasAccelOrdinals = assessment.eventSummaries.accelerationOrdinalValues.length > 0;
  const hasDecelOrdinals = assessment.eventSummaries.decelerationOrdinalValues.length > 0;

  const operationalLoad = {
    accelerationOrdinalLoad: hasAccelOrdinals ? ('RAW_ORDINALS_PRESENT' as const) : ('UNAVAILABLE' as const),
    decelerationOrdinalLoad: hasDecelOrdinals ? ('RAW_ORDINALS_PRESENT' as const) : ('UNAVAILABLE' as const),
    eventFrequency: 'UNAVAILABLE' as const,
    exposureNormalization: 'UNAVAILABLE' as const,
    unavailableDimensions: [
      'HF_ABUSE',
      'KICKDOWN',
      'LAUNCH_LIKE',
      'FULL_BRAKING',
      'EVENT_FREQUENCY',
      'EXPOSURE_NORMALIZATION',
    ],
    rawAccelerationOrdinalValues: [...assessment.eventSummaries.accelerationOrdinalValues],
    rawDecelerationOrdinalValues: [...assessment.eventSummaries.decelerationOrdinalValues],
  };

  if (assessment.assessmentStatus === 'UNSUPPORTED' || assessment.assessmentStatus === 'PENDING') {
    return {
      modelVersion: DS4_IMPACT_V2_MODEL_VERSION,
      scoreAuthority: DS4_IMPACT_V2_SCORE_AUTHORITY,
      operationalLoadIndex: null,
      scorePublicationStatus: 'NOT_ELIGIBLE_ASSESSMENT_STATUS',
      publicationReason: assessment.assessmentStatus,
      evidenceCompleteness,
      operationalLoad,
      sourceAssessmentFingerprint: assessment.inputFingerprint,
    };
  }

  if (assessment.assessmentStatus !== 'RATED') {
    return {
      modelVersion: DS4_IMPACT_V2_MODEL_VERSION,
      scoreAuthority: DS4_IMPACT_V2_SCORE_AUTHORITY,
      operationalLoadIndex: null,
      scorePublicationStatus: 'NOT_ELIGIBLE_ASSESSMENT_STATUS',
      publicationReason: assessment.assessmentStatus,
      evidenceCompleteness,
      operationalLoad,
      sourceAssessmentFingerprint: assessment.inputFingerprint,
    };
  }

  const percentile = reference.resolveOperationalLoadIndexPercentile({
    speedAuthority: assessment.speedAuthority,
    accelerationOrdinalValues: assessment.eventSummaries.accelerationOrdinalValues,
    decelerationOrdinalValues: assessment.eventSummaries.decelerationOrdinalValues,
  });

  if (percentile == null) {
    return {
      modelVersion: DS4_IMPACT_V2_MODEL_VERSION,
      scoreAuthority: DS4_IMPACT_V2_SCORE_AUTHORITY,
      operationalLoadIndex: null,
      scorePublicationStatus: 'DISABLED_MODEL_NOT_CALIBRATED',
      publicationReason: DS4_IMPACT_V2_PUBLICATION_REASON_MODEL_NOT_CALIBRATED,
      evidenceCompleteness,
      operationalLoad,
      sourceAssessmentFingerprint: assessment.inputFingerprint,
    };
  }

  return {
    modelVersion: DS4_IMPACT_V2_MODEL_VERSION,
    scoreAuthority: DS4_IMPACT_V2_SCORE_AUTHORITY,
    operationalLoadIndex: percentile,
    scorePublicationStatus: 'DISABLED_MODEL_NOT_CALIBRATED',
    publicationReason: DS4_IMPACT_V2_PUBLICATION_REASON_MODEL_NOT_CALIBRATED,
    evidenceCompleteness,
    operationalLoad,
    sourceAssessmentFingerprint: assessment.inputFingerprint,
  };
}
