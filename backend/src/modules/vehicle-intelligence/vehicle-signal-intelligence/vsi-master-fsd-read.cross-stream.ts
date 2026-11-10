import type { FsdRunWithStages } from './vsi-master-fsd-read.catalog-resolution';
import { extractCatalogCheckpointFromRun } from './vsi-master-fsd-read.catalog-resolution';
import { isStageNotStarted } from './vsi-master-fsd-read.semantics';

export type Fsd4HistoricalEvidenceClassV1 = 'FULL' | 'PARTIAL';

export type HistoricalCrossStreamLinkV1 =
  | {
      kind: 'LINKED';
      fsd4Run: FsdRunWithStages;
      historicalStageStatus: string;
      historicalEvidenceClass: Fsd4HistoricalEvidenceClassV1;
    }
  | { kind: 'UNVERIFIED_LINK'; limitation: string }
  | { kind: 'NOT_AVAILABLE' };

export type AuthoritativeCatalogIdentityV1 = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  dimoTokenId: number | null;
  connectionIdentityFingerprint: string | null;
  declaredCatalogFingerprint: string | null;
};

function scopeAndCatalogMatch(run: FsdRunWithStages, auth: AuthoritativeCatalogIdentityV1): boolean {
  if (run.discoveryStream !== 'FSD4_HISTORICAL') return false;
  if (run.invalidatedAt != null || run.status === 'INVALIDATED') return false;
  if (run.organizationId !== auth.organizationId) return false;
  if (run.vehicleId !== auth.vehicleId) return false;
  if (run.providerSourceLinkId !== auth.providerSourceLinkId) return false;
  if (run.dimoTokenId !== auth.dimoTokenId) return false;
  if (run.connectionIdentityFingerprint !== auth.connectionIdentityFingerprint) return false;

  const { checkpoint, catalogStage } = extractCatalogCheckpointFromRun(run);
  const fp = checkpoint?.catalogFetch?.declaredCatalogFingerprint ?? null;
  return catalogStage?.status === 'SUCCEEDED' && fp === auth.declaredCatalogFingerprint;
}

export function classifyFsd4HistoricalEvidenceLink(
  run: FsdRunWithStages,
  historicalStageStatus: string | null,
  historicalEvidenceRowCount: number,
): Fsd4HistoricalEvidenceClassV1 | null {
  if (isStageNotStarted(historicalStageStatus)) return null;
  if (historicalEvidenceRowCount <= 0) {
    return null;
  }
  if (run.status === 'COMPLETED' && historicalStageStatus === 'SUCCEEDED') {
    return 'FULL';
  }
  if (run.status === 'FAILED' && historicalStageStatus === 'PLANNED') {
    return null;
  }
  if (run.status === 'PENDING' && isStageNotStarted(historicalStageStatus)) {
    return null;
  }
  return 'PARTIAL';
}

export function pickValidFsd4HistoricalEvidenceRun(input: {
  authoritative: AuthoritativeCatalogIdentityV1;
  fsd4RunsNewestFirst: readonly FsdRunWithStages[];
  historicalEvidenceRowCountByRunId: Readonly<Record<string, number>>;
}): HistoricalCrossStreamLinkV1 {
  const auth = input.authoritative;
  if (!auth.declaredCatalogFingerprint || !auth.connectionIdentityFingerprint || auth.dimoTokenId == null) {
    return { kind: 'UNVERIFIED_LINK', limitation: 'AUTHORITATIVE_CATALOG_IDENTITY_INCOMPLETE' };
  }

  let bestPartial: HistoricalCrossStreamLinkV1 | null = null;

  for (const run of input.fsd4RunsNewestFirst) {
    if (!scopeAndCatalogMatch(run, auth)) continue;

    const historicalStage = run.stages.find((s) => s.stageType === 'HISTORICAL');
    const histStatus = historicalStage?.status ?? null;
    const rowCount = input.historicalEvidenceRowCountByRunId[run.id] ?? 0;
    const linkClass = classifyFsd4HistoricalEvidenceLink(run, histStatus, rowCount);
    if (!linkClass) continue;

    const link: HistoricalCrossStreamLinkV1 = {
      kind: 'LINKED',
      fsd4Run: run,
      historicalStageStatus: histStatus!,
      historicalEvidenceClass: linkClass,
    };

    if (linkClass === 'FULL') {
      return link;
    }
    if (!bestPartial) {
      bestPartial = link;
    }
  }

  if (bestPartial?.kind === 'LINKED') {
    return bestPartial;
  }

  return {
    kind: 'UNVERIFIED_LINK',
    limitation: 'NO_FSD4_RUN_WITH_VALID_HISTORICAL_EVIDENCE_AND_MATCHING_IDENTITY',
  };
}

/** @deprecated use pickValidFsd4HistoricalEvidenceRun */
export function resolveFsd4HistoricalCrossStreamLink(input: {
  authoritative: AuthoritativeCatalogIdentityV1;
  fsd4RunsNewestFirst: readonly FsdRunWithStages[];
  historicalEvidenceRowCountByRunId?: Readonly<Record<string, number>>;
}): HistoricalCrossStreamLinkV1 {
  return pickValidFsd4HistoricalEvidenceRun({
    ...input,
    historicalEvidenceRowCountByRunId: input.historicalEvidenceRowCountByRunId ?? {},
  });
}
