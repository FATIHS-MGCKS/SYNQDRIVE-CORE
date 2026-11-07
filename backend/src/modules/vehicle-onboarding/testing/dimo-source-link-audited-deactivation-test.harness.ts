import type { PrismaClient } from '@prisma/client';
import { BusinessAuditOutboxRepository } from '@modules/business-audit/business-audit-outbox.repository';
import { FsdDiscoveryPersistenceRepository } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.repository';
import { FsdSourceLinkLifecycleService } from '@modules/vehicle-intelligence/fsd-integration/fsd-source-link-lifecycle.service';
import { VsiProfileLifecycleEnqueueService } from '@modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-profile-lifecycle-enqueue.service';
import { VsiProfileLifecycleOutboxRepository } from '@modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-profile-lifecycle-outbox.repository';
import { DimoSourceLinkAuditedDeactivationService } from '../services/dimo-source-link-audited-deactivation.service';

export function createDimoSourceLinkAuditedDeactivationForTests(
  prisma: PrismaClient,
): DimoSourceLinkAuditedDeactivationService {
  const fsdPersistence = new FsdDiscoveryPersistenceRepository(prisma as never);
  const fsdLifecycle = new FsdSourceLinkLifecycleService(fsdPersistence);
  const vsiEnqueue = new VsiProfileLifecycleEnqueueService(
    new VsiProfileLifecycleOutboxRepository(prisma as never),
  );
  return new DimoSourceLinkAuditedDeactivationService(
    prisma as never,
    fsdLifecycle,
    new BusinessAuditOutboxRepository(prisma as never),
    vsiEnqueue,
  );
}
