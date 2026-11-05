import { Injectable, Logger } from '@nestjs/common';
import { OneAutoProviderJobStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { getVerifiedOneAutoContract } from './catalog/oneauto-verified-contracts';
import {
  ONEAUTO_CALLBACK_PROVIDER_OUTCOME_CODES,
  evaluateOneAutoFullDataCallbackPayload,
  isOeVinLookupEuFullDataCallbackSku,
} from './oneauto-callback-full-data.util';
import { persistFullDataCallbackSuccessInTransaction } from './oneauto-e4-full-data-callback-completion.util';
import {
  ONEAUTO_E4_CALLBACK_RECOVERY_CALLBACK_RESPONSE_PHASE,
  resolveOneAutoE4CallbackRecoveryAuthorization,
} from './oneauto-e4-failed-callback-recovery.constants';
import { ONEAUTO_OEM_VIN_LOOKUP_EU_SERVICE_SKU } from './oem-specification/oneauto-vin-lookup-oem-suggestion.types';
import { OneAutoOemVinLookupEuSuggestionMaterializationService } from './oem-specification/oneauto-oem-vin-lookup-eu-suggestion-materialization.service';
import { OneAutoOeServiceHistoryEuIngestionService } from './service-history/oneauto-oe-service-history-eu-ingestion.service';

export type OneAutoE4FailedCallbackRecoveryOutcome =
  | 'AUTHORIZATION_DENIED'
  | 'JOB_NOT_FOUND'
  | 'ALREADY_RECOVERED'
  | 'PRECONDITION_FAILED'
  | 'RETENTION_EXPIRED'
  | 'INBOX_MISSING'
  | 'PAYLOAD_REJECTED'
  | 'DRY_RUN_OK'
  | 'RECOVERED';

export type OneAutoE4FailedCallbackRecoveryResult = {
  outcome: OneAutoE4FailedCallbackRecoveryOutcome;
  jobId: string;
  providerHttpRequestCount: 0;
  dryRun: boolean;
  detail?: Record<string, unknown>;
  materialization?: { outcome: string; code?: string };
};

export type OneAutoE4FailedCallbackRecoveryInput = {
  jobId: string;
  organizationId: string;
  vehicleId: string;
  expectedLastErrorCode: string;
  dryRun?: boolean;
  /** When false, skips production authorization env (unit tests only). */
  requireProductionAuthorization?: boolean;
  now?: Date;
};

@Injectable()
export class OneAutoE4FailedCallbackRecoveryService {
  private readonly logger = new Logger(OneAutoE4FailedCallbackRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly materialization: OneAutoOemVinLookupEuSuggestionMaterializationService,
    private readonly oeServiceHistoryIngestion: OneAutoOeServiceHistoryEuIngestionService,
  ) {}

  /**
   * Replays a validated full-data callback from the persisted inbox for a FAILED job.
   * Never calls the One Auto provider.
   */
  async recoverFailedFullDataCallbackJob(
    input: OneAutoE4FailedCallbackRecoveryInput,
  ): Promise<OneAutoE4FailedCallbackRecoveryResult> {
    const dryRun = input.dryRun === true;
    const now = input.now ?? new Date();
    const base = { jobId: input.jobId.trim(), providerHttpRequestCount: 0 as const, dryRun };

    if (input.requireProductionAuthorization !== false) {
      const auth = resolveOneAutoE4CallbackRecoveryAuthorization();
      if (!auth.authorized) {
        return {
          ...base,
          outcome: 'AUTHORIZATION_DENIED',
          detail: { reasons: auth.reasons },
        };
      }
    }

    const job = await this.prisma.oneAutoProviderJob.findFirst({
      where: { id: input.jobId.trim() },
      select: {
        id: true,
        organizationId: true,
        vehicleId: true,
        vinSnapshot: true,
        serviceSku: true,
        status: true,
        lastErrorCode: true,
        lastErrorMessageRedacted: true,
        initialProviderDispatchAt: true,
        retrievalProviderDispatchAt: true,
        providerResultExpiresAt: true,
        expiresAt: true,
        providerCallbackReceivedAt: true,
      },
    });

    if (!job) {
      return { ...base, outcome: 'JOB_NOT_FOUND' };
    }

    if (job.organizationId !== input.organizationId || job.vehicleId !== input.vehicleId) {
      return {
        ...base,
        outcome: 'PRECONDITION_FAILED',
        detail: { reason: 'organization_or_vehicle_mismatch' },
      };
    }

    if (job.serviceSku !== ONEAUTO_OEM_VIN_LOOKUP_EU_SERVICE_SKU) {
      return {
        ...base,
        outcome: 'PRECONDITION_FAILED',
        detail: { reason: 'unsupported_service_sku', serviceSku: job.serviceSku },
      };
    }

    const contract = getVerifiedOneAutoContract(job.serviceSku);
    if (!contract || contract.asyncCompletionMode !== 'CALLBACK_FULL_DATA') {
      return {
        ...base,
        outcome: 'PRECONDITION_FAILED',
        detail: { reason: 'callback_full_data_mode_not_active_in_registry' },
      };
    }

    if (!isOeVinLookupEuFullDataCallbackSku(job.serviceSku)) {
      return { ...base, outcome: 'PRECONDITION_FAILED', detail: { reason: 'sku_not_full_data' } };
    }

    if (job.status === OneAutoProviderJobStatus.SUCCEEDED) {
      const callbackResponses = await this.prisma.oneAutoProviderResponse.count({
        where: {
          jobId: job.id,
          responsePhase: ONEAUTO_E4_CALLBACK_RECOVERY_CALLBACK_RESPONSE_PHASE,
        },
      });
      if (callbackResponses > 0 || job.providerCallbackReceivedAt) {
        return { ...base, outcome: 'ALREADY_RECOVERED' };
      }
      return {
        ...base,
        outcome: 'PRECONDITION_FAILED',
        detail: { reason: 'succeeded_without_callback_response' },
      };
    }

    if (job.status !== OneAutoProviderJobStatus.FAILED) {
      return {
        ...base,
        outcome: 'PRECONDITION_FAILED',
        detail: { reason: 'job_not_failed', status: job.status },
      };
    }

    if (job.lastErrorCode !== input.expectedLastErrorCode.trim()) {
      return {
        ...base,
        outcome: 'PRECONDITION_FAILED',
        detail: {
          reason: 'unexpected_last_error_code',
          expected: input.expectedLastErrorCode.trim(),
          actual: job.lastErrorCode,
        },
      };
    }

    if (job.retrievalProviderDispatchAt != null) {
      return {
        ...base,
        outcome: 'PRECONDITION_FAILED',
        detail: { reason: 'retrieval_dispatch_present' },
      };
    }

    if (!job.initialProviderDispatchAt) {
      return {
        ...base,
        outcome: 'PRECONDITION_FAILED',
        detail: { reason: 'missing_initial_dispatch' },
      };
    }

    const retentionExpired =
      (job.providerResultExpiresAt && job.providerResultExpiresAt <= now) ||
      (job.expiresAt && job.expiresAt <= now);
    if (retentionExpired) {
      return { ...base, outcome: 'RETENTION_EXPIRED' };
    }

    const inboxRows = await this.prisma.oneAutoProviderCallbackInbox.findMany({
      where: { jobId: job.id, duplicate: false },
      orderBy: { receivedAt: 'asc' },
      select: { id: true, payloadJson: true, receivedAt: true },
    });

    if (inboxRows.length === 0) {
      return { ...base, outcome: 'INBOX_MISSING' };
    }

    const inbox = inboxRows[0];

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: job.vehicleId, organizationId: job.organizationId },
      select: { vin: true },
    });
    if (!vehicle) {
      return {
        ...base,
        outcome: 'PRECONDITION_FAILED',
        detail: { reason: 'vehicle_binding_missing' },
      };
    }

    const evaluation = evaluateOneAutoFullDataCallbackPayload({
      body: inbox.payloadJson,
      contract,
      jobVinSnapshot: job.vinSnapshot,
      vehicleVin: vehicle.vin,
    });

    if (!evaluation.ok) {
      const code = evaluation.code;
      if (ONEAUTO_CALLBACK_PROVIDER_OUTCOME_CODES.has(code)) {
        return {
          ...base,
          outcome: 'PAYLOAD_REJECTED',
          detail: { reason: 'provider_outcome_not_recoverable', code, diagnostic: evaluation.diagnostic },
        };
      }
      return {
        ...base,
        outcome: 'PAYLOAD_REJECTED',
        detail: { reason: 'payload_evaluation_failed', code, diagnostic: evaluation.diagnostic },
      };
    }

    if (dryRun) {
      return {
        ...base,
        outcome: 'DRY_RUN_OK',
        detail: {
          inboxRowId: inbox.id,
          inboxReceivedAt: inbox.receivedAt.toISOString(),
          wrapperStatus: evaluation.wrapperStatus,
          resultKeyCount: Object.keys(evaluation.result).length,
        },
      };
    }

    const recoveredAt = now;
    const expectedError = input.expectedLastErrorCode.trim();
    const transitioned = await this.prisma.$transaction(async (tx) => {
      const existingCallback = await tx.oneAutoProviderResponse.count({
        where: {
          jobId: job.id,
          responsePhase: ONEAUTO_E4_CALLBACK_RECOVERY_CALLBACK_RESPONSE_PHASE,
        },
      });
      if (existingCallback > 0) {
        return 'already_has_callback' as const;
      }

      const jobInTx = await tx.oneAutoProviderJob.findFirst({
        where: {
          id: job.id,
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          status: OneAutoProviderJobStatus.FAILED,
          lastErrorCode: expectedError,
          serviceSku: ONEAUTO_OEM_VIN_LOOKUP_EU_SERVICE_SKU,
          retrievalProviderDispatchAt: null,
        },
        select: {
          id: true,
          status: true,
          lastErrorCode: true,
          lastErrorMessageRedacted: true,
          providerResultExpiresAt: true,
          expiresAt: true,
        },
      });
      if (!jobInTx) {
        return 'job_precondition_failed' as const;
      }

      const expiredInTx =
        (jobInTx.providerResultExpiresAt && jobInTx.providerResultExpiresAt <= now) ||
        (jobInTx.expiresAt && jobInTx.expiresAt <= now);
      if (expiredInTx) {
        return 'retention_expired' as const;
      }

      const { transitioned: ok } = await persistFullDataCallbackSuccessInTransaction(tx, {
        jobId: job.id,
        evaluation,
        providerCallbackReceivedAt: inbox.receivedAt,
        eligiblePriorStatuses: [OneAutoProviderJobStatus.FAILED],
        recoveryAudit: {
          priorStatus: jobInTx.status,
          priorLastErrorCode: jobInTx.lastErrorCode,
          priorLastErrorMessageRedacted: jobInTx.lastErrorMessageRedacted,
          inboxRowId: inbox.id,
          recoveredAt,
        },
      });
      return ok ? ('recovered' as const) : ('transition_lost' as const);
    });

    if (transitioned === 'already_has_callback') {
      return { ...base, outcome: 'ALREADY_RECOVERED' };
    }
    if (transitioned === 'retention_expired') {
      return { ...base, outcome: 'RETENTION_EXPIRED' };
    }
    if (transitioned === 'job_precondition_failed' || transitioned === 'transition_lost') {
      const fresh = await this.prisma.oneAutoProviderJob.findUnique({
        where: { id: job.id },
        select: { status: true, providerCallbackReceivedAt: true },
      });
      if (fresh?.status === OneAutoProviderJobStatus.SUCCEEDED) {
        return { ...base, outcome: 'ALREADY_RECOVERED' };
      }
      return {
        ...base,
        outcome: 'PRECONDITION_FAILED',
        detail: { reason: transitioned },
      };
    }

    if (transitioned !== 'recovered') {
      return {
        ...base,
        outcome: 'PRECONDITION_FAILED',
        detail: { reason: 'unexpected_transaction_result' },
      };
    }

    const materialization = await this.materialization.tryMaterializeFromSucceededJob(job.id);
    let serviceHistoryIngestion: { outcome: string } = { outcome: 'SKIPPED' };
    try {
      serviceHistoryIngestion = await this.oeServiceHistoryIngestion.tryIngestFromSucceededJob(job.id);
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          kind: 'ONEAUTO_E4_SERVICE_HISTORY_INGESTION_UNHANDLED',
          jobId: job.id,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      serviceHistoryIngestion = { outcome: 'FAILED' };
    }
    this.logger.log(
      JSON.stringify({
        kind: 'ONEAUTO_E4_FAILED_CALLBACK_RECOVERY',
        jobId: job.id,
        organizationId: job.organizationId,
        vehicleId: job.vehicleId,
        inboxRowId: inbox.id,
        materializationOutcome: materialization.outcome,
        serviceHistoryIngestionOutcome: serviceHistoryIngestion.outcome,
      }),
    );

    return {
      ...base,
      outcome: 'RECOVERED',
      detail: { inboxRowId: inbox.id },
      materialization: { outcome: materialization.outcome, code: materialization.code },
    };
  }
}
