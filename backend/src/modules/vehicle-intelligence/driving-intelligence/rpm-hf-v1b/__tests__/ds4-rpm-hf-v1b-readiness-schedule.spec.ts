import { computeDs4RpmHfV1bDeferNextAttemptAt } from '../ds4-rpm-hf-v1b-readiness-schedule';
import { DS4_RPM_HF_V1B_TUNING } from '../ds4-rpm-hf-v1b.config';

describe('ds4-rpm-hf-v1b-readiness-schedule', () => {
  const tripEndIso = '2026-01-01T10:00:00.000Z';
  const tripEndMs = Date.parse(tripEndIso);

  it('schedules short-term retries after trip end', () => {
    const soon = computeDs4RpmHfV1bDeferNextAttemptAt({
      tripEndIso,
      attemptCount: 1,
      nowMs: tripEndMs,
    });
    expect(soon!.getTime()).toBe(tripEndMs + 2 * 60_000);
  });

  it('uses later offsets for higher attempt counts within the readiness window', () => {
    const third = computeDs4RpmHfV1bDeferNextAttemptAt({
      tripEndIso,
      attemptCount: 3,
      nowMs: tripEndMs,
    });
    expect(third!.getTime()).toBe(tripEndMs + 60 * 60_000);
  });

  it('returns null when now is at or past the readiness deadline', () => {
    const next = computeDs4RpmHfV1bDeferNextAttemptAt({
      tripEndIso,
      attemptCount: 1,
      nowMs: tripEndMs + DS4_RPM_HF_V1B_TUNING.postTripReadinessWindowMs,
    });
    expect(next).toBeNull();
  });

  it('does not schedule before now when trip-end offset is already in the past', () => {
    const nowMs = tripEndMs + 3 * 60 * 60_000;
    const next = computeDs4RpmHfV1bDeferNextAttemptAt({
      tripEndIso,
      attemptCount: 1,
      nowMs,
    });
    expect(next!.getTime()).toBe(nowMs);
  });
});
