import type { VsiProfileLifecycleOutboxEventType } from '@prisma/client';

export type VsiProfileLifecycleOutboxPayloadV1 = {
  version: 1;
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId?: string | null;
  reason?: string | null;
  catalogCheckedAt?: string | null;
  supersededByLinkId?: string | null;
  backfillCursor?: string | null;
  inventorySweepCursor?: {
    organizationId: string;
    providerSourceLinkId: string;
  } | null;
};

export type VsiProfileLifecycleEnqueueInput = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId?: string | null;
  eventType: VsiProfileLifecycleOutboxEventType;
  occurredAt: Date;
  idempotencyKey: string;
  payload?: Partial<VsiProfileLifecycleOutboxPayloadV1>;
};
