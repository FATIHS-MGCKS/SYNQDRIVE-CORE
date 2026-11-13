import type { ProductSlug } from '@prisma/client';
import type {
  Ds4ImpactV2ScorePublicationStatusV1,
  Ds4TripAssessmentStatusV1,
} from '@modules/vehicle-intelligence/driving-intelligence/ds4-assessment/ds4-trip-assessment-v1.contract';

/**
 * Contract `core.driving.assessment.read.v1` — read-only DS4 Assessment L2 metadata for a visible trip.
 *
 * Does not classify private vs business journeys (same trip visibility as `core.trip.read.v1`).
 * Does not expose numeric Impact V2 scores, DBI outputs, fingerprints, event summaries,
 * motion sparse channel outcomes, processing errors, or rental fields.
 * Authorization: user JWT + ACTIVE org membership + `fleet.read` + ACTIVE product license.
 * Not authorized for M2M or production customer scoring activation.
 */
export const CORE_DRIVING_ASSESSMENT_READ_CONTRACT_VERSION = 'core.driving.assessment.read.v1' as const;

export type CoreDrivingAssessmentAvailabilityV1 = 'AVAILABLE' | 'NOT_AVAILABLE';

export type CoreDrivingAssessmentReadV1 = {
  version: typeof CORE_DRIVING_ASSESSMENT_READ_CONTRACT_VERSION;
  organizationId: string;
  vehicleId: string;
  tripId: string;
  productSlug: ProductSlug;
  assessmentAvailability: CoreDrivingAssessmentAvailabilityV1;
  /** DS4 assessment contract version when availability is AVAILABLE. */
  assessmentVersion: string | null;
  /** DS4 L2 assessment status (computed/evaluated), not Impact V2 publication. */
  assessmentStatus: Ds4TripAssessmentStatusV1 | null;
  assessmentComputedAt: string | null;
  /** Impact V2 publication gate only — never a numeric score in this contract. */
  scorePublicationStatus: Ds4ImpactV2ScorePublicationStatusV1 | null;
};
