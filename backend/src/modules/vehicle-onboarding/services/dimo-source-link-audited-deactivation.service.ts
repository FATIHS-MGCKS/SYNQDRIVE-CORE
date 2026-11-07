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
import { acquirePgAdvisoryXactLock64 } from '@shared/database/pg-advisory-lock.util';
import { lockVehicleRowForLifecycleMutation } from '../offboarding/vehicle-lifecycle-row-lock';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import type { DimoSourceLinkOperatorAuthorizationEvidenceV1 } from './dimo-source-link-operator-authorization.service';
import {
  assertDimoSourceLinkDeactivationAuditSemanticMatch,
  assertSourceLinkDeactivationEpisodeReplayMatch,
  buildExpectedDimoSourceLinkDeactivationSemantics,
  buildExpectedDimoSourceLinkRecoverySemantics,
  buildDimoSourceLinkDeactivationIdempotencyAdvisoryLockKey,
  assertDimoSourceLinkRecoveryAuditSemanticMatch,
  resolveDimoSourceLinkDeactivationAuditIdempotencyKey,
  resolveDimoSourceLinkRecoveryAuditIdempotencyKey,
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
  authorizationEvidence?: DimoSourceLinkOperatorAuthorizationEvidenceV1;
};

export type DimoSourceLinkAuditedDeactivationResult = {
  deactivatedAt: Date;
  idempotentReplay: boolean;
};

export type DimoSourceLinkFsdRecoveryInput = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  actorUserId: string;
  idempotencyKey: string;
  recoveryReason: string;
  note?: string;
  authorizationEvidence?: DimoSourceLinkOperatorAuthorizationEvidenceV1;
};

export type DimoSourceLinkFsdRecoveryResult = {
  invalidatedCount: number;
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

    const preReplay = await this.tryReplayFromAudit(auditKey, expectedSemantics);
    if (preReplay) {
      return preReplay;
    }

    const deactivatedAt = new Date();
    let replayOnlyInTransaction = false;

    await this.prisma.$transaction(async (tx) => {
      await acquirePgAdvisoryXactLock64(
        tx,
        buildDimoSourceLinkDeactivationIdempotencyAdvisoryLockKey(auditKey),
      );

      await lockVehicleRowForLifecycleMutation(tx, {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      });

      await lockDimoSourceLinkRowForLifecycleMutation(tx, {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerSourceLinkId: input.providerSourceLinkId,
      });

      const existingAudit = await tx.businessAuditOutbox.findUnique({
        where: { idempotencyKey: auditKey },
      });
      if (existingAudit) {
        assertDimoSourceLinkDeactivationAuditSemanticMatch(existingAudit, expectedSemantics);
        replayOnlyInTransaction = true;
        return;
      }

      const link = await tx.vehicleDataSourceLink.findFirst({
        where: {
          id: input.providerSourceLinkId,
          vehicleId: input.vehicleId,
          provider: 'DIMO',
          sourceType: 'DIMO',
          vehicle: { organizationId: input.organizationId },
        },
        select: { id: true, isActive: true, activatedAt: true, deactivatedAt: true },
      });
      if (!link) {
        throw new VehicleOnboardingError('CASE_NOT_FOUND', 'DIMO source link not found for scope');
      }
      if (!link.isActive) {
        throw new VehicleOnboardingError(
          'VEHICLE_REGISTRY_INVALID_TRANSITION',
          'Link already inactive; use recovery invalidation for OOB-deactivated links without audit',
        );
      }

      const sourceLinkActivatedAt = link.activatedAt;

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

      const auditResult = await this.businessAuditOutbox.enqueueInTransactionIdempotent(tx, {
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
          deactivatedAt: deactivatedAt.toISOString(),
          sourceLinkActivatedAt: sourceLinkActivatedAt.toISOString(),
          sourceLinkDeactivatedAt: deactivatedAt.toISOString(),
          consentScope: 'UNCHANGED',
          authorizationReference: input.authorizationEvidence?.authorizationReference ?? null,
          ...(input.note ? { note: input.note } : {}),
        },
        occurredAt: deactivatedAt,
      });
      if (auditResult.kind === 'EXISTING') {
        assertDimoSourceLinkDeactivationAuditSemanticMatch(auditResult.record, expectedSemantics);
        throw new VehicleOnboardingError(
          'ONBOARDING_CONCURRENCY_CONFLICT',
          'Audit idempotency race after locks',
        );
      }
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

  /**
   * Audited FSD invalidation for an already-inactive DIMO link (OOB recovery). Does not toggle isActive.
   */
  async recoverFsdRunsForInactiveLinkAudited(
    input: DimoSourceLinkFsdRecoveryInput,
  ): Promise<DimoSourceLinkFsdRecoveryResult> {
    const expectedSemantics = buildExpectedDimoSourceLinkRecoverySemantics(input);
    const auditKey = resolveDimoSourceLinkRecoveryAuditIdempotencyKey(input.idempotencyKey);

    const preReplay = await this.tryReplayFromRecoveryAudit(auditKey, expectedSemantics);
    if (preReplay) {
      return preReplay;
    }

    let invalidatedCount = 0;
    let replayOnlyInTransaction = false;

    await this.prisma.$transaction(async (tx) => {
      await acquirePgAdvisoryXactLock64(tx, buildDimoSourceLinkDeactivationIdempotencyAdvisoryLockKey(auditKey));

      await lockVehicleRowForLifecycleMutation(tx, {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      });

      await lockDimoSourceLinkRowForLifecycleMutation(tx, {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerSourceLinkId: input.providerSourceLinkId,
      });

      const existingAudit = await tx.businessAuditOutbox.findUnique({
        where: { idempotencyKey: auditKey },
      });
      if (existingAudit) {
        assertDimoSourceLinkRecoveryAuditSemanticMatch(existingAudit, expectedSemantics);
        const meta = (existingAudit.payload as { metadata?: { invalidatedCount?: number } })?.metadata;
        invalidatedCount = meta?.invalidatedCount ?? 0;
        replayOnlyInTransaction = true;
        return;
      }

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
      if (link.isActive) {
        throw new VehicleOnboardingError(
          'VEHICLE_REGISTRY_INVALID_TRANSITION',
          'Recovery invalidation requires an inactive source link',
        );
      }

      const invalidated = await this.fsdSourceLinkLifecycle.invalidateSingleDimoSourceLinkForLifecycle(tx, {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerSourceLinkId: input.providerSourceLinkId,
        invalidationReason: FSD_SOURCE_LINK_INVALIDATION_REASON_DEACTIVATED,
      });
      invalidatedCount = invalidated.invalidatedCount;

      const occurredAt = new Date();
      const auditResult = await this.businessAuditOutbox.enqueueInTransactionIdempotent(tx, {
        organizationId: input.organizationId,
        idempotencyKey: auditKey,
        action: BusinessAuditAction.DIMO_SOURCE_LINK_FSD_RECOVERY_INVALIDATION,
        actorUserId: input.actorUserId,
        entityType: BUSINESS_AUDIT_ENTITY_TYPE.VEHICLE,
        entityId: input.vehicleId,
        changeReason: input.recoveryReason,
        outcome: 'SUCCESS',
        description: 'FSD executable run invalidation for inactive DIMO source link (recovery)',
        metadata: {
          vehicleId: input.vehicleId,
          organizationId: input.organizationId,
          providerSourceLinkId: input.providerSourceLinkId,
          recoveryReason: input.recoveryReason,
          actorUserId: input.actorUserId,
          invalidatedCount,
          occurredAt: occurredAt.toISOString(),
          authorizationReference: input.authorizationEvidence?.authorizationReference ?? null,
          ...(input.note ? { note: input.note } : {}),
        },
        occurredAt,
      });
      if (auditResult.kind === 'EXISTING') {
        assertDimoSourceLinkRecoveryAuditSemanticMatch(auditResult.record, expectedSemantics);
        const meta = (auditResult.record.payload as { metadata?: { invalidatedCount?: number } })?.metadata;
        invalidatedCount = meta?.invalidatedCount ?? invalidatedCount;
        throw new VehicleOnboardingError(
          'ONBOARDING_CONCURRENCY_CONFLICT',
          'Recovery audit idempotency race after locks',
        );
      }
    });

    if (replayOnlyInTransaction) {
      const replay = await this.tryReplayFromRecoveryAudit(auditKey, expectedSemantics);
      if (!replay) {
        throw new VehicleOnboardingError(
          'ONBOARDING_CONCURRENCY_CONFLICT',
          'Expected idempotent recovery replay audit after transactional short-circuit',
        );
      }
      return replay;
    }

    return { invalidatedCount, idempotentReplay: false };
  }

  private async tryReplayFromRecoveryAudit(
    auditKey: string,
    expected: ReturnType<typeof buildExpectedDimoSourceLinkRecoverySemantics>,
  ): Promise<DimoSourceLinkFsdRecoveryResult | null> {
    const existing = await this.prisma.businessAuditOutbox.findUnique({
      where: { idempotencyKey: auditKey },
    });
    if (!existing) {
      return null;
    }
    assertDimoSourceLinkRecoveryAuditSemanticMatch(existing, expected);
    const parsed = (existing.payload as { metadata?: { invalidatedCount?: number } })?.metadata;
    const invalidatedCount = parsed?.invalidatedCount ?? 0;
    return { invalidatedCount, idempotentReplay: true };
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
    const meta = (existing.payload as { metadata?: Record<string, unknown> })?.metadata;
    const deactivatedAt = meta?.deactivatedAt
      ? new Date(String(meta.deactivatedAt))
      : existing.occurredAt;
    const link = await this.prisma.vehicleDataSourceLink.findFirst({
      where: {
        id: expected.providerSourceLinkId,
        vehicleId: expected.vehicleId,
        vehicle: { organizationId: expected.organizationId },
      },
      select: { isActive: true, activatedAt: true, deactivatedAt: true },
    });
    if (!link) {
      throw new VehicleOnboardingError('CASE_NOT_FOUND', 'Source link missing during audit replay');
    }
    if (link.isActive) {
      throw new VehicleOnboardingError(
        'ONBOARDING_CONCURRENCY_CONFLICT',
        'Audit replay exists but source link is still active',
      );
    }
    assertSourceLinkDeactivationEpisodeReplayMatch(link, meta);
    return { deactivatedAt, idempotentReplay: true };
  }
}
