import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DimoConnectionStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildPaginatedResult,
  parsePagination,
} from '@shared/utils/pagination';
import { PlatformAdminService } from '@modules/platform-admin/platform-admin.service';
import { PlatformConnectivitySummaryService } from '@modules/platform-admin/platform-dashboard.service';
import { VehiclesService } from './vehicles.service';
import {
  attentionDrilldownSection,
  attentionReasonLabel,
  buildVehicleAttention,
  computeDisplayTitle,
  deriveIntegrityState,
  buildOperationalDimoAccessContext,
  deriveIntegrationConnectivity,
  isSynqDriveDimoDataAccessBlocked,
  mapProviderMirrorConnectionStatus,
  maskTokenId,
} from './vehicle-attention.util';
import {
  resolveTelemetryFreshness,
  type TelemetryTimestampEvidence,
} from './telemetry-freshness.resolver';
import type { TelemetryFreshness } from './vehicle-state-interpreter';
import type {
  VehicleAttentionQueueItemDto,
  VehicleImportPreflightDto,
  VehicleOperationalDetailDto,
  VehicleOperationalRowDto,
  VehiclesOperationalOverviewDto,
  VehiclesOperationalQueryDto,
} from './vehicles-operational.types';
import {
  buildRegisteredListQueryForOverviewSampling,
  buildRegisteredOperationalWhere,
} from './vehicles-operational-query.util';

const TELEMETRY_LABELS: Record<TelemetryFreshness, string> = {
  live: 'Live',
  standby: 'Standby',
  signal_delayed: 'Signal verzögert',
  offline: 'Offline',
  no_signal: 'Kein Signal',
};

const INTEGRATION_LABELS: Record<string, string> = {
  connected: 'Verbunden',
  disconnected: 'Getrennt',
  error: 'Fehler',
  none: 'Keine Verknüpfung',
};

const POLL_STALE_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class VehiclesOperationalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAdmin: PlatformAdminService,
    private readonly connectivitySummary: PlatformConnectivitySummaryService,
    private readonly vehiclesService: VehiclesService,
  ) {}

  async findAllOperational(query: VehiclesOperationalQueryDto) {
    const { skip, take } = parsePagination(query);
    const now = Date.now();
    const platformCtx = await this.loadPlatformDimoContext();

    const registrationState = query.registrationState ?? 'registered';

    if (registrationState === 'unregistered') {
      return this.findUnregisteredOperational(query, skip, take, now, platformCtx);
    }

    return this.findRegisteredOperational(query, skip, take, now, platformCtx);
  }

  async getOperationalDetail(vehicleId: string): Promise<VehicleOperationalDetailDto> {
    const now = Date.now();
    const platformCtx = await this.loadPlatformDimoContext();

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: {
        organization: { select: { id: true, companyName: true } },
        dimoVehicle: true,
        latestState: { select: { lastSeenAt: true, updatedAt: true } },
      },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const [pollLog, auditEvents, connectivityDetail] = await Promise.all([
      this.loadLatestPollLog(vehicle.id),
      this.loadAuditEvents(vehicle.id, vehicle.organizationId),
      this.vehiclesService
        .getFleetConnectivityDetail(vehicle.organizationId, vehicle.id)
        .catch(() => null),
    ]);

    const row = this.composeRegisteredRow(
      vehicle,
      now,
      platformCtx,
      pollLog,
      connectivityDetail?.providerLinkState ?? null,
    );

    const moduleErrors: string[] = [];
    if (!connectivityDetail) {
      moduleErrors.push('connectivity_detail');
    }

    const raw = (vehicle.dimoVehicle?.rawJson ?? {}) as Record<string, unknown>;
    const aftermarket = raw?.aftermarketDevice as { serial?: string } | undefined;
    const synthetic = raw?.syntheticDevice as { tokenId?: number } | undefined;
    const deviceType = aftermarket?.serial
      ? 'Aftermarket'
      : synthetic?.tokenId != null
        ? 'Synthetic'
        : vehicle.dimoVehicle
          ? 'DIMO'
          : null;

    return {
      ...row,
      pipeline: {
        lastSuccessfulIngestAt: pollLog?.lastSuccessAt ?? row.telemetryObservedAtIso,
        lastPollStatus: pollLog?.lastStatus ?? null,
        lastPollAt: pollLog?.lastAt ?? null,
        lastProcessingAt: vehicle.latestState?.updatedAt?.toISOString() ?? null,
        stale:
          pollLog?.lastAt != null
            ? now - Date.parse(pollLog.lastAt) > POLL_STALE_MS
            : false,
      },
      mapping: {
        dimoVehicleId: vehicle.dimoVehicleId,
        dimoExternalId: vehicle.dimoVehicle?.externalId ?? null,
        tokenIdMasked: maskTokenId(vehicle.dimoVehicle?.tokenId ?? null),
        connectionStatus: vehicle.dimoVehicle?.connectionStatus ?? null,
        mirrorIntegrationConnectivity: mapProviderMirrorConnectionStatus(
          vehicle.dimoVehicleId,
          vehicle.dimoVehicle?.connectionStatus,
        ),
        mirrorIntegrationConnectivityLabel:
          INTEGRATION_LABELS[
            mapProviderMirrorConnectionStatus(
              vehicle.dimoVehicleId,
              vehicle.dimoVehicle?.connectionStatus,
            )
          ],
        syncedAt: vehicle.dimoVehicle?.syncedAt?.toISOString() ?? null,
        deviceType,
      },
      authorization: {
        state: row.integrationConnectivity,
        platformDimoDegraded: platformCtx.degraded,
        note: platformCtx.message,
      },
      activeIssues: buildVehicleAttention({
        vehicleId: vehicle.id,
        dimoVehicleId: vehicle.dimoVehicleId,
        registrationState: 'registered',
        ownership: 'assigned',
        integrationConnectivity: row.integrationConnectivity,
        telemetryFreshness: row.telemetryFreshness,
        telemetryAgeMs: row.telemetryObservedAtIso
          ? now - Date.parse(row.telemetryObservedAtIso)
          : null,
        platformDimoDegraded: platformCtx.degraded,
        lastPollStatus: pollLog?.lastStatus ?? null,
        lastPollAt: pollLog?.lastAt ?? null,
        mappingConflict: row.dimoLinkStatus === 'conflict',
        synqDriveDimoDataAccessActive: !isSynqDriveDimoDataAccessBlocked(
          buildOperationalDimoAccessContext(
            vehicle.registryLifecycle ?? 'ACTIVE',
            connectivityDetail?.providerLinkState ?? null,
          ),
        ),
      }).reasons,
      auditEvents,
      moduleErrors,
    };
  }

  async getUnregisteredDetail(dimoVehicleId: string): Promise<VehicleOperationalDetailDto> {
    const now = Date.now();
    const platformCtx = await this.loadPlatformDimoContext();
    const dv = await this.prisma.dimoVehicle.findUnique({
      where: { id: dimoVehicleId },
      include: { registeredVehicles: { select: { id: true, organizationId: true, organization: { select: { companyName: true } } } } },
    });
    if (!dv) throw new NotFoundException('DIMO vehicle not found');

    const row = this.composeUnregisteredRow(dv, now, platformCtx);
    return {
      ...row,
      pipeline: {
        lastSuccessfulIngestAt: dv.syncedAt?.toISOString() ?? dv.lastSignal?.toISOString() ?? null,
        lastPollStatus: null,
        lastPollAt: null,
        lastProcessingAt: dv.syncedAt?.toISOString() ?? null,
        stale: false,
      },
      mapping: {
        dimoVehicleId: dv.id,
        dimoExternalId: dv.externalId,
        tokenIdMasked: maskTokenId(dv.tokenId),
        connectionStatus: dv.connectionStatus,
        syncedAt: dv.syncedAt?.toISOString() ?? null,
        deviceType: 'DIMO',
      },
      authorization: {
        state: row.integrationConnectivity,
        platformDimoDegraded: platformCtx.degraded,
        note: platformCtx.message,
      },
      activeIssues: buildVehicleAttention({
        vehicleId: null,
        dimoVehicleId: dv.id,
        registrationState: 'unregistered',
        ownership: dv.registeredVehicles.length > 1 ? 'conflict' : 'unassigned',
        integrationConnectivity: row.integrationConnectivity,
        telemetryFreshness: row.telemetryFreshness,
        telemetryAgeMs: row.telemetryObservedAtIso
          ? now - Date.parse(row.telemetryObservedAtIso)
          : null,
        platformDimoDegraded: platformCtx.degraded,
        lastPollStatus: null,
        lastPollAt: null,
        mappingConflict: dv.registeredVehicles.length > 1,
      }).reasons,
      auditEvents: [],
      moduleErrors: [],
    };
  }

  async getOverview(query?: {
    organizationId?: string;
  }): Promise<VehiclesOperationalOverviewDto> {
    const activeListWhere = buildRegisteredOperationalWhere({
      registrationState: 'registered',
      registryLifecycle: 'ACTIVE',
      organizationId: query?.organizationId,
    });
    const orgScope = query?.organizationId ? { organizationId: query.organizationId } : {};

    const [
      registeredActive,
      registeredOffboarded,
      registeredArchived,
      registeredAll,
      unregisteredCount,
      dimoLinkedActive,
      activeFleetFreshness,
    ] = await Promise.all([
      this.prisma.vehicle.count({ where: activeListWhere }),
      this.prisma.vehicle.count({
        where: { registryLifecycle: 'OFFBOARDED', ...orgScope },
      }),
      this.prisma.vehicle.count({
        where: { registryLifecycle: 'ARCHIVED', ...orgScope },
      }),
      this.prisma.vehicle.count({ where: { ...orgScope } }),
      this.prisma.dimoVehicle.count({
        where: { registeredVehicles: { none: {} } },
      }),
      this.prisma.vehicle.count({
        where: {
          ...activeListWhere,
          dimoVehicleId: { not: null },
        },
      }),
      this.computeActiveRegisteredFleetFreshness(activeListWhere),
    ]);

    const platformCtx = await this.loadPlatformDimoContext();
    const sampleRows = await this.findAllOperational(
      buildRegisteredListQueryForOverviewSampling(query?.organizationId),
    );
    const rows = sampleRows.data as VehicleOperationalRowDto[];

    let withAttention = 0;
    for (const row of rows) {
      if (row.attention.severity !== 'none') withAttention += 1;
    }

    const attentionQueue = this.buildAttentionQueue(rows, platformCtx.degraded);

    return {
      generatedAt: new Date().toISOString(),
      platformDimoDegraded: platformCtx.degraded,
      platformDimoMessage: platformCtx.message,
      counts: {
        registered: registeredActive,
        registeredOffboarded,
        registeredArchived,
        registeredAll,
        unregistered: unregisteredCount,
        withAttention,
        dimoLinked: dimoLinkedActive,
      },
      freshness: activeFleetFreshness,
      attentionQueue,
    };
  }

  /** Operational overview freshness — ACTIVE registered cohort only (matches fleet count). */
  private async computeActiveRegisteredFleetFreshness(
    where: Prisma.VehicleWhereInput,
  ): Promise<VehiclesOperationalOverviewDto['freshness']> {
    const now = Date.now();
    const vehicles = await this.prisma.vehicle.findMany({
      where,
      select: {
        latestState: { select: { lastSeenAt: true, updatedAt: true } },
        dimoVehicle: { select: { lastSignal: true } },
      },
    });

    const freshness: VehiclesOperationalOverviewDto['freshness'] = {
      live: 0,
      standby: 0,
      signal_delayed: 0,
      offline: 0,
      no_signal: 0,
    };

    for (const vehicle of vehicles) {
      const resolved = resolveTelemetryFreshness(
        {
          lastSignal: vehicle.dimoVehicle?.lastSignal ?? null,
          latestStateUpdatedAt:
            vehicle.latestState?.lastSeenAt ?? vehicle.latestState?.updatedAt ?? null,
        },
        now,
      );
      freshness[resolved.freshness] += 1;
    }

    return freshness;
  }

  async getAttentionQueue(limit = 8): Promise<VehicleAttentionQueueItemDto[]> {
    const platformCtx = await this.loadPlatformDimoContext();
    const res = await this.findAllOperational({
      ...buildRegisteredListQueryForOverviewSampling(),
      attention: 'true',
    });
    return this.buildAttentionQueue(res.data as VehicleOperationalRowDto[], platformCtx.degraded).slice(
      0,
      limit,
    );
  }

  async importPreflight(
    organizationId: string,
    dimoVehicleId: string,
  ): Promise<VehicleImportPreflightDto> {
    const [org, dimoVehicle, existing] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, companyName: true },
      }),
      this.prisma.dimoVehicle.findUnique({ where: { id: dimoVehicleId } }),
      this.prisma.vehicle.findFirst({
        where: { dimoVehicleId },
        select: {
          id: true,
          organizationId: true,
          organization: { select: { companyName: true } },
        },
      }),
    ]);

    if (!org) throw new NotFoundException('Organization not found');
    if (!dimoVehicle) throw new NotFoundException('DIMO vehicle not found');

    const conflict = existing
      ? {
          code: 'DIMO_VEHICLE_ALREADY_REGISTERED',
          message: 'Dieses DIMO-Fahrzeug ist bereits einer Organisation zugeordnet.',
          existingVehicleId: existing.id,
          existingOrganizationId: existing.organizationId,
          existingOrganizationName: existing.organization.companyName,
        }
      : null;

    const effects = [
      'Es wird ein SynqDrive-Fahrzeug in der gewählten Organisation angelegt.',
      'Die DIMO-Spiegel-Identität bleibt erhalten.',
      'Bestehende Telemetrie-Historie wird nicht überschrieben.',
    ];

    return {
      canProceed: !conflict,
      dimoVehicle: {
        id: dimoVehicle.id,
        vin: dimoVehicle.vin,
        make: dimoVehicle.make,
        model: dimoVehicle.model,
        connectionStatus: dimoVehicle.connectionStatus,
      },
      organization: org,
      conflict,
      effects,
    };
  }

  async getDiagnostics(vehicleId: string, organizationId: string) {
    return this.vehiclesService.getFleetConnectivityAdminDiagnostics(
      organizationId,
      vehicleId,
    );
  }

  private async findRegisteredOperational(
    query: VehiclesOperationalQueryDto,
    skip: number,
    take: number,
    now: number,
    platformCtx: { degraded: boolean; message: string | null },
  ) {
    const where = buildRegisteredOperationalWhere(query);
    const [vehicles, totalBefore] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        skip,
        take: query.attention || query.integrationConnectivity || query.telemetryFreshness ? 500 : take,
        orderBy: { updatedAt: 'desc' },
        include: {
          organization: { select: { id: true, companyName: true } },
          dimoVehicle: true,
          latestState: { select: { lastSeenAt: true, updatedAt: true } },
        },
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    const vehicleIds = vehicles.map((v) => v.id);
    const pollByVehicle = await this.loadPollLogsForVehicles(vehicleIds);

    let rows = vehicles.map((v) =>
      this.composeRegisteredRow(v, now, platformCtx, pollByVehicle.get(v.id) ?? null),
    );

    rows = this.applyEnrichedFilters(rows, query);
    const total =
      query.attention || query.integrationConnectivity || query.telemetryFreshness
        ? rows.length
        : totalBefore;

    if (query.attention || query.integrationConnectivity || query.telemetryFreshness) {
      rows = this.sortRows(rows, query.sort);
      rows = rows.slice(skip, skip + take);
    } else {
      rows = this.sortRows(rows, query.sort);
    }

    return buildPaginatedResult(rows, total, query);
  }

  private async findUnregisteredOperational(
    query: VehiclesOperationalQueryDto,
    skip: number,
    take: number,
    now: number,
    platformCtx: { degraded: boolean; message: string | null },
  ) {
    const where: Prisma.DimoVehicleWhereInput = {
      registeredVehicles: { none: {} },
    };
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { vin: { contains: q, mode: 'insensitive' } },
        { make: { contains: q, mode: 'insensitive' } },
        { model: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.dimoVehicle.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
        include: {
          registeredVehicles: {
            select: { id: true, organizationId: true },
          },
        },
      }),
      this.prisma.dimoVehicle.count({ where }),
    ]);

    let rows = items.map((dv) => this.composeUnregisteredRow(dv, now, platformCtx));
    rows = this.applyEnrichedFilters(rows, query);
    rows = this.sortRows(rows, query.sort);

    return buildPaginatedResult(rows, total, query);
  }

  private composeRegisteredRow(
    vehicle: {
      id: string;
      registryLifecycle?: 'ACTIVE' | 'OFFBOARDED' | 'ARCHIVED';
      vin: string | null;
      make: string;
      model: string;
      year: number;
      licensePlate: string | null;
      vehicleName: string | null;
      organizationId: string;
      dimoVehicleId: string | null;
      organization: { companyName: string };
      dimoVehicle: {
        id: string;
        connectionStatus: DimoConnectionStatus;
        lastSignal: Date | null;
        externalId: string;
        tokenId: number | null;
        syncedAt: Date | null;
      } | null;
      latestState: { lastSeenAt: Date | null; updatedAt: Date | null } | null;
    },
    now: number,
    platformCtx: { degraded: boolean },
    pollLog: { lastStatus: 'SUCCESS' | 'FAILURE' | 'TIMEOUT'; lastAt: string; lastSuccessAt: string | null } | null,
    providerLinkState?: string | null,
  ): VehicleOperationalRowDto {
    const telemetry = this.resolveRowTelemetry(vehicle, now);
    const synqDriveAccess = buildOperationalDimoAccessContext(
      vehicle.registryLifecycle ?? 'ACTIVE',
      providerLinkState ?? null,
    );
    const synqDriveDimoDataAccessActive = !isSynqDriveDimoDataAccessBlocked(synqDriveAccess);
    const integrationConnectivity = deriveIntegrationConnectivity(
      vehicle.dimoVehicleId,
      vehicle.dimoVehicle?.connectionStatus,
      platformCtx.degraded,
      synqDriveAccess,
    );
    const dimoLinkStatus =
      vehicle.dimoVehicleId == null
        ? 'unlinked'
        : ('linked' as const);
    const attention = buildVehicleAttention({
      vehicleId: vehicle.id,
      dimoVehicleId: vehicle.dimoVehicleId,
      registrationState: 'registered',
      ownership: 'assigned',
      integrationConnectivity,
      telemetryFreshness: telemetry.freshness,
      telemetryAgeMs: telemetry.ageMs,
      platformDimoDegraded: platformCtx.degraded,
      lastPollStatus: pollLog?.lastStatus ?? null,
      lastPollAt: pollLog?.lastAt ?? null,
      mappingConflict: false,
      synqDriveDimoDataAccessActive,
    });
    const { displayTitle, displaySubtitle } = computeDisplayTitle(
      vehicle.licensePlate,
      vehicle.vehicleName,
      vehicle.make,
      vehicle.model,
    );

    return {
      registryLifecycle: vehicle.registryLifecycle ?? 'ACTIVE',
      vehicleId: vehicle.id,
      dimoVehicleId: vehicle.dimoVehicleId,
      displayTitle,
      displaySubtitle,
      vin: vehicle.vin,
      licensePlate: vehicle.licensePlate,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      organizationId: vehicle.organizationId,
      organizationName: vehicle.organization.companyName,
      registrationState: 'registered',
      ownership: 'assigned',
      dimoLinkStatus,
      integrationConnectivity,
      integrationConnectivityLabel: INTEGRATION_LABELS[integrationConnectivity],
      telemetryFreshness: telemetry.freshness,
      telemetryLabel: TELEMETRY_LABELS[telemetry.freshness],
      telemetryObservedAtIso: telemetry.observedAtIso,
      telemetryComputedAt: new Date(now).toISOString(),
      integrity: deriveIntegrityState(attention),
      attention: {
        severity: attention.severity,
        primaryReason: attention.primaryReason,
        reasonCount: attention.reasonCount,
      },
      lastSignalRelative: telemetry.observedAtIso
        ? this.formatRelativeDe(now - Date.parse(telemetry.observedAtIso))
        : null,
    };
  }

  private composeUnregisteredRow(
    dv: {
      id: string;
      vin: string | null;
      make: string | null;
      model: string | null;
      year: number | null;
      connectionStatus: DimoConnectionStatus;
      lastSignal: Date | null;
      registeredVehicles?: { id: string }[];
    },
    now: number,
    platformCtx: { degraded: boolean },
  ): VehicleOperationalRowDto {
    const telemetry = resolveTelemetryFreshness(
      { lastSignal: dv.lastSignal },
      now,
    );
    const integrationConnectivity = deriveIntegrationConnectivity(
      dv.id,
      dv.connectionStatus,
      platformCtx.degraded,
    );
    const ownership =
      (dv.registeredVehicles?.length ?? 0) > 1
        ? 'conflict'
        : 'unassigned';
    const attention = buildVehicleAttention({
      vehicleId: null,
      dimoVehicleId: dv.id,
      registrationState: 'unregistered',
      ownership,
      integrationConnectivity,
      telemetryFreshness: telemetry.freshness,
      telemetryAgeMs: telemetry.ageMs,
      platformDimoDegraded: platformCtx.degraded,
      lastPollStatus: null,
      lastPollAt: null,
      mappingConflict: ownership === 'conflict',
    });
    const { displayTitle, displaySubtitle } = computeDisplayTitle(
      null,
      null,
      dv.make ?? '',
      dv.model ?? '',
    );

    return {
      vehicleId: null,
      dimoVehicleId: dv.id,
      displayTitle,
      displaySubtitle,
      vin: dv.vin,
      licensePlate: null,
      make: dv.make ?? '',
      model: dv.model ?? '',
      year: dv.year,
      organizationId: null,
      organizationName: null,
      registrationState: 'unregistered',
      ownership,
      dimoLinkStatus: ownership === 'conflict' ? 'conflict' : 'unlinked',
      integrationConnectivity,
      integrationConnectivityLabel: INTEGRATION_LABELS[integrationConnectivity],
      telemetryFreshness: telemetry.freshness,
      telemetryLabel: TELEMETRY_LABELS[telemetry.freshness],
      telemetryObservedAtIso: telemetry.observedAtIso,
      telemetryComputedAt: new Date(now).toISOString(),
      integrity: deriveIntegrityState(attention),
      attention: {
        severity: attention.severity,
        primaryReason: attention.primaryReason,
        reasonCount: attention.reasonCount,
      },
      lastSignalRelative: telemetry.observedAtIso
        ? this.formatRelativeDe(now - Date.parse(telemetry.observedAtIso))
        : null,
    };
  }

  private resolveRowTelemetry(
    vehicle: {
      dimoVehicle: { lastSignal: Date | null } | null;
      latestState: { lastSeenAt: Date | null; updatedAt: Date | null } | null;
    },
    now: number,
  ) {
    const evidence: TelemetryTimestampEvidence = {
      lastSignal: vehicle.dimoVehicle?.lastSignal ?? null,
      latestStateUpdatedAt:
        vehicle.latestState?.lastSeenAt ?? vehicle.latestState?.updatedAt ?? null,
    };
    return resolveTelemetryFreshness(evidence, now);
  }

  private applyEnrichedFilters(
    rows: VehicleOperationalRowDto[],
    query: VehiclesOperationalQueryDto,
  ) {
    let out = rows;
    if (query.integrationConnectivity && query.integrationConnectivity !== 'all') {
      out = out.filter((r) => r.integrationConnectivity === query.integrationConnectivity);
    }
    if (query.telemetryFreshness && query.telemetryFreshness !== 'all') {
      out = out.filter((r) => r.telemetryFreshness === query.telemetryFreshness);
    }
    if (query.attention === 'true') {
      out = out.filter((r) => r.attention.severity !== 'none');
    } else if (query.attention === 'false') {
      out = out.filter((r) => r.attention.severity === 'none');
    }
    return out;
  }

  private sortRows(rows: VehicleOperationalRowDto[], sort?: string) {
    const severityRank = { critical: 0, warning: 1, info: 2, none: 3 };
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sort === 'organization') {
        return (a.organizationName ?? '').localeCompare(b.organizationName ?? '');
      }
      if (sort === 'vehicle') {
        return a.displayTitle.localeCompare(b.displayTitle);
      }
      if (sort === 'lastSignal') {
        const at = a.telemetryObservedAtIso ? Date.parse(a.telemetryObservedAtIso) : 0;
        const bt = b.telemetryObservedAtIso ? Date.parse(b.telemetryObservedAtIso) : 0;
        return bt - at;
      }
      const as = severityRank[a.attention.severity];
      const bs = severityRank[b.attention.severity];
      if (as !== bs) return as - bs;
      const at = a.telemetryObservedAtIso ? Date.parse(a.telemetryObservedAtIso) : 0;
      const bt = b.telemetryObservedAtIso ? Date.parse(b.telemetryObservedAtIso) : 0;
      return bt - at;
    });
    return copy;
  }

  private buildAttentionQueue(
    rows: VehicleOperationalRowDto[],
    platformDegraded: boolean,
  ): VehicleAttentionQueueItemDto[] {
    if (platformDegraded) {
      return [
        {
          code: 'PLATFORM_DIMO_DEGRADED',
          severity: 'critical',
          reason: 'DIMO-Plattform eingeschränkt',
          vehicleCount: rows.length,
          sampleVehicleId: rows[0]?.vehicleId ?? null,
          sampleDimoVehicleId: rows[0]?.dimoVehicleId ?? null,
          sampleOrganizationName: rows[0]?.organizationName ?? null,
          drilldownSection: 'connectivity',
        },
      ];
    }

    const byCode = new Map<string, VehicleAttentionQueueItemDto>();
    for (const row of rows) {
      if (row.attention.severity === 'none' || !row.attention.primaryReason) continue;
      const code = row.attention.primaryReason;
      const existing = byCode.get(code);
      if (existing) {
        existing.vehicleCount += 1;
        continue;
      }
      byCode.set(code, {
        code,
        severity: row.attention.severity === 'info' ? 'info' : row.attention.severity,
        reason: attentionReasonLabel(code),
        vehicleCount: 1,
        sampleVehicleId: row.vehicleId,
        sampleDimoVehicleId: row.dimoVehicleId,
        sampleOrganizationName: row.organizationName,
        drilldownSection: attentionDrilldownSection(code),
      });
    }
    return Array.from(byCode.values());
  }

  private async loadPlatformDimoContext(): Promise<{ degraded: boolean; message: string | null }> {
    try {
      const health = await this.platformAdmin.getPlatformHealth();
      const dimo = health.integrations?.dimo;
      const tokenHealth = dimo?.tokenHealth as { status?: string } | undefined;
      const errorRate = health.monitoring?.errorRatePercent ?? 0;
      const degraded =
        tokenHealth?.status === 'critical' ||
        tokenHealth?.status === 'error' ||
        errorRate > 15;
      return {
        degraded,
        message: degraded
          ? 'DIMO-Plattform eingeschränkt — Fahrzeugtelemetrie kann veraltet sein.'
          : null,
      };
    } catch {
      return { degraded: false, message: null };
    }
  }

  private async loadPollLogsForVehicles(vehicleIds: string[]) {
    const map = new Map<
      string,
      { lastStatus: 'SUCCESS' | 'FAILURE' | 'TIMEOUT'; lastAt: string; lastSuccessAt: string | null }
    >();
    if (vehicleIds.length === 0) return map;

    const logs = await this.prisma.dimoPollLog.findMany({
      where: { vehicleId: { in: vehicleIds } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(vehicleIds.length * 5, 500),
      select: { vehicleId: true, status: true, createdAt: true },
    });

    for (const id of vehicleIds) {
      const vehicleLogs = logs.filter((l) => l.vehicleId === id);
      const last = vehicleLogs[0];
      const lastSuccess = vehicleLogs.find((l) => l.status === 'SUCCESS');
      if (last) {
        map.set(id, {
          lastStatus: last.status as 'SUCCESS' | 'FAILURE' | 'TIMEOUT',
          lastAt: last.createdAt.toISOString(),
          lastSuccessAt: lastSuccess?.createdAt.toISOString() ?? null,
        });
      }
    }
    return map;
  }

  private async loadLatestPollLog(vehicleId: string) {
    const logs = await this.prisma.dimoPollLog.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { status: true, createdAt: true },
    });
    const last = logs[0];
    if (!last) return null;
    const lastSuccess = logs.find((l) => l.status === 'SUCCESS');
    return {
      lastStatus: last.status as 'SUCCESS' | 'FAILURE' | 'TIMEOUT',
      lastAt: last.createdAt.toISOString(),
      lastSuccessAt: lastSuccess?.createdAt.toISOString() ?? null,
    };
  }

  private async loadAuditEvents(vehicleId: string, _organizationId: string) {
    const logs = await this.prisma.activityLog.findMany({
      where: {
        OR: [
          { entityId: vehicleId },
          {
            metaJson: {
              path: ['vehicleId'],
              equals: vehicleId,
            },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        action: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    });
    return logs.map((l) => ({
      id: l.id,
      action: l.action,
      label: l.action,
      occurredAt: l.createdAt.toISOString(),
      actorName: l.user?.name ?? null,
    }));
  }

  private formatRelativeDe(diffMs: number): string {
    if (diffMs < 60_000) return 'vor wenigen Sekunden';
    const min = Math.floor(diffMs / 60_000);
    if (min < 60) return `vor ${min} Min.`;
    const h = Math.floor(min / 60);
    if (h < 24) return `vor ${h} Std.`;
    const d = Math.floor(h / 24);
    return `vor ${d} Tg.`;
  }
}
