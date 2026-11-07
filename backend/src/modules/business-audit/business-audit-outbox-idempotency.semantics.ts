import type { BusinessAuditOutbox } from '@prisma/client';
import { hashBusinessAuditValue } from './business-audit-sanitize.util';
import type { BusinessAuditActionCode, BusinessAuditEntityType } from './business-audit.constants';
import { BusinessAuditOutboxError } from './business-audit-outbox.errors';

export type BusinessAuditEnqueueSemanticInput = {
  organizationId: string;
  idempotencyKey: string;
  action: BusinessAuditActionCode;
  actorUserId?: string | null;
  entityType: BusinessAuditEntityType;
  entityId: string;
  correlationId?: string | null;
  before?: unknown;
  after?: unknown;
  changeReason?: string | null;
  outcome?: string | null;
};

export type BusinessAuditOutboxIdempotencyIdentity = Pick<
  BusinessAuditOutbox,
  | 'organizationId'
  | 'action'
  | 'entityType'
  | 'entityId'
  | 'actorUserId'
  | 'correlationId'
  | 'changeReason'
  | 'outcome'
  | 'beforeHash'
  | 'afterHash'
>;

/**
 * Generic replay contract for shared business-audit idempotency keys.
 * Identity (org, action, entity) must match exactly. Optional content fields
 * (hashes, reason, outcome, correlation) are compared only when both sides carry a value
 * so legitimate retries are not rejected for omitted timestamps/metadata on replay.
 */
export function businessAuditOutboxIdempotencySemanticMatch(
  existing: BusinessAuditOutboxIdempotencyIdentity,
  input: BusinessAuditEnqueueSemanticInput,
): boolean {
  if (existing.organizationId !== input.organizationId) return false;
  if (existing.action !== input.action) return false;
  if (existing.entityType !== input.entityType) return false;
  if (existing.entityId !== input.entityId) return false;

  const inputActor = input.actorUserId ?? null;
  const existingActor = existing.actorUserId ?? null;
  if (inputActor !== existingActor) return false;

  const inputCorrelation = input.correlationId?.trim() || null;
  const existingCorrelation = existing.correlationId?.trim() || null;
  if (
    inputCorrelation !== null &&
    existingCorrelation !== null &&
    inputCorrelation !== existingCorrelation
  ) {
    return false;
  }

  const inputReason = input.changeReason?.trim() || null;
  const existingReason = existing.changeReason?.trim() || null;
  if (inputReason !== null && existingReason !== null && inputReason !== existingReason) {
    return false;
  }

  const inputOutcome = input.outcome ?? null;
  const existingOutcome = existing.outcome ?? null;
  if (inputOutcome !== null && existingOutcome !== null && inputOutcome !== existingOutcome) {
    return false;
  }

  if (input.before !== undefined) {
    const nextHash = hashBusinessAuditValue(input.before);
    if (existing.beforeHash !== null && nextHash !== existing.beforeHash) return false;
  }
  if (input.after !== undefined) {
    const nextHash = hashBusinessAuditValue(input.after);
    if (existing.afterHash !== null && nextHash !== existing.afterHash) return false;
  }

  return true;
}

export function assertBusinessAuditOutboxIdempotencySemanticMatch(
  existing: BusinessAuditOutboxIdempotencyIdentity,
  input: BusinessAuditEnqueueSemanticInput,
): void {
  if (!businessAuditOutboxIdempotencySemanticMatch(existing, input)) {
    throw new BusinessAuditOutboxError(
      'BUSINESS_AUDIT_IDEMPOTENCY_CONFLICT',
      'Business audit idempotency key reused with incompatible semantics',
    );
  }
}
