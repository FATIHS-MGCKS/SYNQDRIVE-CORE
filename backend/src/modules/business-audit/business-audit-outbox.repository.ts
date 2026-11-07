import { Injectable } from '@nestjs/common';
import { BusinessAuditOutboxStatus, Prisma, type BusinessAuditOutbox } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@shared/database/prisma.service';
import {
  BUSINESS_AUDIT_OUTBOX,
  type BusinessAuditActionCode,
  type BusinessAuditEntityType,
} from './business-audit.constants';
import {
  hashBusinessAuditValue,
  summarizeBusinessAuditValue,
} from './business-audit-sanitize.util';

export type BusinessAuditEnqueueInTransactionResultV1 =
  | { kind: 'CREATED'; record: BusinessAuditOutbox }
  | { kind: 'EXISTING'; record: BusinessAuditOutbox };

export interface EnqueueBusinessAuditOutboxInput {
  organizationId: string;
  idempotencyKey: string;
  action: BusinessAuditActionCode;
  actorUserId?: string | null;
  entityType: BusinessAuditEntityType;
  entityId: string;
  correlationId?: string | null;
  before?: unknown;
  after?: unknown;
  diff?: unknown;
  changeReason?: string | null;
  outcome?: string | null;
  description: string;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
  payloadVersion?: number;
}

@Injectable()
export class BusinessAuditOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async enqueueInTransaction(
    tx: Prisma.TransactionClient,
    input: EnqueueBusinessAuditOutboxInput,
  ): Promise<BusinessAuditOutbox> {
    const result = await this.enqueueInTransactionIdempotent(tx, input);
    return result.record;
  }

  /**
   * INSERT with ON CONFLICT DO NOTHING — never queries inside an aborted transaction after P2002.
   */
  async enqueueInTransactionIdempotent(
    tx: Prisma.TransactionClient,
    input: EnqueueBusinessAuditOutboxInput,
  ): Promise<BusinessAuditEnqueueInTransactionResultV1> {
    const sanitizedBefore =
      input.before !== undefined ? summarizeBusinessAuditValue(input.before) : null;
    const sanitizedAfter =
      input.after !== undefined ? summarizeBusinessAuditValue(input.after) : null;
    const sanitizedDiff =
      input.diff !== undefined ? summarizeBusinessAuditValue(input.diff) : null;

    const id = randomUUID();
    const eventId = randomUUID();
    const occurredAt = input.occurredAt ?? new Date();
    const payloadVersion = input.payloadVersion ?? BUSINESS_AUDIT_OUTBOX.payloadVersion;
    const payloadJson = {
      description: input.description,
      metadata: input.metadata ?? null,
    };
    const nextRetryAt = new Date();
    const status = BusinessAuditOutboxStatus.PENDING;

    const inserted = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO business_audit_outbox (
        id,
        event_id,
        organization_id,
        idempotency_key,
        actor_user_id,
        action,
        entity_type,
        entity_id,
        correlation_id,
        occurred_at,
        payload_version,
        before_hash,
        before_summary,
        after_hash,
        after_summary,
        change_reason,
        outcome,
        diff_ref,
        payload,
        processing_status,
        attempts,
        next_retry_at,
        created_at,
        updated_at
      )
      VALUES (
        ${id},
        ${eventId},
        ${input.organizationId},
        ${input.idempotencyKey},
        ${input.actorUserId ?? null},
        ${input.action},
        ${input.entityType},
        ${input.entityId},
        ${input.correlationId ?? null},
        ${occurredAt},
        ${payloadVersion},
        ${hashBusinessAuditValue(input.before)},
        ${sanitizedBefore},
        ${hashBusinessAuditValue(input.after)},
        ${sanitizedAfter},
        ${input.changeReason?.trim() || null},
        ${input.outcome ?? null},
        ${sanitizedDiff},
        ${JSON.stringify(payloadJson)}::jsonb,
        ${BusinessAuditOutboxStatus.PENDING}::"BusinessAuditOutboxStatus",
        0,
        ${nextRetryAt},
        NOW(),
        NOW()
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id
    `;

    if (inserted.length > 0) {
      const record = await tx.businessAuditOutbox.findUniqueOrThrow({ where: { id: inserted[0]!.id } });
      return { kind: 'CREATED', record };
    }

    const existing = await tx.businessAuditOutbox.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (!existing) {
      throw new Error('BUSINESS_AUDIT_IDEMPOTENCY_RACE_WITHOUT_ROW');
    }
    return { kind: 'EXISTING', record: existing };
  }

  async enqueue(input: EnqueueBusinessAuditOutboxInput) {
    return this.prisma.$transaction((tx) => this.enqueueInTransaction(tx, input));
  }

  findById(id: string, organizationId?: string) {
    return this.prisma.businessAuditOutbox.findFirst({
      where: {
        id,
        ...(organizationId ? { organizationId } : {}),
      },
    });
  }

  findByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.businessAuditOutbox.findUnique({
      where: { idempotencyKey },
    });
  }

  findDueBatch(limit: number, now: Date = new Date()) {
    return this.prisma.businessAuditOutbox.findMany({
      where: {
        status: BusinessAuditOutboxStatus.PENDING,
        nextRetryAt: { lte: now },
      },
      orderBy: { nextRetryAt: 'asc' },
      take: limit,
    });
  }

  async claimForProcessing(id: string) {
    const result = await this.prisma.businessAuditOutbox.updateMany({
      where: {
        id,
        status: BusinessAuditOutboxStatus.PENDING,
        nextRetryAt: { lte: new Date() },
      },
      data: {
        status: BusinessAuditOutboxStatus.PROCESSING,
        attempts: { increment: 1 },
      },
    });
    if (result.count === 0) return null;
    return this.findById(id);
  }

  markProcessed(id: string) {
    return this.prisma.businessAuditOutbox.update({
      where: { id },
      data: {
        status: BusinessAuditOutboxStatus.PROCESSED,
        processedAt: new Date(),
        errorMessage: null,
      },
    });
  }

  markRetry(id: string, errorMessage: string, nextRetryAt: Date) {
    return this.prisma.businessAuditOutbox.update({
      where: { id },
      data: {
        status: BusinessAuditOutboxStatus.PENDING,
        nextRetryAt,
        errorMessage: errorMessage.slice(0, 2000),
        processedAt: null,
        deadLetteredAt: null,
      },
    });
  }

  markDeadLetter(id: string, errorMessage: string) {
    return this.prisma.businessAuditOutbox.update({
      where: { id },
      data: {
        status: BusinessAuditOutboxStatus.DEAD_LETTER,
        deadLetteredAt: new Date(),
        errorMessage: errorMessage.slice(0, 2000),
      },
    });
  }

  async recoverStaleProcessing(staleBefore: Date): Promise<string[]> {
    const stale = await this.prisma.businessAuditOutbox.findMany({
      where: {
        status: BusinessAuditOutboxStatus.PROCESSING,
        updatedAt: { lt: staleBefore },
      },
      select: { id: true },
    });
    if (stale.length === 0) return [];

    const ids = stale.map((row) => row.id);
    await this.prisma.businessAuditOutbox.updateMany({
      where: { id: { in: ids } },
      data: {
        status: BusinessAuditOutboxStatus.PENDING,
        nextRetryAt: new Date(),
      },
    });
    return ids;
  }
}
