import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { VSI_PROFILE_LIFECYCLE_OUTBOX_PAYLOAD_VERSION } from './vsi-profile-lifecycle.constants';
import { VsiProfileLifecycleOutboxRepository } from './vsi-profile-lifecycle-outbox.repository';
import type {
  VsiProfileLifecycleEnqueueInput,
  VsiProfileLifecycleOutboxPayloadV1,
} from './vsi-profile-lifecycle.types';

type DbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class VsiProfileLifecycleEnqueueService {
  private readonly logger = new Logger(VsiProfileLifecycleEnqueueService.name);

  constructor(private readonly repository: VsiProfileLifecycleOutboxRepository) {}

  async enqueue(
    input: VsiProfileLifecycleEnqueueInput,
    client?: DbClient,
  ): Promise<void> {
    const payload: VsiProfileLifecycleOutboxPayloadV1 = {
      version: VSI_PROFILE_LIFECYCLE_OUTBOX_PAYLOAD_VERSION,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: input.providerSourceLinkId ?? null,
      reason: input.payload?.reason ?? null,
      catalogCheckedAt: input.payload?.catalogCheckedAt ?? null,
      supersededByLinkId: input.payload?.supersededByLinkId ?? null,
      backfillCursor: input.payload?.backfillCursor ?? null,
      inventorySweepCursor: input.payload?.inventorySweepCursor ?? null,
    };

    const result = await this.repository.enqueue(
      {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerSourceLinkId: input.providerSourceLinkId ?? null,
        eventType: input.eventType,
        idempotencyKey: input.idempotencyKey,
        occurredAt: input.occurredAt,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
      client ?? undefined,
    );

    if (result.created) {
      this.logger.debug(
        `VSI lifecycle outbox enqueued type=${input.eventType} vehicle=${input.vehicleId} link=${input.providerSourceLinkId ?? 'n/a'}`,
      );
    }
  }

  buildSourceLinkActivatedKey(linkId: string, occurredAt: Date): string {
    return `vsi-p2:SOURCE_LINK_ACTIVATED:${linkId}:${occurredAt.toISOString()}`;
  }

  buildSourceLinkDeactivatedKey(linkId: string, occurredAt: Date): string {
    return `vsi-p2:SOURCE_LINK_DEACTIVATED:${linkId}:${occurredAt.toISOString()}`;
  }

  buildCatalogAdvancedKey(vehicleId: string, catalogCheckedAt: string): string {
    return `vsi-p2:DECLARED_CATALOG_ADVANCED:${vehicleId}:${catalogCheckedAt}`;
  }

  async enqueueSourceLinkActivated(
    input: {
      organizationId: string;
      vehicleId: string;
      providerSourceLinkId: string;
      occurredAt: Date;
      reason?: string;
    },
    client?: DbClient,
  ): Promise<void> {
    await this.enqueue(
      {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerSourceLinkId: input.providerSourceLinkId,
        eventType: 'SOURCE_LINK_ACTIVATED',
        occurredAt: input.occurredAt,
        idempotencyKey: this.buildSourceLinkActivatedKey(
          input.providerSourceLinkId,
          input.occurredAt,
        ),
        payload: { reason: input.reason ?? 'source_link_activated' },
      },
      client,
    );
  }

  async enqueueSourceLinkDeactivated(
    input: {
      organizationId: string;
      vehicleId: string;
      providerSourceLinkId: string;
      occurredAt: Date;
      reason?: string;
      supersededByLinkId?: string | null;
    },
    client?: DbClient,
  ): Promise<void> {
    const eventType = input.supersededByLinkId ? 'SOURCE_LINK_SUPERSEDED' : 'SOURCE_LINK_DEACTIVATED';
    await this.enqueue(
      {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerSourceLinkId: input.providerSourceLinkId,
        eventType,
        occurredAt: input.occurredAt,
        idempotencyKey: this.buildSourceLinkDeactivatedKey(
          input.providerSourceLinkId,
          input.occurredAt,
        ),
        payload: {
          reason: input.reason ?? eventType,
          supersededByLinkId: input.supersededByLinkId ?? null,
        },
      },
      client,
    );
  }

  async enqueueBackfillContinuation(input: {
    organizationId: string;
    vehicleId: string;
    cursor: string;
    occurredAt: Date;
  }): Promise<void> {
    await this.enqueue({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: null,
      eventType: 'ACTIVE_VEHICLE_BACKFILL_RECONCILE',
      occurredAt: input.occurredAt,
      idempotencyKey: `vsi-p2:BACKFILL:${input.organizationId}:${input.cursor}`,
      payload: {
        organizationId: input.organizationId,
        backfillCursor: input.cursor,
      },
    });
  }

  async enqueueNativeDiscoveryInventorySweepTick(input: {
    organizationId: string;
    vehicleId: string;
    occurredAt: Date;
    tickBucket: number;
  }): Promise<void> {
    await this.enqueue({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: null,
      eventType: 'NATIVE_DISCOVERY_INVENTORY_SWEEP',
      occurredAt: input.occurredAt,
      idempotencyKey: `vsi-p3a:INVENTORY_SWEEP_TICK:${input.tickBucket}`,
      payload: { reason: 'scheduled_inventory_sweep' },
    });
  }

  async enqueueNativeDiscoveryInventorySweepContinuation(input: {
    organizationId: string;
    vehicleId: string;
    cursor: { organizationId: string; providerSourceLinkId: string };
    occurredAt: Date;
  }): Promise<void> {
    await this.enqueue({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: null,
      eventType: 'NATIVE_DISCOVERY_INVENTORY_SWEEP',
      occurredAt: input.occurredAt,
      idempotencyKey: `vsi-p3a:INVENTORY_SWEEP:${input.cursor.organizationId}:${input.cursor.providerSourceLinkId}`,
      payload: {
        inventorySweepCursor: input.cursor,
      },
    });
  }

  async enqueueNativeDiscoveryInventoryReconcile(input: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
    profileUpdatedAt: Date;
    occurredAt: Date;
  }): Promise<void> {
    await this.enqueue({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: input.providerSourceLinkId,
      eventType: 'NATIVE_DISCOVERY_INVENTORY_RECONCILE',
      occurredAt: input.occurredAt,
      idempotencyKey: `vsi-p3a:INVENTORY_RECONCILE:${input.providerSourceLinkId}:${input.profileUpdatedAt.toISOString()}`,
      payload: { reason: 'inventory_reconcile' },
    });
  }

  async enqueueDeclaredCatalogAdvanced(
    input: {
      organizationId: string;
      vehicleId: string;
      providerSourceLinkId: string | null;
      occurredAt: Date;
      catalogCheckedAt: Date;
    },
    client?: DbClient,
  ): Promise<void> {
    const checkedIso = input.catalogCheckedAt.toISOString();
    await this.enqueue(
      {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerSourceLinkId: input.providerSourceLinkId,
        eventType: 'DECLARED_CATALOG_ADVANCED',
        occurredAt: input.occurredAt,
        idempotencyKey: this.buildCatalogAdvancedKey(input.vehicleId, checkedIso),
        payload: { catalogCheckedAt: checkedIso },
      },
      client,
    );
  }
}
