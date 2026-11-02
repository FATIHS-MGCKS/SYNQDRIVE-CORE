import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { projectConnectionIdentitiesFromLinks } from './vsi-connection-identity-projection';
import { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
import { evaluateVsiSignalProfile } from './vsi-profile-evaluator';
import {
  areVsiProfileSemanticEvaluationsEquivalent,
  fingerprintVsiProfileSemanticEvaluation,
} from './vsi-profile-fingerprint.util';
import {
  buildOperationalProfileRefreshCasWhere,
  buildOperationalProfileRefreshUpdate,
} from './vsi-profile-operational-refresh.util';
import { loadVsiBundleHistoricalEvidence } from './vsi-profile-historical-evidence.loader';
import { enrichVsiProfileWithSignalFingerprints } from './vsi-signal-fingerprint.enricher';
import {
  VsiProfileCadenceEvidenceLoader,
  type VsiProfileCadenceEvidencePort,
} from './vsi-profile-cadence-evidence.loader';
import {
  enrichVsiProfileWithCadenceIntelligence,
  extractPriorCadenceByKey,
} from './vsi-profile-cadence.enricher';
import type { VsiProfileEvaluationResult } from './vsi-profile.types';
import { VSI_PROFILE_CONTRACT_VERSION } from './vsi-profile.types';
import type { VsiSourceLinkRow } from './vsi-readonly-composer.types';
import {
  VSI_PROFILE_LIFECYCLE_LIMITATION_SOURCE_LINK_INACTIVE,
  VSI_PROFILE_LIFECYCLE_LIMITATION_SOURCE_LINK_SUPERSEDED,
} from './vsi-profile-lifecycle.constants';
import { isVsiP5h1ProfileRevisionHistoryCaptureEnabled } from './vsi-p5h1-profile-revision-history.config';
import type { VsiProfileRevisionMaterializationTrigger } from './vsi-profile-revision-history.types';
import { appendVsiProfileRevisionHistoryInTransaction } from './vsi-profile-revision-history.writer';
import {
  readDiagnosticTroubleCodeLastSourceMsFromProfileSnapshot,
  resolveVsiMaterializationProjectionAsOf,
  type VsiDtcConfirmedCompleteEvidence,
} from './vsi-dtc-complete-evidence.util';
import { parseConfirmedObdCodesFromHeadJson } from './vsi-vls-obd-dtc-normalize.util';

const DEFAULT_POLL_LOG_LIMIT = 5;

export type VsiProfileLifecycleMaterializationMode =
  | 'SNAPSHOT_HOOK'
  | 'SOURCE_LINK_ACTIVATED'
  | 'DECLARED_CATALOG_ADVANCED'
  | 'BACKFILL_RECONCILE'
  | 'MANUAL_RECOVERY'
  | 'DTC_CONFIRMED_COMPLETE_APPLIED'
  | 'TRIP_FINALIZED_RPM_CADENCE';

export type VsiProfileMaterializeFromSnapshotInput = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string | null;
  /** Post-trip RPM cadence: wait for HF mirror rows on this trip before certifying. */
  rpmCadenceTripId?: string | null;
  /** When true, skip when VLS binding does not match the target link. */
  requireBindingMatch?: boolean;
  /**
   * P2 lifecycle modes allow declared-only initialization without VLS binding match.
   * Snapshot hook keeps strict binding semantics by default.
   */
  lifecycleMode?: VsiProfileLifecycleMaterializationMode;
};

@Injectable()
export class VsiSignalProfileMaterializationService {
  private readonly logger = new Logger(VsiSignalProfileMaterializationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly declaredCatalog: VsiDeclaredCatalogResolver,
    @Inject(VsiProfileCadenceEvidenceLoader)
    private readonly cadenceEvidence: VsiProfileCadenceEvidencePort,
  ) {}

  async getProfileForLink(
    organizationId: string,
    vehicleId: string,
    providerSourceLinkId: string,
  ) {
    const row = await this.prisma.vehicleSignalCapabilityProfile.findFirst({
      where: { organizationId, vehicleId, providerSourceLinkId },
    });
    if (!row) {
      throw new NotFoundException('VSI signal capability profile not found');
    }
    return row;
  }

  async listProfilesForVehicle(organizationId: string, vehicleId: string) {
    return this.prisma.vehicleSignalCapabilityProfile.findMany({
      where: { organizationId, vehicleId },
      orderBy: { evaluatedAt: 'desc' },
    });
  }

  /**
   * Idempotent profile upsert from persisted VLS + cached catalog evidence.
   * Non-blocking callers must catch/log errors externally.
   */
  async materializeFromPersistedEvidence(
    input: VsiProfileMaterializeFromSnapshotInput,
  ): Promise<VsiProfileEvaluationResult | null> {
    const { organizationId, vehicleId, providerSourceLinkId } = input;
    if (!providerSourceLinkId) {
      return null;
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: {
        id: true,
        organizationId: true,
        registryLifecycle: true,
        hardwareType: true,
        fuelType: true,
      },
    });
    if (!vehicle) {
      return null;
    }

    const link = await this.prisma.vehicleDataSourceLink.findFirst({
      where: { id: providerSourceLinkId, vehicleId, isActive: true },
      select: {
        id: true,
        provider: true,
        isActive: true,
        metadata: true,
        consentId: true,
        activatedAt: true,
        deactivatedAt: true,
      },
    });
    if (!link) {
      return null;
    }

    const latestState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: {
        vehicleId: true,
        providerBindingId: true,
        providerSource: true,
        lvBatteryVoltage: true,
        evSoc: true,
        online: true,
        sourceTimestamp: true,
        providerFetchedAt: true,
        updatedAt: true,
        rawPayloadJson: true,
      },
    });

    const dtcHead = await this.prisma.vehicleDtcSourceHead.findUnique({
      where: { vehicleId },
      select: {
        providerBindingId: true,
        lastConfirmedCompleteSourceAt: true,
        lastConfirmedCompleteFetchAt: true,
        confirmedObdCodes: true,
      },
    });
    const dtcConfirmedComplete = this.resolveDtcConfirmedCompleteEvidence(
      providerSourceLinkId,
      dtcHead,
    );

    const boundLatestState =
      latestState?.providerBindingId && latestState.providerBindingId !== providerSourceLinkId
        ? null
        : latestState;

    const lifecycleScopedInit =
      input.lifecycleMode === 'SOURCE_LINK_ACTIVATED' ||
      input.lifecycleMode === 'BACKFILL_RECONCILE';
    const strictBinding = lifecycleScopedInit
      ? false
      : input.requireBindingMatch !== false;

    if (
      strictBinding &&
      latestState?.providerBindingId &&
      latestState.providerBindingId !== providerSourceLinkId
    ) {
      return null;
    }

    const existingProfile = await this.prisma.vehicleSignalCapabilityProfile.findUnique({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId,
          vehicleId,
          providerSourceLinkId,
        },
      },
    });

    const priorSource =
      existingProfile?.lastMaterializedSourceTimestamp ??
      null;
    if (
      boundLatestState?.sourceTimestamp &&
      priorSource &&
      boundLatestState.sourceTimestamp.getTime() < priorSource.getTime()
    ) {
      this.logger.debug(
        `VSI profile skip out-of-order source for vehicle=${vehicleId} link=${providerSourceLinkId}`,
      );
      return null;
    }

    const pollLogs = await this.prisma.dimoPollLog.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
      take: DEFAULT_POLL_LOG_LIMIT,
      select: { status: true, startedAt: true, finishedAt: true },
    });

    const linkRow: VsiSourceLinkRow = {
      id: link.id,
      provider: link.provider,
      isActive: link.isActive,
      metadata: link.metadata,
      consentId: link.consentId,
    };

    const identity =
      projectConnectionIdentitiesFromLinks([linkRow], {
        organizationId,
        vehicleId,
      })[0] ?? null;
    if (!identity) {
      return null;
    }

    const declared = await this.declaredCatalog.resolveForMaterialization(
      organizationId,
      vehicleId,
      providerSourceLinkId,
      link.provider,
    );

    const profileDtcSourceMs = readDiagnosticTroubleCodeLastSourceMsFromProfileSnapshot(
      existingProfile?.signalsSnapshot,
    );
    const headDtcSourceMs = dtcConfirmedComplete?.sourceObservedAt.getTime() ?? null;
    const dtcEvidenceAdvanced =
      headDtcSourceMs != null &&
      (profileDtcSourceMs == null || headDtcSourceMs > profileDtcSourceMs);

    if (
      existingProfile &&
      boundLatestState?.sourceTimestamp &&
      boundLatestState?.providerFetchedAt &&
      existingProfile.lastMaterializedSourceTimestamp?.getTime() ===
        boundLatestState.sourceTimestamp.getTime() &&
      existingProfile.lastMaterializedProviderFetchAt?.getTime() ===
        boundLatestState.providerFetchedAt.getTime()
    ) {
      const catalogAdvanced =
        declared.checkedAt &&
        existingProfile.declaredCatalogCheckedAt &&
        declared.checkedAt > existingProfile.declaredCatalogCheckedAt;
      const dtcTriggered =
        input.lifecycleMode === 'DTC_CONFIRMED_COMPLETE_APPLIED' || dtcEvidenceAdvanced;
      const cadenceTriggered =
        input.lifecycleMode === 'TRIP_FINALIZED_RPM_CADENCE' ||
        input.lifecycleMode === 'BACKFILL_RECONCILE' ||
        input.lifecycleMode === 'MANUAL_RECOVERY';
      if (!catalogAdvanced && !dtcTriggered && !cadenceTriggered) {
        return null;
      }
    }

    const obdDtcListForVsi =
      dtcConfirmedComplete &&
      (dtcConfirmedComplete.codesParse.status === 'valid' ||
        dtcConfirmedComplete.codesParse.status === 'valid_empty')
        ? dtcConfirmedComplete.codes
        : null;
    const lastDtcSuccessfulCheckAtForVsi = dtcConfirmedComplete?.fetchObservedAt ?? null;

    const projectionAsOf =
      dtcConfirmedComplete != null
        ? resolveVsiMaterializationProjectionAsOf({
            bundleProviderFetchedAt: boundLatestState?.providerFetchedAt ?? null,
            bundleUpdatedAt: boundLatestState?.updatedAt ?? null,
            dtcConfirmedComplete,
            materializationWallClock: new Date(),
          })
        : boundLatestState?.providerFetchedAt ??
          boundLatestState?.updatedAt ??
          new Date();

    const evaluationDraft = evaluateVsiSignalProfile(
      {
        organizationId,
        vehicleId,
        registryLifecycle: vehicle.registryLifecycle,
        hardwareTypeLegacy: vehicle.hardwareType,
        link: linkRow,
        identity,
        projectionAsOf,
        latestState: boundLatestState
          ? {
              vehicleId: boundLatestState.vehicleId,
              providerBindingId: boundLatestState.providerBindingId,
              providerSource: boundLatestState.providerSource,
              lvBatteryVoltage: boundLatestState.lvBatteryVoltage,
              evSoc: boundLatestState.evSoc,
              online: boundLatestState.online,
              sourceTimestamp: boundLatestState.sourceTimestamp,
              providerFetchedAt: boundLatestState.providerFetchedAt,
              updatedAt: boundLatestState.updatedAt,
              rawPayloadJson: boundLatestState.rawPayloadJson,
              obdDtcList: obdDtcListForVsi,
              lastDtcSuccessfulCheckAt: lastDtcSuccessfulCheckAtForVsi,
            }
          : null,
        pollLogs,
        declaredCatalog: declared,
        priorAggregatedSourceTimestamp:
          existingProfile?.lastProvenStrictSourceAdvanceAt ?? priorSource,
        priorProvenStrictSourceAdvanceAt:
          existingProfile?.lastProvenStrictSourceAdvanceAt ?? null,
        dtcConfirmedComplete,
        fuelType: vehicle.fuelType,
      },
      this.declaredCatalog,
    );

    if (
      link.isActive &&
      (input.lifecycleMode === 'SOURCE_LINK_ACTIVATED' ||
        input.lifecycleMode === 'BACKFILL_RECONCILE')
    ) {
      evaluationDraft.profileLimitations = evaluationDraft.profileLimitations.filter(
        (limitation) =>
          limitation !== VSI_PROFILE_LIFECYCLE_LIMITATION_SOURCE_LINK_INACTIVE &&
          limitation !== VSI_PROFILE_LIFECYCLE_LIMITATION_SOURCE_LINK_SUPERSEDED,
      );
    }

    const bundleHistory = await loadVsiBundleHistoricalEvidence(this.prisma, {
      organizationId,
      vehicleId,
      providerSourceLinkId,
      provider: link.provider,
    });
    let evaluation = enrichVsiProfileWithSignalFingerprints(
      evaluationDraft,
      bundleHistory,
    );

    const lifecycleMode = input.lifecycleMode ?? 'SNAPSHOT_HOOK';
    const refreshRpmCadence =
      lifecycleMode === 'TRIP_FINALIZED_RPM_CADENCE' ||
      lifecycleMode === 'BACKFILL_RECONCILE' ||
      lifecycleMode === 'MANUAL_RECOVERY';
    const cadenceCtx = {
      organizationId,
      vehicleId,
      providerSourceLinkId,
      fuelType: vehicle.fuelType,
      linkActivatedAt: link.activatedAt,
      linkDeactivatedAt: link.deactivatedAt,
      projectionAsOf,
      refreshRpmCadence,
      refreshLvCadence: true,
      rpmTripIdForReadiness:
        lifecycleMode === 'TRIP_FINALIZED_RPM_CADENCE'
          ? input.rpmCadenceTripId ?? null
          : null,
    };
    const priorCadenceByKey = extractPriorCadenceByKey(existingProfile?.signalsSnapshot);
    const [rpmEvidence, lvEvidence, lvStandbyTransmissionEvidence] = await Promise.all([
      this.cadenceEvidence.loadRpmEvidence(cadenceCtx),
      this.cadenceEvidence.loadLvEvidence(cadenceCtx),
      this.cadenceEvidence.loadLvStandbyTransmissionEvidence(cadenceCtx),
    ]);
    evaluation = enrichVsiProfileWithCadenceIntelligence(evaluation, {
      rpmEvidence,
      lvEvidence,
      lvStandbyTransmissionEvidence,
      priorCadenceByKey,
    });

    const semanticFingerprint = fingerprintVsiProfileSemanticEvaluation(evaluation);
    if (
      existingProfile &&
      areVsiProfileSemanticEvaluationsEquivalent(existingProfile, evaluation)
    ) {
      await this.persistOperationalRefreshWithConcurrencyRetry(
        evaluation,
        existingProfile.id,
        semanticFingerprint,
      );
      return evaluation;
    }

    await this.persistWithConcurrencyRetry(
      evaluation,
      input.lifecycleMode ?? 'SNAPSHOT_HOOK',
      semanticFingerprint,
    );
    return evaluation;
  }

  private async persistOperationalRefreshWithConcurrencyRetry(
    evaluation: VsiProfileEvaluationResult,
    profileId: string,
    semanticFingerprint: string,
  ): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const applied = await this.persistOperationalRefresh(
          evaluation,
          profileId,
          semanticFingerprint,
        );
        if (applied === 'stale_semantics') {
          return;
        }
        if (applied === 'applied' || applied === 'noop') {
          return;
        }
      } catch (err) {
        const code = (err as { code?: string })?.code;
        const message = err instanceof Error ? err.message : '';
        if (
          (code === 'P2002' || message === 'VSI_PROFILE_REVISION_CONFLICT') &&
          attempt < 2
        ) {
          continue;
        }
        throw err;
      }
    }
    throw new Error('VSI_PROFILE_REVISION_CONFLICT');
  }

  private async persistOperationalRefresh(
    evaluation: VsiProfileEvaluationResult,
    profileId: string,
    semanticFingerprint: string,
  ): Promise<'applied' | 'noop' | 'stale_semantics' | 'conflict'> {
    return this.prisma.$transaction(async (tx) => {
      const existingProfile = await tx.vehicleSignalCapabilityProfile.findUnique({
        where: { id: profileId },
      });
      if (!existingProfile) {
        return 'noop';
      }

      const refreshData = buildOperationalProfileRefreshUpdate({
        persisted: existingProfile,
        evaluation,
        semanticFingerprint,
      });
      if (!refreshData) {
        if (!areVsiProfileSemanticEvaluationsEquivalent(existingProfile, evaluation)) {
          return 'stale_semantics';
        }
        return 'noop';
      }

      const updated = await tx.vehicleSignalCapabilityProfile.updateMany({
        where: buildOperationalProfileRefreshCasWhere(existingProfile),
        data: {
          contentFingerprint: refreshData.contentFingerprint,
          evaluatedAt: refreshData.evaluatedAt,
          lastMaterializedProviderFetchAt: refreshData.lastMaterializedProviderFetchAt,
          signalsSnapshot: refreshData.signalsSnapshot as unknown as Prisma.InputJsonValue,
        },
      });
      if (updated.count === 0) {
        throw new Error('VSI_PROFILE_REVISION_CONFLICT');
      }
      return 'applied';
    });
  }

  private async persistWithConcurrencyRetry(
    evaluation: VsiProfileEvaluationResult,
    materializationTrigger: VsiProfileRevisionMaterializationTrigger,
    semanticFingerprint?: string,
  ): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const existingProfile = await this.prisma.vehicleSignalCapabilityProfile.findUnique({
          where: {
            organizationId_vehicleId_providerSourceLinkId: {
              organizationId: evaluation.organizationId,
              vehicleId: evaluation.vehicleId,
              providerSourceLinkId: evaluation.providerSourceLinkId,
            },
          },
        });
        await this.persistEvaluation(
          evaluation,
          existingProfile,
          materializationTrigger,
          semanticFingerprint,
        );
        return;
      } catch (err) {
        const code = (err as { code?: string })?.code;
        const message = err instanceof Error ? err.message : '';
        if (
          (code === 'P2002' || message === 'VSI_PROFILE_REVISION_CONFLICT') &&
          attempt < 2
        ) {
          continue;
        }
        throw err;
      }
    }
    throw new Error('VSI_PROFILE_REVISION_CONFLICT');
  }

  private async persistEvaluation(
    evaluation: VsiProfileEvaluationResult,
    existingProfile: {
      id: string;
      profileRevision: number;
      contentFingerprint: string;
    } | null,
    materializationTrigger: VsiProfileRevisionMaterializationTrigger,
    semanticFingerprint?: string,
  ): Promise<void> {
    const fingerprint =
      semanticFingerprint ?? fingerprintVsiProfileSemanticEvaluation(evaluation);
    const historyEnabled = isVsiP5h1ProfileRevisionHistoryCaptureEnabled();

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.vehicleSignalCapabilityProfile.findUnique({
        where: {
          organizationId_vehicleId_providerSourceLinkId: {
            organizationId: evaluation.organizationId,
            vehicleId: evaluation.vehicleId,
            providerSourceLinkId: evaluation.providerSourceLinkId,
          },
        },
      });

      if (existing && areVsiProfileSemanticEvaluationsEquivalent(existing, evaluation)) {
        const refreshData = buildOperationalProfileRefreshUpdate({
          persisted: existing,
          evaluation,
          semanticFingerprint: fingerprint,
        });
        if (!refreshData) {
          if (!areVsiProfileSemanticEvaluationsEquivalent(existing, evaluation)) {
            return;
          }
          return;
        }
        const refreshed = await tx.vehicleSignalCapabilityProfile.updateMany({
          where: buildOperationalProfileRefreshCasWhere(existing),
          data: {
            contentFingerprint: refreshData.contentFingerprint,
            evaluatedAt: refreshData.evaluatedAt,
            lastMaterializedProviderFetchAt: refreshData.lastMaterializedProviderFetchAt,
            signalsSnapshot: refreshData.signalsSnapshot as unknown as Prisma.InputJsonValue,
          },
        });
        if (refreshed.count === 0) {
          throw new Error('VSI_PROFILE_REVISION_CONFLICT');
        }
        return;
      }

      const link = await tx.vehicleDataSourceLink.findFirst({
        where: {
          id: evaluation.providerSourceLinkId,
          vehicleId: evaluation.vehicleId,
          vehicle: { organizationId: evaluation.organizationId },
        },
        select: {
          id: true,
          isActive: true,
          activatedAt: true,
          deactivatedAt: true,
          supersededByLinkId: true,
        },
      });

      const nextRevision = existing ? existing.profileRevision + 1 : 1;

      const data = {
        organizationId: evaluation.organizationId,
        vehicleId: evaluation.vehicleId,
        providerSourceLinkId: evaluation.providerSourceLinkId,
        providerIdentity: evaluation.providerIdentity,
        verifiedModality: evaluation.verifiedModality,
        telemetrySourceFamily: evaluation.telemetrySourceFamily,
        profileContractVersion: VSI_PROFILE_CONTRACT_VERSION,
        profileRevision: nextRevision,
        contentFingerprint: fingerprint,
        evaluatedAt: evaluation.evaluatedAt,
        declaredCatalogCheckedAt: evaluation.declaredCatalogCheckedAt,
        lastMaterializedSourceTimestamp: evaluation.lastMaterializedSourceTimestamp,
        lastMaterializedProviderFetchAt: evaluation.lastMaterializedProviderFetchAt,
        lastProvenStrictSourceAdvanceAt: evaluation.lastProvenStrictSourceAdvanceAt,
        signalsSnapshot: evaluation.signals as unknown as Prisma.InputJsonValue,
        profileLimitations: evaluation.profileLimitations as Prisma.InputJsonValue,
      };

      if (existing) {
        const updated = await tx.vehicleSignalCapabilityProfile.updateMany({
          where: {
            id: existing.id,
            profileRevision: existing.profileRevision,
          },
          data,
        });
        if (updated.count === 0) {
          throw new Error('VSI_PROFILE_REVISION_CONFLICT');
        }
      } else {
        await tx.vehicleSignalCapabilityProfile.create({ data });
      }

      if (historyEnabled) {
        if (!link) {
          throw new Error('VSI_PROFILE_REVISION_HISTORY_LINK_CONTEXT_MISSING');
        }
        await appendVsiProfileRevisionHistoryInTransaction(tx, {
          ...data,
          profileLimitations: evaluation.profileLimitations,
          signalsSnapshot: evaluation.signals,
          materializationTrigger,
          sourceLinkLifecycleContext: {
            version: 'vsi-profile-revision-link-context-v1',
            linkId: link.id,
            isActive: link.isActive,
            activatedAt: link.activatedAt.toISOString(),
            deactivatedAt: link.deactivatedAt?.toISOString() ?? null,
            supersededByLinkId: link.supersededByLinkId,
          },
        });
      }
    });
  }

  /**
   * Recovery path when async snapshot hook logged a failure — re-reads VLS + cached catalog only.
   */
  async rematerializeForCertification(
    input: VsiProfileMaterializeFromSnapshotInput,
  ): Promise<VsiProfileEvaluationResult | null> {
    try {
      return await this.materializeFromPersistedEvidence({
        ...input,
        lifecycleMode: input.lifecycleMode ?? 'MANUAL_RECOVERY',
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'VSI_PROFILE_REVISION_CONFLICT') {
        return await this.materializeFromPersistedEvidence({
          ...input,
          lifecycleMode: input.lifecycleMode ?? 'MANUAL_RECOVERY',
        });
      }
      throw err;
    }
  }

  async listActiveProviderLinksForVehicle(organizationId: string, vehicleId: string) {
    return this.prisma.vehicleDataSourceLink.findMany({
      where: { vehicleId, isActive: true, vehicle: { organizationId } },
      select: { id: true, provider: true },
      orderBy: { activatedAt: 'asc' },
    });
  }

  async listActiveLinksMissingProfiles(input: {
    organizationId?: string;
    afterLinkId?: string | null;
    limit: number;
  }) {
    const links = await this.prisma.vehicleDataSourceLink.findMany({
      where: {
        isActive: true,
        ...(input.organizationId
          ? { vehicle: { organizationId: input.organizationId, registryLifecycle: 'ACTIVE' } }
          : { vehicle: { registryLifecycle: 'ACTIVE' } }),
        ...(input.afterLinkId ? { id: { gt: input.afterLinkId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: input.limit,
      select: {
        id: true,
        vehicleId: true,
        vehicle: { select: { organizationId: true } },
      },
    });

    const missing: Array<{ id: string; vehicleId: string; organizationId: string }> = [];
    for (const link of links) {
      const profile = await this.prisma.vehicleSignalCapabilityProfile.findUnique({
        where: {
          organizationId_vehicleId_providerSourceLinkId: {
            organizationId: link.vehicle.organizationId,
            vehicleId: link.vehicleId,
            providerSourceLinkId: link.id,
          },
        },
        select: { id: true },
      });
      if (!profile) {
        missing.push({
          id: link.id,
          vehicleId: link.vehicleId,
          organizationId: link.vehicle.organizationId,
        });
      }
    }
    return missing;
  }

  /**
   * Lifecycle deactivation/supersession — preserve historical signals snapshot; append limitations only.
   */
  async appendLifecycleLimitations(input: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
    limitations: string[];
    reason?: string;
  }): Promise<void> {
    const existing = await this.prisma.vehicleSignalCapabilityProfile.findUnique({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          providerSourceLinkId: input.providerSourceLinkId,
        },
      },
    });
    if (!existing) {
      return;
    }

    const current = Array.isArray(existing.profileLimitations)
      ? (existing.profileLimitations as string[])
      : [];
    const merged = [...new Set([...current, ...input.limitations])];
    if (merged.length === current.length) {
      return;
    }

    const historyEnabled = isVsiP5h1ProfileRevisionHistoryCaptureEnabled();

    await this.prisma.$transaction(async (tx) => {
      const row = await tx.vehicleSignalCapabilityProfile.findUnique({
        where: { id: existing.id },
      });
      if (!row) {
        return;
      }
      const nextRevision = row.profileRevision + 1;
      const evaluatedAt = new Date();
      const updated = await tx.vehicleSignalCapabilityProfile.updateMany({
        where: { id: row.id, profileRevision: row.profileRevision },
        data: {
          profileLimitations: merged as unknown as Prisma.InputJsonValue,
          profileRevision: nextRevision,
          evaluatedAt,
        },
      });
      if (updated.count === 0) {
        throw new Error('VSI_PROFILE_REVISION_CONFLICT');
      }

      if (historyEnabled) {
        const link = await tx.vehicleDataSourceLink.findFirst({
          where: {
            id: input.providerSourceLinkId,
            vehicleId: input.vehicleId,
            vehicle: { organizationId: input.organizationId },
          },
          select: {
            id: true,
            isActive: true,
            activatedAt: true,
            deactivatedAt: true,
            supersededByLinkId: true,
          },
        });
        if (!link) {
          throw new Error('VSI_PROFILE_REVISION_HISTORY_LINK_CONTEXT_MISSING');
        }
        const added = input.limitations.filter((l) => !current.includes(l));
        await appendVsiProfileRevisionHistoryInTransaction(tx, {
          organizationId: row.organizationId,
          vehicleId: row.vehicleId,
          providerSourceLinkId: row.providerSourceLinkId,
          profileRevision: nextRevision,
          profileContractVersion: row.profileContractVersion,
          contentFingerprint: row.contentFingerprint,
          providerIdentity: row.providerIdentity,
          verifiedModality: row.verifiedModality,
          telemetrySourceFamily: row.telemetrySourceFamily,
          evaluatedAt,
          declaredCatalogCheckedAt: row.declaredCatalogCheckedAt,
          lastMaterializedSourceTimestamp: row.lastMaterializedSourceTimestamp,
          lastMaterializedProviderFetchAt: row.lastMaterializedProviderFetchAt,
          lastProvenStrictSourceAdvanceAt: row.lastProvenStrictSourceAdvanceAt,
          signalsSnapshot: row.signalsSnapshot,
          profileLimitations: merged,
          materializationTrigger: 'SOURCE_LINK_LIFECYCLE',
          sourceLinkLifecycleContext: {
            version: 'vsi-profile-revision-link-context-v1',
            linkId: link.id,
            isActive: link.isActive,
            activatedAt: link.activatedAt.toISOString(),
            deactivatedAt: link.deactivatedAt?.toISOString() ?? null,
            supersededByLinkId: link.supersededByLinkId,
            lifecycleLimitationsAppended: added,
          },
        });
      }
    });
  }

  private resolveDtcConfirmedCompleteEvidence(
    providerSourceLinkId: string,
    head: {
      providerBindingId: string;
      lastConfirmedCompleteSourceAt: Date | null;
      lastConfirmedCompleteFetchAt: Date | null;
      confirmedObdCodes: unknown;
    } | null,
  ): VsiDtcConfirmedCompleteEvidence | null {
    if (!head?.lastConfirmedCompleteSourceAt) {
      return null;
    }
    if (head.providerBindingId !== providerSourceLinkId) {
      return null;
    }
    const codesParse = parseConfirmedObdCodesFromHeadJson(head.confirmedObdCodes);
    if (codesParse.status === 'malformed' || codesParse.status === 'absent') {
      return null;
    }
    const fetchAt =
      head.lastConfirmedCompleteFetchAt ?? head.lastConfirmedCompleteSourceAt;
    const codes =
      codesParse.status === 'valid' ? codesParse.codes : [];
    return {
      providerBindingId: head.providerBindingId,
      sourceObservedAt: head.lastConfirmedCompleteSourceAt,
      fetchObservedAt: fetchAt,
      codes,
      codesParse,
    };
  }
}
