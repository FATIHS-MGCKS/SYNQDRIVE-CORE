import { businessAuditOutboxIdempotencySemanticMatch } from './business-audit-outbox-idempotency.semantics';
import { BusinessAuditAction } from './business-audit.constants';
import { hashBusinessAuditValue } from './business-audit-sanitize.util';

describe('businessAuditOutboxIdempotencySemanticMatch', () => {
  const baseExisting = {
    organizationId: 'org-a',
    action: BusinessAuditAction.RENTAL_RULE_PUBLISHED,
    entityType: 'RENTAL_RULE_REVISION' as const,
    entityId: 'rev-1',
    actorUserId: 'actor-1',
    correlationId: 'corr-1',
    changeReason: 'policy',
    outcome: 'published',
    beforeHash: hashBusinessAuditValue({ status: 'DRAFT' }),
    afterHash: hashBusinessAuditValue({ status: 'ACTIVE' }),
  };

  it('accepts identical replay semantics', () => {
    expect(
      businessAuditOutboxIdempotencySemanticMatch(baseExisting, {
        organizationId: 'org-a',
        idempotencyKey: 'k',
        action: BusinessAuditAction.RENTAL_RULE_PUBLISHED,
        entityType: 'RENTAL_RULE_REVISION',
        entityId: 'rev-1',
        actorUserId: 'actor-1',
        correlationId: 'corr-1',
        changeReason: 'policy',
        outcome: 'published',
        before: { status: 'DRAFT' },
        after: { status: 'ACTIVE' },
      }),
    ).toBe(true);
  });

  it('rejects different organization or entity under same key', () => {
    expect(
      businessAuditOutboxIdempotencySemanticMatch(baseExisting, {
        organizationId: 'org-b',
        idempotencyKey: 'k',
        action: BusinessAuditAction.RENTAL_RULE_PUBLISHED,
        entityType: 'RENTAL_RULE_REVISION',
        entityId: 'rev-1',
      }),
    ).toBe(false);
    expect(
      businessAuditOutboxIdempotencySemanticMatch(baseExisting, {
        organizationId: 'org-a',
        idempotencyKey: 'k',
        action: BusinessAuditAction.RENTAL_RULE_PUBLISHED,
        entityType: 'RENTAL_RULE_REVISION',
        entityId: 'rev-2',
      }),
    ).toBe(false);
  });
});
