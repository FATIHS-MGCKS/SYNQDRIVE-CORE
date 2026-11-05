import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OneAutoOeServiceHistoryEuIngestionStatus,
  OneAutoProviderJobStatus,
  Prisma,
  ServiceEventOrigin,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { redactOneAutoErrorMessage } from '../oneauto-provider-redact.util';
import {
  assertOeServiceHistoryEuJobBinding,
  parseOeServiceHistoryEuProviderResult,
} from './oneauto-service-history-eu-provider.util';
import { ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU } from './oneauto-service-history-eu.types';
import { buildOneAutoOeServiceHistoryEuSourceEventKey } from './oneauto-oe-service-history-eu-event-identity.util';
import { mapOneAutoOeServiceHistoryEuEvent } from './oneauto-oe-service-history-eu-event.mapper';
import { pickPersistedOeServiceHistoryEuSuccessPayload } from './oneauto-oe-service-history-eu-response.util';

export type OneAutoOeServiceHistoryEuIngestionOutcome =
  | 'DISABLED'
  | 'SKIPPED_JOB_STATE'
  | 'SKIPPED_BINDING'
  | 'SKIPPED_RESPONSE'
  | 'SKIPPED_EMPTY'
  | 'ALREADY_SUCCEEDED'
  | 'SUCCEEDED'
  | 'PARTIAL'
  | 'FAILED';

export type OneAutoOeServiceHistoryEuIngestionEvidence = {
  outcome: OneAutoOeServiceHistoryEuIngestionOutcome;
  providerJobId: string;
  eventsDiscovered?: number;
  eventsIngested?: number;
  code?: string;
};

@Injectable()
export class OneAutoOeServiceHistoryEuIngestionService {
  private readonly logger = new Logger(OneAutoOeServiceHistoryEuIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private ingestionEnabled(): boolean {
    const cfg = this.config.get<{ oeServiceHistoryIngestionEnabled?: boolean }>('oneautoProvider');
    return cfg?.oeServiceHistoryIngestionEnabled === true;
  }

  emitOperationalEvidence(evidence: OneAutoOeServiceHistoryEuIngestionEvidence): void {
    this.logger.log(
      JSON.stringify({
        kind: 'ONEAUTO_OE_SERVICE_HISTORY_EU_INGESTION',
        ...evidence,
      }),
    );
  }

  /**
   * Idempotent ingestion from persisted provider responses only — never provider HTTP.
   * Does not mutate manual service history rows or HM/OEM next-service fields.
   */
  async tryIngestFromSucceededJob(
    providerJobId: string,
  ): Promise<OneAutoOeServiceHistoryEuIngestionEvidence> {
    const base = { providerJobId };
    if (!this.ingestionEnabled()) {
      const evidence = { ...base, outcome: 'DISABLED' as const };
      this.emitOperationalEvidence(evidence);
      return evidence;
    }

    const job = await this.prisma.oneAutoProviderJob.findUnique({
      where: { id: providerJobId },
      include: {
        responses: { orderBy: { fetchedAt: 'desc' }, take: 12 },
        oeServiceHistoryEuIngestion: true,
      },
    });

    if (!job) {
      const evidence = { ...base, outcome: 'SKIPPED_JOB_STATE' as const, code: 'JOB_NOT_FOUND' };
      this.emitOperationalEvidence(evidence);
      return evidence;
    }

    if (job.serviceSku !== ONEAUTO_OE_SERVICE_HISTORY_EU_SERVICE_SKU) {
      const evidence = { ...base, outcome: 'SKIPPED_BINDING' as const, code: 'SKU_MISMATCH' };
      this.emitOperationalEvidence(evidence);
      return evidence;
    }

    if (job.status !== OneAutoProviderJobStatus.SUCCEEDED) {
      const evidence = {
        ...base,
        outcome: 'SKIPPED_JOB_STATE' as const,
        code: `JOB_STATUS_${job.status}`,
      };
      this.emitOperationalEvidence(evidence);
      return evidence;
    }

    if (job.oeServiceHistoryEuIngestion?.status === OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED) {
      const evidence = {
        ...base,
        outcome: 'ALREADY_SUCCEEDED' as const,
        eventsDiscovered: job.oeServiceHistoryEuIngestion.eventsDiscovered,
        eventsIngested: job.oeServiceHistoryEuIngestion.eventsIngested,
      };
      this.emitOperationalEvidence(evidence);
      return evidence;
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: job.vehicleId, organizationId: job.organizationId },
      select: { vin: true },
    });
    if (!vehicle) {
      const evidence = {
        ...base,
        outcome: 'SKIPPED_BINDING' as const,
        code: 'ONEAUTO_SERVICE_HISTORY_ORG_VEHICLE_MISMATCH',
      };
      await this.markIngestionFailed(job, evidence.code, 'Vehicle binding missing');
      this.emitOperationalEvidence(evidence);
      return evidence;
    }

    const payload = pickPersistedOeServiceHistoryEuSuccessPayload(job.responses);
    if (!payload) {
      const evidence = { ...base, outcome: 'SKIPPED_RESPONSE' as const, code: 'NO_SUCCESS_RESPONSE' };
      await this.markIngestionFailed(job, evidence.code, 'No persisted success response');
      this.emitOperationalEvidence(evidence);
      return evidence;
    }

    const binding = assertOeServiceHistoryEuJobBinding({
      serviceSku: job.serviceSku,
      jobVinSnapshot: job.vinSnapshot,
      vehicleVin: vehicle.vin,
      providerResponseBody: {
        success: true,
        result: payload.providerResult,
      },
    });
    if (!binding.ok) {
      const evidence = { ...base, outcome: 'SKIPPED_BINDING' as const, code: binding.code };
      await this.markIngestionFailed(job, binding.code, 'VIN binding rejected for ingestion');
      this.emitOperationalEvidence(evidence);
      return evidence;
    }

    const parsed = parseOeServiceHistoryEuProviderResult(payload.providerResult);
    if (parsed.kind === 'INVALID_SHAPE') {
      const evidence = {
        ...base,
        outcome: 'FAILED' as const,
        code: `INVALID_SHAPE_${parsed.reason}`,
      };
      await this.markIngestionFailed(job, evidence.code!, 'Malformed provider service history payload');
      this.emitOperationalEvidence(evidence);
      return evidence;
    }

    if (parsed.kind === 'SUCCESS_EMPTY_HISTORY') {
      await this.prisma.oneAutoOeServiceHistoryEuIngestion.upsert({
        where: { providerJobId: job.id },
        create: {
          organizationId: job.organizationId,
          vehicleId: job.vehicleId,
          providerJobId: job.id,
          status: OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED,
          eventsDiscovered: 0,
          eventsIngested: 0,
          sourceResponseId: payload.responseId,
          sourceRetrievedAt: payload.fetchedAt,
        },
        update: {
          status: OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED,
          eventsDiscovered: 0,
          eventsIngested: 0,
          sourceResponseId: payload.responseId,
          sourceRetrievedAt: payload.fetchedAt,
          lastErrorCode: null,
          lastErrorMessageRedacted: null,
        },
      });
      const evidence = { ...base, outcome: 'SKIPPED_EMPTY' as const, eventsDiscovered: 0, eventsIngested: 0 };
      this.emitOperationalEvidence(evidence);
      return evidence;
    }

    let eventsIngested = 0;
    let malformedCount = 0;
    const discovered = parsed.serviceEvents.length;

    await this.prisma.oneAutoOeServiceHistoryEuIngestion.upsert({
      where: { providerJobId: job.id },
      create: {
        organizationId: job.organizationId,
        vehicleId: job.vehicleId,
        providerJobId: job.id,
        status: OneAutoOeServiceHistoryEuIngestionStatus.PENDING,
        eventsDiscovered: discovered,
        eventsIngested: 0,
        sourceResponseId: payload.responseId,
        sourceRetrievedAt: payload.fetchedAt,
      },
      update: {
        status: OneAutoOeServiceHistoryEuIngestionStatus.PENDING,
        eventsDiscovered: discovered,
        sourceResponseId: payload.responseId,
        sourceRetrievedAt: payload.fetchedAt,
      },
    });

    for (let index = 0; index < parsed.serviceEvents.length; index += 1) {
      const rawEvent = parsed.serviceEvents[index]!;
      const mapped = mapOneAutoOeServiceHistoryEuEvent(rawEvent);
      if (!mapped.ok) {
        malformedCount += 1;
        this.logger.warn(
          JSON.stringify({
            kind: 'ONEAUTO_OE_SERVICE_HISTORY_EU_EVENT_SKIPPED',
            providerJobId: job.id,
            index,
            reason: mapped.reason,
          }),
        );
        continue;
      }

      const sourceEventKey = buildOneAutoOeServiceHistoryEuSourceEventKey({
        providerJobId: job.id,
        event: rawEvent,
        eventIndex: index,
      });

      try {
        await this.prisma.vehicleServiceEvent.create({
          data: {
            organizationId: job.organizationId,
            vehicleId: job.vehicleId,
            eventType: mapped.value.eventType,
            eventDate: mapped.value.eventDate,
            odometerKm: mapped.value.odometerKm,
            workshopName: mapped.value.workshopName,
            notes: mapped.value.notes,
            provider: mapped.value.provider,
            origin: ServiceEventOrigin.ONEAUTO,
            oneAutoProviderJobId: job.id,
            externalSourceEventKey: sourceEventKey,
            sourcePayloadJson: rawEvent as Prisma.InputJsonValue,
          },
        });
        eventsIngested += 1;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }
        throw error;
      }
    }

    const finalStatus =
      eventsIngested === discovered
        ? OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED
        : eventsIngested > 0
          ? OneAutoOeServiceHistoryEuIngestionStatus.PARTIAL
          : OneAutoOeServiceHistoryEuIngestionStatus.FAILED;

    await this.prisma.oneAutoOeServiceHistoryEuIngestion.update({
      where: { providerJobId: job.id },
      data: {
        status: finalStatus,
        eventsDiscovered: discovered,
        eventsIngested,
        lastErrorCode:
          malformedCount > 0 ? 'ONEAUTO_SERVICE_HISTORY_MALFORMED_EVENTS' : null,
        lastErrorMessageRedacted:
          malformedCount > 0
            ? redactOneAutoErrorMessage(`${malformedCount} provider event(s) skipped`)
            : null,
      },
    });

    const outcome: OneAutoOeServiceHistoryEuIngestionOutcome =
      finalStatus === OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED
        ? 'SUCCEEDED'
        : finalStatus === OneAutoOeServiceHistoryEuIngestionStatus.PARTIAL
          ? 'PARTIAL'
          : 'FAILED';

    const evidence = {
      ...base,
      outcome,
      eventsDiscovered: discovered,
      eventsIngested,
      code: malformedCount > 0 ? 'ONEAUTO_SERVICE_HISTORY_MALFORMED_EVENTS' : undefined,
    };
    this.emitOperationalEvidence(evidence);
    return evidence;
  }

  private async markIngestionFailed(
    job: { id: string; organizationId: string; vehicleId: string },
    code: string,
    message: string,
  ): Promise<void> {
    await this.prisma.oneAutoOeServiceHistoryEuIngestion.upsert({
      where: { providerJobId: job.id },
      create: {
        organizationId: job.organizationId,
        vehicleId: job.vehicleId,
        providerJobId: job.id,
        status: OneAutoOeServiceHistoryEuIngestionStatus.FAILED,
        lastErrorCode: code,
        lastErrorMessageRedacted: redactOneAutoErrorMessage(message),
      },
      update: {
        status: OneAutoOeServiceHistoryEuIngestionStatus.FAILED,
        lastErrorCode: code,
        lastErrorMessageRedacted: redactOneAutoErrorMessage(message),
      },
    });
  }
}
