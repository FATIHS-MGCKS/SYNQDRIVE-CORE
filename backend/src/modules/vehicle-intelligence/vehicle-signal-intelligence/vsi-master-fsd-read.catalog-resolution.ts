import type { FsdDiscoveryRun, FsdDiscoveryStage } from '@prisma/client';
import { parsePersistedCatalogCheckpointV1 } from '@modules/vehicle-intelligence/fsd-integration/ops/p6d/fsd-p6d-catalog-provenance-authority.v1';
import { filterAuthoritativeCatalogSignalNames } from './vsi-master-fsd-read.internal-signals';
import {
  resolvePersistedCatalogProvenanceReadV1,
  type MasterFsdCatalogProvenanceReadV1,
} from './vsi-master-fsd-read.provenance';

export type FsdRunWithStages = FsdDiscoveryRun & { stages: FsdDiscoveryStage[] };

export type ResolvedAuthoritativeFsd3CatalogV1 = {
  run: FsdRunWithStages;
  provenance: MasterFsdCatalogProvenanceReadV1;
  declaredSignalNames: readonly string[];
};

export function extractCatalogCheckpointFromRun(run: FsdRunWithStages): {
  checkpoint: ReturnType<typeof parsePersistedCatalogCheckpointV1>;
  catalogStage: FsdDiscoveryStage | undefined;
} {
  const catalogStage = run.stages.find((s) => s.stageType === 'CATALOG');
  const checkpoint = catalogStage ? parsePersistedCatalogCheckpointV1(catalogStage.checkpointJson) : null;
  return { checkpoint, catalogStage };
}

export function resolveCatalogProvenanceForRun(run: FsdRunWithStages): MasterFsdCatalogProvenanceReadV1 | null {
  const { checkpoint, catalogStage } = extractCatalogCheckpointFromRun(run);
  if (!checkpoint || catalogStage?.status !== 'SUCCEEDED') {
    return null;
  }
  return resolvePersistedCatalogProvenanceReadV1({
    runId: run.id,
    runKey: run.runKey,
    organizationId: run.organizationId,
    vehicleId: run.vehicleId,
    providerSourceLinkId: run.providerSourceLinkId,
    dimoTokenId: run.dimoTokenId,
    connectionIdentityFingerprint: run.connectionIdentityFingerprint,
    invalidatedAt: run.invalidatedAt,
    checkpoint,
    stageHttpStatus: catalogStage.lastHttpStatus,
  });
}

/**
 * Latest activity = newest run by createdAt. Authoritative catalog = newest valid LIVE_DIMO_VERIFIED catalog (completed catalog stage).
 */
export function pickAuthoritativeFsd3Catalog(
  runsNewestFirst: readonly FsdRunWithStages[],
): ResolvedAuthoritativeFsd3CatalogV1 | null {
  for (const run of runsNewestFirst) {
    const provenance = resolveCatalogProvenanceForRun(run);
    if (!provenance || provenance.availability !== 'AUTHORITATIVE_LIVE') {
      continue;
    }
    const { checkpoint } = extractCatalogCheckpointFromRun(run);
    const raw = checkpoint?.catalogFetch?.availableSignalNames ?? [];
    const names = filterAuthoritativeCatalogSignalNames(raw);
    if (names.length === 0) {
      continue;
    }
    return { run, provenance, declaredSignalNames: names };
  }
  return null;
}

export function describeExplicitRunCatalog(
  run: FsdRunWithStages,
): { authoritative: boolean; provenance: MasterFsdCatalogProvenanceReadV1 | null; declaredSignalNames: readonly string[] } {
  if (run.discoveryStream !== 'FSD3_CATALOG_SNAPSHOT') {
    return { authoritative: false, provenance: null, declaredSignalNames: [] };
  }
  const provenance = resolveCatalogProvenanceForRun(run);
  const { checkpoint } = extractCatalogCheckpointFromRun(run);
  const raw = checkpoint?.catalogFetch?.availableSignalNames ?? [];
  const names = filterAuthoritativeCatalogSignalNames(raw);
  return {
    authoritative: provenance?.availability === 'AUTHORITATIVE_LIVE',
    provenance,
    declaredSignalNames: names,
  };
}
