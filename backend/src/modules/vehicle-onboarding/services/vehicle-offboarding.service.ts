import { Injectable, Optional } from '@nestjs/common';
import { Zb1RegistrationDocumentP4Service } from '@modules/document-extraction/zb1/zb1-registration-document-p4.service';
import { VsiProfileLifecycleEnqueueService } from '@modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-profile-lifecycle-enqueue.service';
import type { Prisma, VehicleRegistryLifecycle } from '@prisma/client';
import { VehicleProviderConsentStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { BusinessAuditOutboxRepository } from '@modules/business-audit/business-audit-outbox.repository';
import { PrismaService } from '@shared/database/prisma.service';
import { isPrismaUniqueViolation } from '@shared/database/prisma-error.util';
import {
  OFFBOARD_OUTBOX_PAYLOAD_VERSION,
  type VehicleOffboardedOutboxPayloadV2,
} from '../contracts/offboard-outbox-payload.v1';
import type { VehicleOffboardReasonCode } from '../contracts/vehicle-offboard-reason.v1';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import {
  assertOffboardOutboxSemanticMatch,
  buildExpectedOffboardSemantics,
} from '../offboarding/offboard-outbox-semantics';
import { closeOpenOrganizationAssignmentForOffboard } from '../offboarding/offboard-organization-assignment';
import {
  assertOffboardAuditReplaySemantics,
  buildExpectedOffboardAuditSemantics,
  ensureOffboardAuditRecord,
} from '../offboarding/offboard-registry-audit';
import { lockVehicleRowForLifecycleMutation } from '../offboarding/vehicle-lifecycle-row-lock';
import {
  FSD_LIFECYCLE_REASON_OFFBOARD,
  FsdSourceLinkLifecycleService,
} from '@modules/vehicle-intelligence/fsd-integration/fsd-source-link-lifecycle.service';

export type OffboardVehicleInput = {
  organizationId: string;
  vehicleId: string;
  reason: VehicleOffboardReasonCode;
  actorUserId: string | null;
  idempotencyKey: string;
  note?: string;
  /** Fail-closed: organization transfer is not supported in VO-5A. */
  destinationOrganizationId?: string | null;
  /** Optional in-transaction gate (e.g. operational preflight recheck after row lock). */
  operationalGate?: (tx: Prisma.TransactionClient) => Promise<void>;
};

export type OffboardVehicleResult = {
  vehicleId: string;
  organizationId: string;
  registryLifecycle: VehicleRegistryLifecycle;
  offboardedAt: Date;
  idempotentReplay: boolean;
};

function offboardOutboxIdempotencyKey(idempotencyKey: string): string {
  return `vehicle-onboarding:VEHICLE_OFFBOARDED:v1:${idempotencyKey}`;
}

@Injectable()
export class VehicleOffboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessAuditOutbox: BusinessAuditOutboxRepository,
    private readonly fsdSourceLinkLifecycle: FsdSourceLinkLifecycleService,
    @Optional()
    private readonly vsiProfileLifecycleEnqueue?: VsiProfileLifecycleEnqueueService,
    @Optional()
    private readonly zb1RegistrationDocumentP4?: Zb1RegistrationDocumentP4Service,
  ) {}

  /**
   * Read-only idempotent replay resolution for completed offboards.
   * Used before operational preflight so lost-response retries are not blocked
   * by post-success operational state.
   */
  async tryResolveIdempotentOffboardReplay(
    input: Pick<
      OffboardVehicleInput,
      'organizationId' | 'vehicleId' | 'reason' | 'idempotencyKey' | 'actorUserId' | 'note'
    >,
  ): Promise<OffboardVehicleResult | null> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: input.vehicleId, organizationId: input.organizationId },
      select: { registryLifecycle: true },
    });
    if (!vehicle || vehicle.registryLifecycle !== 'OFFBOARDED') {
      return null;
    }

    const outboxKey = offboardOutboxIdempotencyKey(input.idempotencyKey);
    const existingOutbox = await this.prisma.vehicleRegistryLifecycleOutbox.findUnique({
      where: { idempotencyKey: outboxKey },
    });
    if (!existingOutbox) {
      return null;
    }

    const expectedSemantics = buildExpectedOffboardSemantics({
      vehicleId: input.vehicleId,
      organizationId: input.organizationId,
      reason: input.reason,
    });
    assertOffboardOutboxSemanticMatch(existingOutbox, expectedSemantics);

    if (input.actorUserId) {
      await assertOffboardAuditReplaySemantics(this.prisma, {
        idempotencyKey: input.idempotencyKey,
        expectedSemantics: buildExpectedOffboardAuditSemantics({
          vehicleId: input.vehicleId,
          organizationId: input.organizationId,
          reason: input.reason,
          actorUserId: input.actorUserId,
          note: input.note,
        }),
      });
    }

    return {
      vehicleId: input.vehicleId,
      organizationId: input.organizationId,
      registryLifecycle: 'OFFBOARDED',
      offboardedAt: existingOutbox.occurredAt,
      idempotentReplay: true,
    };
  }

  async offboardVehicle(input: OffboardVehicleInput): Promise<OffboardVehicleResult> {
    if (input.destinationOrganizationId) {
      throw new VehicleOnboardingError(
        'ORG_TRANSFER_NOT_SUPPORTED',
        'Organization transfer is not supported',
      );
    }

    const offboardedAt = new Date();
    const outboxKey = offboardOutboxIdempotencyKey(input.idempotencyKey);
    const expectedSemantics = buildExpectedOffboardSemantics({
      vehicleId: input.vehicleId,
      organizationId: input.organizationId,
      reason: input.reason,
    });
    const actorUserId = input.actorUserId;

    const result = await this.prisma.$transaction<OffboardVehicleResult>(async (tx) => {
      let registryLifecycle: VehicleRegistryLifecycle;
      try {
        registryLifecycle = await lockVehicleRowForLifecycleMutation(tx, {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
        });
      } catch {
        throw new VehicleOnboardingError('CASE_NOT_FOUND', 'Vehicle not found for organization');
      }

      const replayFromOutbox = async (): Promise<OffboardVehicleResult | null> => {
        const existingOutbox = await tx.vehicleRegistryLifecycleOutbox.findUnique({
          where: { idempotencyKey: outboxKey },
        });
        if (!existingOutbox) return null;
        assertOffboardOutboxSemanticMatch(existingOutbox, expectedSemantics);
        return {
          vehicleId: input.vehicleId,
          organizationId: input.organizationId,
          registryLifecycle: 'OFFBOARDED',
          offboardedAt: existingOutbox.occurredAt,
          idempotentReplay: true,
        };
      };

      if (registryLifecycle === 'OFFBOARDED') {
        const replay = await replayFromOutbox();
        if (replay) return replay;
        throw new VehicleOnboardingError(
          'VEHICLE_REGISTRY_INVALID_TRANSITION',
          'Vehicle is already offboarded',
        );
      }

      if (registryLifecycle !== 'ACTIVE') {
        throw new VehicleOnboardingError(
          'VEHICLE_REGISTRY_INVALID_TRANSITION',
          `Cannot offboard vehicle in registry lifecycle ${registryLifecycle}`,
        );
      }

      if (input.operationalGate) {
        await input.operationalGate(tx);
      }

      const transitioned = await tx.vehicle.updateMany({
        where: {
          id: input.vehicleId,
          organizationId: input.organizationId,
          registryLifecycle: 'ACTIVE',
        },
        data: { registryLifecycle: 'OFFBOARDED' },
      });
      if (transitioned.count !== 1) {
        const afterRace = await tx.vehicle.findFirst({
          where: { id: input.vehicleId, organizationId: input.organizationId },
          select: { registryLifecycle: true },
        });
        if (afterRace?.registryLifecycle === 'OFFBOARDED') {
          const replay = await replayFromOutbox();
          if (replay) return replay;
        }
        throw new VehicleOnboardingError(
          'ONBOARDING_CONCURRENCY_CONFLICT',
          'Vehicle registry lifecycle changed concurrently',
        );
      }

      await closeOpenOrganizationAssignmentForOffboard(tx, {
        vehicleId: input.vehicleId,
        organizationId: input.organizationId,
        reason: input.reason,
        offboardedAt,
      });

      const activeLinks = await tx.vehicleDataSourceLink.findMany({
        where: { vehicleId: input.vehicleId, isActive: true },
        select: { id: true },
        orderBy: { id: 'asc' },
      });

      // Lock order: vehicles FOR NO KEY UPDATE → per-link row FOR UPDATE + FSD advisory (sorted ids)
      // → deactivate links. FK inserts from FSD acquire may KEY SHARE the vehicle row.
      await this.fsdSourceLinkLifecycle.invalidateDimoSourceLinksForVehicleLifecycle(tx, {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        invalidationReason: FSD_LIFECYCLE_REASON_OFFBOARD,
      });

      await tx.vehicleDataSourceLink.updateMany({
        where: { vehicleId: input.vehicleId, isActive: true },
        data: {
          isActive: false,
          deactivatedAt: offboardedAt,
          deactivationReason: 'VEHICLE_OFFBOARDED',
        },
      });

      for (const link of activeLinks) {
        await this.vsiProfileLifecycleEnqueue?.enqueueSourceLinkDeactivated(
          {
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            providerSourceLinkId: link.id,
            occurredAt: offboardedAt,
            reason: 'VEHICLE_OFFBOARDED',
          },
          tx,
        );
      }

      await tx.vehicleProviderConsent.updateMany({
        where: {
          vehicleId: input.vehicleId,
          status: VehicleProviderConsentStatus.ACTIVE,
        },
        data: {
          status: VehicleProviderConsentStatus.REVOKED,
          revokedAt: offboardedAt,
          revokedByUserId: input.actorUserId,
          metadataJson: {
            revokedReason: 'VEHICLE_OFFBOARDED',
            offboardReason: input.reason,
          },
        },
      });

      const payload: VehicleOffboardedOutboxPayloadV2 = {
        version: OFFBOARD_OUTBOX_PAYLOAD_VERSION,
        vehicleId: input.vehicleId,
        organizationId: input.organizationId,
        registryLifecycle: 'OFFBOARDED',
        offboardedAt: offboardedAt.toISOString(),
        reason: input.reason,
        actorUserId: input.actorUserId,
      };

      await this.ensureOffboardOutboxEvent(tx, {
        idempotencyKey: outboxKey,
        payload,
        vehicleId: input.vehicleId,
        organizationId: input.organizationId,
        offboardedAt,
        expectedSemantics,
      });

      if (actorUserId) {
        const expectedAuditSemantics = buildExpectedOffboardAuditSemantics({
          vehicleId: input.vehicleId,
          organizationId: input.organizationId,
          reason: input.reason,
          actorUserId,
          note: input.note,
        });
        await ensureOffboardAuditRecord(tx, this.businessAuditOutbox, {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          reason: input.reason,
          actorUserId,
          idempotencyKey: input.idempotencyKey,
          offboardedAt,
          note: input.note,
          expectedSemantics: expectedAuditSemantics,
        });
      }

      return {
        vehicleId: input.vehicleId,
        organizationId: input.organizationId,
        registryLifecycle: 'OFFBOARDED',
        offboardedAt,
        idempotentReplay: false,
      };
    });

    await this.zb1RegistrationDocumentP4
      ?.softDeleteRegistrationDocumentsForVehicle({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        actorUserId: input.actorUserId,
      })
      .catch(() => undefined);

    return result;
  }

  private async ensureOffboardOutboxEvent(
    tx: Prisma.TransactionClient,
    input: {
      idempotencyKey: string;
      payload: VehicleOffboardedOutboxPayloadV2;
      vehicleId: string;
      organizationId: string;
      offboardedAt: Date;
      expectedSemantics: ReturnType<typeof buildExpectedOffboardSemantics>;
    },
  ): Promise<void> {
    const existing = await tx.vehicleRegistryLifecycleOutbox.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      assertOffboardOutboxSemanticMatch(existing, input.expectedSemantics);
      return;
    }

    const eventId = randomUUID();
    try {
      await tx.vehicleRegistryLifecycleOutbox.create({
        data: {
          id: randomUUID(),
          eventId,
          eventType: 'VEHICLE_OFFBOARDED',
          vehicleId: input.vehicleId,
          organizationId: input.organizationId,
          payloadVersion: OFFBOARD_OUTBOX_PAYLOAD_VERSION,
          payload: input.payload as unknown as Prisma.InputJsonValue,
          occurredAt: input.offboardedAt,
          idempotencyKey: input.idempotencyKey,
        },
      });
    } catch (error) {
      if (!isPrismaUniqueViolation(error, ['idempotency_key'])) {
        throw error;
      }
      const raced = await tx.vehicleRegistryLifecycleOutbox.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (raced) {
        assertOffboardOutboxSemanticMatch(raced, input.expectedSemantics);
        return;
      }
      throw new VehicleOnboardingError(
        'ONBOARDING_CONCURRENCY_CONFLICT',
        'Lifecycle outbox idempotency race',
      );
    }
  }
}
