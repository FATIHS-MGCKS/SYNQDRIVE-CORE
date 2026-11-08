import { Injectable } from '@nestjs/common';
import { hostname } from 'node:os';
import { FsdDiscoveryPersistenceRepository } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.repository';
import { Fsd4HistoricalDiscoveryOrchestratorService } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd4-orchestration.service.v1';
import type { Fsd4HistoricalDiscoveryProviderPortV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd4-provider.port.v1';
import type { FsdBudgetConfigV1 } from '@modules/vehicle-intelligence/full-signal-discovery/fsd-budget.contract.v1';
import type { FsdHistoricalWindowV1 } from '@modules/vehicle-intelligence/full-signal-discovery/fsd-query-document.builder.v1';
import { buildFsd4OneShotCliOrchestrationConfigV1 } from './fsd3-one-shot-cli-fsd3-config.v1';
import type { Fsd3OneShotLiveProviderV1 } from './fsd3-one-shot-types.v1';
import type { Fsd3OneShotPreflightResultV1 } from './fsd3-one-shot-preflight.service';
import { resolveFsd3OneShotReleaseShaForAuditV1 } from './fsd3-one-shot-types.v1';

const LEASE_TTL_MS = 15 * 60 * 1000;

const CONCURRENT_ORCHESTRATION_TRANSIENT_FAILURES = new Set([
  'ACTIVE_RUN_CONFLICT',
  'LEASE_NOT_AVAILABLE_FOR_RESUME',
  'LEASE_CLAIM_FAILED',
]);

const CONCURRENT_ORCHESTRATION_POLL_MS = 50;
const CONCURRENT_ORCHESTRATION_MAX_WAIT_MS = 120_000;

export type Fsd4OneShotExecutionResultV1 = {
  mode: 'EXECUTE';
  historicalRequestKey: string;
  runId: string;
  terminalStatus: string;
  reason?: string;
  verifiedFsd3CatalogRunId?: string;
  operatorAuthorizationReference: string;
  releaseSha: string;
};

export type Fsd4OneShotCliScopeV1 = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  historicalRequestKey: string;
};

@Injectable()
export class Fsd4OneShotExecutionService {
  constructor(private readonly persistence: FsdDiscoveryPersistenceRepository) {}

  async executeHistoricalOneShot(input: {
    scope: Fsd4OneShotCliScopeV1;
    preflight: Fsd3OneShotPreflightResultV1;
    liveProvider: Fsd3OneShotLiveProviderV1;
    provider: Fsd4HistoricalDiscoveryProviderPortV1;
    historicalWindow: FsdHistoricalWindowV1;
    budget: FsdBudgetConfigV1;
    verifiedFsd3CatalogRunId?: string;
    releaseSha?: string;
  }): Promise<Fsd4OneShotExecutionResultV1> {
    if (input.liveProvider === 'dimo_live' && input.provider.providerKind !== 'live') {
      throw new Error('FSD4_EXECUTION_PROVIDER_KIND_MISMATCH');
    }
    if (input.liveProvider === 'mock' && input.provider.providerKind === 'live') {
      throw new Error('FSD4_EXECUTION_PROVIDER_KIND_MISMATCH');
    }
    if (
      !input.preflight.dimoVehicleId ||
      input.preflight.dimoTokenId == null ||
      !input.preflight.connectionIdentityFingerprint
    ) {
      throw new Error('FSD4_PREFLIGHT_DIMO_IDENTITY_INCOMPLETE');
    }

    const dispatchScope = {
      organizationId: input.scope.organizationId,
      vehicleId: input.scope.vehicleId,
      providerSourceLinkId: input.scope.providerSourceLinkId,
    };

    await this.persistence.assertActiveSourceLinkForDispatch(dispatchScope);

    const config = buildFsd4OneShotCliOrchestrationConfigV1(input.scope.vehicleId);
    const orchestrator = new Fsd4HistoricalDiscoveryOrchestratorService(
      this.persistence,
      input.provider,
      config,
    );

    const leaseOwner = `fsd4-one-shot:${hostname()}:${input.scope.historicalRequestKey}`;
    const leaseExpiresAt = new Date(Date.now() + LEASE_TTL_MS);
    const releaseSha = input.releaseSha ?? resolveFsd3OneShotReleaseShaForAuditV1();

    const orchestrationInput = {
      organizationId: input.scope.organizationId,
      vehicleId: input.scope.vehicleId,
      providerSourceLinkId: input.scope.providerSourceLinkId,
      dimoVehicleId: input.preflight.dimoVehicleId,
      dimoTokenId: input.preflight.dimoTokenId,
      historicalRequestKey: input.scope.historicalRequestKey,
      historicalWindow: input.historicalWindow,
      leaseOwner,
      leaseExpiresAt,
      budget: input.budget,
      verifiedFsd3CatalogRunId: input.verifiedFsd3CatalogRunId,
    };

    const waitStarted = Date.now();
    let result = await orchestrator.runHistoricalDiscovery(orchestrationInput);
    while (
      result.status === 'FAILED' &&
      result.failureReason &&
      CONCURRENT_ORCHESTRATION_TRANSIENT_FAILURES.has(result.failureReason) &&
      Date.now() - waitStarted < CONCURRENT_ORCHESTRATION_MAX_WAIT_MS
    ) {
      await new Promise((resolve) => setTimeout(resolve, CONCURRENT_ORCHESTRATION_POLL_MS));
      result = await orchestrator.runHistoricalDiscovery(orchestrationInput);
    }
    if (
      result.status === 'FAILED' &&
      result.failureReason &&
      CONCURRENT_ORCHESTRATION_TRANSIENT_FAILURES.has(result.failureReason)
    ) {
      throw new Error('FSD4_ONE_SHOT_CONCURRENT_WAIT_EXHAUSTED');
    }

    if (result.status === 'SKIPPED') {
      return {
        mode: 'EXECUTE',
        historicalRequestKey: input.scope.historicalRequestKey,
        runId: '',
        terminalStatus: result.status,
        reason: result.reason,
        verifiedFsd3CatalogRunId: input.verifiedFsd3CatalogRunId,
        operatorAuthorizationReference: input.preflight.authorizationReference,
        releaseSha,
      };
    }

    return {
      mode: 'EXECUTE',
      historicalRequestKey: input.scope.historicalRequestKey,
      runId: result.runId,
      terminalStatus: result.status,
      reason: result.failureReason,
      verifiedFsd3CatalogRunId: input.verifiedFsd3CatalogRunId,
      operatorAuthorizationReference: input.preflight.authorizationReference,
      releaseSha,
    };
  }
}
