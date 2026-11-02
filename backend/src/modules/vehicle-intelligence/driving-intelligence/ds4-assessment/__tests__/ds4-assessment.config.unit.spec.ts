import {
  DI_V0_DS4_ASSESSMENT_ENV,
  DI_V0_DS4_ASSESSMENT_PROPOSED_COLLECTION_CUTOFF_UTC,
  isDiV0Ds4AssessmentWorkerRunnable,
  parseDiV0Ds4AssessmentMinMotionRunCreatedAt,
  parseDiV0Ds4AssessmentRuntimeConfig,
} from '../ds4-assessment.config';

describe('ds4-assessment.config', () => {
  it('parses explicit UTC cutoff without defaulting to now', () => {
    const parsed = parseDiV0Ds4AssessmentMinMotionRunCreatedAt(DI_V0_DS4_ASSESSMENT_PROPOSED_COLLECTION_CUTOFF_UTC);
    expect(parsed?.toISOString()).toBe('2026-10-28T17:42:00.000Z');
  });

  it('fail-closes worker when cutoff unset or invalid', () => {
    expect(
      isDiV0Ds4AssessmentWorkerRunnable(
        parseDiV0Ds4AssessmentRuntimeConfig({
          [DI_V0_DS4_ASSESSMENT_ENV.enabled]: '1',
          [DI_V0_DS4_ASSESSMENT_ENV.worker]: '1',
        }),
      ),
    ).toBe(false);
    expect(
      isDiV0Ds4AssessmentWorkerRunnable(
        parseDiV0Ds4AssessmentRuntimeConfig({
          [DI_V0_DS4_ASSESSMENT_ENV.enabled]: '1',
          [DI_V0_DS4_ASSESSMENT_ENV.worker]: '1',
          [DI_V0_DS4_ASSESSMENT_ENV.minMotionRunCreatedAt]: 'not-a-date',
        }),
      ),
    ).toBe(false);
  });

  it('requires valid cutoff for runnable worker config', () => {
    const config = parseDiV0Ds4AssessmentRuntimeConfig({
      [DI_V0_DS4_ASSESSMENT_ENV.enabled]: '1',
      [DI_V0_DS4_ASSESSMENT_ENV.worker]: '1',
      [DI_V0_DS4_ASSESSMENT_ENV.minMotionRunCreatedAt]: '2026-10-28T17:42:00Z',
    });
    expect(isDiV0Ds4AssessmentWorkerRunnable(config)).toBe(true);
    expect(config.minMotionRunCreatedAt?.toISOString()).toBe('2026-10-28T17:42:00.000Z');
  });
});
