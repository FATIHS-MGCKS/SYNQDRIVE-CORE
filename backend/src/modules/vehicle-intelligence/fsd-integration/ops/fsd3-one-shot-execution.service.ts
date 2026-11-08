import { Injectable } from '@nestjs/common';
import { hostname } from 'node:os';
import { FsdDiscoveryPersistenceRepository } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.repository';
import { Fsd3CatalogSnapshotOrchestratorService } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-orchestration.service.v1';
import type { Fsd3DiscoveryProviderPortV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-provider.port.v1';
import { buildFsd3DiscoveryRequestRunKeyV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-discovery-request.v1';
import { buildFsd3OneShotCliOrchestrationConfigV1 } from './fsd3-one-shot-cli-fsd3-config.v1';
import { p6bCliDiscoveryBudget } from './fsd3-one-shot-cli-budget.v1';
import type { Fsd3OneShotCliScopeV1, Fsd3OneShotLiveProviderV1 } from './fsd3-one-shot-types.v1';
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

export type Fsd3OneShotExecutionResultV1 = {
  mode: 'EXECUTE';
  discoveryRequestKey: string;
  runId: string;
  terminalStatus: string;
  reason?: string;
  operatorAuthorizationReference: string;
  releaseSha: string;
};

@Injectable()
export class Fsd3OneShotExecutionService {
  constructor(private readonly persistence: FsdDiscoveryPersistenceRepository) {}

  async executeOneShot(input: {
    scope: Fsd3OneShotCliScopeV1;
    preflight: Fsd3OneShotPreflightResultV1;
    liveProvider: Fsd3OneShotLiveProviderV1;
    provider: Fsd3DiscoveryProviderPortV1;
    releaseSha?: string;
  }): Promise<Fsd3OneShotExecutionResultV1> {
    if (input.liveProvider === 'dimo_live' && input.provider.providerKind !== 'live') {
      throw new Error('FSD3_EXECUTION_PROVIDER_KIND_MISMATCH');
    }
    if (input.liveProvider === 'mock' && input.provider.providerKind === 'live') {
      throw new Error('FSD3_EXECUTION_PROVIDER_KIND_MISMATCH');
    }
    if (
      !input.preflight.dimoVehicleId ||
      input.preflight.dimoTokenId == null ||
      !input.preflight.connectionIdentityFingerprint
    ) {
      throw new Error('FSD3_PREFLIGHT_DIMO_IDENTITY_INCOMPLETE');
    }

    const dispatchScope = {
      organizationId: input.scope.organizationId,
      vehicleId: input.scope.vehicleId,
      providerSourceLinkId: input.scope.providerSourceLinkId,
    };

    await this.persistence.assertActiveSourceLinkForDispatch(dispatchScope);
    const runKey = buildFsd3DiscoveryRequestRunKeyV1({
      discoveryRequestKey: input.scope.discoveryRequestKey,
      connectionIdentityFingerprint: input.preflight.connectionIdentityFingerprint,
    });
    await this.persistence.assertDimoDispatchBinding({
      organizationId: input.scope.organizationId,
      vehicleId: input.scope.vehicleId,
      providerSourceLinkId: input.scope.providerSourceLinkId,
      runKey,
      dimoTokenId: input.preflight.dimoTokenId,
      connectionIdentityFingerprint: input.preflight.connectionIdentityFingerprint,
      discoveryStream: 'FSD3_CATALOG_SNAPSHOT',
    });

    const config = buildFsd3OneShotCliOrchestrationConfigV1(input.scope.vehicleId);
    const orchestrator = new Fsd3CatalogSnapshotOrchestratorService(
      this.persistence,
      input.provider,
      config,
    );

    const leaseOwner = `fsd3-one-shot:${hostname()}:${input.scope.discoveryRequestKey}`;
    const leaseExpiresAt = new Date(Date.now() + LEASE_TTL_MS);
    const releaseSha = input.releaseSha ?? resolveFsd3OneShotReleaseShaForAuditV1();

    const orchestrationInput = {
      organizationId: input.scope.organizationId,
      vehicleId: input.scope.vehicleId,
      providerSourceLinkId: input.scope.providerSourceLinkId,
      dimoVehicleId: input.preflight.dimoVehicleId,
      dimoTokenId: input.preflight.dimoTokenId,
      discoveryRequestKey: input.scope.discoveryRequestKey,
      leaseOwner,
      leaseExpiresAt,
      budget: p6bCliDiscoveryBudget(),
    };

    const waitStarted = Date.now();
    let result = await orchestrator.runCatalogSnapshotDiscovery(orchestrationInput);
    while (
      result.status === 'FAILED' &&
      result.failureReason &&
      CONCURRENT_ORCHESTRATION_TRANSIENT_FAILURES.has(result.failureReason) &&
      Date.now() - waitStarted < CONCURRENT_ORCHESTRATION_MAX_WAIT_MS
    ) {
      await new Promise((resolve) => setTimeout(resolve, CONCURRENT_ORCHESTRATION_POLL_MS));
      result = await orchestrator.runCatalogSnapshotDiscovery(orchestrationInput);
    }
    if (
      result.status === 'FAILED' &&
      result.failureReason &&
      CONCURRENT_ORCHESTRATION_TRANSIENT_FAILURES.has(result.failureReason)
    ) {
      throw new Error('FSD3_ONE_SHOT_CONCURRENT_WAIT_EXHAUSTED');
    }

    if (result.status === 'SKIPPED') {
      return {
        mode: 'EXECUTE',
        discoveryRequestKey: input.scope.discoveryRequestKey,
        runId: '',
        terminalStatus: result.status,
        reason: result.reason,
        operatorAuthorizationReference: input.preflight.authorizationReference,
        releaseSha,
      };
    }
    return {
      mode: 'EXECUTE',
      discoveryRequestKey: input.scope.discoveryRequestKey,
      runId: result.runId,
      terminalStatus: result.status,
      reason: result.failureReason,
      operatorAuthorizationReference: input.preflight.authorizationReference,
      releaseSha,
    };
  }
}
