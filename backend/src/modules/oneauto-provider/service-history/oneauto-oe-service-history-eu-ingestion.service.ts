import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OneAutoOeServiceHistoryEuIngestionEventLinkKind,
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
import {
  buildOneAutoOeServiceHistoryEuJobSourceEventKey,
  buildOneAutoOeServiceHistoryEuVehicleHistoricalEventKey,
} from './oneauto-oe-service-history-eu-event-identity.util';
import { mapOneAutoOeServiceHistoryEuEvent, type OneAutoMappedServiceHistoryEvent } from './oneauto-oe-service-history-eu-event.mapper';
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
  eventsLinked?: number;
  code?: string;
};

type PersistEventResult = 'created' | 'linked' | 'already_linked_for_job';

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

  async tryIngestFromSucceededJob(
    providerJobId: string,
  ): Promise<OneAutoOeServiceHistoryEuIngestionEvidence> {
    try {
      return await this.ingestFromSucceededJobInternal(providerJobId);
    } catch (error) {
      const code = 'ONEAUTO_SERVICE_HISTORY_INGESTION_EXCEPTION';
      this.logger.error(
        JSON.stringify({
          kind: 'ONEAUTO_OE_SERVICE_HISTORY_EU_INGESTION_EXCEPTION',
          providerJobId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      await this.markIngestionFailedSafe(providerJobId, code, 'Unhandled ingestion exception');
      const evidence = {
        outcome: 'FAILED' as const,
        providerJobId,
        code,
      };
      this.emitOperationalEvidence(evidence);
      return evidence;
    }
  }

  private async ingestFromSucceededJobInternal(
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
      const linkCount = await this.prisma.oneAutoOeServiceHistoryEuIngestionEventLink.count({
        where: { providerJobId: job.id },
      });
      const evidence = {
        ...base,
        outcome: 'ALREADY_SUCCEEDED' as const,
        eventsDiscovered: job.oeServiceHistoryEuIngestion.eventsDiscovered,
        eventsIngested: linkCount,
        eventsLinked: linkCount,
      };
      this.emitOperationalEvidence(evidence);
      return evidence;
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: job.vehicleId, organizationId: job.organizationId },
      select: { vin: true },
    });
    if (!vehicle?.vin) {
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

    return this.withProviderJobIngestionLock(providerJobId, async () => {
      const lockedIngestion = await this.prisma.oneAutoOeServiceHistoryEuIngestion.findUnique({
        where: { providerJobId: job.id },
      });
      if (lockedIngestion?.status === OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED) {
        const linkCount = await this.prisma.oneAutoOeServiceHistoryEuIngestionEventLink.count({
          where: { providerJobId: job.id },
        });
        const evidence = {
          ...base,
          outcome: 'ALREADY_SUCCEEDED' as const,
          eventsDiscovered: lockedIngestion.eventsDiscovered,
          eventsIngested: linkCount,
          eventsLinked: linkCount,
        };
        this.emitOperationalEvidence(evidence);
        return evidence;
      }

    if (parsed.kind === 'SUCCESS_EMPTY_HISTORY') {
      const recorded = await this.recordTerminalIngestionAudit(job, {
        discovered: 0,
        persisted: 0,
        sourceResponseId: payload.responseId,
        sourceRetrievedAt: payload.fetchedAt,
        terminalStatus: OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED,
        malformedCount: 0,
      });
      if (recorded === 'already_succeeded') {
        const linkCount = await this.prisma.oneAutoOeServiceHistoryEuIngestionEventLink.count({
          where: { providerJobId: job.id },
        });
        const evidence = {
          ...base,
          outcome: 'ALREADY_SUCCEEDED' as const,
          eventsDiscovered: 0,
          eventsIngested: linkCount,
          eventsLinked: linkCount,
        };
        this.emitOperationalEvidence(evidence);
        return evidence;
      }
      const evidence = {
        ...base,
        outcome: 'SUCCEEDED' as const,
        eventsDiscovered: 0,
        eventsIngested: 0,
      };
      this.emitOperationalEvidence(evidence);
      return evidence;
    }

    const claimed = await this.claimIngestionWork(job, {
      discovered: parsed.serviceEvents.length,
      sourceResponseId: payload.responseId,
      sourceRetrievedAt: payload.fetchedAt,
    });
    if (!claimed) {
      const fresh = await this.prisma.oneAutoOeServiceHistoryEuIngestion.findUnique({
        where: { providerJobId: job.id },
      });
      if (fresh?.status === OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED) {
        const linkCount = await this.prisma.oneAutoOeServiceHistoryEuIngestionEventLink.count({
          where: { providerJobId: job.id },
        });
        const evidence = {
          ...base,
          outcome: 'ALREADY_SUCCEEDED' as const,
          eventsDiscovered: fresh.eventsDiscovered,
          eventsIngested: linkCount,
          eventsLinked: linkCount,
        };
        this.emitOperationalEvidence(evidence);
        return evidence;
      }
    }

    let created = 0;
    let linked = 0;
    let malformedCount = 0;
    const discovered = parsed.serviceEvents.length;

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

      const jobSourceEventKey = buildOneAutoOeServiceHistoryEuJobSourceEventKey({
        providerJobId: job.id,
        event: rawEvent,
        eventIndex: index,
      });
      const vehicleHistoricalEventKey = buildOneAutoOeServiceHistoryEuVehicleHistoricalEventKey({
        normalizedVin: binding.normalizedVin,
        event: rawEvent,
      });

      const existingLink =
        await this.prisma.oneAutoOeServiceHistoryEuIngestionEventLink.findUnique({
          where: {
            providerJobId_jobSourceEventKey: {
              providerJobId: job.id,
              jobSourceEventKey,
            },
          },
        });
      if (existingLink) {
        linked += 1;
        continue;
      }

      const result = await this.persistEvent({
        job,
        mapped: mapped.value,
        rawEvent,
        jobSourceEventKey,
        vehicleHistoricalEventKey,
      });
      if (result === 'created') created += 1;
      else if (result === 'linked' || result === 'already_linked_for_job') linked += 1;
    }

    const persisted = created + linked;
    await this.finalizeIngestion(job, {
      discovered,
      persisted,
      linked,
      malformedCount,
      sourceResponseId: payload.responseId,
      sourceRetrievedAt: payload.fetchedAt,
    });

    const finalStatus = await this.prisma.oneAutoOeServiceHistoryEuIngestion.findUnique({
      where: { providerJobId: job.id },
      select: { status: true },
    });

    const outcome: OneAutoOeServiceHistoryEuIngestionOutcome =
      finalStatus?.status === OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED
        ? 'SUCCEEDED'
        : finalStatus?.status === OneAutoOeServiceHistoryEuIngestionStatus.PARTIAL
          ? 'PARTIAL'
          : 'FAILED';

    const evidence = {
      ...base,
      outcome,
      eventsDiscovered: discovered,
      eventsIngested: persisted,
      eventsLinked: linked,
      code: malformedCount > 0 ? 'ONEAUTO_SERVICE_HISTORY_MALFORMED_EVENTS' : undefined,
    };
    this.emitOperationalEvidence(evidence);
    return evidence;
    });
  }

  private async withProviderJobIngestionLock<T>(
    providerJobId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    await this.prisma.$executeRaw`SELECT pg_advisory_lock(hashtext(${providerJobId}))`;
    try {
      return await fn();
    } finally {
      await this.prisma.$executeRaw`SELECT pg_advisory_unlock(hashtext(${providerJobId}))`;
    }
  }

  private async persistEvent(input: {
    job: { id: string; organizationId: string; vehicleId: string };
    mapped: OneAutoMappedServiceHistoryEvent;
    rawEvent: Record<string, unknown>;
    jobSourceEventKey: string;
    vehicleHistoricalEventKey: string;
  }): Promise<PersistEventResult> {
    const existingVehicleRow = await this.prisma.vehicleServiceEvent.findFirst({
      where: {
        organizationId: input.job.organizationId,
        vehicleId: input.job.vehicleId,
        oneAutoVehicleHistoricalEventKey: input.vehicleHistoricalEventKey,
        origin: ServiceEventOrigin.ONEAUTO,
      },
      select: { id: true },
    });

    if (existingVehicleRow) {
      await this.upsertEventLink({
        organizationId: input.job.organizationId,
        providerJobId: input.job.id,
        vehicleServiceEventId: existingVehicleRow.id,
        jobSourceEventKey: input.jobSourceEventKey,
        linkKind: OneAutoOeServiceHistoryEuIngestionEventLinkKind.LINKED_EXISTING,
      });
      return 'linked';
    }

    try {
      const created = await this.prisma.vehicleServiceEvent.create({
        data: {
          organizationId: input.job.organizationId,
          vehicleId: input.job.vehicleId,
          eventType: input.mapped.eventType,
          eventDate: input.mapped.eventDate,
          odometerKm: input.mapped.odometerKm,
          workshopName: input.mapped.workshopName,
          notes: input.mapped.notes,
          provider: input.mapped.provider,
          origin: ServiceEventOrigin.ONEAUTO,
          oneAutoProviderJobId: input.job.id,
          externalSourceEventKey: input.jobSourceEventKey,
          oneAutoVehicleHistoricalEventKey: input.vehicleHistoricalEventKey,
          sourcePayloadJson: input.rawEvent as Prisma.InputJsonValue,
        },
      });
      await this.upsertEventLink({
        organizationId: input.job.organizationId,
        providerJobId: input.job.id,
        vehicleServiceEventId: created.id,
        jobSourceEventKey: input.jobSourceEventKey,
        linkKind: OneAutoOeServiceHistoryEuIngestionEventLinkKind.CREATED,
      });
      return 'created';
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const racedVehicle = await this.prisma.vehicleServiceEvent.findFirst({
          where: {
            organizationId: input.job.organizationId,
            vehicleId: input.job.vehicleId,
            oneAutoVehicleHistoricalEventKey: input.vehicleHistoricalEventKey,
          },
          select: { id: true },
        });
        const racedJob = await this.prisma.vehicleServiceEvent.findFirst({
          where: {
            organizationId: input.job.organizationId,
            oneAutoProviderJobId: input.job.id,
            externalSourceEventKey: input.jobSourceEventKey,
          },
          select: { id: true },
        });
        const targetId = racedVehicle?.id ?? racedJob?.id;
        if (targetId) {
          await this.upsertEventLink({
            organizationId: input.job.organizationId,
            providerJobId: input.job.id,
            vehicleServiceEventId: targetId,
            jobSourceEventKey: input.jobSourceEventKey,
            linkKind: OneAutoOeServiceHistoryEuIngestionEventLinkKind.LINKED_EXISTING,
          });
          return racedJob ? 'already_linked_for_job' : 'linked';
        }
      }
      throw error;
    }
  }

  private async upsertEventLink(input: {
    organizationId: string;
    providerJobId: string;
    vehicleServiceEventId: string;
    jobSourceEventKey: string;
    linkKind: OneAutoOeServiceHistoryEuIngestionEventLinkKind;
  }): Promise<void> {
    try {
      await this.prisma.oneAutoOeServiceHistoryEuIngestionEventLink.create({
        data: input,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }
      throw error;
    }
  }

  private async claimIngestionWork(
    job: { id: string; organizationId: string; vehicleId: string },
    input: {
      discovered: number;
      sourceResponseId: string;
      sourceRetrievedAt: Date;
    },
  ): Promise<boolean> {
    try {
      await this.prisma.oneAutoOeServiceHistoryEuIngestion.create({
        data: {
          organizationId: job.organizationId,
          vehicleId: job.vehicleId,
          providerJobId: job.id,
          status: OneAutoOeServiceHistoryEuIngestionStatus.PENDING,
          eventsDiscovered: input.discovered,
          eventsIngested: 0,
          sourceResponseId: input.sourceResponseId,
          sourceRetrievedAt: input.sourceRetrievedAt,
        },
      });
      return true;
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      ) {
        throw error;
      }
    }

    const existing = await this.prisma.oneAutoOeServiceHistoryEuIngestion.findUnique({
      where: { providerJobId: job.id },
      select: { status: true },
    });
    if (existing?.status === OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED) {
      return false;
    }

    const claimed = await this.prisma.oneAutoOeServiceHistoryEuIngestion.updateMany({
      where: {
        providerJobId: job.id,
        status: { not: OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED },
      },
      data: {
        status: OneAutoOeServiceHistoryEuIngestionStatus.PENDING,
        eventsDiscovered: input.discovered,
        sourceResponseId: input.sourceResponseId,
        sourceRetrievedAt: input.sourceRetrievedAt,
      },
    });
    if (claimed.count > 0) {
      return true;
    }

    const afterRace = await this.prisma.oneAutoOeServiceHistoryEuIngestion.findUnique({
      where: { providerJobId: job.id },
      select: { status: true },
    });
    return afterRace?.status !== OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED;
  }

  private async recordTerminalIngestionAudit(
    job: { id: string; organizationId: string; vehicleId: string },
    input: {
      discovered: number;
      persisted: number;
      sourceResponseId: string;
      sourceRetrievedAt: Date;
      terminalStatus: OneAutoOeServiceHistoryEuIngestionStatus;
      malformedCount: number;
    },
  ): Promise<'written' | 'already_succeeded'> {
    try {
      await this.prisma.oneAutoOeServiceHistoryEuIngestion.create({
        data: {
          organizationId: job.organizationId,
          vehicleId: job.vehicleId,
          providerJobId: job.id,
          status: input.terminalStatus,
          eventsDiscovered: input.discovered,
          eventsIngested: input.persisted,
          sourceResponseId: input.sourceResponseId,
          sourceRetrievedAt: input.sourceRetrievedAt,
          lastErrorCode:
            input.malformedCount > 0 ? 'ONEAUTO_SERVICE_HISTORY_MALFORMED_EVENTS' : null,
          lastErrorMessageRedacted:
            input.malformedCount > 0
              ? redactOneAutoErrorMessage(`${input.malformedCount} provider event(s) skipped`)
              : null,
        },
      });
      return 'written';
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      ) {
        throw error;
      }
    }

    const updated = await this.prisma.oneAutoOeServiceHistoryEuIngestion.updateMany({
      where: {
        providerJobId: job.id,
        status: { not: OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED },
      },
      data: {
        status: input.terminalStatus,
        eventsDiscovered: input.discovered,
        eventsIngested: input.persisted,
        sourceResponseId: input.sourceResponseId,
        sourceRetrievedAt: input.sourceRetrievedAt,
        lastErrorCode:
          input.malformedCount > 0 ? 'ONEAUTO_SERVICE_HISTORY_MALFORMED_EVENTS' : null,
        lastErrorMessageRedacted:
          input.malformedCount > 0
            ? redactOneAutoErrorMessage(`${input.malformedCount} provider event(s) skipped`)
            : null,
      },
    });
    if (updated.count === 0) {
      return 'already_succeeded';
    }
    return 'written';
  }

  private async finalizeIngestion(
    job: { id: string; organizationId: string; vehicleId: string },
    input: {
      discovered: number;
      persisted: number;
      linked: number;
      malformedCount: number;
      sourceResponseId: string;
      sourceRetrievedAt: Date;
    },
  ): Promise<void> {
    const finalStatus =
      input.discovered === 0
        ? OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED
        : input.persisted === input.discovered
          ? OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED
          : input.persisted > 0
            ? OneAutoOeServiceHistoryEuIngestionStatus.PARTIAL
            : OneAutoOeServiceHistoryEuIngestionStatus.FAILED;

    await this.prisma.oneAutoOeServiceHistoryEuIngestion.updateMany({
      where: {
        providerJobId: job.id,
        status: { not: OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED },
      },
      data: {
        status: finalStatus,
        eventsDiscovered: input.discovered,
        eventsIngested: input.persisted,
        sourceResponseId: input.sourceResponseId,
        sourceRetrievedAt: input.sourceRetrievedAt,
        lastErrorCode:
          input.malformedCount > 0 ? 'ONEAUTO_SERVICE_HISTORY_MALFORMED_EVENTS' : null,
        lastErrorMessageRedacted:
          input.malformedCount > 0
            ? redactOneAutoErrorMessage(`${input.malformedCount} provider event(s) skipped`)
            : null,
      },
    });
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
      update: {},
    });
    await this.prisma.oneAutoOeServiceHistoryEuIngestion.updateMany({
      where: {
        providerJobId: job.id,
        status: { not: OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED },
      },
      data: {
        status: OneAutoOeServiceHistoryEuIngestionStatus.FAILED,
        lastErrorCode: code,
        lastErrorMessageRedacted: redactOneAutoErrorMessage(message),
      },
    });
  }

  private async markIngestionFailedSafe(providerJobId: string, code: string, message: string): Promise<void> {
    const job = await this.prisma.oneAutoProviderJob.findUnique({
      where: { id: providerJobId },
      select: { id: true, organizationId: true, vehicleId: true },
    });
    if (!job) return;
    await this.prisma.oneAutoOeServiceHistoryEuIngestion.updateMany({
      where: {
        providerJobId: job.id,
        status: { not: OneAutoOeServiceHistoryEuIngestionStatus.SUCCEEDED },
      },
      data: {
        status: OneAutoOeServiceHistoryEuIngestionStatus.FAILED,
        lastErrorCode: code,
        lastErrorMessageRedacted: redactOneAutoErrorMessage(message),
      },
    });
  }
}
