import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { FsdDiscoveryPersistenceRepository } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.repository';
import {
  FSD_SOURCE_LINK_INVALIDATION_REASON_DEACTIVATED,
  FSD_SOURCE_LINK_INVALIDATION_REASON_SUPERSEDED,
  type FsdSourceLinkLifecycleInvalidationReasonV1,
  type InvalidateExecutableFsdRunsForDimoSourceLinkResultV1,
} from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-source-link-lifecycle-invalidation.v1';

const DIMO_LINK_WHERE = {
  provider: 'DIMO' as const,
  sourceType: 'DIMO' as const,
};

export type InvalidateVehicleDimoSourceLinksLifecycleInputV1 = {
  organizationId: string;
  vehicleId: string;
  invalidationReason: FsdSourceLinkLifecycleInvalidationReasonV1;
  /**
   * When true, include links that are already inactive (e.g. supersession finalize).
   * Default false — only currently active DIMO links (offboarding path).
   */
  includeInactiveLinks?: boolean;
};

export type InvalidateVehicleDimoSourceLinksLifecycleResultV1 = {
  linkIdsProcessed: string[];
  perLink: Array<InvalidateExecutableFsdRunsForDimoSourceLinkResultV1 & { providerSourceLinkId: string }>;
};

/**
 * Reusable P5B lifecycle integration for offboarding and future supersession writers.
 */
@Injectable()
export class FsdSourceLinkLifecycleService {
  constructor(private readonly persistence: FsdDiscoveryPersistenceRepository) {}

  async invalidateDimoSourceLinksForVehicleLifecycle(
    tx: Prisma.TransactionClient,
    input: InvalidateVehicleDimoSourceLinksLifecycleInputV1,
  ): Promise<InvalidateVehicleDimoSourceLinksLifecycleResultV1> {
    const links = await tx.vehicleDataSourceLink.findMany({
      where: {
        vehicleId: input.vehicleId,
        ...DIMO_LINK_WHERE,
        vehicle: { organizationId: input.organizationId },
        ...(input.includeInactiveLinks ? {} : { isActive: true }),
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    const perLink: InvalidateVehicleDimoSourceLinksLifecycleResultV1['perLink'] = [];
    for (const link of links) {
      await tx.$queryRaw`
        SELECT id FROM vehicle_data_source_links WHERE id = ${link.id} AND vehicle_id = ${input.vehicleId}
        FOR UPDATE
      `;
      const invalidated = await this.persistence.invalidateExecutableRunsForDimoSourceLinkInTransaction(
        tx,
        {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          providerSourceLinkId: link.id,
          invalidationReason: input.invalidationReason,
        },
      );
      perLink.push({ providerSourceLinkId: link.id, ...invalidated });
    }

    return {
      linkIdsProcessed: links.map((l) => l.id),
      perLink,
    };
  }

  async invalidateSingleDimoSourceLinkForLifecycle(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      vehicleId: string;
      providerSourceLinkId: string;
      invalidationReason: FsdSourceLinkLifecycleInvalidationReasonV1;
    },
  ): Promise<InvalidateExecutableFsdRunsForDimoSourceLinkResultV1> {
    return this.persistence.invalidateExecutableRunsForDimoSourceLinkInTransaction(tx, input);
  }
}

export const FSD_LIFECYCLE_REASON_OFFBOARD = FSD_SOURCE_LINK_INVALIDATION_REASON_DEACTIVATED;
export const FSD_LIFECYCLE_REASON_SUPERSEDE = FSD_SOURCE_LINK_INVALIDATION_REASON_SUPERSEDED;
