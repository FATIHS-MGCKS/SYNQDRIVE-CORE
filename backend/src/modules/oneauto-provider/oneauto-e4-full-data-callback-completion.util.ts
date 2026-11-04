import { OneAutoProviderJobStatus, Prisma } from '@prisma/client';
import type { OneAutoFullDataCallbackEvaluation } from './oneauto-callback-full-data.util';
import { redactProviderResponseBody } from './oneauto-provider-redact.util';
import {
  ONEAUTO_E4_CALLBACK_RECOVERY_AUDIT_RESPONSE_PHASE,
  ONEAUTO_E4_CALLBACK_RECOVERY_CALLBACK_RESPONSE_PHASE,
} from './oneauto-e4-failed-callback-recovery.constants';

export type FullDataCallbackCompletionClient = {
  oneAutoProviderResponse: {
    create: (args: {
      data: {
        jobId: string;
        httpStatus: number;
        providerStatusHeader: null;
        responseBodyJson: Prisma.InputJsonValue;
        responsePhase: string;
      };
    }) => Promise<unknown>;
    count?: (args: { where: { jobId: string; responsePhase: string } }) => Promise<number>;
  };
  oneAutoProviderJob: {
    updateMany: (args: {
      where: { id: string; status: { in: OneAutoProviderJobStatus[] } };
      data: {
        status: OneAutoProviderJobStatus;
        providerCallbackReceivedAt: Date;
        actualChargeKnown: boolean;
        actualChargeMinor: null;
        lastErrorCode: null;
        lastErrorMessageRedacted: null;
      };
    }) => Promise<{ count: number }>;
  };
};

export type PersistFullDataCallbackSuccessInput = {
  jobId: string;
  evaluation: Extract<OneAutoFullDataCallbackEvaluation, { ok: true }>;
  providerCallbackReceivedAt: Date;
  /** When recovering a FAILED job, write an immutable audit row before success transition. */
  recoveryAudit?: {
    priorStatus: OneAutoProviderJobStatus;
    priorLastErrorCode: string | null;
    priorLastErrorMessageRedacted: string | null;
    inboxRowId: string;
    recoveredAt: Date;
  };
  /** Job statuses eligible for transition to SUCCEEDED (AWAITING/RUNNING for live callback; FAILED for recovery). */
  eligiblePriorStatuses: OneAutoProviderJobStatus[];
};

/**
 * Transactional success path shared by live callback ingest and owner-invoked FAILED-job recovery.
 * Never performs provider HTTP.
 *
 * Order: conditional job transition first; response rows are written only after `updateMany` succeeds
 * so a failed transition never leaves orphan audit/callback rows.
 */
export async function persistFullDataCallbackSuccessInTransaction(
  tx: FullDataCallbackCompletionClient,
  input: PersistFullDataCallbackSuccessInput,
): Promise<{ transitioned: boolean }> {
  const updated = await tx.oneAutoProviderJob.updateMany({
    where: {
      id: input.jobId,
      status: { in: input.eligiblePriorStatuses },
    },
    data: {
      status: OneAutoProviderJobStatus.SUCCEEDED,
      providerCallbackReceivedAt: input.providerCallbackReceivedAt,
      actualChargeKnown: false,
      actualChargeMinor: null,
      lastErrorCode: null,
      lastErrorMessageRedacted: null,
    },
  });

  if (updated.count === 0) {
    return { transitioned: false };
  }

  if (input.recoveryAudit) {
    await tx.oneAutoProviderResponse.create({
      data: {
        jobId: input.jobId,
        httpStatus: 200,
        providerStatusHeader: null,
        responseBodyJson: {
          kind: 'ONEAUTO_E4_FAILED_CALLBACK_RECOVERY_AUDIT',
          priorStatus: input.recoveryAudit.priorStatus,
          priorLastErrorCode: input.recoveryAudit.priorLastErrorCode,
          priorLastErrorMessageRedacted: input.recoveryAudit.priorLastErrorMessageRedacted,
          inboxRowId: input.recoveryAudit.inboxRowId,
          recoveredAt: input.recoveryAudit.recoveredAt.toISOString(),
        } as Prisma.InputJsonValue,
        responsePhase: ONEAUTO_E4_CALLBACK_RECOVERY_AUDIT_RESPONSE_PHASE,
      },
    });
  }

  await tx.oneAutoProviderResponse.create({
    data: {
      jobId: input.jobId,
      httpStatus: 200,
      providerStatusHeader: null,
      responseBodyJson: redactProviderResponseBody(input.evaluation.envelope) as Prisma.InputJsonValue,
      responsePhase: ONEAUTO_E4_CALLBACK_RECOVERY_CALLBACK_RESPONSE_PHASE,
    },
  });

  return { transitioned: true };
}
