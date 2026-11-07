export type BusinessAuditOutboxErrorCode =
  | 'BUSINESS_AUDIT_IDEMPOTENCY_CONFLICT'
  | 'BUSINESS_AUDIT_IDEMPOTENCY_RACE_WITHOUT_ROW';

export class BusinessAuditOutboxError extends Error {
  constructor(
    public readonly code: BusinessAuditOutboxErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BusinessAuditOutboxError';
  }
}
