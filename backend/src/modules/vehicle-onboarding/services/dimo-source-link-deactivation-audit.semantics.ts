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
  sourceLinkActivatedAt?: string;
  sourceLinkDeactivatedAt?: string;
  note?: string;
};

export function buildDimoSourceLinkDeactivationIdempotencyAdvisoryLockKey(auditKey: string): string {
  return `dimo-source-link:deactivate-audit:v1:${auditKey}`;
}

export function resolveDimoSourceLinkRecoveryAuditIdempotencyKey(idempotencyKey: string): string {
  return `dimo-source-link:RECOVERY:audit:v1:${idempotencyKey}`;
}

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
    ...(typeof m.sourceLinkActivatedAt === 'string'
      ? { sourceLinkActivatedAt: m.sourceLinkActivatedAt }
      : {}),
    ...(typeof m.sourceLinkDeactivatedAt === 'string'
      ? { sourceLinkDeactivatedAt: m.sourceLinkDeactivatedAt }
      : {}),
    ...(typeof m.note === 'string' ? { note: m.note } : {}),
  };
}

export function assertSourceLinkDeactivationEpisodeReplayMatch(
  link: { activatedAt: Date; deactivatedAt: Date | null },
  auditMetadata: Record<string, unknown> | null | undefined,
): void {
  const episodeDeactivatedAt =
    typeof auditMetadata?.sourceLinkDeactivatedAt === 'string'
      ? auditMetadata.sourceLinkDeactivatedAt
      : typeof auditMetadata?.deactivatedAt === 'string'
        ? auditMetadata.deactivatedAt
        : null;
  const episodeActivatedAt =
    typeof auditMetadata?.sourceLinkActivatedAt === 'string'
      ? auditMetadata.sourceLinkActivatedAt
      : null;

  if (episodeDeactivatedAt && link.deactivatedAt) {
    const linkIso = link.deactivatedAt.toISOString();
    if (linkIso !== episodeDeactivatedAt) {
      throw new VehicleOnboardingError(
        'OUTBOX_IDEMPOTENCY_CONFLICT',
        'Source-link deactivation episode no longer matches audit replay',
      );
    }
  }

  if (episodeActivatedAt && link.activatedAt.toISOString() !== episodeActivatedAt) {
    throw new VehicleOnboardingError(
      'OUTBOX_IDEMPOTENCY_CONFLICT',
      'Source link was reactivated since the audited deactivation episode',
    );
  }
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
