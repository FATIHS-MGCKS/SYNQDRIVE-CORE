import {
  computeRetentionCutoff,
  validateTripEndValidationObservabilityRetentionConfig,
} from './trip-end-validation-observability-retention.service';
import { TDL_OBS_TEST_RETENTION_CONFIG } from './trip-end-validation-observability-test.helpers';
import { TDL_EV_OBS_RETENTION_SKIP_REASON } from './trip-end-validation-observability-retention.types';
import { TripEndValidationObservabilityRetentionService } from './trip-end-validation-observability-retention.service';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';

describe('trip-end-validation observability retention (unit)', () => {
  it('computeRetentionCutoff uses exact 90-day window', () => {
    const now = new Date('2026-11-02T12:00:00.000Z');
    const cutoff = computeRetentionCutoff(90, now);
    expect(cutoff.toISOString()).toBe('2026-08-04T12:00:00.000Z');
  });

  it('validateTripEndValidationObservabilityRetentionConfig rejects invalid batch and days', () => {
    expect(
      validateTripEndValidationObservabilityRetentionConfig({
        ...TDL_OBS_TEST_RETENTION_CONFIG,
        enabled: false,
      }),
    ).toContain('TRIP_END_VALIDATION_OBSERVATION_RETENTION_ENABLED!=true');

    expect(
      validateTripEndValidationObservabilityRetentionConfig({
        ...TDL_OBS_TEST_RETENTION_CONFIG,
        retentionDays: 89,
      }),
    ).toEqual(
      expect.arrayContaining([expect.stringContaining('retention days out of range')]),
    );

    expect(
      validateTripEndValidationObservabilityRetentionConfig({
        ...TDL_OBS_TEST_RETENTION_CONFIG,
        batchSize: 0,
      }),
    ).toEqual(expect.arrayContaining([expect.stringContaining('batch size out of range')]));
  });

  it('runOnce skips when retention disabled (fail-closed config gate)', async () => {
    const leaderGuard = {
      shouldRun: jest.fn(() => true),
    } as unknown as SchedulerLeaderGuardService;
    const svc = new TripEndValidationObservabilityRetentionService(
      { $queryRaw: jest.fn() } as never,
      { ...TDL_OBS_TEST_RETENTION_CONFIG, enabled: false },
      leaderGuard,
    );
    const report = await svc.runOnce({ trigger: 'manual' });
    expect(report.skipped).toBe(true);
    expect(report.skipReason).toBe(TDL_EV_OBS_RETENTION_SKIP_REASON.INVALID_CONFIG);
  });

  it('runOnce skips when leader guard rejects replica', async () => {
    const leaderGuard = {
      shouldRun: jest.fn(() => false),
    } as unknown as SchedulerLeaderGuardService;
    const svc = new TripEndValidationObservabilityRetentionService(
      { $queryRaw: jest.fn() } as never,
      TDL_OBS_TEST_RETENTION_CONFIG,
      leaderGuard,
    );
    const report = await svc.runOnce({ trigger: 'manual' });
    expect(report.skipped).toBe(true);
    expect(report.skipReason).toBe(TDL_EV_OBS_RETENTION_SKIP_REASON.LEADER_SKIP);
  });
});
