import type { PrismaService } from '@shared/database/prisma.service';
import type { Fsd3DiscoveryProviderPortV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-provider.port.v1';
import type { Fsd3OneShotPreflightResultV1 } from '../fsd3-one-shot-preflight.service';
import { hasPersistedFsdCatalogFetchV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd-catalog-persist.util.v1';
import type { Fsd3CatalogStageCheckpointV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-request-ledger.v1';
import { FSD3_CATALOG_ATTEMPT_KEY_V1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-request-ledger.v1';
import { buildFsdDimoConnectionIdentityFingerprint } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.contract.v1';
import { assertFsdP6dProviderPreDispatchGateV1 } from './fsd-p6d-pre-dispatch-gate.v1';
import type { FsdP6cFleetDiscoveryPlanReportV1 } from '../p6c/fsd-p6c-fleet-plan.v1';
import type { FsdP6cFleetManifestV1 } from '../p6c/fsd-p6c-fleet-manifest.v1';
import type { FsdP6cLiveTestGoNoGoV1 } from '../p6c/fsd-p6c-go-no-go.v1';
import { isFsdP6dForceMockTransportV1 } from './fsd-p6d-live-fleet-gate.v1';

export type FsdP6dCatalogEvidenceSourceV1 =
  | 'PERSISTED_FSD3_RUN'
  | 'LIVE_CATALOG_DISPATCH'
  | 'MANIFEST_DECLARED_FIELDS';

export type FsdP6dCatalogProvenanceClassV1 = 'LIVE_VERIFIED' | 'INTEGRATION_MOCK_PERSISTED';

export type FsdP6dVerifiedCatalogEvidenceV1 = {
  source: FsdP6dCatalogEvidenceSourceV1;
  provenanceClass: FsdP6dCatalogProvenanceClassV1;
  availableSignals: readonly string[];
  connectionIdentityFingerprint: string;
  dimoTokenId: number;
  persistedRunId: string | null;
  httpStatus: number | null;
  providerSourceLinkId: string;
};

export type FsdP6dCatalogResolutionV1 =
  | { kind: 'VERIFIED'; evidence: FsdP6dVerifiedCatalogEvidenceV1 }
  | { kind: 'CATALOG_PENDING' };

const MOCK_RUN_KEY_FRAGMENTS = ['mock', 'p6c-pg', 'p6d-pg'] as const;

function parseCatalogCheckpoint(json: unknown): Fsd3CatalogStageCheckpointV1 | null {
  if (!json || typeof json !== 'object') {
    return null;
  }
  return json as Fsd3CatalogStageCheckpointV1;
}

function isSyntheticMockCatalogSignalList(signals: readonly string[]): boolean {
  return signals.some((s) => /^fsdSyntheticFloat\d+$/i.test(s));
}

function looksLikeMockDiscoveryRunKey(runKey: string): boolean {
  const lower = runKey.toLowerCase();
  return MOCK_RUN_KEY_FRAGMENTS.some((f) => lower.includes(f));
}

function assertPersistedCatalogLiveVerifiedV1(input: {
  checkpoint: Fsd3CatalogStageCheckpointV1;
  runKey: string;
  stageHttpStatus: number | null;
  acceptIntegrationMockPersistedEvidence: boolean;
}): void {
  if (!hasPersistedFsdCatalogFetchV1(input.checkpoint.catalogFetch)) {
    throw new Error('FSD_P6D_PERSISTED_CATALOG_INCOMPLETE');
  }
  const httpStatus = input.checkpoint.catalogFetch.httpStatus ?? input.stageHttpStatus;
  if (httpStatus !== 200) {
    throw new Error('FSD_P6D_PERSISTED_CATALOG_HTTP_NOT_200');
  }
  const catalogAttempt = input.checkpoint.requestLedger.attempts.find(
    (a) => a.attemptKey === FSD3_CATALOG_ATTEMPT_KEY_V1,
  );
  if (!catalogAttempt || catalogAttempt.outcome !== 'SUCCEEDED') {
    throw new Error('FSD_P6D_PERSISTED_CATALOG_LEDGER_NOT_SUCCEEDED');
  }
  const mockHint =
    looksLikeMockDiscoveryRunKey(input.runKey) ||
    isSyntheticMockCatalogSignalList(input.checkpoint.catalogFetch.availableSignalNames);
  if (mockHint && !input.acceptIntegrationMockPersistedEvidence) {
    throw new Error('FSD_P6D_MOCK_PERSISTED_CATALOG_REJECTED');
  }
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
    acceptIntegrationMockPersistedEvidence?: boolean;
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
  const checkpoint = parseCatalogCheckpoint(run.stages[0].checkpointJson);
  if (!checkpoint) {
    return null;
  }

  const acceptMock = input.acceptIntegrationMockPersistedEvidence === true;
  try {
    assertPersistedCatalogLiveVerifiedV1({
      checkpoint,
      runKey: run.runKey,
      stageHttpStatus: run.stages[0].lastHttpStatus,
      acceptIntegrationMockPersistedEvidence: acceptMock,
    });
  } catch {
    return null;
  }

  if (!hasPersistedFsdCatalogFetchV1(checkpoint.catalogFetch)) {
    return null;
  }

  const mockHint =
    looksLikeMockDiscoveryRunKey(run.runKey) ||
    isSyntheticMockCatalogSignalList(checkpoint.catalogFetch.availableSignalNames);

  return {
    source: 'PERSISTED_FSD3_RUN',
    provenanceClass: mockHint && acceptMock ? 'INTEGRATION_MOCK_PERSISTED' : 'LIVE_VERIFIED',
    availableSignals: [...checkpoint.catalogFetch.availableSignalNames],
    connectionIdentityFingerprint: fp,
    dimoTokenId: tokenId,
    persistedRunId: run.id,
    httpStatus: checkpoint.catalogFetch.httpStatus ?? run.stages[0].lastHttpStatus,
    providerSourceLinkId: input.providerSourceLinkId,
  };
}

function assertLiveCatalogFetchResultV1(
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
  if (result.catalogFetchSucceeded === false) {
    throw new Error('FSD_P6D_LIVE_CATALOG_FETCH_NOT_SUCCEEDED');
  }
  if (!Array.isArray(result.availableSignals)) {
    throw new Error('FSD_P6D_LIVE_CATALOG_MALFORMED_RESPONSE');
  }
  if (result.availableSignals.length === 0) {
    throw new Error('FSD_P6D_LIVE_CATALOG_EMPTY');
  }
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
  manifest: FsdP6cFleetManifestV1;
  planReport: FsdP6cFleetDiscoveryPlanReportV1;
  goNoGo: FsdP6cLiveTestGoNoGoV1;
  releaseSha: string;
}): Promise<FsdP6dVerifiedCatalogEvidenceV1> {
  const env = input.env ?? process.env;
  const forceMockTransport = isFsdP6dForceMockTransportV1(env);

  assertFsdP6dProviderPreDispatchGateV1({
    env,
    context: 'PREPARE_CATALOG_FETCH',
    releaseSha: input.releaseSha,
    goNoGo: input.goNoGo,
    planReport: input.planReport,
    manifest: input.manifest,
    forceMockTransport,
  });

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

  assertLiveCatalogFetchResultV1(input.provider, result);

  const computed = buildFsdDimoConnectionIdentityFingerprint({
    dimoVehicleId: input.preflight.dimoVehicleId ?? '',
    tokenId,
  });
  if (fp !== computed) {
    throw new Error('FSD_P6D_CATALOG_IDENTITY_DRIFT');
  }

  return {
    source: 'LIVE_CATALOG_DISPATCH',
    provenanceClass: 'LIVE_VERIFIED',
    availableSignals: [...result.availableSignals],
    connectionIdentityFingerprint: fp,
    dimoTokenId: tokenId,
    persistedRunId: null,
    httpStatus: result.httpStatus ?? null,
    providerSourceLinkId: input.dispatchContext.providerSourceLinkId,
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
    provenanceClass: 'LIVE_VERIFIED',
    availableSignals: [...input.declaredFieldNames],
    connectionIdentityFingerprint: fp,
    dimoTokenId: tokenId,
    persistedRunId: null,
    httpStatus: null,
    providerSourceLinkId: '',
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
  allowCatalogPending?: boolean;
  manifest?: FsdP6cFleetManifestV1;
  planReport?: FsdP6cFleetDiscoveryPlanReportV1;
  goNoGo?: FsdP6cLiveTestGoNoGoV1;
  releaseSha?: string;
}): Promise<FsdP6dCatalogResolutionV1> {
  const env = input.env ?? process.env;
  const acceptIntegrationMock = isFsdP6dForceMockTransportV1(env);

  const persisted = await loadPersistedFsd3CatalogEvidenceV1(input.prisma, {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    providerSourceLinkId: input.providerSourceLinkId,
    preflight: input.preflight,
    acceptIntegrationMockPersistedEvidence: acceptIntegrationMock,
  });
  if (persisted) {
    return { kind: 'VERIFIED', evidence: persisted };
  }

  if (input.liveCatalogProvider && input.catalogDispatchRunKey) {
    const tokenId = input.preflight.dimoTokenId;
    const fp = input.preflight.connectionIdentityFingerprint;
    if (tokenId == null || !fp) {
      throw new Error('FSD_P6D_CATALOG_PREFLIGHT_IDENTITY_MISSING');
    }
    if (!input.manifest || !input.planReport || !input.goNoGo || !input.releaseSha) {
      throw new Error('FSD_P6D_CATALOG_DISPATCH_CONTEXT_INCOMPLETE');
    }
    const evidence = await fetchLiveCatalogEvidenceV1({
      env,
      provider: input.liveCatalogProvider,
      preflight: input.preflight,
      manifest: input.manifest,
      planReport: input.planReport,
      goNoGo: input.goNoGo,
      releaseSha: input.releaseSha,
      dispatchContext: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        providerSourceLinkId: input.providerSourceLinkId,
        runKey: input.catalogDispatchRunKey,
        dimoTokenId: tokenId,
        connectionIdentityFingerprint: fp,
      },
    });
    return { kind: 'VERIFIED', evidence };
  }

  if (input.manifestDeclaredFieldNames.length > 0) {
    const fromManifest = manifestDeclaredCatalogEvidenceV1({
      preflight: input.preflight,
      declaredFieldNames: input.manifestDeclaredFieldNames,
    });
    if (fromManifest) {
      throw new Error('FSD_P6D_CATALOG_MANIFEST_ONLY_NOT_ACCEPTED');
    }
  }

  if (input.allowCatalogPending) {
    return { kind: 'CATALOG_PENDING' };
  }

  throw new Error('FSD_P6D_CATALOG_EVIDENCE_MISSING');
}
