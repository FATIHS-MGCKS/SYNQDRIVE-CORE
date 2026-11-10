import { forwardRef, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { QUEUE_NAMES } from '../queues/queue-names';
import { SnapshotWakeCoordinatorService } from './snapshot-wake-coordinator.service';
import { SnapshotWakeIntakeService } from './snapshot-wake-intake.service';
import { AdaptivePollingShadowModule } from '../schedulers/snapshot-polling/adaptive-polling-shadow/adaptive-polling-shadow.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.DIMO_SNAPSHOT },
      { name: QUEUE_NAMES.SNAPSHOT_WAKE_HANDOFF },
    ),
    forwardRef(() => AdaptivePollingShadowModule),
  ],
  providers: [SnapshotWakeCoordinatorService, SnapshotWakeIntakeService],
  exports: [SnapshotWakeCoordinatorService, SnapshotWakeIntakeService],
})
export class SnapshotWakeModule {}
