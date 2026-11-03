import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { PrismaService } from '@shared/database/prisma.service';
import {
  VSI_DISCOVERY_INVENTORY_SWEEP_INTERVAL_MS,
  VSI_PROFILE_LIFECYCLE_OUTBOX_WORKER_INTERVAL_MS,
} from './vsi-profile-lifecycle.constants';
import { VsiProfileLifecycleOutboxProcessor } from './vsi-profile-lifecycle.processor';
import { VsiProfileLifecycleEnqueueService } from './vsi-profile-lifecycle-enqueue.service';
import { isVsiDiscoveryInventoryReconcileEnabled } from './vsi-discovery-inventory-reconcile.config';
import { resolveNativeDiscoveryInventorySweepOutboxAnchor } from './vsi-native-discovery-inventory-sweep-anchor.util';

@Injectable()
export class VsiProfileLifecycleOutboxWorker {
  private readonly logger = new Logger(VsiProfileLifecycleOutboxWorker.name);
  private running = false;

  constructor(
    private readonly processor: VsiProfileLifecycleOutboxProcessor,
    private readonly leaderGuard: SchedulerLeaderGuardService,
    private readonly enqueue: VsiProfileLifecycleEnqueueService,
    private readonly prisma: PrismaService,
  ) {}

  @Interval(VSI_PROFILE_LIFECYCLE_OUTBOX_WORKER_INTERVAL_MS)
  async runScheduled(): Promise<void> {
    if (!this.leaderGuard.shouldRun('vsi_profile_lifecycle_outbox')) return;
    if (!RuntimeStatusRegistry.getWorkersEnabled()) return;
    await this.runOnce();
  }

  async runOnce(): Promise<{ processed: number; skipped: boolean }> {
    if (this.running) {
      return { processed: 0, skipped: true };
    }
    this.running = true;
    try {
      const results = await this.processor.processPendingBatch();
      const completed = results.filter((r) => r.outcome === 'completed').length;
      if (completed > 0) {
        this.logger.log(`VSI profile lifecycle outbox completed=${completed}`);
      }
      return { processed: results.length, skipped: false };
    } finally {
      this.running = false;
    }
  }

  @Interval(VSI_DISCOVERY_INVENTORY_SWEEP_INTERVAL_MS)
  async runInventorySweepSchedulerTick(): Promise<void> {
    if (!isVsiDiscoveryInventoryReconcileEnabled()) return;
    if (!this.leaderGuard.shouldRun('vsi_profile_lifecycle_outbox')) return;
    if (!RuntimeStatusRegistry.getWorkersEnabled()) return;
    const anchor = await resolveNativeDiscoveryInventorySweepOutboxAnchor(this.prisma);
    if (!anchor) return;
    const tickBucket = Math.floor(Date.now() / VSI_DISCOVERY_INVENTORY_SWEEP_INTERVAL_MS);
    await this.enqueue.enqueueNativeDiscoveryInventorySweepTick({
      organizationId: anchor.organizationId,
      vehicleId: anchor.vehicleId,
      occurredAt: new Date(),
      tickBucket,
    });
  }
}
