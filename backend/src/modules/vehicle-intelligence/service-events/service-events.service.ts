import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  ServiceEventOrigin,
  ServiceEventType,
  VehicleServiceEvent,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  parsePagination,
  buildPaginatedResult,
  PaginationParams,
  PaginatedResult,
} from '@shared/utils/pagination';
import { ServiceOverdueTaskService } from '../service-compliance/service-overdue-task.service';
import { BatteryGroundTruthBackedSourceGuard } from '../battery-health/ground-truth/ground-truth-backed-source.guard';
import { CreateVehicleServiceEventDto } from './dto/create-vehicle-service-event.dto';
import { UpdateVehicleServiceEventDto } from './dto/update-vehicle-service-event.dto';
import {
  FULL_SERVICE_BASELINE_EVENT_TYPES,
  OIL_CHANGE_EVENT_TYPE,
  SERVICE_HISTORY_EVENT_TYPES,
} from './service-events.constants';
import {
  SERVICE_ACTIONS_PAYLOAD_KEY,
  SERVICE_KIND_PAYLOAD_KEY,
} from '../service-compliance/maintenance-forecast/adapters/service-event-evidence.adapter';
import type { ServiceEventServiceKind } from './dto/create-vehicle-service-event.dto';

export const SERVICE_EVENT_DUPLICATE_CODE = 'SERVICE_EVENT_DUPLICATE';

/**
 * Structured source payload for manual / OCR events — same keys the OneAuto history mapper
 * writes, so history rendering and forecast coverage matching share a single path.
 */
export function buildStructuredServicePayload(input: {
  performedWork?: string[] | null;
  serviceKind?: ServiceEventServiceKind | null;
  existing?: unknown;
}): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  const base: Record<string, unknown> =
    input.existing && typeof input.existing === 'object' && !Array.isArray(input.existing)
      ? { ...(input.existing as Record<string, unknown>) }
      : {};
  if (input.performedWork !== undefined) {
    const items = (input.performedWork ?? []).map((x) => x.trim()).filter(Boolean);
    if (items.length > 0) base[SERVICE_ACTIONS_PAYLOAD_KEY] = Array.from(new Set(items));
    else delete base[SERVICE_ACTIONS_PAYLOAD_KEY];
  }
  if (input.serviceKind !== undefined) {
    if (input.serviceKind) base[SERVICE_KIND_PAYLOAD_KEY] = input.serviceKind;
    else delete base[SERVICE_KIND_PAYLOAD_KEY];
  }
  return Object.keys(base).length > 0 ? (base as Prisma.InputJsonValue) : Prisma.JsonNull;
}

export interface ServiceEventMutationContext {
  userId?: string | null;
  origin?: ServiceEventOrigin;
}

export type CreateServiceEventFromDocumentExtractionInput = {
  organizationId: string;
  vehicleId: string;
  documentExtractionId: string;
  documentActionIdempotencyKey?: string | null;
  eventType: ServiceEventType;
  eventDate: string;
  odometerKm?: number | null;
  workshopName?: string | null;
  notes?: string | null;
  costCents?: number | null;
  documentUrl?: string | null;
  performedWork?: string[] | null;
  serviceKind?: ServiceEventServiceKind | null;
};

export type ApplyComplianceVehicleUpdateInput = {
  organizationId: string;
  vehicleId: string;
  documentExtractionId: string;
  documentActionIdempotencyKey?: string | null;
  documentType: 'TUV_REPORT' | 'BOKRAFT_REPORT';
  lastInspectionDate: Date;
  nextValidUntilDate: Date;
};

export type DocumentExtractionVehicleUpdateResult = {
  applied: boolean;
  skipped: boolean;
  vehicleId: string;
};

function sameUtcCalendarDay(left: Date, right: Date): boolean {
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate()
  );
}

@Injectable()
export class ServiceEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly serviceOverdueTasks: ServiceOverdueTaskService,
    private readonly groundTruthBackedSourceGuard: BatteryGroundTruthBackedSourceGuard,
  ) {}

  async findByVehicle(
    vehicleId: string,
    params?: PaginationParams,
  ): Promise<PaginatedResult<VehicleServiceEvent>> {
    const { skip, take } = parsePagination(params || {});
    const where = { vehicleId };
    const [data, total] = await Promise.all([
      this.prisma.vehicleServiceEvent.findMany({
        where,
        skip,
        take,
        orderBy: { eventDate: 'desc' },
      }),
      this.prisma.vehicleServiceEvent.count({ where }),
    ]);
    return buildPaginatedResult(data, total, params || {});
  }

  async findByDocumentExtractionId(organizationId: string, documentExtractionId: string) {
    return this.prisma.vehicleServiceEvent.findUnique({
      where: {
        organizationId_documentExtractionId: {
          organizationId,
          documentExtractionId,
        },
      },
    });
  }

  async createFromDocumentExtraction(
    input: CreateServiceEventFromDocumentExtractionInput,
  ): Promise<VehicleServiceEvent> {
    if (!input.documentExtractionId) {
      throw new BadRequestException('documentExtractionId is required for extraction apply');
    }
    if (!input.eventDate?.trim()) {
      throw new BadRequestException('eventDate is required for extraction apply — no default date');
    }
    const eventDate = new Date(input.eventDate);
    if (Number.isNaN(eventDate.getTime())) {
      throw new BadRequestException('eventDate is invalid for extraction apply');
    }

    const existing = await this.findByDocumentExtractionId(
      input.organizationId,
      input.documentExtractionId,
    );
    if (existing) {
      return existing;
    }

    try {
      const created = await this.prisma.vehicleServiceEvent.create({
        data: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          documentExtractionId: input.documentExtractionId,
          eventType: input.eventType,
          eventDate,
          odometerKm: input.odometerKm ?? null,
          workshopName: input.workshopName?.trim() || null,
          notes: input.notes?.trim() || null,
          costCents: input.costCents ?? null,
          documentUrl: input.documentUrl ?? null,
          origin: ServiceEventOrigin.AI_UPLOAD,
          sourcePayloadJson: buildStructuredServicePayload({
            performedWork: input.performedWork ?? undefined,
            serviceKind: input.serviceKind ?? undefined,
          }),
        },
      });
      return created;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.findByDocumentExtractionId(
          input.organizationId,
          input.documentExtractionId,
        );
        if (raced) {
          return raced;
        }
      }
      throw error;
    }
  }

  async applyComplianceVehicleUpdateFromExtraction(
    input: ApplyComplianceVehicleUpdateInput,
  ): Promise<DocumentExtractionVehicleUpdateResult> {
    const serviceEvent = await this.findByDocumentExtractionId(
      input.organizationId,
      input.documentExtractionId,
    );
    if (!serviceEvent) {
      throw new BadRequestException({
        message: 'Service event must exist before vehicle compliance update',
        code: 'SERVICE_EVENT_MISSING_FOR_COMPLIANCE_UPDATE',
      });
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: input.vehicleId, organizationId: input.organizationId },
      select: {
        id: true,
        lastTuvDate: true,
        nextTuvDate: true,
        lastBokraftDate: true,
        nextBokraftDate: true,
      },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found in organization');
    }

    const isTuv = input.documentType === 'TUV_REPORT';
    const currentLast = isTuv ? vehicle.lastTuvDate : vehicle.lastBokraftDate;
    const currentNext = isTuv ? vehicle.nextTuvDate : vehicle.nextBokraftDate;
    if (
      currentLast &&
      currentNext &&
      sameUtcCalendarDay(currentLast, input.lastInspectionDate) &&
      sameUtcCalendarDay(currentNext, input.nextValidUntilDate)
    ) {
      return { applied: false, skipped: true, vehicleId: vehicle.id };
    }

    const data = isTuv
      ? {
          lastTuvDate: input.lastInspectionDate,
          nextTuvDate: input.nextValidUntilDate,
        }
      : {
          lastBokraftDate: input.lastInspectionDate,
          nextBokraftDate: input.nextValidUntilDate,
        };

    await this.prisma.vehicle.update({
      where: { id: vehicle.id },
      data,
    });

    return { applied: true, skipped: false, vehicleId: vehicle.id };
  }

  async refreshVehicleServiceHistoryFromExtraction(input: {
    organizationId: string;
    vehicleId: string;
    documentExtractionId: string;
  }): Promise<DocumentExtractionVehicleUpdateResult> {
    const serviceEvent = await this.findByDocumentExtractionId(
      input.organizationId,
      input.documentExtractionId,
    );
    if (!serviceEvent) {
      throw new BadRequestException({
        message: 'Service event must exist before service history refresh',
        code: 'SERVICE_EVENT_MISSING_FOR_HISTORY_REFRESH',
      });
    }

    await this.refreshVehicleHistoryDenorm(input.vehicleId);
    return { applied: true, skipped: false, vehicleId: input.vehicleId };
  }

  async create(
    vehicleId: string,
    dto: CreateVehicleServiceEventDto,
    ctx: ServiceEventMutationContext = {},
  ): Promise<VehicleServiceEvent> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true, organizationId: true },
    });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${vehicleId} not found`);
    }

    const eventDate = new Date(dto.eventDate);
    if (Number.isNaN(eventDate.getTime())) {
      throw new BadRequestException('eventDate is invalid');
    }
    if (!dto.allowDuplicate) {
      await this.assertNoDuplicateManualEvent(vehicleId, dto.eventType, eventDate, dto.odometerKm ?? null);
    }

    const created = await this.prisma.vehicleServiceEvent.create({
      data: {
        vehicleId,
        organizationId: vehicle.organizationId,
        eventType: dto.eventType,
        eventDate,
        odometerKm: dto.odometerKm ?? null,
        notes: dto.notes?.trim() || null,
        workshopName: dto.workshopName?.trim() || null,
        costCents: dto.costCents ?? null,
        provider: dto.provider?.trim() || null,
        documentUrl: dto.documentUrl ?? null,
        origin: ctx.origin ?? dto.origin ?? ServiceEventOrigin.MANUAL,
        createdById: ctx.userId ?? null,
        updatedById: ctx.userId ?? null,
        sourcePayloadJson: buildStructuredServicePayload({
          performedWork: dto.performedWork,
          serviceKind: dto.serviceKind,
        }),
      },
    });

    await this.refreshVehicleHistoryDenorm(vehicleId);
    await this.notifyServiceOverdueAfterHistoryChange(vehicleId, dto.eventType);
    return created;
  }

  async update(
    vehicleId: string,
    id: string,
    dto: UpdateVehicleServiceEventDto,
    ctx: ServiceEventMutationContext = {},
  ): Promise<VehicleServiceEvent> {
    const existing = await this.prisma.vehicleServiceEvent.findFirst({
      where: { id, vehicleId },
    });
    if (!existing) {
      throw new NotFoundException(`Service event ${id} not found for vehicle ${vehicleId}`);
    }

    await this.groundTruthBackedSourceGuard.assertServiceEventMutable(vehicleId, id, 'update', {
      eventType: dto.eventType,
      eventDate: dto.eventDate,
    });

    const data: Record<string, unknown> = {};
    if (dto.eventType !== undefined) data.eventType = dto.eventType;
    if (dto.eventDate !== undefined) data.eventDate = new Date(dto.eventDate);
    if (dto.odometerKm !== undefined) data.odometerKm = dto.odometerKm;
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    if (dto.workshopName !== undefined) data.workshopName = dto.workshopName?.trim() || null;
    if (dto.costCents !== undefined) data.costCents = dto.costCents;
    if (dto.provider !== undefined) data.provider = dto.provider?.trim() || null;
    if (dto.documentUrl !== undefined) data.documentUrl = dto.documentUrl;
    if (dto.origin !== undefined) data.origin = dto.origin;
    if (dto.performedWork !== undefined || dto.serviceKind !== undefined) {
      data.sourcePayloadJson = buildStructuredServicePayload({
        performedWork: dto.performedWork,
        serviceKind: dto.serviceKind,
        existing: existing.sourcePayloadJson,
      });
    }
    if (ctx.userId) data.updatedById = ctx.userId;

    const updated = await this.prisma.vehicleServiceEvent.update({
      where: { id: existing.id },
      data,
    });

    await this.refreshVehicleHistoryDenorm(vehicleId);
    await this.notifyServiceOverdueAfterHistoryChange(vehicleId, updated.eventType);
    return updated;
  }

  async remove(vehicleId: string, id: string): Promise<void> {
    await this.groundTruthBackedSourceGuard.assertServiceEventMutable(vehicleId, id, 'delete');
    const result = await this.prisma.vehicleServiceEvent.deleteMany({
      where: { id, vehicleId },
    });
    if (result.count === 0) {
      throw new NotFoundException(`Service event ${id} not found for vehicle ${vehicleId}`);
    }
    await this.refreshVehicleHistoryDenorm(vehicleId);
  }

  /**
   * Duplicate guard for manual entries: same vehicle + type + UTC calendar day + odometer.
   * Upload idempotency is handled separately via documentExtractionId.
   */
  private async assertNoDuplicateManualEvent(
    vehicleId: string,
    eventType: ServiceEventType,
    eventDate: Date,
    odometerKm: number | null,
  ): Promise<void> {
    const dayStart = new Date(Date.UTC(eventDate.getUTCFullYear(), eventDate.getUTCMonth(), eventDate.getUTCDate()));
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const duplicate = await this.prisma.vehicleServiceEvent.findFirst({
      where: {
        vehicleId,
        eventType,
        eventDate: { gte: dayStart, lt: dayEnd },
        odometerKm,
      },
      select: { id: true, eventDate: true, odometerKm: true, origin: true },
    });
    if (duplicate) {
      throw new ConflictException({
        code: SERVICE_EVENT_DUPLICATE_CODE,
        // Code prefix is intentional: the frontend HTTP layer flattens string messages and drops `code`.
        message: `${SERVICE_EVENT_DUPLICATE_CODE}: a service event of the same type, day and odometer already exists for this vehicle`,
        existingEventId: duplicate.id,
        existingEventDate: duplicate.eventDate.toISOString(),
        existingOrigin: duplicate.origin,
      });
    }
  }

  /**
   * Recomputes denormalized vehicle history fields from events.
   * Never touches next-service intervals, nextServiceDueDate, or HM-derived truth.
   */
  async refreshVehicleHistoryDenorm(vehicleId: string): Promise<void> {
    const [latestFullService, latestOilChange] = await Promise.all([
      this.prisma.vehicleServiceEvent.findFirst({
        where: {
          vehicleId,
          eventType: { in: FULL_SERVICE_BASELINE_EVENT_TYPES },
        },
        orderBy: { eventDate: 'desc' },
        select: { eventDate: true, odometerKm: true },
      }),
      this.prisma.vehicleServiceEvent.findFirst({
        where: { vehicleId, eventType: OIL_CHANGE_EVENT_TYPE },
        orderBy: { eventDate: 'desc' },
        select: { eventDate: true, odometerKm: true },
      }),
    ]);

    await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        lastServiceDate: latestFullService?.eventDate ?? null,
        lastServiceOdometerKm: latestFullService?.odometerKm ?? null,
        lastOilChangeDate: latestOilChange?.eventDate ?? null,
        lastOilChangeOdometerKm: latestOilChange?.odometerKm ?? null,
      },
    });
  }

  /** Count any documented service history row (incl. REPAIR) — not next-service truth. */
  async hasAnyServiceHistory(vehicleId: string): Promise<boolean> {
    const count = await this.prisma.vehicleServiceEvent.count({
      where: {
        vehicleId,
        eventType: { in: SERVICE_HISTORY_EVENT_TYPES },
      },
    });
    return count > 0;
  }

  private async notifyServiceOverdueAfterHistoryChange(
    vehicleId: string,
    eventType: ServiceEventType,
  ): Promise<void> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        id: true,
        organizationId: true,
        make: true,
        model: true,
        licensePlate: true,
        homeStationId: true,
        mileageKm: true,
        lastServiceDate: true,
        lastServiceOdometerKm: true,
        serviceIntervalManufacturerKm: true,
        serviceIntervalManufacturerMonths: true,
      },
    });
    if (!vehicle) return;

    void this.serviceOverdueTasks
      .onServiceHistoryChanged(
        vehicle.organizationId,
        {
          id: vehicle.id,
          make: vehicle.make,
          model: vehicle.model,
          licensePlate: vehicle.licensePlate,
          homeStationId: vehicle.homeStationId,
          mileageKm: vehicle.mileageKm,
          lastServiceDate: vehicle.lastServiceDate,
          lastServiceOdometerKm: vehicle.lastServiceOdometerKm,
          serviceIntervalManufacturerKm: vehicle.serviceIntervalManufacturerKm,
          serviceIntervalManufacturerMonths: vehicle.serviceIntervalManufacturerMonths,
        },
        eventType,
      )
      .catch(() => {});
  }
}
