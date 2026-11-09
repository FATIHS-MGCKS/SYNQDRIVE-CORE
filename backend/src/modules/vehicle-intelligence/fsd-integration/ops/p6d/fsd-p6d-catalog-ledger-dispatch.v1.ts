import type { Fsd3DiscoveryProviderPortV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-provider.port.v1';
import type { FsdBudgetConfigV1 } from '@modules/vehicle-intelligence/full-signal-discovery/fsd-budget.contract.v1';
import { createDefaultFsdBudgetConfigV1 } from '@modules/vehicle-intelligence/full-signal-discovery/fsd-budget.contract.v1';
import type { Fsd3OneShotExecutionService } from '../fsd3-one-shot-execution.service';
import type { Fsd3OneShotPreflightResultV1 } from '../fsd3-one-shot-preflight.service';
import type { PrismaService } from '@shared/database/prisma.service';
import type { Fsd3OneShotLiveProviderV1 } from '../fsd3-one-shot-types.v1';
import { verifyFsdP6dCatalogOnlyLedgerDispatchV1 } from './fsd-p6d-catalog-only-outcome.v1';

export const FSD_P6D_CATALOG_PREP_REQUEST_PREFIX_V1 = 'p6d-catalog-prep' as const;

export function buildFsdP6dCatalogPrepDiscoveryRequestKeyV1(discoveryRequestKey: string): string {
  return `${FSD_P6D_CATALOG_PREP_REQUEST_PREFIX_V1}:${discoveryRequestKey}`;
}

/** Catalog-only budget (1 provider slot) via existing FSD3 orchestrator ledger. */
export function buildFsdP6dCatalogOnlyBudgetV1(base?: FsdBudgetConfigV1): FsdBudgetConfigV1 {
  const normalized = base ?? createDefaultFsdBudgetConfigV1();
  return { ...normalized, maxRequestsPerRun: 1 };
}

function readCatalogProviderCallCount(
  provider: Fsd3DiscoveryProviderPortV1,
): number | null {
  const maybe = provider as Fsd3DiscoveryProviderPortV1 & { getCatalogCallCount?: () => number };
  return typeof maybe.getCatalogCallCount === 'function' ? maybe.getCatalogCallCount() : null;
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
  clientTerminalStatus: string;
  ledgerCatalogAttemptsSucceeded: number;
  ledgerReplayed: boolean;
}> {
  const catalogCallsBefore = readCatalogProviderCallCount(input.provider);

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

  const verified = await verifyFsdP6dCatalogOnlyLedgerDispatchV1({
    prisma: input.prisma,
    env: input.env,
    organizationId: input.scope.organizationId,
    oneShotResult: result,
    preflight: {
      dimoTokenId: input.preflight.dimoTokenId!,
      connectionIdentityFingerprint: input.preflight.connectionIdentityFingerprint!,
    },
  });

  if (!verified.verdict.accepted) {
    throw new Error(verified.verdict.reason);
  }
  const accepted = verified as Extract<typeof verified, { verdict: { accepted: true } }>;

  const catalogCallsAfter = readCatalogProviderCallCount(input.provider);
  const ledgerReplayed =
    catalogCallsBefore != null &&
    catalogCallsAfter != null &&
    catalogCallsAfter === catalogCallsBefore &&
    accepted.verdict.ledgerCatalogAttemptsSucceeded === 1;

  return {
    runId: accepted.persistedRunId,
    persistedRunId: accepted.persistedRunId,
    availableSignals: accepted.availableSignals,
    declaredCatalogFingerprint: accepted.declaredCatalogFingerprint,
    httpStatus: accepted.httpStatus,
    clientTerminalStatus: accepted.verdict.runTerminalClientStatus,
    ledgerCatalogAttemptsSucceeded: accepted.verdict.ledgerCatalogAttemptsSucceeded,
    ledgerReplayed,
  };
}
