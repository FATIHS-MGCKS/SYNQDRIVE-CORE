import { Module } from '@nestjs/common';
import { BusinessAuditOutboxRepository } from '@modules/business-audit/business-audit-outbox.repository';
import { FsdDiscoveryPersistenceRepository } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.repository';
import { FsdSourceLinkLifecycleService } from '@modules/vehicle-intelligence/fsd-integration/fsd-source-link-lifecycle.service';
import { VsiProfileLifecycleEnqueueService } from '@modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-profile-lifecycle-enqueue.service';
import { VsiProfileLifecycleOutboxRepository } from '@modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-profile-lifecycle-outbox.repository';
import { PrismaModule } from '@shared/database/prisma.module';
import { DimoSourceLinkAuditedDeactivationService } from '../services/dimo-source-link-audited-deactivation.service';
import { DimoSourceLinkOperatorAuthorizationService } from '../services/dimo-source-link-operator-authorization.service';

/**
 * Minimal Nest surface for DIMO source-link ops CLIs — no BullMQ, workers, schedules or HTTP stack.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    FsdDiscoveryPersistenceRepository,
    FsdSourceLinkLifecycleService,
    BusinessAuditOutboxRepository,
    VsiProfileLifecycleOutboxRepository,
    VsiProfileLifecycleEnqueueService,
    DimoSourceLinkOperatorAuthorizationService,
    DimoSourceLinkAuditedDeactivationService,
  ],
  exports: [
    DimoSourceLinkOperatorAuthorizationService,
    DimoSourceLinkAuditedDeactivationService,
  ],
})
export class DimoSourceLinkOpsModule {}
