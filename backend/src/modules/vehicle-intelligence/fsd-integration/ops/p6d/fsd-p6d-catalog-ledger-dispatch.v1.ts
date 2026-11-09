import type { Fsd3DiscoveryProviderPortV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-provider.port.v1';
import type { FsdBudgetConfigV1 } from '@modules/vehicle-intelligence/full-signal-discovery/fsd-budget.contract.v1';
import { createDefaultFsdBudgetConfigV1 } from '@modules/vehicle-intelligence/full-signal-discovery/fsd-budget.contract.v1';
import type { Fsd3OneShotExecutionService } from '../fsd3-one-shot-execution.service';
import type { Fsd3OneShotPreflightResultV1 } from '../fsd3-one-shot-preflight.service';
import type { PrismaService } from '@shared/database/prisma.service';
import {
  assertFsdP6dAuthoritativePersistedCatalogV1,
  parsePersistedCatalogCheckpointV1,
} from './fsd-p6d-catalog-provenance-authority.v1';
import type { Fsd3OneShotLiveProviderV1 } from '../fsd3-one-shot-types.v1';

export const FSD_P6D_CATALOG_PREP_REQUEST_PREFIX_V1 = 'p6d-catalog-prep' as const;

export function buildFsdP6dCatalogPrepDiscoveryRequestKeyV1(discoveryRequestKey: string): string {
  return `${FSD_P6D_CATALOG_PREP_REQUEST_PREFIX_V1}:${discoveryRequestKey}`;
}

/** Catalog-only budget (1 provider slot) via existing FSD3 orchestrator ledger. */
export function buildFsdP6dCatalogOnlyBudgetV1(base?: FsdBudgetConfigV1): FsdBudgetConfigV1 {
  const normalized = base ?? createDefaultFsdBudgetConfigV1();
  return { ...normalized, maxRequestsPerRun: 1 };
}

export async function dispatchFsdP6dCatalogWithLedgerV1(input: {
  prisma: PrismaService;
  env?: NodeJS.ProcessEnv;
  executionSvc: Fsd3OneShotExecutionService;
  scope: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
    discoveryRequestKey: string;
  };
  preflight: Fsd3OneShotPreflightResultV1;
  liveProvider: Fsd3OneShotLiveProviderV1;
  provider: Fsd3DiscoveryProviderPortV1;
  releaseSha: string;
  budget?: FsdBudgetConfigV1;
}): Promise<{
  runId: string;
  availableSignals: readonly string[];
  declaredCatalogFingerprint: string;
  persistedRunId: string;
  httpStatus: number;
}> {
  const catalogRequestKey = buildFsdP6dCatalogPrepDiscoveryRequestKeyV1(input.scope.discoveryRequestKey);
  const result = await input.executionSvc.executeOneShot({
    scope: {
      organizationId: input.scope.organizationId,
      vehicleId: input.scope.vehicleId,
      providerSourceLinkId: input.scope.providerSourceLinkId,
      discoveryRequestKey: catalogRequestKey,
    },
    preflight: input.preflight,
    liveProvider: input.liveProvider,
    provider: input.provider,
    budget: buildFsdP6dCatalogOnlyBudgetV1(input.budget),
    releaseSha: input.releaseSha,
  });

  if (result.terminalStatus !== 'COMPLETED') {
    throw new Error(`FSD_P6D_CATALOG_LEDGER_DISPATCH_FAILED:${result.terminalStatus}`);
  }

  const run = await input.prisma.fsdDiscoveryRun.findUnique({
    where: { id: result.runId },
    include: {
      stages: { where: { stageType: 'CATALOG', status: 'SUCCEEDED' }, take: 1 },
    },
  });
  if (!run?.stages[0]) {
    throw new Error('FSD_P6D_CATALOG_LEDGER_RUN_STAGE_MISSING');
  }

  const checkpoint = parsePersistedCatalogCheckpointV1(run.stages[0].checkpointJson);
  if (!checkpoint) {
    throw new Error('FSD_P6D_CATALOG_LEDGER_CHECKPOINT_MISSING');
  }

  const authoritative = assertFsdP6dAuthoritativePersistedCatalogV1({
    env: input.env,
    context: {
      runId: run.id,
      runKey: run.runKey,
      organizationId: run.organizationId,
      vehicleId: run.vehicleId,
      providerSourceLinkId: run.providerSourceLinkId,
      dimoTokenId: run.dimoTokenId ?? input.preflight.dimoTokenId!,
      connectionIdentityFingerprint:
        run.connectionIdentityFingerprint ?? input.preflight.connectionIdentityFingerprint!,
      invalidatedAt: run.invalidatedAt,
      checkpoint,
      stageHttpStatus: run.stages[0].lastHttpStatus,
    },
  });

  const httpStatus = checkpoint.catalogFetch?.httpStatus ?? run.stages[0].lastHttpStatus ?? 200;

  return {
    runId: run.id,
    persistedRunId: run.id,
    availableSignals: authoritative.availableSignals,
    declaredCatalogFingerprint: authoritative.declaredCatalogFingerprint,
    httpStatus,
  };
}
