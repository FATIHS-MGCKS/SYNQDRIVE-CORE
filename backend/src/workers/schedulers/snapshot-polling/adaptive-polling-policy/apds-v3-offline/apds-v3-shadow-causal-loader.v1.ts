import {
  DimoPollStatus,
  VehicleProviderSourceObservationOutcome,
  VehicleProviderSourceObservationRecordPhase,
} from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import { buildP25ApdProfileLvLoaderWhere } from '../p25-apd-profile-lv-loader';
import { apdsV3ShadowDbStatementTimeoutMs } from './apds-v3-shadow.config';

export type ApdsV3ShadowCausalEvidenceBundle = {
  lastPhysicalPollMs: number | null;
  lastPhysicalPollVerified: boolean;
  lvProviderTimestampsMs: number[];
  lastProviderFetchedAtMs: number | null;
  lastTopLevelProviderSourceMs: number | null;
  signalProfileRevision: string | null;
  signalProfileRevisionEffectiveAtMs: number | null;
  p2cObservationId: string | null;
  p2cObservationAvailableAtMs: number | null;
  p2cBoundOrganizationId: string | null;
  p2cBoundVehicleId: string | null;
  p2cBoundProviderSourceLinkId: string | null;
  p2cDataSourceTimestampMs: number | null;
  p2cTopLevelAdvanceKnown: boolean;
  p2cObservationCoverageVerified: boolean;
  missingEvidenceReasons: string[];
};

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('APDS_V3_SHADOW_ABORTED');
  }
}

const ADMISSIBLE_P2C_OUTCOMES = new Set<VehicleProviderSourceObservationOutcome>([
  VehicleProviderSourceObservationOutcome.PROVIDER_FETCH_RECORDED,
  VehicleProviderSourceObservationOutcome.VLS_APPLIED,
  VehicleProviderSourceObservationOutcome.VLS_COMMITTED,
]);

export async function loadApdsV3ShadowCausalEvidence(
  prisma: PrismaService,
  input: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
    decisionAtMs: number;
  },
  signal?: AbortSignal,
): Promise<ApdsV3ShadowCausalEvidenceBundle> {
  const missing: string[] = [];
  const decisionAt = new Date(input.decisionAtMs);
  const stmtMs = apdsV3ShadowDbStatementTimeoutMs();

  throwIfAborted(signal);

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${stmtMs}`);
      throwIfAborted(signal);

      const [
    lastSuccessPoll,
    lvRows,
    latestState,
    profileRevision,
    p2cObs,
    priorP2cObs,
  ] = await Promise.all([
    tx.dimoPollLog.findFirst({
      where: {
        vehicleId: input.vehicleId,
        status: DimoPollStatus.SUCCESS,
        finishedAt: { not: null, lte: decisionAt },
      },
      orderBy: { finishedAt: 'desc' },
      select: { finishedAt: true, startedAt: true },
    }),
    tx.batteryMeasurement.findMany({
      where: buildP25ApdProfileLvLoaderWhere(input.vehicleId, input.decisionAtMs),
      orderBy: { providerTimestamp: 'desc' },
      take: 24,
      select: { providerTimestamp: true },
    }),
    tx.vehicleLatestState.findUnique({
      where: { vehicleId: input.vehicleId },
      select: { providerFetchedAt: true, sourceTimestamp: true },
    }),
    tx.vehicleSignalCapabilityProfileRevision.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerSourceLinkId: input.providerSourceLinkId,
        evaluatedAt: { lte: decisionAt },
        recordedAt: { lte: decisionAt },
      },
      orderBy: { evaluatedAt: 'desc' },
      select: {
        profileRevision: true,
        evaluatedAt: true,
        recordedAt: true,
        profileContractVersion: true,
        lastProvenStrictSourceAdvanceAt: true,
      },
    }),
    tx.vehicleProviderSourceObservation.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        provider: 'DIMO',
        providerFetchedAt: { lte: decisionAt },
        providerBindingId: input.providerSourceLinkId,
        recordPhase: VehicleProviderSourceObservationRecordPhase.PROVIDER_FETCH,
        observationOutcome: { in: [...ADMISSIBLE_P2C_OUTCOMES] },
      },
      orderBy: { providerFetchedAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        providerSourceTimestamp: true,
        providerFetchedAt: true,
        organizationId: true,
        vehicleId: true,
        providerBindingId: true,
        recordPhase: true,
        observationOutcome: true,
      },
    }),
    tx.vehicleProviderSourceObservation.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        provider: 'DIMO',
        providerBindingId: input.providerSourceLinkId,
        providerFetchedAt: { lt: decisionAt },
        recordPhase: VehicleProviderSourceObservationRecordPhase.PROVIDER_FETCH,
        observationOutcome: { in: [...ADMISSIBLE_P2C_OUTCOMES] },
      },
      orderBy: { providerFetchedAt: 'desc' },
      select: { providerSourceTimestamp: true, providerFetchedAt: true },
    }),
  ]);

  throwIfAborted(signal);

  const lastPhysicalPollMs =
    lastSuccessPoll?.finishedAt?.getTime() ?? lastSuccessPoll?.startedAt?.getTime() ?? null;
  const lastPhysicalPollVerified =
    lastPhysicalPollMs != null && lastPhysicalPollMs <= input.decisionAtMs;

  if (!lastPhysicalPollVerified) {
    missing.push('PRIOR_SUCCESSFUL_PHYSICAL_POLL_NOT_VERIFIED');
  }

  const lvProviderTimestampsMs = lvRows
    .map((r) => r.providerTimestamp?.getTime())
    .filter((t): t is number => t != null && t <= input.decisionAtMs)
    .sort((a, b) => a - b);

  const pfMs = latestState?.providerFetchedAt?.getTime() ?? null;
  const topMs = latestState?.sourceTimestamp?.getTime() ?? null;
  if (pfMs != null && pfMs > input.decisionAtMs) {
    missing.push('PROVIDER_FETCHED_AT_FUTURE_RELATIVE_TO_DECISION');
  }
  if (topMs != null && topMs > input.decisionAtMs) {
    missing.push('TOP_LEVEL_SOURCE_TIMESTAMP_FUTURE_RELATIVE_TO_DECISION');
  }

  let p2cObservationId: string | null = null;
  let p2cObservationAvailableAtMs: number | null = null;
  let p2cBoundOrganizationId: string | null = null;
  let p2cBoundVehicleId: string | null = null;
  let p2cBoundProviderSourceLinkId: string | null = null;
  let p2cDataSourceTimestampMs: number | null = null;
  let p2cTopLevelAdvanceKnown = false;
  let p2cObservationCoverageVerified = false;

  if (p2cObs) {
    const availableMs = p2cObs.createdAt.getTime();
    if (availableMs <= input.decisionAtMs) {
      p2cObservationId = p2cObs.id;
      p2cObservationAvailableAtMs = availableMs;
      p2cBoundOrganizationId = p2cObs.organizationId;
      p2cBoundVehicleId = p2cObs.vehicleId;
      p2cBoundProviderSourceLinkId = p2cObs.providerBindingId;
      const sourceTs = p2cObs.providerSourceTimestamp?.getTime() ?? null;
      p2cDataSourceTimestampMs =
        sourceTs != null && sourceTs <= input.decisionAtMs ? sourceTs : null;

      p2cObservationCoverageVerified =
        p2cObs.organizationId === input.organizationId &&
        p2cObs.vehicleId === input.vehicleId &&
        p2cObs.providerBindingId === input.providerSourceLinkId;

      if (!p2cObservationCoverageVerified) {
        missing.push('P2C_BINDING_MISMATCH');
      }

      const priorSourceTs = priorP2cObs?.providerSourceTimestamp?.getTime() ?? null;
      const profileAdvanceMs =
        profileRevision?.lastProvenStrictSourceAdvanceAt?.getTime() ?? null;
      const strictAdvanceFromObs =
        p2cDataSourceTimestampMs != null &&
        (priorSourceTs == null || p2cDataSourceTimestampMs > priorSourceTs);
      const strictAdvanceFromProfile =
        profileAdvanceMs != null &&
        profileAdvanceMs <= input.decisionAtMs &&
        p2cDataSourceTimestampMs != null &&
        p2cDataSourceTimestampMs >= profileAdvanceMs;

      p2cTopLevelAdvanceKnown = strictAdvanceFromObs || strictAdvanceFromProfile;
      if (!p2cTopLevelAdvanceKnown && p2cDataSourceTimestampMs != null) {
        missing.push('P2C_STRICT_TOP_LEVEL_ADVANCE_NOT_PROVEN');
      }
    } else {
      missing.push('P2C_OBSERVATION_NOT_YET_AVAILABLE_AT_DECISION');
    }
  } else {
    missing.push('P2C_OBSERVATION_NOT_PERSISTED');
  }

  if (!profileRevision) {
    missing.push('SIGNAL_PROFILE_REVISION_NOT_AVAILABLE');
  } else if (profileRevision.recordedAt.getTime() > input.decisionAtMs) {
    missing.push('SIGNAL_PROFILE_REVISION_RECORDED_AFTER_DECISION');
  }

      return {
        lastPhysicalPollMs: lastPhysicalPollVerified ? lastPhysicalPollMs : null,
        lastPhysicalPollVerified,
        lvProviderTimestampsMs,
        lastProviderFetchedAtMs:
          pfMs != null && pfMs <= input.decisionAtMs ? pfMs : null,
        lastTopLevelProviderSourceMs:
          topMs != null && topMs <= input.decisionAtMs ? topMs : null,
        signalProfileRevision:
          profileRevision != null
            ? `${profileRevision.profileContractVersion}:r${profileRevision.profileRevision}`
            : null,
        signalProfileRevisionEffectiveAtMs: profileRevision?.evaluatedAt.getTime() ?? null,
        p2cObservationId,
        p2cObservationAvailableAtMs,
        p2cBoundOrganizationId,
        p2cBoundVehicleId,
        p2cBoundProviderSourceLinkId,
        p2cDataSourceTimestampMs,
        p2cTopLevelAdvanceKnown,
        p2cObservationCoverageVerified,
        missingEvidenceReasons: missing,
      };
    },
    { timeout: stmtMs + 5_000 },
  );
}
