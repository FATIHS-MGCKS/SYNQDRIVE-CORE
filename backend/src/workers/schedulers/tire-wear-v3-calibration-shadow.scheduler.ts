import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import tireWearV3CalibrationShadowConfig from '@config/tire-wear-v3-calibration-shadow.config';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { TireWearV3CalibrationShadowWriterService } from '@modules/vehicle-intelligence/tires/wear-v3-calibration-shadow/tire-wear-v3-calibration-shadow-writer.service';

const LEADER_JOB = 'tire_wear_v3_calibration_shadow_writer';

@Injectable()
export class TireWearV3CalibrationShadowScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TireWearV3CalibrationShadowScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(tireWearV3CalibrationShadowConfig.KEY)
    private readonly config: ConfigType<typeof tireWearV3CalibrationShadowConfig>,
    private readonly leaderGuard: SchedulerLeaderGuardService,
    private readonly writer: TireWearV3CalibrationShadowWriterService,
  ) {}

  onModuleInit(): void {
    const intervalMs = Math.max(60_000, this.config.intervalMs);
    this.timer = setInterval(() => {
      void this.runTick();
    }, intervalMs);
    this.logger.log(
      `Tire Wear V3 calibration shadow scheduler registered (intervalMs=${intervalMs}, writeEnabled=${this.config.writeEnabled})`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runTick(): Promise<void> {
    if (!this.config.writeEnabled) return;
    if (!this.leaderGuard.shouldRun(LEADER_JOB)) return;
    await this.writer.runBoundedSnapshotTick();
  }
}
