import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { Ds4RpmHfV1bShadowService } from './ds4-rpm-hf-v1b-shadow.service';

const LEADER_JOB = 'ds4_rpm_hf_v1b_shadow_v1';

@Injectable()
export class Ds4RpmHfV1bShadowScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(Ds4RpmHfV1bShadowScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly leaderGuard: SchedulerLeaderGuardService,
    private readonly service: Ds4RpmHfV1bShadowService,
  ) {}

  onModuleInit(): void {
    if (!this.service.isConfigured()) {
      this.logger.log('RPM HF V1B shadow scheduler dormant (feature disabled)');
      return;
    }
    const intervalMs = this.service.getRuntimeConfig().schedulerIntervalMs;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.logger.log(`RPM HF V1B shadow scheduler registered (intervalMs=${intervalMs}, dormant until flags+allowlists)`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    if (this.running || !this.service.isConfigured()) return;
    if (!this.leaderGuard.shouldRun(LEADER_JOB)) return;
    this.running = true;
    try {
      const pass = await this.service.runPass();
      if (pass.claimed > 0) {
        this.logger.log(
          `rpm hf v1b pass discovered=${pass.discovered} claimed=${pass.claimed} ok=${pass.succeeded} defer=${pass.deferred} terminal=${pass.terminal} retry=${pass.failedRetryable}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `rpm hf v1b tick failed: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown'}`,
      );
    } finally {
      this.running = false;
    }
  }
}
