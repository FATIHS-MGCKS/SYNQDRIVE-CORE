/**
 * Shared business-audit idempotency — disposable Postgres (FSD2 guard).
 */
import { BusinessType, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { BusinessAuditOutboxRepository } from './business-audit-outbox.repository';
import { BusinessAuditAction } from './business-audit.constants';

const run =
  process.env.FSD_DISCOVERY_PERSISTENCE_PG === '1' ||
  process.env.VO5A_OFFBOARDING_PG === '1';

(run ? describe : describe.skip)(
  'BusinessAuditOutbox idempotency semantics (PostgreSQL)',
  () => {
    jest.setTimeout(120_000);
    const prisma = new PrismaClient();
    const repo = new BusinessAuditOutboxRepository(prisma as never);

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('duplicate insert with matching semantics returns one row', async () => {
      const organizationId = randomUUID();
      await prisma.organization.create({
        data: { id: organizationId, companyName: 'audit idem', businessType: BusinessType.FLEET },
      });
      const idempotencyKey = `idem:${randomUUID()}`;
      const entityId = randomUUID();
      const input = {
        organizationId,
        idempotencyKey,
        action: BusinessAuditAction.MANUAL_APPROVAL_REQUESTED,
        entityType: 'BOOKING_ELIGIBILITY_APPROVAL' as const,
        entityId,
        description: 'approval requested',
        outcome: 'requested',
      };

      await prisma.$transaction(async (tx) => {
        await repo.enqueueInTransaction(tx, input);
        await repo.enqueueInTransaction(tx, input);
      });

      const rows = await prisma.businessAuditOutbox.findMany({ where: { idempotencyKey } });
      expect(rows).toHaveLength(1);
    });

    it('conflicting entity under same key aborts transaction', async () => {
      const organizationId = randomUUID();
      await prisma.organization.create({
        data: { id: organizationId, companyName: 'audit conflict', businessType: BusinessType.FLEET },
      });
      const idempotencyKey = `idem:${randomUUID()}`;
      await prisma.$transaction(async (tx) => {
        await repo.enqueueInTransaction(tx, {
          organizationId,
          idempotencyKey,
          action: BusinessAuditAction.MANUAL_APPROVAL_REQUESTED,
          entityType: 'BOOKING_ELIGIBILITY_APPROVAL',
          entityId: randomUUID(),
          description: 'first',
        });
      });

      await expect(
        prisma.$transaction(async (tx) => {
          await repo.enqueueInTransaction(tx, {
            organizationId,
            idempotencyKey,
            action: BusinessAuditAction.MANUAL_APPROVAL_REQUESTED,
            entityType: 'BOOKING_ELIGIBILITY_APPROVAL',
            entityId: randomUUID(),
            description: 'second',
          });
        }),
      ).rejects.toMatchObject({ code: 'BUSINESS_AUDIT_IDEMPOTENCY_CONFLICT' });
    });
  },
);
