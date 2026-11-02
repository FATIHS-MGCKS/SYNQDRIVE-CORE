import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { VsiSignalProfileMaterializationService } from './vsi-profile-materialization.service';
import { VsiReadonlySignalComposerService } from './vsi-readonly-composer.service';
import { VsiProfileRevisionHistoryRepository } from './vsi-profile-revision-history.repository';
import { VsiCapabilityResolverService } from './vsi-capability-resolver.service';
import { isVsiP5h1ProfileRevisionHistoryCaptureEnabled } from './vsi-p5h1-profile-revision-history.config';
import {
  mapProfileRowToDetail,
  mapProfileRowToSummary,
  mapRevisionRowToTimelineItem,
} from './vsi-master-intelligence-read.mapper';
import type {
  MasterVsiFleetOverviewDto,
  MasterVsiProfileDetailDto,
  MasterVsiRevisionAsOfDto,
  MasterVsiRevisionHistoryPageDto,
} from './vsi-master-intelligence-read.types';
import { parseCapabilityResolverEvaluationTime } from './vsi-capability-resolver.controller';
import type { VsiConsumerModuleId } from './vsi-consumer-requirements.types';
import { VsiConsumerModuleId as VsiConsumerModuleIdValues } from './vsi-consumer-requirements.types';
import { VsiProfileRevisionAsOfAuthority } from './vsi-profile-revision-as-of.types';

const MAX_REVISION_PAGE = 50;

@Injectable()
export class VsiMasterIntelligenceReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly materialization: VsiSignalProfileMaterializationService,
    private readonly composer: VsiReadonlySignalComposerService,
    private readonly revisionHistory: VsiProfileRevisionHistoryRepository,
    private readonly capabilityResolver: VsiCapabilityResolverService,
  ) {}

  private async assertVehicleScope(organizationId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found for organization scope');
    }
  }

  private async assertSourceLinkScope(
    organizationId: string,
    vehicleId: string,
    providerSourceLinkId: string,
  ): Promise<{ provider: string | null }> {
    await this.assertVehicleScope(organizationId, vehicleId);
    const link = await this.prisma.vehicleDataSourceLink.findFirst({
      where: {
        id: providerSourceLinkId,
        vehicleId,
        vehicle: { organizationId },
      },
      select: { id: true, provider: true },
    });
    if (!link) {
      throw new NotFoundException('Provider source link not found for vehicle scope');
    }
    return { provider: link.provider };
  }

  async getFleetOverview(
    organizationId: string,
    vehicleId: string,
  ): Promise<MasterVsiFleetOverviewDto> {
    await this.assertVehicleScope(organizationId, vehicleId);
    const rows = await this.materialization.listProfilesForVehicle(organizationId, vehicleId);
    const linkIds = rows.map((r) => r.providerSourceLinkId);
    const links =
      linkIds.length === 0
        ? []
        : await this.prisma.vehicleDataSourceLink.findMany({
            where: { id: { in: linkIds }, vehicleId },
            select: { id: true, provider: true },
          });
    const providerByLink = new Map(links.map((l) => [l.id, l.provider]));
    return {
      organizationId,
      vehicleId,
      profiles: rows.map((row) =>
        mapProfileRowToSummary(row, providerByLink.get(row.providerSourceLinkId) ?? null),
      ),
    };
  }

  async getProfileDetail(
    organizationId: string,
    vehicleId: string,
    providerSourceLinkId: string,
  ): Promise<MasterVsiProfileDetailDto> {
    const { provider } = await this.assertSourceLinkScope(
      organizationId,
      vehicleId,
      providerSourceLinkId,
    );
    const row = await this.materialization.getProfileForLink(
      organizationId,
      vehicleId,
      providerSourceLinkId,
    );
    return mapProfileRowToDetail(row, provider);
  }

  async getReadonlySignals(
    organizationId: string,
    vehicleId: string,
    providerSourceLinkId: string,
  ) {
    await this.assertSourceLinkScope(organizationId, vehicleId, providerSourceLinkId);
    const composed = await this.composer.composeVehicleSignals({
      organizationId,
      vehicleId,
    });
    const signals = composed.signals.filter(
      (s) =>
        s.identity.providerSourceLinkRef.kind === 'resolved' &&
        s.identity.providerSourceLinkRef.providerSourceLinkId === providerSourceLinkId,
    );
    const identityProjections = composed.identityProjections.filter(
      (p) => p.providerSourceLinkId === providerSourceLinkId,
    );
    return {
      contractVersion: composed.contractVersion,
      projectionAsOf: composed.projectionAsOf,
      organizationId: composed.organizationId,
      vehicleId: composed.vehicleId,
      providerSourceLinkId,
      identityProjections,
      signals,
    };
  }

  async getRevisionHistoryPage(input: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
    limit?: number;
    cursor?: string | null;
  }): Promise<MasterVsiRevisionHistoryPageDto> {
    await this.assertSourceLinkScope(
      input.organizationId,
      input.vehicleId,
      input.providerSourceLinkId,
    );

    if (!isVsiP5h1ProfileRevisionHistoryCaptureEnabled()) {
      return {
        captureStatus: 'NOT_CAPTURED',
        items: [],
        page: { limit: 0, nextCursor: null, hasMore: false },
      };
    }

    const limit = Math.min(Math.max(input.limit ?? 20, 1), MAX_REVISION_PAGE);
    const cursorRev = input.cursor ? Number.parseInt(input.cursor, 10) : null;
    if (input.cursor != null && input.cursor !== '' && Number.isNaN(cursorRev)) {
      throw new BadRequestException('Invalid revision cursor');
    }

    const rows = await this.revisionHistory.listRevisionsForLink({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: input.providerSourceLinkId,
      maxRows: limit + 1 + (cursorRev != null ? 512 : 0),
    });

    let filtered = rows;
    if (cursorRev != null) {
      filtered = rows.filter((r) => r.profileRevision < cursorRev);
    }
    const pageRows = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;
    const nextCursor =
      hasMore && pageRows.length > 0
        ? String(pageRows[pageRows.length - 1]!.profileRevision)
        : null;

    return {
      captureStatus: 'CAPTURE_ENABLED',
      items: pageRows.map(mapRevisionRowToTimelineItem),
      page: { limit, nextCursor, hasMore },
    };
  }

  async resolveRevisionAsOf(input: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
    decisionAt: string;
    historicalLinkAttributionProven?: boolean;
  }): Promise<MasterVsiRevisionAsOfDto> {
    await this.assertSourceLinkScope(
      input.organizationId,
      input.vehicleId,
      input.providerSourceLinkId,
    );

    const decisionAt = parseCapabilityResolverEvaluationTime(input.decisionAt);

    if (!isVsiP5h1ProfileRevisionHistoryCaptureEnabled()) {
      return {
        captureStatus: 'NOT_CAPTURED',
        decisionAt: decisionAt.toISOString(),
        authority: VsiProfileRevisionAsOfAuthority.NO_PRIOR_REVISION,
        limitations: ['P5H1_REVISION_HISTORY_NOT_CAPTURED'],
        queryEvidence: {},
        selectedRevision: null,
      };
    }

    const resolution = await this.revisionHistory.resolveRevisionAsOf({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: input.providerSourceLinkId,
      decisionAt,
      historicalLinkAttributionProven: input.historicalLinkAttributionProven === true,
    });

    return {
      captureStatus: 'CAPTURE_ENABLED',
      decisionAt: decisionAt.toISOString(),
      authority: resolution.authority,
      limitations: resolution.limitations,
      queryEvidence: resolution.queryEvidence as unknown as Record<string, unknown>,
      selectedRevision: resolution.selectedRevision
        ? mapRevisionRowToTimelineItem(resolution.selectedRevision)
        : null,
    };
  }

  async resolveCapability(input: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
    consumerModule: string;
    featureId: string;
    evaluationTime?: string;
  }) {
    await this.assertSourceLinkScope(
      input.organizationId,
      input.vehicleId,
      input.providerSourceLinkId,
    );
    const moduleId = input.consumerModule as VsiConsumerModuleId;
    if (!Object.values(VsiConsumerModuleIdValues).includes(moduleId)) {
      return {
        error: 'INVALID_CONSUMER_MODULE',
        allowed: Object.values(VsiConsumerModuleIdValues),
      };
    }
    if (!input.featureId?.trim()) {
      return { error: 'FEATURE_ID_REQUIRED' };
    }
    const evalAt = parseCapabilityResolverEvaluationTime(input.evaluationTime);
    return this.capabilityResolver.resolve({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: input.providerSourceLinkId,
      consumerModule: moduleId as VsiConsumerModuleId,
      featureId: input.featureId,
      evaluationTime: evalAt,
    });
  }
}
