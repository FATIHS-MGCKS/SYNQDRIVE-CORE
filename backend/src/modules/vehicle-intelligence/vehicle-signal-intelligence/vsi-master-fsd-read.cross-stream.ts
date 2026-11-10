import type { FsdRunWithStages } from './vsi-master-fsd-read.catalog-resolution';
import { extractCatalogCheckpointFromRun } from './vsi-master-fsd-read.catalog-resolution';

export type HistoricalCrossStreamLinkV1 =
  | { kind: 'LINKED'; fsd4Run: FsdRunWithStages }
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

export function resolveFsd4HistoricalCrossStreamLink(input: {
  authoritative: AuthoritativeCatalogIdentityV1;
  fsd4RunsNewestFirst: readonly FsdRunWithStages[];
}): HistoricalCrossStreamLinkV1 {
  const auth = input.authoritative;
  if (!auth.declaredCatalogFingerprint || !auth.connectionIdentityFingerprint || auth.dimoTokenId == null) {
    return { kind: 'UNVERIFIED_LINK', limitation: 'AUTHORITATIVE_CATALOG_IDENTITY_INCOMPLETE' };
  }

  for (const run of input.fsd4RunsNewestFirst) {
    if (run.discoveryStream !== 'FSD4_HISTORICAL') continue;
    if (run.invalidatedAt != null) continue;
    if (run.organizationId !== auth.organizationId) continue;
    if (run.vehicleId !== auth.vehicleId) continue;
    if (run.providerSourceLinkId !== auth.providerSourceLinkId) continue;
    if (run.dimoTokenId !== auth.dimoTokenId) continue;
    if (run.connectionIdentityFingerprint !== auth.connectionIdentityFingerprint) continue;

    const { checkpoint, catalogStage } = extractCatalogCheckpointFromRun(run);
    const fp = checkpoint?.catalogFetch?.declaredCatalogFingerprint ?? null;
    if (catalogStage?.status === 'SUCCEEDED' && fp === auth.declaredCatalogFingerprint) {
      return { kind: 'LINKED', fsd4Run: run };
    }
  }

  return {
    kind: 'UNVERIFIED_LINK',
    limitation:
      'NO_FSD4_RUN_WITH_MATCHING_CATALOG_FINGERPRINT_AND_CONNECTION_IDENTITY',
  };
}
