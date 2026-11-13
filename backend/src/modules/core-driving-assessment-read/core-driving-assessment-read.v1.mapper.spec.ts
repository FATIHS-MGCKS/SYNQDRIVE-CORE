import { ProductSlug } from '@prisma/client';
import { toCoreDrivingAssessmentReadV1 } from './core-driving-assessment-read.v1.mapper';
import { CORE_DRIVING_ASSESSMENT_READ_CONTRACT_VERSION } from './core-driving-assessment-read.v1.types';

describe('toCoreDrivingAssessmentReadV1', () => {
  const scope = {
    organizationId: 'org-a',
    vehicleId: 'veh-a',
    tripId: 'trip-1',
    productSlug: ProductSlug.RENTAL,
  };

  it('maps NOT_AVAILABLE without inventing fields', () => {
    const dto = toCoreDrivingAssessmentReadV1({ ...scope, assessment: null, impact: null });
    expect(dto).toEqual({
      version: CORE_DRIVING_ASSESSMENT_READ_CONTRACT_VERSION,
      ...scope,
      assessmentAvailability: 'NOT_AVAILABLE',
      assessmentVersion: null,
      assessmentStatus: null,
      evidenceQuality: null,
      assessmentComputedAt: null,
      scorePublicationStatus: null,
    });
  });

  it('maps AVAILABLE without numeric score fields', () => {
    const dto = toCoreDrivingAssessmentReadV1({
      ...scope,
      assessment: {
        assessmentVersion: 'DS4_TRIP_ASSESSMENT_V1',
        assessmentStatus: 'UNRATED_COUNTS_ONLY',
        evidenceQuality: 'PRESENT',
        computedAt: new Date('2026-06-01T12:00:00.000Z'),
      },
      impact: {
        scorePublicationStatus: 'DISABLED_MODEL_NOT_CALIBRATED',
      },
    });
    expect(dto.assessmentAvailability).toBe('AVAILABLE');
    expect(dto.assessmentStatus).toBe('UNRATED_COUNTS_ONLY');
    expect(dto.scorePublicationStatus).toBe('DISABLED_MODEL_NOT_CALIBRATED');
    expect(dto).not.toHaveProperty('operationalLoadIndex');
    expect(Object.keys(dto).sort()).toEqual(
      [
        'version',
        'organizationId',
        'vehicleId',
        'tripId',
        'productSlug',
        'assessmentAvailability',
        'assessmentVersion',
        'assessmentStatus',
        'evidenceQuality',
        'assessmentComputedAt',
        'scorePublicationStatus',
      ].sort(),
    );
  });

  it('nulls unknown assessmentStatus and publication status', () => {
    const dto = toCoreDrivingAssessmentReadV1({
      ...scope,
      assessment: {
        assessmentVersion: 'DS4_TRIP_ASSESSMENT_V1',
        assessmentStatus: 'UNKNOWN_FUTURE',
        evidenceQuality: null,
        computedAt: new Date('2026-06-01T12:00:00.000Z'),
      },
      impact: { scorePublicationStatus: 'SHADOW_PRODUCTION' },
    });
    expect(dto.assessmentStatus).toBeNull();
    expect(dto.scorePublicationStatus).toBeNull();
  });
});
