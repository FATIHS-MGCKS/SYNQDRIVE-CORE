import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  BusinessAuditAction,
  BUSINESS_AUDIT_ENTITY_TYPE,
} from '@modules/business-audit/business-audit.constants';
import type { BusinessAuditOutboxRepository } from '@modules/business-audit/business-audit-outbox.repository';
import { FSD_SOURCE_LINK_INVALIDATION_REASON_DEACTIVATED } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-source-link-lifecycle-invalidation.v1';
import { lockDimoSourceLinkRowForLifecycleMutation } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-dimo-source-link-row-lock.v1';
import { FsdSourceLinkLifecycleService } from '@modules/vehicle-intelligence/fsd-integration/fsd-source-link-lifecycle.service';
import { VsiProfileLifecycleEnqueueService } from '@modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-profile-lifecycle-enqueue.service';
import { PrismaService } from '@shared/database/prisma.service';
import { lockVehicleRowForLifecycleMutation } from '../offboarding/vehicle-lifecycle-row-lock';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import {
  assertDimoSourceLinkDeactivationAuditSemanticMatch,
  buildExpectedDimoSourceLinkDeactivationSemantics,
  resolveDimoSourceLinkDeactivationAuditIdempotencyKey,
} from './dimo-source-link-deactivation-audit.semantics';

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

export type DimoSourceLinkAuditedDeactivationResult = {
  deactivatedAt: Date;
  idempotentReplay: boolean;
};

export const dimoSourceLinkDeactivationAuditIdempotencyKey =
  resolveDimoSourceLinkDeactivationAuditIdempotencyKey;

/**
 * Operator audited DIMO link deactivation (not full vehicle offboarding).
 * Consent: does not revoke vehicle provider consent rows (explicit H2 boundary).
 * VSI SOURCE_LINK_DEACTIVATED delivery is mandatory (fail-closed if unavailable).
 */
@Injectable()
export class DimoSourceLinkAuditedDeactivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fsdSourceLinkLifecycle: FsdSourceLinkLifecycleService,
    private readonly businessAuditOutbox: BusinessAuditOutboxRepository,
    private readonly vsiProfileLifecycleEnqueue: VsiProfileLifecycleEnqueueService,
  ) {}

  async deactivateAudited(
    input: DimoSourceLinkAuditedDeactivationInput,
  ): Promise<DimoSourceLinkAuditedDeactivationResult> {
    const expectedSemantics = buildExpectedDimoSourceLinkDeactivationSemantics(input);
    const auditKey = dimoSourceLinkDeactivationAuditIdempotencyKey(input.idempotencyKey);

    const replay = await this.tryReplayFromAudit(auditKey, expectedSemantics);
    if (replay) {
      return replay;
    }

    const deactivatedAt = new Date();
    let replayOnlyInTransaction = false;
    await this.prisma.$transaction(async (tx) => {
      const existingAudit = await tx.businessAuditOutbox.findUnique({
        where: { idempotencyKey: auditKey },
      });
      if (existingAudit) {
        assertDimoSourceLinkDeactivationAuditSemanticMatch(existingAudit, expectedSemantics);
        replayOnlyInTransaction = true;
        return;
      }

      await lockVehicleRowForLifecycleMutation(tx, {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      });

      await lockDimoSourceLinkRowForLifecycleMutation(tx, {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerSourceLinkId: input.providerSourceLinkId,
      });

      const link = await tx.vehicleDataSourceLink.findFirst({
        where: {
          id: input.providerSourceLinkId,
          vehicleId: input.vehicleId,
          provider: 'DIMO',
          sourceType: 'DIMO',
          vehicle: { organizationId: input.organizationId },
        },
        select: { id: true, isActive: true },
      });
      if (!link) {
        throw new VehicleOnboardingError('CASE_NOT_FOUND', 'DIMO source link not found for scope');
      }
      if (!link.isActive) {
        throw new VehicleOnboardingError(
          'VEHICLE_REGISTRY_INVALID_TRANSITION',
          'Link already inactive; idempotent replay requires a matching audit record',
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

      await this.vsiProfileLifecycleEnqueue.enqueueSourceLinkDeactivated(
        {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          providerSourceLinkId: input.providerSourceLinkId,
          occurredAt: deactivatedAt,
          reason: input.deactivationReason,
        },
        tx,
      );

      await this.insertAuditRecord(tx, {
        ...input,
        deactivatedAt,
        auditKey,
      });
    });

    if (replayOnlyInTransaction) {
      const replay = await this.tryReplayFromAudit(auditKey, expectedSemantics);
      if (!replay) {
        throw new VehicleOnboardingError(
          'ONBOARDING_CONCURRENCY_CONFLICT',
          'Expected idempotent replay audit after transactional short-circuit',
        );
      }
      return replay;
    }

    return { deactivatedAt, idempotentReplay: false };
  }

  private async tryReplayFromAudit(
    auditKey: string,
    expected: ReturnType<typeof buildExpectedDimoSourceLinkDeactivationSemantics>,
  ): Promise<DimoSourceLinkAuditedDeactivationResult | null> {
    const existing = await this.prisma.businessAuditOutbox.findUnique({
      where: { idempotencyKey: auditKey },
    });
    if (!existing) {
      return null;
    }
    assertDimoSourceLinkDeactivationAuditSemanticMatch(existing, expected);
    const meta = (existing.payload as { metadata?: { deactivatedAt?: string } })?.metadata;
    const deactivatedAt = meta?.deactivatedAt
      ? new Date(meta.deactivatedAt)
      : existing.occurredAt;
    const link = await this.prisma.vehicleDataSourceLink.findFirst({
      where: {
        id: expected.providerSourceLinkId,
        vehicleId: expected.vehicleId,
        vehicle: { organizationId: expected.organizationId },
      },
      select: { isActive: true },
    });
    if (link?.isActive) {
      throw new VehicleOnboardingError(
        'ONBOARDING_CONCURRENCY_CONFLICT',
        'Audit replay exists but source link is still active',
      );
    }
    return { deactivatedAt, idempotentReplay: true };
  }

  private async insertAuditRecord(
    tx: Prisma.TransactionClient,
    input: DimoSourceLinkAuditedDeactivationInput & { deactivatedAt: Date; auditKey: string },
  ): Promise<void> {
    try {
      await this.businessAuditOutbox.enqueueInTransaction(tx, {
        organizationId: input.organizationId,
        idempotencyKey: input.auditKey,
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
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'P2002') {
        const raced = await tx.businessAuditOutbox.findUnique({
          where: { idempotencyKey: input.auditKey },
        });
        if (raced) {
          assertDimoSourceLinkDeactivationAuditSemanticMatch(
            raced,
            buildExpectedDimoSourceLinkDeactivationSemantics(input),
          );
          return;
        }
      }
      throw error;
    }
  }
}
