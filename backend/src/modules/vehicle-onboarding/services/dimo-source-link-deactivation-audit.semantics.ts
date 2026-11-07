import type { BusinessAuditOutbox } from '@prisma/client';
import { BusinessAuditAction } from '@modules/business-audit/business-audit.constants';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

export type ExpectedDimoSourceLinkDeactivationSemanticsV1 = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  actorUserId: string;
  deactivationReason: string;
  note?: string;
};

export function buildExpectedDimoSourceLinkDeactivationSemantics(
  input: ExpectedDimoSourceLinkDeactivationSemanticsV1,
): ExpectedDimoSourceLinkDeactivationSemanticsV1 {
  return { ...input };
}

type ParsedAuditMetadata = {
  vehicleId: string;
  organizationId: string;
  providerSourceLinkId: string;
  actorUserId: string;
  deactivationReason: string;
  deactivatedAt: string;
  note?: string;
};

function parseAuditPayload(payload: unknown): ParsedAuditMetadata | null {
  if (!payload || typeof payload !== 'object') return null;
  const meta = (payload as { metadata?: unknown }).metadata;
  if (!meta || typeof meta !== 'object') return null;
  const m = meta as Record<string, unknown>;
  if (
    typeof m.vehicleId !== 'string' ||
    typeof m.organizationId !== 'string' ||
    typeof m.providerSourceLinkId !== 'string' ||
    typeof m.actorUserId !== 'string' ||
    typeof m.deactivationReason !== 'string' ||
    typeof m.deactivatedAt !== 'string'
  ) {
    return null;
  }
  return {
    vehicleId: m.vehicleId,
    organizationId: m.organizationId,
    providerSourceLinkId: m.providerSourceLinkId,
    actorUserId: m.actorUserId,
    deactivationReason: m.deactivationReason,
    deactivatedAt: m.deactivatedAt,
    ...(typeof m.note === 'string' ? { note: m.note } : {}),
  };
}

export function dimoSourceLinkDeactivationAuditSemanticMatch(
  existing: Pick<BusinessAuditOutbox, 'entityId' | 'organizationId' | 'action' | 'payload'>,
  expected: ExpectedDimoSourceLinkDeactivationSemanticsV1,
): boolean {
  if (
    existing.action !== BusinessAuditAction.DIMO_SOURCE_LINK_DEACTIVATED ||
    existing.entityId !== expected.vehicleId ||
    existing.organizationId !== expected.organizationId
  ) {
    return false;
  }
  const parsed = parseAuditPayload(existing.payload);
  if (!parsed) return false;
  const noteMatches = (parsed.note ?? undefined) === (expected.note ?? undefined);
  return (
    parsed.vehicleId === expected.vehicleId &&
    parsed.organizationId === expected.organizationId &&
    parsed.providerSourceLinkId === expected.providerSourceLinkId &&
    parsed.actorUserId === expected.actorUserId &&
    parsed.deactivationReason === expected.deactivationReason &&
    noteMatches
  );
}

export function assertDimoSourceLinkDeactivationAuditSemanticMatch(
  existing: Pick<BusinessAuditOutbox, 'entityId' | 'organizationId' | 'action' | 'payload'>,
  expected: ExpectedDimoSourceLinkDeactivationSemanticsV1,
): void {
  if (!dimoSourceLinkDeactivationAuditSemanticMatch(existing, expected)) {
    throw new VehicleOnboardingError(
      'OUTBOX_IDEMPOTENCY_CONFLICT',
      'Dimo source-link deactivation idempotency key belongs to a different operation',
    );
  }
}

export function resolveDimoSourceLinkDeactivationAuditIdempotencyKey(idempotencyKey: string): string {
  return `dimo-source-link:DEACTIVATED:audit:v1:${idempotencyKey}`;
}
