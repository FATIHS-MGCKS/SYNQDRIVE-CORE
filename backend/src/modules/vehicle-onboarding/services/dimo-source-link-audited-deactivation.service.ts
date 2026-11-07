import { Injectable, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  BusinessAuditAction,
  BUSINESS_AUDIT_ENTITY_TYPE,
} from '@modules/business-audit/business-audit.constants';
import type { BusinessAuditOutboxRepository } from '@modules/business-audit/business-audit-outbox.repository';
import { FSD_SOURCE_LINK_INVALIDATION_REASON_DEACTIVATED } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-source-link-lifecycle-invalidation.v1';
import { FsdSourceLinkLifecycleService } from '@modules/vehicle-intelligence/fsd-integration/fsd-source-link-lifecycle.service';
import { VsiProfileLifecycleEnqueueService } from '@modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-profile-lifecycle-enqueue.service';
import { PrismaService } from '@shared/database/prisma.service';
import { lockVehicleRowForLifecycleMutation } from '../offboarding/vehicle-lifecycle-row-lock';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

export type DimoSourceLinkAuditedDeactivationInput = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  actorUserId: string;
  /** Stored on link.deactivationReason — not vehicle offboarding. */
  deactivationReason: string;
  idempotencyKey: string;
  note?: string;
};

export function dimoSourceLinkDeactivationAuditIdempotencyKey(idempotencyKey: string): string {
  return `dimo-source-link:DEACTIVATED:audit:v1:${idempotencyKey}`;
}

/**
 * Operator audited DIMO link deactivation (not full vehicle offboarding).
 * Consent: does not revoke vehicle provider consent rows (explicit H2 boundary).
 */
@Injectable()
export class DimoSourceLinkAuditedDeactivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fsdSourceLinkLifecycle: FsdSourceLinkLifecycleService,
    private readonly businessAuditOutbox: BusinessAuditOutboxRepository,
    @Optional()
    private readonly vsiProfileLifecycleEnqueue?: VsiProfileLifecycleEnqueueService,
  ) {}

  async deactivateAudited(input: DimoSourceLinkAuditedDeactivationInput): Promise<{ deactivatedAt: Date }> {
    const deactivatedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await lockVehicleRowForLifecycleMutation(tx, {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      });

      const linkRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM vehicle_data_source_links
        WHERE id = ${input.providerSourceLinkId}
          AND vehicle_id = ${input.vehicleId}
          AND provider = 'DIMO'
          AND source_type = 'DIMO'
          AND is_active = true
        FOR UPDATE
      `;
      if (linkRows.length === 0) {
        const scoped = await tx.vehicleDataSourceLink.findFirst({
          where: {
            id: input.providerSourceLinkId,
            vehicleId: input.vehicleId,
            vehicle: { organizationId: input.organizationId },
          },
          select: { id: true, isActive: true },
        });
        if (!scoped) {
          throw new VehicleOnboardingError('CASE_NOT_FOUND', 'DIMO source link not found for scope');
        }
        if (!scoped.isActive) {
          return;
        }
        throw new VehicleOnboardingError(
          'ONBOARDING_CONCURRENCY_CONFLICT',
          'DIMO source link is not active DIMO scope',
        );
      }

      await this.fsdSourceLinkLifecycle.invalidateSingleDimoSourceLinkForLifecycle(tx, {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerSourceLinkId: input.providerSourceLinkId,
        invalidationReason: FSD_SOURCE_LINK_INVALIDATION_REASON_DEACTIVATED,
      });

      await tx.vehicleDataSourceLink.update({
        where: { id: input.providerSourceLinkId },
        data: {
          isActive: false,
          deactivatedAt,
          deactivationReason: input.deactivationReason,
        },
      });

      await this.vsiProfileLifecycleEnqueue?.enqueueSourceLinkDeactivated(
        {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          providerSourceLinkId: input.providerSourceLinkId,
          occurredAt: deactivatedAt,
          reason: input.deactivationReason,
        },
        tx,
      );

      await this.ensureAuditRecord(tx, {
        ...input,
        deactivatedAt,
      });
    });

    return { deactivatedAt };
  }

  private async ensureAuditRecord(
    tx: Prisma.TransactionClient,
    input: DimoSourceLinkAuditedDeactivationInput & { deactivatedAt: Date },
  ): Promise<void> {
    const auditKey = dimoSourceLinkDeactivationAuditIdempotencyKey(input.idempotencyKey);
    const existing = await tx.businessAuditOutbox.findUnique({
      where: { idempotencyKey: auditKey },
    });
    if (existing) {
      return;
    }
    await this.businessAuditOutbox.enqueueInTransaction(tx, {
      organizationId: input.organizationId,
      idempotencyKey: auditKey,
      action: BusinessAuditAction.DIMO_SOURCE_LINK_DEACTIVATED,
      actorUserId: input.actorUserId,
      entityType: BUSINESS_AUDIT_ENTITY_TYPE.VEHICLE,
      entityId: input.vehicleId,
      changeReason: input.deactivationReason,
      outcome: 'SUCCESS',
      description: 'DIMO vehicle data source link manually deactivated',
      before: { providerSourceLinkId: input.providerSourceLinkId, isActive: true },
      after: { providerSourceLinkId: input.providerSourceLinkId, isActive: false },
      metadata: {
        vehicleId: input.vehicleId,
        organizationId: input.organizationId,
        providerSourceLinkId: input.providerSourceLinkId,
        deactivationReason: input.deactivationReason,
        actorUserId: input.actorUserId,
        deactivatedAt: input.deactivatedAt.toISOString(),
        consentScope: 'UNCHANGED',
        ...(input.note ? { note: input.note } : {}),
      },
      occurredAt: input.deactivatedAt,
    });
  }
}
