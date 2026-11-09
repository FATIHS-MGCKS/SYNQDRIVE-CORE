import type { PrismaService } from '@shared/database/prisma.service';
import type { Fsd3DiscoveryProviderPortV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-provider.port.v1';
import type { Fsd3OneShotPreflightResultV1 } from '../fsd3-one-shot-preflight.service';
import { hasPersistedFsdCatalogFetchV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd-catalog-persist.util.v1';
import type { Fsd3CatalogStageCheckpointV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-request-ledger.v1';
import { buildFsdDimoConnectionIdentityFingerprint } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.contract.v1';
import { assertFsdP6dLiveCatalogDispatchAuthorizedV1 } from './fsd-p6d-live-fleet-gate.v1';

export type FsdP6dCatalogEvidenceSourceV1 =
  | 'PERSISTED_FSD3_RUN'
  | 'LIVE_CATALOG_DISPATCH'
  | 'MANIFEST_DECLARED_FIELDS';

export type FsdP6dVerifiedCatalogEvidenceV1 = {
  source: FsdP6dCatalogEvidenceSourceV1;
  availableSignals: readonly string[];
  connectionIdentityFingerprint: string;
  dimoTokenId: number;
  persistedRunId: string | null;
  httpStatus: number | null;
};

function parseCatalogCheckpoint(json: unknown): string[] | null {
  if (!json || typeof json !== 'object') {
    return null;
  }
  const cp = json as Fsd3CatalogStageCheckpointV1;
  if (!hasPersistedFsdCatalogFetchV1(cp.catalogFetch)) {
    return null;
  }
  return [...cp.catalogFetch.availableSignalNames];
}

export async function loadPersistedFsd3CatalogEvidenceV1(
  prisma: PrismaService,
  input: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
    preflight: Pick<
      Fsd3OneShotPreflightResultV1,
      'connectionIdentityFingerprint' | 'dimoTokenId'
    >;
  },
): Promise<FsdP6dVerifiedCatalogEvidenceV1 | null> {
  const fp = input.preflight.connectionIdentityFingerprint;
  const tokenId = input.preflight.dimoTokenId;
  if (!fp || tokenId == null) {
    return null;
  }

  const run = await prisma.fsdDiscoveryRun.findFirst({
    where: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerSourceLinkId: input.providerSourceLinkId,
      discoveryStream: 'FSD3_CATALOG_SNAPSHOT',
      status: 'COMPLETED',
      invalidatedAt: null,
      connectionIdentityFingerprint: fp,
      dimoTokenId: tokenId,
    },
    orderBy: { completedAt: 'desc' },
    include: {
      stages: {
        where: { stageType: 'CATALOG', status: 'SUCCEEDED' },
        take: 1,
      },
    },
  });
  if (!run?.stages[0]) {
    return null;
  }
  const signals = parseCatalogCheckpoint(run.stages[0].checkpointJson);
  if (signals == null) {
    return null;
  }
  return {
    source: 'PERSISTED_FSD3_RUN',
    availableSignals: signals,
    connectionIdentityFingerprint: fp,
    dimoTokenId: tokenId,
    persistedRunId: run.id,
    httpStatus: run.stages[0].lastHttpStatus,
  };
}

export async function fetchLiveCatalogEvidenceV1(input: {
  env?: NodeJS.ProcessEnv;
  provider: Fsd3DiscoveryProviderPortV1;
  preflight: Pick<
    Fsd3OneShotPreflightResultV1,
    'connectionIdentityFingerprint' | 'dimoTokenId' | 'dimoVehicleId'
  >;
  dispatchContext: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
    runKey: string;
    dimoTokenId: number;
    connectionIdentityFingerprint: string;
  };
}): Promise<FsdP6dVerifiedCatalogEvidenceV1> {
  const env = input.env ?? process.env;
  assertFsdP6dLiveCatalogDispatchAuthorizedV1(env);
  const tokenId = input.preflight.dimoTokenId;
  const fp = input.preflight.connectionIdentityFingerprint;
  if (tokenId == null || !fp) {
    throw new Error('FSD_P6D_CATALOG_PREFLIGHT_IDENTITY_MISSING');
  }
  const result = await input.provider.fetchAvailableSignals({
    tokenId,
    dispatchContext: {
      organizationId: input.dispatchContext.organizationId,
      vehicleId: input.dispatchContext.vehicleId,
      providerSourceLinkId: input.dispatchContext.providerSourceLinkId,
      runKey: input.dispatchContext.runKey,
      discoveryStream: 'FSD3_CATALOG_SNAPSHOT',
      dimoTokenId: input.dispatchContext.dimoTokenId,
      connectionIdentityFingerprint: input.dispatchContext.connectionIdentityFingerprint,
    },
  });
  if (!Array.isArray(result.availableSignals)) {
    throw new Error('FSD_P6D_LIVE_CATALOG_MALFORMED_RESPONSE');
  }
  const computed = buildFsdDimoConnectionIdentityFingerprint({
    dimoVehicleId: input.preflight.dimoVehicleId ?? '',
    tokenId,
  });
  if (fp !== computed) {
    throw new Error('FSD_P6D_CATALOG_IDENTITY_DRIFT');
  }
  return {
    source: 'LIVE_CATALOG_DISPATCH',
    availableSignals: [...result.availableSignals],
    connectionIdentityFingerprint: fp,
    dimoTokenId: tokenId,
    persistedRunId: null,
    httpStatus: result.httpStatus ?? null,
  };
}

export function manifestDeclaredCatalogEvidenceV1(input: {
  preflight: Pick<Fsd3OneShotPreflightResultV1, 'connectionIdentityFingerprint' | 'dimoTokenId'>;
  declaredFieldNames: readonly string[];
}): FsdP6dVerifiedCatalogEvidenceV1 | null {
  if (input.declaredFieldNames.length === 0) {
    return null;
  }
  const fp = input.preflight.connectionIdentityFingerprint;
  const tokenId = input.preflight.dimoTokenId;
  if (!fp || tokenId == null) {
    return null;
  }
  return {
    source: 'MANIFEST_DECLARED_FIELDS',
    availableSignals: [...input.declaredFieldNames],
    connectionIdentityFingerprint: fp,
    dimoTokenId: tokenId,
    persistedRunId: null,
    httpStatus: null,
  };
}

export async function resolveFsdP6dCatalogEvidenceV1(input: {
  prisma: PrismaService;
  env?: NodeJS.ProcessEnv;
  preflight: Fsd3OneShotPreflightResultV1;
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  manifestDeclaredFieldNames: readonly string[];
  liveCatalogProvider?: Fsd3DiscoveryProviderPortV1;
  catalogDispatchRunKey?: string;
}): Promise<FsdP6dVerifiedCatalogEvidenceV1> {
  const persisted = await loadPersistedFsd3CatalogEvidenceV1(input.prisma, {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    providerSourceLinkId: input.providerSourceLinkId,
    preflight: input.preflight,
  });
  if (persisted) {
    return persisted;
  }

  if (input.liveCatalogProvider && input.catalogDispatchRunKey) {
    const tokenId = input.preflight.dimoTokenId;
    const fp = input.preflight.connectionIdentityFingerprint;
    if (tokenId == null || !fp) {
      throw new Error('FSD_P6D_CATALOG_PREFLIGHT_IDENTITY_MISSING');
    }
    return fetchLiveCatalogEvidenceV1({
      env: input.env,
      provider: input.liveCatalogProvider,
      preflight: input.preflight,
      dispatchContext: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerSourceLinkId: input.providerSourceLinkId,
        runKey: input.catalogDispatchRunKey,
        dimoTokenId: tokenId,
        connectionIdentityFingerprint: fp,
      },
    });
  }

  const fromManifest = manifestDeclaredCatalogEvidenceV1({
    preflight: input.preflight,
    declaredFieldNames: input.manifestDeclaredFieldNames,
  });
  if (fromManifest) {
    throw new Error('FSD_P6D_CATALOG_MANIFEST_ONLY_NOT_ACCEPTED');
  }

  throw new Error('FSD_P6D_CATALOG_EVIDENCE_MISSING');
}
