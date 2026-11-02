import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import {
  selectVsiProfileRevisionAsOf,
  type VsiProfileRevisionAsOfSelectionResult,
} from './vsi-profile-revision-as-of.resolver';
import {
  VsiProfileRevisionAsOfQueryCompleteness,
  type VsiProfileRevisionAsOfQueryEvidenceV1,
  type VsiProfileRevisionAsOfResolutionV1,
} from './vsi-profile-revision-as-of.types';
import type { VsiProfileRevisionHistoryRowV1 } from './vsi-profile-revision-history.types';

const MAX_ELIGIBLE_REVISION_SCAN = 4096;

function decisionTimeQueryIncomplete(): {
  bestRevision: null;
  queryEvidence: VsiProfileRevisionAsOfQueryEvidenceV1;
} {
  return {
    bestRevision: null,
    queryEvidence: {
      completeness: VsiProfileRevisionAsOfQueryCompleteness.INCOMPLETE,
      eligibleRevisionCountExact: null,
      maxEligibleProfileRevision: null,
    },
  };
}

function mapRow(row: {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  profileRevision: number;
  profileContractVersion: string;
  contentFingerprint: string;
  providerIdentity: string;
  verifiedModality: string | null;
  telemetrySourceFamily: string | null;
  evaluatedAt: Date;
  recordedAt: Date;
  signalsSnapshot: unknown;
  profileLimitations: unknown;
  materializationTrigger: string;
  sourceLinkLifecycleContext: unknown;
  sourceProvenance: unknown;
}): VsiProfileRevisionHistoryRowV1 {
  return {
    organizationId: row.organizationId,
    vehicleId: row.vehicleId,
    providerSourceLinkId: row.providerSourceLinkId,
    profileRevision: row.profileRevision,
    profileContractVersion: row.profileContractVersion,
    contentFingerprint: row.contentFingerprint,
    providerIdentity: row.providerIdentity,
    verifiedModality: row.verifiedModality,
    telemetrySourceFamily: row.telemetrySourceFamily,
    evaluatedAt: row.evaluatedAt,
    recordedAt: row.recordedAt,
    signalsSnapshot: row.signalsSnapshot,
    profileLimitations: Array.isArray(row.profileLimitations)
      ? (row.profileLimitations as string[])
      : [],
    materializationTrigger: row.materializationTrigger as VsiProfileRevisionHistoryRowV1['materializationTrigger'],
    sourceLinkLifecycleContext: row.sourceLinkLifecycleContext as VsiProfileRevisionHistoryRowV1['sourceLinkLifecycleContext'],
    sourceProvenance: row.sourceProvenance as VsiProfileRevisionHistoryRowV1['sourceProvenance'],
  };
}

@Injectable()
export class VsiProfileRevisionHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @deprecated For as-of resolution use {@link loadDecisionTimeRevisionEvidence} or {@link resolveRevisionAsOf}.
   * Listing without decision-time filters can omit older eligible revisions.
   */
  async listRevisionsForLink(input: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
    maxRows?: number;
  }): Promise<VsiProfileRevisionHistoryRowV1[]> {
    const limit = Math.min(Math.max(input.maxRows ?? 128, 1), 512);
    const rows = await this.prisma.vehicleSignalCapabilityProfileRevision.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerSourceLinkId: input.providerSourceLinkId,
      },
      orderBy: [{ profileRevision: 'desc' }],
      take: limit,
    });
    return rows.map(mapRow);
  }

  /**
   * Decision-time-aware bounded load: temporal filters applied in SQL.
   * Uses `REPEATABLE READ` so count, findFirst, and aggregate share one snapshot.
   */
  async loadDecisionTimeRevisionEvidence(input: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
    decisionAt: Date;
    maxEligibleScan?: number;
  }): Promise<{
    bestRevision: VsiProfileRevisionHistoryRowV1 | null;
    queryEvidence: VsiProfileRevisionAsOfQueryEvidenceV1;
  }> {
    const decisionAt = input.decisionAt;
    const scope = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: input.providerSourceLinkId,
      recordedAt: { lte: decisionAt },
      evaluatedAt: { lte: decisionAt },
    };
    const scanCap = Math.min(Math.max(input.maxEligibleScan ?? MAX_ELIGIBLE_REVISION_SCAN, 1), 10_000);

    return this.prisma.$transaction(
      async (tx) => {
        const eligibleRevisionCountExact = await tx.vehicleSignalCapabilityProfileRevision.count({
          where: scope,
        });

        if (eligibleRevisionCountExact > scanCap) {
          return decisionTimeQueryIncomplete();
        }

        const best = await tx.vehicleSignalCapabilityProfileRevision.findFirst({
          where: scope,
          orderBy: [{ profileRevision: 'desc' }, { recordedAt: 'desc' }, { id: 'desc' }],
        });

        const maxEligible = await tx.vehicleSignalCapabilityProfileRevision.aggregate({
          where: scope,
          _max: { profileRevision: true },
        });

        const maxRev = maxEligible._max.profileRevision;

        if (eligibleRevisionCountExact > 0 && !best) {
          return decisionTimeQueryIncomplete();
        }
        if (eligibleRevisionCountExact === 0 && (best != null || maxRev != null)) {
          return decisionTimeQueryIncomplete();
        }
        if (best && maxRev != null && best.profileRevision !== maxRev) {
          return decisionTimeQueryIncomplete();
        }

        return {
          bestRevision: best ? mapRow(best) : null,
          queryEvidence: {
            completeness: VsiProfileRevisionAsOfQueryCompleteness.COMPLETE,
            eligibleRevisionCountExact,
            maxEligibleProfileRevision: maxRev,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async resolveRevisionAsOf(input: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
    decisionAt: Date;
    historicalLinkAttributionProven: boolean;
  }): Promise<VsiProfileRevisionAsOfResolutionV1> {
    const { bestRevision, queryEvidence } = await this.loadDecisionTimeRevisionEvidence({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: input.providerSourceLinkId,
      decisionAt: input.decisionAt,
    });

    const selection: VsiProfileRevisionAsOfSelectionResult = selectVsiProfileRevisionAsOf({
      revisions: bestRevision ? [bestRevision] : [],
      decisionAt: input.decisionAt,
      historicalLinkAttributionProven: input.historicalLinkAttributionProven,
      queryEvidence,
    });

    return {
      authority: selection.authority,
      selectedRevision: selection.selectedRevision,
      limitations: selection.limitations,
      queryEvidence,
    };
  }
}
