import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { TireWearV3CalibrationShadowScheduler } from '../../../../workers/schedulers/tire-wear-v3-calibration-shadow.scheduler';
import { TireWearV3CalibrationShadowWriterService } from './tire-wear-v3-calibration-shadow-writer.service';

describe('TireWearV3CalibrationShadowScheduler', () => {
  it('does not run writer when flag is off', async () => {
    const writer = { runBoundedSnapshotTick: jest.fn() } as unknown as TireWearV3CalibrationShadowWriterService;
    const leaderGuard = {
      shouldRun: jest.fn().mockReturnValue(true),
    } as unknown as SchedulerLeaderGuardService;
    const scheduler = new TireWearV3CalibrationShadowScheduler(
      { writeEnabled: false, batchSize: 5, intervalMs: 60_000 },
      leaderGuard,
      writer,
    );
    await scheduler.runTick();
    expect(writer.runBoundedSnapshotTick).not.toHaveBeenCalled();
  });

  it('respects leader guard', async () => {
    const writer = { runBoundedSnapshotTick: jest.fn() } as unknown as TireWearV3CalibrationShadowWriterService;
    const leaderGuard = {
      shouldRun: jest.fn().mockReturnValue(false),
    } as unknown as SchedulerLeaderGuardService;
    const scheduler = new TireWearV3CalibrationShadowScheduler(
      { writeEnabled: true, batchSize: 5, intervalMs: 60_000 },
      leaderGuard,
      writer,
    );
    await scheduler.runTick();
    expect(writer.runBoundedSnapshotTick).not.toHaveBeenCalled();
  });
});
