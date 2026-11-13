import type { ProductSlug } from '@prisma/client';
import type {
  Ds4ImpactV2ScorePublicationStatusV1,
  Ds4TripAssessmentStatusV1,
} from '@modules/vehicle-intelligence/driving-intelligence/ds4-assessment/ds4-trip-assessment-v1.contract';
import type { CoreDrivingAssessmentReadV1 } from './core-driving-assessment-read.v1.types';
import { CORE_DRIVING_ASSESSMENT_READ_CONTRACT_VERSION } from './core-driving-assessment-read.v1.types';

const ASSESSMENT_STATUS_ALLOWLIST: ReadonlySet<string> = new Set([
  'RATED',
  'UNRATED_COUNTS_ONLY',
  'INSUFFICIENT_EVIDENCE',
  'UNSUPPORTED',
  'PENDING',
  'FAILED',
]);

const SCORE_PUBLICATION_STATUS_ALLOWLIST: ReadonlySet<string> = new Set([
  'DISABLED_MODEL_NOT_CALIBRATED',
  'NOT_ELIGIBLE_ASSESSMENT_STATUS',
]);

export type CoreDs4AssessmentReadRowV1 = {
  assessmentVersion: string;
  assessmentStatus: string;
  computedAt: Date;
};

export type CoreDs4ImpactReadRowV1 = {
  scorePublicationStatus: string;
};

export function toCoreDrivingAssessmentReadV1(input: {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  productSlug: ProductSlug;
  assessment: CoreDs4AssessmentReadRowV1 | null;
  impact: CoreDs4ImpactReadRowV1 | null;
}): CoreDrivingAssessmentReadV1 {
  if (!input.assessment) {
    return {
      version: CORE_DRIVING_ASSESSMENT_READ_CONTRACT_VERSION,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      productSlug: input.productSlug,
      assessmentAvailability: 'NOT_AVAILABLE',
      assessmentVersion: null,
      assessmentStatus: null,
      assessmentComputedAt: null,
      scorePublicationStatus: null,
    };
  }

  const assessmentStatus = ASSESSMENT_STATUS_ALLOWLIST.has(input.assessment.assessmentStatus)
    ? (input.assessment.assessmentStatus as Ds4TripAssessmentStatusV1)
    : null;

  const scorePublicationStatus =
    input.impact && SCORE_PUBLICATION_STATUS_ALLOWLIST.has(input.impact.scorePublicationStatus)
      ? (input.impact.scorePublicationStatus as Ds4ImpactV2ScorePublicationStatusV1)
      : null;

  return {
    version: CORE_DRIVING_ASSESSMENT_READ_CONTRACT_VERSION,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    productSlug: input.productSlug,
    assessmentAvailability: 'AVAILABLE',
    assessmentVersion: input.assessment.assessmentVersion,
    assessmentStatus,
    assessmentComputedAt: input.assessment.computedAt.toISOString(),
    scorePublicationStatus,
  };
}
