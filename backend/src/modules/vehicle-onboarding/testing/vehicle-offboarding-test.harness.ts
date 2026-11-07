import type { PrismaClient } from '@prisma/client';
import { BusinessAuditOutboxRepository } from '@modules/business-audit/business-audit-outbox.repository';
import { FsdDiscoveryPersistenceRepository } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.repository';
import { FsdSourceLinkLifecycleService } from '@modules/vehicle-intelligence/fsd-integration/fsd-source-link-lifecycle.service';
import { VehicleOffboardingService } from '../services/vehicle-offboarding.service';

export function createVehicleOffboardingServiceForTests(
  prisma: PrismaClient,
): VehicleOffboardingService {
  const fsdPersistence = new FsdDiscoveryPersistenceRepository(prisma as never);
  const fsdLifecycle = new FsdSourceLinkLifecycleService(fsdPersistence);
  return new VehicleOffboardingService(
    prisma as never,
    new BusinessAuditOutboxRepository(prisma as never),
    fsdLifecycle,
  );
}
