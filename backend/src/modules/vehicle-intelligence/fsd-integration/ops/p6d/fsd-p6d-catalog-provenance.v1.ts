import type { PrismaService } from '@shared/database/prisma.service';
import type { Fsd3DiscoveryProviderPortV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-provider.port.v1';
import type { Fsd3OneShotPreflightResultV1 } from '../fsd3-one-shot-preflight.service';
import {
  assertFsdP6dAuthoritativePersistedCatalogV1,
  parsePersistedCatalogCheckpointV1,
} from './fsd-p6d-catalog-provenance-authority.v1';
import { buildFsdDimoConnectionIdentityFingerprint } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.contract.v1';

export type FsdP6dCatalogEvidenceSourceV1 =
  | 'PERSISTED_FSD3_RUN'
  | 'LIVE_CATALOG_LEDGER'
  | 'MANIFEST_DECLARED_FIELDS';

export type FsdP6dCatalogProvenanceClassV1 = 'LIVE_DIMO_VERIFIED' | 'INTEGRATION_MOCK_DISPOSABLE';

export type FsdP6dVerifiedCatalogEvidenceV1 = {
  source: FsdP6dCatalogEvidenceSourceV1;
  provenanceClass: FsdP6dCatalogProvenanceClassV1;
  availableSignals: readonly string[];
  declaredCatalogFingerprint: string;
  connectionIdentityFingerprint: string;
  dimoTokenId: number;
  persistedRunId: string;
  httpStatus: number;
  providerSourceLinkId: string;
};

export type FsdP6dCatalogResolutionV1 =
  | { kind: 'VERIFIED'; evidence: FsdP6dVerifiedCatalogEvidenceV1 }
  | { kind: 'CATALOG_PENDING' };

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
    env?: NodeJS.ProcessEnv;
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
  const checkpoint = parsePersistedCatalogCheckpointV1(run.stages[0].checkpointJson);
  if (!checkpoint) {
    return null;
  }

  try {
    const authoritative = assertFsdP6dAuthoritativePersistedCatalogV1({
      env: input.env,
      context: {
        runId: run.id,
        runKey: run.runKey,
        organizationId: run.organizationId,
        vehicleId: run.vehicleId,
        providerSourceLinkId: run.providerSourceLinkId,
        dimoTokenId: tokenId,
        connectionIdentityFingerprint: fp,
        invalidatedAt: run.invalidatedAt,
        checkpoint,
        stageHttpStatus: run.stages[0].lastHttpStatus,
      },
    });
    return {
      source: 'PERSISTED_FSD3_RUN',
      provenanceClass:
        authoritative.provenance.class === 'LIVE_DIMO_VERIFIED'
          ? 'LIVE_DIMO_VERIFIED'
          : 'INTEGRATION_MOCK_DISPOSABLE',
      availableSignals: authoritative.availableSignals,
      declaredCatalogFingerprint: authoritative.declaredCatalogFingerprint,
      connectionIdentityFingerprint: fp,
      dimoTokenId: tokenId,
      persistedRunId: run.id,
      httpStatus: checkpoint.catalogFetch?.httpStatus ?? run.stages[0].lastHttpStatus ?? 200,
      providerSourceLinkId: input.providerSourceLinkId,
    };
  } catch {
    return null;
  }
}

export function assertLiveInFlightCatalogFetchResultV1(
  provider: Fsd3DiscoveryProviderPortV1,
  result: Awaited<ReturnType<Fsd3DiscoveryProviderPortV1['fetchAvailableSignals']>>,
): void {
  if (provider.providerKind === 'mock') {
    throw new Error('FSD_P6D_LIVE_CATALOG_MOCK_PROVIDER_REJECTED');
  }
  if (result.httpStatus === 401 || result.httpStatus === 403) {
    throw new Error('FSD_P6D_LIVE_CATALOG_AUTH_REJECTED');
  }
  if (result.httpStatus === 429) {
    throw new Error('FSD_P6D_LIVE_CATALOG_RATE_LIMITED');
  }
  if (result.httpStatus != null && result.httpStatus >= 500) {
    throw new Error('FSD_P6D_LIVE_CATALOG_SERVER_ERROR');
  }
  if (result.httpStatus !== 200) {
    throw new Error('FSD_P6D_LIVE_CATALOG_HTTP_NOT_OK');
  }
  if (result.catalogFetchSucceeded !== true) {
    throw new Error('FSD_P6D_LIVE_CATALOG_FETCH_NOT_SUCCEEDED');
  }
  if (!Array.isArray(result.availableSignals) || result.availableSignals.length === 0) {
    throw new Error('FSD_P6D_LIVE_CATALOG_EMPTY_OR_MALFORMED');
  }
}

/** Manifest declared fields are never authoritative catalog evidence. */
export function manifestDeclaredCatalogEvidenceV1(input: {
  preflight: Pick<Fsd3OneShotPreflightResultV1, 'connectionIdentityFingerprint' | 'dimoTokenId'>;
  declaredFieldNames: readonly string[];
}): null {
  if (input.declaredFieldNames.length > 0) {
    return null;
  }
  return null;
}

export async function resolveFsdP6dCatalogEvidenceV1(input: {
  prisma: PrismaService;
  env?: NodeJS.ProcessEnv;
  preflight: Fsd3OneShotPreflightResultV1;
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  manifestDeclaredFieldNames: readonly string[];
  allowCatalogPending?: boolean;
}): Promise<FsdP6dCatalogResolutionV1> {
  const persisted = await loadPersistedFsd3CatalogEvidenceV1(input.prisma, {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    providerSourceLinkId: input.providerSourceLinkId,
    preflight: input.preflight,
    env: input.env,
  });
  if (persisted) {
    return { kind: 'VERIFIED', evidence: persisted };
  }

  if (input.manifestDeclaredFieldNames.length > 0) {
    throw new Error('FSD_P6D_CATALOG_MANIFEST_ONLY_NOT_ACCEPTED');
  }

  if (input.allowCatalogPending) {
    return { kind: 'CATALOG_PENDING' };
  }

  throw new Error('FSD_P6D_CATALOG_EVIDENCE_MISSING');
}

export function assertFsdP6dCatalogIdentityBindingV1(input: {
  preflight: Pick<Fsd3OneShotPreflightResultV1, 'connectionIdentityFingerprint' | 'dimoTokenId' | 'dimoVehicleId'>;
  evidence: Pick<FsdP6dVerifiedCatalogEvidenceV1, 'connectionIdentityFingerprint' | 'dimoTokenId'>;
}): void {
  const computed = buildFsdDimoConnectionIdentityFingerprint({
    dimoVehicleId: input.preflight.dimoVehicleId ?? '',
    tokenId: input.preflight.dimoTokenId ?? 0,
  });
  if (input.preflight.connectionIdentityFingerprint !== computed) {
    throw new Error('FSD_P6D_CATALOG_PREFLIGHT_IDENTITY_DRIFT');
  }
  if (input.evidence.connectionIdentityFingerprint !== input.preflight.connectionIdentityFingerprint) {
    throw new Error('FSD_P6D_CATALOG_EVIDENCE_IDENTITY_MISMATCH');
  }
  if (input.evidence.dimoTokenId !== input.preflight.dimoTokenId) {
    throw new Error('FSD_P6D_CATALOG_EVIDENCE_TOKEN_MISMATCH');
  }
}
