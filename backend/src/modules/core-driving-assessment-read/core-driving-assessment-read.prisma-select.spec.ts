import {
  CORE_DS4_ASSESSMENT_READ_V1_SELECT,
  CORE_DS4_IMPACT_PUBLICATION_READ_V1_SELECT,
} from './core-driving-assessment-read.v1.service';

const EXPECTED_ASSESSMENT_SELECT_KEYS = [
  'id',
  'assessmentVersion',
  'assessmentStatus',
  'computedAt',
] as const;

const EXPECTED_IMPACT_SELECT_KEYS = ['scorePublicationStatus'] as const;

const FORBIDDEN_ASSESSMENT_SELECT_KEYS = [
  'evidenceQuality',
  'inputFingerprint',
  'eventSummariesJson',
  'reasonCodes',
  'completenessJson',
  'processingErrorJson',
  'pinnedSnapshotHash',
  'combinedInputIdentity',
  'sourceMotionRunId',
] as const;

const FORBIDDEN_IMPACT_SELECT_KEYS = [
  'operationalLoadIndex',
  'publicationReason',
  'evidenceCompletenessJson',
  'operationalLoadJson',
  'sourceAssessmentFingerprint',
  'modelVersion',
  'scoreAuthority',
] as const;

describe('Core driving assessment read — Prisma select allowlists (F2)', () => {
  it('assessment select matches literal allowlist exactly', () => {
    expect(Object.keys(CORE_DS4_ASSESSMENT_READ_V1_SELECT).sort()).toEqual(
      [...EXPECTED_ASSESSMENT_SELECT_KEYS].sort(),
    );
    for (const key of FORBIDDEN_ASSESSMENT_SELECT_KEYS) {
      expect(CORE_DS4_ASSESSMENT_READ_V1_SELECT).not.toHaveProperty(key);
    }
  });

  it('impact select matches literal allowlist exactly', () => {
    expect(Object.keys(CORE_DS4_IMPACT_PUBLICATION_READ_V1_SELECT).sort()).toEqual(
      [...EXPECTED_IMPACT_SELECT_KEYS].sort(),
    );
    for (const key of FORBIDDEN_IMPACT_SELECT_KEYS) {
      expect(CORE_DS4_IMPACT_PUBLICATION_READ_V1_SELECT).not.toHaveProperty(key);
    }
  });
});
