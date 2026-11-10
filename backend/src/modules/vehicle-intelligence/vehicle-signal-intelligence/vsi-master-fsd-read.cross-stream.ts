import type { FsdRunWithStages } from './vsi-master-fsd-read.catalog-resolution';
import { extractCatalogCheckpointFromRun } from './vsi-master-fsd-read.catalog-resolution';
import { isStageNotStarted } from './vsi-master-fsd-read.semantics';

export type HistoricalCrossStreamLinkV1 =
  | { kind: 'LINKED'; fsd4Run: FsdRunWithStages; historicalStageStatus: string }
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

/**
 * Historical stage must have left persisted evidence scope — not merely a matching catalog stage on a failed shell run.
 */
export function isFsd4HistoricalStageEvidenceEligible(historicalStageStatus: string | null): boolean {
  if (isStageNotStarted(historicalStageStatus)) return false;
  return true;
}

export function pickValidFsd4HistoricalEvidenceRun(input: {
  authoritative: AuthoritativeCatalogIdentityV1;
  fsd4RunsNewestFirst: readonly FsdRunWithStages[];
}): HistoricalCrossStreamLinkV1 {
  const auth = input.authoritative;
  if (!auth.declaredCatalogFingerprint || !auth.connectionIdentityFingerprint || auth.dimoTokenId == null) {
    return { kind: 'UNVERIFIED_LINK', limitation: 'AUTHORITATIVE_CATALOG_IDENTITY_INCOMPLETE' };
  }

  for (const run of input.fsd4RunsNewestFirst) {
    if (!scopeAndCatalogMatch(run, auth)) continue;

    const historicalStage = run.stages.find((s) => s.stageType === 'HISTORICAL');
    const histStatus = historicalStage?.status ?? null;

    if (!isFsd4HistoricalStageEvidenceEligible(histStatus)) {
      continue;
    }

    if (run.status === 'FAILED' && histStatus !== 'SUCCEEDED' && histStatus !== 'UNKNOWN_OUTCOME' && histStatus !== 'FAILED') {
      continue;
    }

    if (run.status === 'PENDING' && isStageNotStarted(histStatus)) {
      continue;
    }

    return {
      kind: 'LINKED',
      fsd4Run: run,
      historicalStageStatus: histStatus!,
    };
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
}): HistoricalCrossStreamLinkV1 {
  return pickValidFsd4HistoricalEvidenceRun(input);
}
