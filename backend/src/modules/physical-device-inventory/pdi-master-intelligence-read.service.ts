import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PhysicalDeviceModelCode } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { loadPdiIdentityDriftObservationData } from './pdi-identity-drift-shadow.data-loader';
import { evaluateAllInstalledDevices } from './pdi-identity-drift-shadow.evaluator';
import { mapEpisodeRow, maskIdentifier } from './pdi-master-intelligence-read.mapper';
import type {
  MasterPdiConnectionEpisodePageDto,
  MasterPdiDeviceIntelligenceDto,
  MasterPdiDriftHistoryDto,
  MasterPdiTimelineItemDto,
} from './pdi-master-intelligence-read.types';
import { PhysicalDeviceInventoryService } from './physical-device-inventory.service';

const MAX_PAGE = 50;
const DEFAULT_PAGE = 20;

@Injectable()
export class PdiMasterIntelligenceReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: PhysicalDeviceInventoryService,
  ) {}

  private parseLimit(raw?: number): number {
    if (raw == null || Number.isNaN(raw)) return DEFAULT_PAGE;
    return Math.min(Math.max(raw, 1), MAX_PAGE);
  }

  private parseEpisodeCursor(cursor: string | null | undefined): { openedAt: Date; id: string } | null {
    if (!cursor?.trim()) return null;
    const sep = cursor.indexOf('|');
    if (sep <= 0) throw new BadRequestException('Invalid episode cursor');
    const openedAt = new Date(cursor.slice(0, sep));
    const id = cursor.slice(sep + 1);
    if (Number.isNaN(openedAt.getTime()) || !id) {
      throw new BadRequestException('Invalid episode cursor');
    }
    return { openedAt, id };
  }

  private async assertDeviceOrgScope(
    physicalDeviceId: string,
    organizationId: string | null | undefined,
  ): Promise<{ currentVehicleId: string | null; currentOrganizationId: string | null }> {
    const device = await this.prisma.physicalDevice.findUnique({
      where: { id: physicalDeviceId },
      select: {
        ownerOrganizationId: true,
        assignments: {
          where: { effectiveTo: null, assignmentKind: 'INSTALL' },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
          select: { vehicleId: true, organizationId: true },
        },
      },
    });
    if (!device) {
      throw new NotFoundException('Physical device not found');
    }
    const active = device.assignments[0];
    const currentVehicleId = active?.vehicleId ?? null;
    let currentOrganizationId = active?.organizationId ?? null;
    if (currentVehicleId && !currentOrganizationId) {
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: currentVehicleId },
        select: { organizationId: true },
      });
      currentOrganizationId = vehicle?.organizationId ?? null;
    }
    if (organizationId) {
      if (device.ownerOrganizationId && device.ownerOrganizationId !== organizationId) {
        throw new NotFoundException('Physical device not found for organization scope');
      }
      if (currentOrganizationId && currentOrganizationId !== organizationId) {
        throw new NotFoundException('Physical device not active in organization scope');
      }
    }
    return { currentVehicleId, currentOrganizationId };
  }

  private async assertVehicleLinkedToDevice(
    physicalDeviceId: string,
    organizationId: string,
    vehicleId: string,
  ): Promise<void> {
    const linked = await this.prisma.physicalDeviceAssignment.findFirst({
      where: {
        physicalDeviceId,
        vehicleId,
        organizationId,
      },
      select: { id: true },
    });
    if (!linked) {
      throw new NotFoundException('Vehicle assignment not found for physical device scope');
    }
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found for organization scope');
    }
  }

  async getConnectionEpisodes(input: {
    physicalDeviceId: string;
    organizationId: string;
    vehicleId: string;
    limit?: number;
    cursor?: string | null;
  }): Promise<MasterPdiConnectionEpisodePageDto> {
    await this.assertDeviceOrgScope(input.physicalDeviceId, input.organizationId);
    await this.assertVehicleLinkedToDevice(
      input.physicalDeviceId,
      input.organizationId,
      input.vehicleId,
    );
    const limit = this.parseLimit(input.limit);
    const cursor = this.parseEpisodeCursor(input.cursor);
    const rows = await this.prisma.deviceConnectionEpisode.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        ...(cursor
          ? {
              OR: [
                { openedAt: { lt: cursor.openedAt } },
                { openedAt: cursor.openedAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    return {
      items: pageRows.map(mapEpisodeRow),
      page: {
        limit,
        nextCursor: hasMore && last ? `${last.openedAt.toISOString()}|${last.id}` : null,
        hasMore,
      },
    };
  }

  private async resolveLiveDriftObservation(
    physicalDeviceId: string,
    modelCode: PhysicalDeviceModelCode,
    currentVehicleId: string | null,
  ): Promise<MasterPdiDriftHistoryDto> {
    if (modelCode !== 'RUPTELA_R1') {
      return {
        availability: 'NOT_APPLICABLE',
        availabilityExplanation: ['PHYSICAL_R1_IDENTITY_MONITORING_NOT_APPLICABLE'],
        liveObservation: null,
        persistedHistoricalEntries: [],
        noDriftRecordsIsNotVerifiedNoDrift: true,
      };
    }
    if (!currentVehicleId) {
      return {
        availability: 'NOT_PERSISTED',
        availabilityExplanation: [
          'NO_PERSISTED_DRIFT_EVENT_HISTORY',
          'DEVICE_NOT_INSTALLED_FOR_LIVE_OBSERVATION',
        ],
        liveObservation: null,
        persistedHistoricalEntries: [],
        noDriftRecordsIsNotVerifiedNoDrift: true,
      };
    }

    const now = new Date();
    const loadResult = await loadPdiIdentityDriftObservationData(this.prisma);
    const rows = evaluateAllInstalledDevices({
      now,
      syncRunId: `pdi-intelligence-read-${now.getTime()}`,
      devices: loadResult.devices.filter((d) => d.physicalDeviceId === physicalDeviceId),
      knownInventorySerials: loadResult.knownInventorySerials,
    });
    const row = rows[0];
    if (!row) {
      return {
        availability: 'NOT_PERSISTED',
        availabilityExplanation: ['NO_LIVE_OBSERVATION_INPUT_FOR_DEVICE'],
        liveObservation: null,
        persistedHistoricalEntries: [],
        noDriftRecordsIsNotVerifiedNoDrift: true,
      };
    }

    return {
      availability: 'LIVE_OBSERVATION_ONLY',
      availabilityExplanation: [
        'NO_PERSISTED_DRIFT_EVENT_HISTORY',
        'LIVE_OBSERVATION_FROM_DIMO_MIRROR_AND_PDI_INSTALL',
      ],
      liveObservation: {
        observedAt: now.toISOString(),
        vehicleIdForObservation: row.vehicleId,
        expectedSerialMasked: row.expectedSerialMasked,
        observedSerialMasked: row.observedSerialMasked,
        driftReasonCode: row.reasonCode,
        confidence: row.confidence,
        evidenceStale: row.detailCodes.includes('PROVIDER_MIRROR_STALE_OR_MISSING'),
        observationIsLiveSnapshotNotHistory: true,
        observationVehicleIsNotImpliedForHistoricalAssignments: true,
      },
      persistedHistoricalEntries: [],
      noDriftRecordsIsNotVerifiedNoDrift: true,
    };
  }

  private buildTimeline(
    detail: Awaited<ReturnType<PhysicalDeviceInventoryService['getDeviceDetail']>>,
    episodes: MasterPdiConnectionEpisodePageDto,
  ): MasterPdiTimelineItemDto[] {
    const items: MasterPdiTimelineItemDto[] = [];
    for (const a of detail.assignmentHistory) {
      items.push({
        kind: 'ASSIGNMENT_START',
        at: a.effectiveFrom,
        label: `Assignment ${a.assignmentKind}`,
        vehicleId: a.vehicleId,
        organizationId: a.organizationId,
        source: 'PERSISTED_ASSIGNMENT',
      });
      if (a.effectiveTo) {
        items.push({
          kind: 'ASSIGNMENT_END',
          at: a.effectiveTo,
          label: `Assignment ended ${a.assignmentKind}`,
          vehicleId: a.vehicleId,
          organizationId: a.organizationId,
          source: 'PERSISTED_ASSIGNMENT',
        });
      }
    }
    for (const e of detail.auditHistory) {
      items.push({
        kind: 'AUDIT_EVENT',
        at: e.createdAt,
        label: e.eventKind,
        vehicleId: null,
        organizationId: null,
        source: 'PERSISTED_AUDIT',
      });
    }
    for (const ep of episodes.items) {
      items.push({
        kind: ep.resolvedAt ? 'CONNECTION_EPISODE_RESOLVE' : 'CONNECTION_EPISODE_OPEN',
        at: ep.resolvedAt ?? ep.openedAt,
        label: `${ep.status} · ${ep.openedReason}`,
        vehicleId: ep.vehicleId,
        organizationId: ep.organizationId,
        source: 'PERSISTED_EPISODE',
        episodeIdPrefix: ep.idPrefix,
      });
    }
    items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    return items.slice(0, 100);
  }

  async getDeviceIntelligence(
    physicalDeviceId: string,
    organizationId?: string | null,
  ): Promise<MasterPdiDeviceIntelligenceDto> {
    const scope = await this.assertDeviceOrgScope(physicalDeviceId, organizationId ?? null);
    const detail = await this.inventory.getDeviceDetail(physicalDeviceId);

    let connectionEpisodes: MasterPdiConnectionEpisodePageDto = {
      items: [],
      page: { limit: DEFAULT_PAGE, nextCursor: null, hasMore: false },
    };
    const limitations: string[] = [];

    const orgForEpisodes = organizationId ?? scope.currentOrganizationId;
    if (scope.currentVehicleId && orgForEpisodes) {
      connectionEpisodes = await this.getConnectionEpisodes({
        physicalDeviceId,
        organizationId: orgForEpisodes,
        vehicleId: scope.currentVehicleId,
        limit: DEFAULT_PAGE,
      });
    } else {
      limitations.push('CONNECTION_EPISODES_REQUIRE_CURRENT_VEHICLE_AND_ORGANIZATION');
    }

    const driftHistory = await this.resolveLiveDriftObservation(
      physicalDeviceId,
      detail.modelCode,
      scope.currentVehicleId,
    );

    let providerBindings: MasterPdiDeviceIntelligenceDto['providerBindings'] = [];
    if (scope.currentVehicleId && orgForEpisodes) {
      const links = await this.prisma.vehicleDataSourceLink.findMany({
        where: { vehicleId: scope.currentVehicleId, vehicle: { organizationId: orgForEpisodes } },
        select: {
          id: true,
          provider: true,
          sourceType: true,
          isActive: true,
        },
        take: 10,
      });
      providerBindings = links.map((l) => ({
        providerSourceLinkId: l.id,
        providerIdentity: `${l.provider}/${l.sourceType}`,
        linkStatus: l.isActive ? 'ACTIVE' : 'INACTIVE',
        attributionScope: 'CURRENT_VEHICLE_ONLY',
        historicalLinkAttributionRequiresPersistedAssignment: true,
      }));
    }

    const physicalR1Applicability =
      detail.modelCode !== 'RUPTELA_R1'
        ? 'NOT_APPLICABLE'
        : detail.currentVehicleId
          ? 'APPLICABLE_INSTALLED'
          : 'APPLICABLE_NOT_INSTALLED';

    const identityEvaluatedAt =
      driftHistory.liveObservation?.observedAt ??
      (detail.recordedAt ? detail.recordedAt : null);

    return {
      identity: {
        physicalDeviceId: detail.id,
        modelCode: detail.modelCode,
        hardwareTypeLabel: detail.manufacturer,
        status: detail.status,
        identityStatus: detail.identityStatus,
        serialNumberMasked: detail.serialNumberMasked,
        imeiMasked: detail.imeiMasked,
        ownerOrganizationId: detail.ownerOrganizationId,
        currentVehicleId: detail.currentVehicleId,
        currentOrganizationId: scope.currentOrganizationId,
        identityEvidenceSummary: detail.identityEvidenceSummary,
        identityEvaluatedAt,
        identityEvidenceSource: 'PDI_INVENTORY_AND_OPTIONAL_LIVE_DIMO_MIRROR',
        currentSnapshotIsNotHistoricalObservation: true,
        physicalR1Applicability,
      },
      assignmentHistory: detail.assignmentHistory,
      auditHistory: detail.auditHistory,
      connectionEpisodes,
      driftHistory,
      providerBindings,
      timeline: this.buildTimeline(detail, connectionEpisodes),
      crossLinkContext: {
        physicalDeviceId: detail.id,
        organizationId: orgForEpisodes ?? scope.currentOrganizationId,
        vehicleId: scope.currentVehicleId,
        providerSourceLinkId: providerBindings[0]?.providerSourceLinkId ?? null,
      },
      limitations,
    };
  }
}
