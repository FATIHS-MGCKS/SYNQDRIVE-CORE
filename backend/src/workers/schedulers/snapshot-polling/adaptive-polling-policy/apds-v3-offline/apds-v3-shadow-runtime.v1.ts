import { Logger } from '@nestjs/common';

export type ApdsV3ShadowQueuedWork = () => Promise<void>;

export class ApdsV3ShadowRuntimeQueue {
  private readonly logger = new Logger(ApdsV3ShadowRuntimeQueue.name);
  private readonly pending: ApdsV3ShadowQueuedWork[] = [];
  private active = 0;
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueueDepth: number,
    private readonly evaluationTimeoutMs: number,
  ) {}

  enqueue(work: ApdsV3ShadowQueuedWork): boolean {
    if (this.active >= this.maxConcurrent && this.pending.length >= this.maxQueueDepth) {
      return false;
    }
    this.pending.push(work);
    this.pump();
    return true;
  }

  async drainForShutdown(): Promise<void> {
    await Promise.allSettled([...this.inFlight]);
  }

  getStats(): { active: number; pending: number } {
    return { active: this.active, pending: this.pending.length };
  }

  private pump(): void {
    while (this.active < this.maxConcurrent && this.pending.length > 0) {
      const next = this.pending.shift();
      if (!next) return;
      this.active += 1;
      const run = this.runBounded(next);
      this.inFlight.add(run);
      void run.finally(() => {
        this.inFlight.delete(run);
        this.active -= 1;
        this.pump();
      });
    }
  }

  private async runBounded(work: ApdsV3ShadowQueuedWork): Promise<void> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        work(),
        new Promise<void>((_, reject) => {
          timeout = setTimeout(() => {
            reject(new Error('APDS_V3_SHADOW_EVALUATION_TIMEOUT'));
          }, this.evaluationTimeoutMs);
        }),
      ]);
    } catch (err) {
      this.logger.warn(
        `APDS V3 shadow queued evaluation failed (non-blocking): ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
