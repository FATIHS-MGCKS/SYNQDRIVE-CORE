import { DimoPollStatus } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import { buildP25ApdProfileLvLoaderWhere } from '../p25-apd-profile-lv-loader';

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

export async function loadApdsV3ShadowCausalEvidence(
  prisma: PrismaService,
  input: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
    decisionAtMs: number;
  },
): Promise<ApdsV3ShadowCausalEvidenceBundle> {
  const missing: string[] = [];
  const decisionAt = new Date(input.decisionAtMs);

  const [
    lastSuccessPoll,
    lvRows,
    latestState,
    profileRevision,
    p2cObs,
  ] = await Promise.all([
    prisma.dimoPollLog.findFirst({
      where: {
        vehicleId: input.vehicleId,
        status: DimoPollStatus.SUCCESS,
        finishedAt: { not: null, lte: decisionAt },
      },
      orderBy: { finishedAt: 'desc' },
      select: { finishedAt: true, startedAt: true },
    }),
    prisma.batteryMeasurement.findMany({
      where: buildP25ApdProfileLvLoaderWhere(input.vehicleId, input.decisionAtMs),
      orderBy: { providerTimestamp: 'desc' },
      take: 24,
      select: { providerTimestamp: true },
    }),
    prisma.vehicleLatestState.findUnique({
      where: { vehicleId: input.vehicleId },
      select: { providerFetchedAt: true, sourceTimestamp: true },
    }),
    prisma.vehicleSignalCapabilityProfileRevision.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerSourceLinkId: input.providerSourceLinkId,
        evaluatedAt: { lte: decisionAt },
      },
      orderBy: { evaluatedAt: 'desc' },
      select: { profileRevision: true, evaluatedAt: true, profileContractVersion: true },
    }),
    prisma.vehicleProviderSourceObservation.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        provider: 'DIMO',
        providerFetchedAt: { lte: decisionAt },
        providerBindingId: input.providerSourceLinkId,
      },
      orderBy: { providerFetchedAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        providerSourceTimestamp: true,
        organizationId: true,
        vehicleId: true,
        providerBindingId: true,
      },
    }),
  ]);

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
      p2cDataSourceTimestampMs = p2cObs.providerSourceTimestamp?.getTime() ?? null;
      p2cTopLevelAdvanceKnown =
        p2cDataSourceTimestampMs != null && p2cDataSourceTimestampMs <= input.decisionAtMs;
      p2cObservationCoverageVerified =
        p2cObs.organizationId === input.organizationId &&
        p2cObs.vehicleId === input.vehicleId &&
        p2cObs.providerBindingId === input.providerSourceLinkId;
      if (!p2cObservationCoverageVerified) {
        missing.push('P2C_BINDING_MISMATCH');
      }
    } else {
      missing.push('P2C_OBSERVATION_NOT_YET_AVAILABLE_AT_DECISION');
    }
  } else {
    missing.push('P2C_OBSERVATION_NOT_PERSISTED');
  }

  if (!profileRevision) {
    missing.push('SIGNAL_PROFILE_REVISION_NOT_AVAILABLE');
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
}
