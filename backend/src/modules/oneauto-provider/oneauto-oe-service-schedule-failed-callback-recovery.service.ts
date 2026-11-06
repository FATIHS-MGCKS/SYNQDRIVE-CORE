import { Injectable, Logger } from '@nestjs/common';
import { OneAutoProviderJobStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { getVerifiedOneAutoContract } from './catalog/oneauto-verified-contracts';
import {
  ONEAUTO_CALLBACK_PROVIDER_OUTCOME_CODES,
  evaluateOneAutoFullDataCallbackPayload,
} from './oneauto-callback-full-data.util';
import { persistFullDataCallbackSuccessInTransaction } from './oneauto-e4-full-data-callback-completion.util';
import {
  ONEAUTO_E4_CALLBACK_RECOVERY_CALLBACK_RESPONSE_PHASE,
  ONEAUTO_E4_CALLBACK_RECOVERY_AUDIT_RESPONSE_PHASE,
} from './oneauto-e4-failed-callback-recovery.constants';
import { resolveOneAutoOeServiceScheduleCallbackRecoveryAuthorization } from './oneauto-oe-service-schedule-failed-callback-recovery.constants';
import { ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU } from './service-schedule/oneauto-service-schedule-eu.types';
import { parseOeServiceScheduleEuProviderResult } from './service-schedule/oneauto-oe-service-schedule-eu-provider.util';

export type OneAutoOeServiceScheduleFailedCallbackRecoveryOutcome =
  | 'AUTHORIZATION_DENIED'
  | 'JOB_NOT_FOUND'
  | 'ALREADY_RECOVERED'
  | 'PRECONDITION_FAILED'
  | 'RETENTION_EXPIRED'
  | 'INBOX_MISSING'
  | 'INBOX_AMBIGUOUS'
  | 'PAYLOAD_REJECTED'
  | 'DRY_RUN_OK'
  | 'BLOCKED'
  | 'RECOVERED';

export type OneAutoOeServiceScheduleFailedCallbackRecoveryResult = {
  outcome: OneAutoOeServiceScheduleFailedCallbackRecoveryOutcome;
  jobId: string;
  providerHttpRequestCount: 0;
  dryRun: boolean;
  detail?: Record<string, unknown>;
};

export type OneAutoOeServiceScheduleFailedCallbackRecoveryInput = {
  jobId: string;
  organizationId: string;
  vehicleId: string;
  expectedVin: string;
  expectedServiceSku: string;
  expectedLastErrorCode: string;
  expectedNormalServicesCount?: number;
  expectedExtraServicesCount?: number;
  dryRun?: boolean;
  requireProductionAuthorization?: boolean;
  now?: Date;
  /** Fixed clock inside the mutating transaction (tests only; defaults to `new Date()`). */
  recoveryTransactionNow?: Date;
};

/**
 * Replays a persisted full-data callback from `one_auto_provider_callback_inbox` for a FAILED
 * `OE_SERVICE_SCHEDULE` job. Never calls the One Auto provider. Does not enqueue BullMQ or touch
 * Service History / OEM snapshot writers.
 */
@Injectable()
export class OneAutoOeServiceScheduleFailedCallbackRecoveryService {
  private readonly logger = new Logger(OneAutoOeServiceScheduleFailedCallbackRecoveryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recoverFailedScheduleCallbackJob(
    input: OneAutoOeServiceScheduleFailedCallbackRecoveryInput,
  ): Promise<OneAutoOeServiceScheduleFailedCallbackRecoveryResult> {
    const dryRun = input.dryRun !== false;
    const now = input.now ?? new Date();
    const base = { jobId: input.jobId.trim(), providerHttpRequestCount: 0 as const, dryRun };

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

    if (job.serviceSku !== input.expectedServiceSku.trim()) {
      return {
        ...base,
        outcome: 'PRECONDITION_FAILED',
        detail: { reason: 'service_sku_mismatch', expected: input.expectedServiceSku, actual: job.serviceSku },
      };
    }

    if (job.serviceSku !== ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU) {
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
        outcome: 'BLOCKED',
        detail: { reason: 'callback_full_data_mode_not_active_in_registry' },
      };
    }

    if (job.status === OneAutoProviderJobStatus.SUCCEEDED) {
      const callbackResponses = await this.prisma.oneAutoProviderResponse.count({
        where: { jobId: job.id, responsePhase: ONEAUTO_E4_CALLBACK_RECOVERY_CALLBACK_RESPONSE_PHASE },
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

    if (job.vinSnapshot.trim() !== input.expectedVin.trim()) {
      return {
        ...base,
        outcome: 'PRECONDITION_FAILED',
        detail: { reason: 'vin_snapshot_mismatch', expected: input.expectedVin, actual: job.vinSnapshot },
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
    if (inboxRows.length > 1) {
      return {
        ...base,
        outcome: 'INBOX_AMBIGUOUS',
        detail: { count: inboxRows.length },
      };
    }

    const inbox = inboxRows[0];

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: job.vehicleId, organizationId: job.organizationId },
      select: { vin: true },
    });
    if (!vehicle) {
      return { ...base, outcome: 'PRECONDITION_FAILED', detail: { reason: 'vehicle_binding_missing' } };
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
          outcome: 'BLOCKED',
          detail: { reason: 'provider_outcome_not_recoverable', code, diagnostic: evaluation.diagnostic },
        };
      }
      return {
        ...base,
        outcome: 'PAYLOAD_REJECTED',
        detail: { reason: 'payload_evaluation_failed', code, diagnostic: evaluation.diagnostic },
      };
    }

    const parsed = parseOeServiceScheduleEuProviderResult(evaluation.result);
    if (parsed.kind === 'INVALID_SHAPE') {
      return {
        ...base,
        outcome: 'BLOCKED',
        detail: { reason: 'schedule_parse_invalid', parseReason: parsed.reason },
      };
    }

    const normalCount =
      parsed.kind === 'SUCCESS_WITH_SERVICES' ? parsed.normalServices.length : 0;
    const extraCount = parsed.kind === 'SUCCESS_WITH_SERVICES' ? parsed.extraServices.length : 0;

    if (input.expectedNormalServicesCount != null && normalCount !== input.expectedNormalServicesCount) {
      return {
        ...base,
        outcome: 'BLOCKED',
        detail: {
          reason: 'normal_services_count_mismatch',
          expected: input.expectedNormalServicesCount,
          actual: normalCount,
        },
      };
    }
    if (input.expectedExtraServicesCount != null && extraCount !== input.expectedExtraServicesCount) {
      return {
        ...base,
        outcome: 'BLOCKED',
        detail: {
          reason: 'extra_services_count_mismatch',
          expected: input.expectedExtraServicesCount,
          actual: extraCount,
        },
      };
    }

    const existingCallback = await this.prisma.oneAutoProviderResponse.count({
      where: { jobId: job.id, responsePhase: ONEAUTO_E4_CALLBACK_RECOVERY_CALLBACK_RESPONSE_PHASE },
    });
    if (existingCallback > 0) {
      return { ...base, outcome: 'ALREADY_RECOVERED' };
    }

    if (!dryRun && input.requireProductionAuthorization !== false) {
      const auth = resolveOneAutoOeServiceScheduleCallbackRecoveryAuthorization();
      if (!auth.authorized) {
        return { ...base, outcome: 'AUTHORIZATION_DENIED', detail: { reasons: auth.reasons } };
      }
    }

    if (dryRun) {
      return {
        ...base,
        outcome: 'DRY_RUN_OK',
        detail: {
          inboxRowId: inbox.id,
          inboxReceivedAt: inbox.receivedAt.toISOString(),
          wrapperStatus: evaluation.wrapperStatus,
          normalServicesCount: normalCount,
          extraServicesCount: extraCount,
          vehicleIdentificationNumber: parsed.vehicleIdentificationNumber,
        },
      };
    }

    const recoveredAt = now;
    const expectedError = input.expectedLastErrorCode.trim();

    const transitioned = await this.prisma.$transaction(async (tx) => {
      const txNow = input.recoveryTransactionNow ?? new Date();
      const dupCallback = await tx.oneAutoProviderResponse.count({
        where: { jobId: job.id, responsePhase: ONEAUTO_E4_CALLBACK_RECOVERY_CALLBACK_RESPONSE_PHASE },
      });
      if (dupCallback > 0) {
        return 'already_has_callback' as const;
      }

      const jobInTx = await tx.oneAutoProviderJob.findFirst({
        where: {
          id: job.id,
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          status: OneAutoProviderJobStatus.FAILED,
          lastErrorCode: expectedError,
          serviceSku: ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU,
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
        (jobInTx.providerResultExpiresAt && jobInTx.providerResultExpiresAt <= txNow) ||
        (jobInTx.expiresAt && jobInTx.expiresAt <= txNow);
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

    this.logger.log(
      JSON.stringify({
        kind: 'ONEAUTO_OE_SERVICE_SCHEDULE_FAILED_CALLBACK_RECOVERY',
        jobId: job.id,
        organizationId: job.organizationId,
        vehicleId: job.vehicleId,
        inboxRowId: inbox.id,
      }),
    );

    return {
      ...base,
      outcome: 'RECOVERED',
      detail: { inboxRowId: inbox.id, normalServicesCount: normalCount, extraServicesCount: extraCount },
    };
  }
}
