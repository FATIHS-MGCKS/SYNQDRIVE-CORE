import type { PrismaClient } from '@prisma/client';
import type { VsiP0aAuditCohort, VsiP0aProductionVerification } from './vsi-p0a-signal-integrity-audit.types';
import type { VsiP0aProfileAuditBundle } from './vsi-p0a-signal-integrity-audit.engine';
import {
  VSI_P0A_HF_HISTORY_DAYS,
  VSI_P0A_MAX_FINALIZED_TRIPS,
  VSI_P0A_MAX_RPM_POINTS,
} from './vsi-p0a-signal-integrity-audit.engine';
import type { VsiP0aHfEvidenceSlice } from './vsi-p0a-signal-integrity-audit.types';

const ENGINE_RPM_SIGNAL = 'powertrainCombustionEngineSpeed';

export type VsiP0aClickHousePort = {
  getBoundedSignalValuePoints(input: {
    vehicleId: string;
    signalName: string;
    from: Date;
    to: Date;
    limit: number;
  }): Promise<{ status: string; points: { timestamp: Date }[] }>;
};

export async function loadVsiP0aProfileBundles(input: {
  prisma: PrismaClient;
  cohort: VsiP0aAuditCohort;
  projectionAsOf: Date;
  clickHouse?: VsiP0aClickHousePort | null;
  verifyClickHouse?: boolean;
}): Promise<VsiP0aProfileAuditBundle[]> {
  const bundles: VsiP0aProfileAuditBundle[] = [];

  for (const vehicle of input.cohort.vehicles) {
    const link = await input.prisma.vehicleDataSourceLink.findFirst({
      where: {
        vehicleId: vehicle.vehicleId,
        isActive: true,
      },
      orderBy: { activatedAt: 'desc' },
      select: {
        id: true,
        provider: true,
        sourceSubtype: true,
        metadata: true,
        activatedAt: true,
        deactivatedAt: true,
      },
    });

    if (!link) {
      continue;
    }

    const profile = await input.prisma.vehicleSignalCapabilityProfile.findUnique({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId: input.cohort.organizationId,
          vehicleId: vehicle.vehicleId,
          providerSourceLinkId: link.id,
        },
      },
    });

    if (!profile) {
      continue;
    }

    const hfBySignal: VsiP0aProfileAuditBundle['hfBySignal'] = {};
    let verificationPartial = false;

    if (input.verifyClickHouse && input.clickHouse && vehicle.powertrainClass === 'ICE') {
      const windowStart = new Date(
        Math.max(
          link.activatedAt.getTime(),
          input.projectionAsOf.getTime() - VSI_P0A_HF_HISTORY_DAYS * 24 * 3600 * 1000,
        ),
      );
      const trips = await input.prisma.vehicleTrip.findMany({
        where: {
          vehicleId: vehicle.vehicleId,
          tripStatus: 'COMPLETED',
          endTime: { not: null, gte: windowStart, lte: input.projectionAsOf },
        },
        orderBy: { endTime: 'desc' },
        take: VSI_P0A_MAX_FINALIZED_TRIPS,
        select: { id: true, startTime: true, endTime: true },
      });
      const tripWindows = trips.filter((t) => t.endTime != null);
      if (tripWindows.length > 0) {
        const earliest = Math.min(...tripWindows.map((t) => t.startTime.getTime()));
        const latest = Math.max(...tripWindows.map((t) => t.endTime!.getTime()));
        try {
          const read = await input.clickHouse.getBoundedSignalValuePoints({
            vehicleId: vehicle.vehicleId,
            signalName: ENGINE_RPM_SIGNAL,
            from: new Date(earliest),
            to: new Date(latest),
            limit: VSI_P0A_MAX_RPM_POINTS,
          });
          const slice: VsiP0aHfEvidenceSlice = {
            availability:
              read.status === 'SUCCESS' && read.points.length > 0
                ? 'SUPPORTED_WITH_SAMPLES'
                : read.status === 'SUCCESS'
                  ? 'SUPPORTED_EMPTY'
                  : 'NOT_VERIFIED',
            sampleCount: read.points.length,
            tripCount: tripWindows.length,
            windowStart: new Date(earliest).toISOString(),
            windowEnd: new Date(latest).toISOString(),
            activeCadenceProfile: null,
            queryLimits: {
              hfHistoryDays: VSI_P0A_HF_HISTORY_DAYS,
              maxFinalizedTrips: VSI_P0A_MAX_FINALIZED_TRIPS,
              maxRpmPoints: VSI_P0A_MAX_RPM_POINTS,
              clickHouseStatus: read.status,
              filterScope: 'vehicleId',
            },
          };
          hfBySignal.engine_rpm = slice;
        } catch {
          verificationPartial = true;
          hfBySignal.engine_rpm = {
            availability: 'NOT_VERIFIED',
            sampleCount: null,
            tripCount: tripWindows.length,
            windowStart: new Date(earliest).toISOString(),
            windowEnd: new Date(latest).toISOString(),
            activeCadenceProfile: null,
            queryLimits: { error: 'clickhouse_read_failed' },
          };
        }
      }
    }

    bundles.push({
      vehicle,
      sourceLinkId: link.id,
      provider: link.provider,
      providerModality:
        vehicle.providerModality ??
        (typeof link.sourceSubtype === 'string' ? link.sourceSubtype : null),
      profileRow: {
        evaluatedAt: profile.evaluatedAt,
        lastMaterializedProviderFetchAt: profile.lastMaterializedProviderFetchAt,
        signalsSnapshot: profile.signalsSnapshot,
        providerSourceLinkId: profile.providerSourceLinkId,
        providerIdentity: profile.providerIdentity,
        profileRevision: profile.profileRevision,
        profileContractVersion: profile.profileContractVersion,
        profileLimitations: profile.profileLimitations,
        contentFingerprint: profile.contentFingerprint,
        lastMaterializedSourceTimestamp: profile.lastMaterializedSourceTimestamp,
      },
      hfBySignal,
      verificationPartial,
    });
  }

  return bundles;
}

export function buildVsiP0aProductionVerification(input: {
  verifiedAt: Date;
  originMainSha: string;
  productionCurrentSha: string;
  productionRelease: string | null;
  replica3001Sha: string | null;
  replica3002Sha: string | null;
  pm2Health: string | null;
  publicHealthOk: boolean;
  pr2255Sha: string;
  pr2256Sha: string;
  pr2257Sha: string;
  frontendBundle: string | null;
  frontendHasRpmDual: boolean;
  frontendHasDualTestId: boolean;
  notes?: string[];
}): VsiP0aProductionVerification {
  const ancestor = (sha: string) =>
    input.productionCurrentSha.startsWith('MISSING')
      ? 'NOT_VERIFIED'
      : isAncestor(input.productionCurrentSha, sha)
        ? 'CODE_PRESENT'
        : 'NOT_PRESENT';

  return {
    verifiedAt: input.verifiedAt.toISOString(),
    originMainSha: input.originMainSha,
    productionCurrentSha: input.productionCurrentSha,
    productionRelease: input.productionRelease,
    replica3001Sha: input.replica3001Sha,
    replica3002Sha: input.replica3002Sha,
    pm2Health: input.pm2Health,
    publicHealthOk: input.publicHealthOk,
    pr2255: ancestor(input.pr2255Sha) as VsiP0aProductionVerification['pr2255'],
    pr2256: ancestor(input.pr2256Sha) as VsiP0aProductionVerification['pr2256'],
    pr2257: ancestor(input.pr2257Sha) as VsiP0aProductionVerification['pr2257'],
    frontendArtifact: {
      bundlePath: input.frontendBundle,
      rpmDualPresent: input.frontendHasRpmDual ? 'ARTIFACT_PRESENT' : 'NOT_PRESENT',
      dualProvenanceTestIdPresent: input.frontendHasDualTestId
        ? 'ARTIFACT_PRESENT'
        : 'NOT_PRESENT',
    },
    runtimeDualProvenanceUi: 'NOT_VERIFIED',
    notes: input.notes ?? [],
  };
}

function isAncestor(productionSha: string, mergeSha: string): boolean {
  if (!productionSha || !mergeSha || productionSha === 'NOT_VERIFIED') return false;
  return productionSha === mergeSha;
}

/** Git ancestry check helper for ops script (injected result from `git merge-base --is-ancestor`). */
export function mapGitAncestorResults(input: {
  productionSha: string;
  pr2255Present: boolean;
  pr2256Present: boolean;
  pr2257Present: boolean;
  base: Omit<VsiP0aProductionVerification, 'pr2255' | 'pr2256' | 'pr2257'>;
}): VsiP0aProductionVerification {
  return {
    ...input.base,
    pr2255: input.pr2255Present ? 'CODE_PRESENT' : 'NOT_PRESENT',
    pr2256: input.pr2256Present ? 'CODE_PRESENT' : 'NOT_PRESENT',
    pr2257: input.pr2257Present ? 'CODE_PRESENT' : 'NOT_PRESENT',
  };
}
