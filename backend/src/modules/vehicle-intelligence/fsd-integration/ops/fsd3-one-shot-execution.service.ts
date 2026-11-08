import { Injectable } from '@nestjs/common';
import { hostname } from 'node:os';
import { FsdDiscoveryPersistenceRepository } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.repository';
import { Fsd3CatalogSnapshotOrchestratorService } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-orchestration.service.v1';
import type { Fsd3DiscoveryProviderPortV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-provider.port.v1';
import { buildFsd3OneShotCliOrchestrationConfigV1 } from './fsd3-one-shot-cli-fsd3-config.v1';
import { p6bCliDiscoveryBudget } from './fsd3-one-shot-cli-budget.v1';
import type { Fsd3OneShotCliScopeV1 } from './fsd3-one-shot-owner-approval.v1';
import type { Fsd3OneShotPreflightResultV1 } from './fsd3-one-shot-preflight.service';

const LEASE_TTL_MS = 15 * 60 * 1000;

export type Fsd3OneShotExecutionResultV1 = {
  mode: 'EXECUTE';
  discoveryRequestKey: string;
  runId: string;
  terminalStatus: string;
  reason?: string;
  approvalReference: string;
  executableReleaseSha: string;
};

@Injectable()
export class Fsd3OneShotExecutionService {
  constructor(private readonly persistence: FsdDiscoveryPersistenceRepository) {}

  async executeAuthorizedOneShot(input: {
    scope: Fsd3OneShotCliScopeV1;
    approvalReference: string;
    preflight: Fsd3OneShotPreflightResultV1;
    provider: Fsd3DiscoveryProviderPortV1;
  }): Promise<Fsd3OneShotExecutionResultV1> {
    if (!input.preflight.dimoVehicleId || input.preflight.dimoTokenId == null) {
      throw new Error('DIMO_IDENTITY_INCOMPLETE');
    }

    const config = buildFsd3OneShotCliOrchestrationConfigV1(input.scope.vehicleId);
    const orchestrator = new Fsd3CatalogSnapshotOrchestratorService(
      this.persistence,
      input.provider,
      config,
    );

    const leaseOwner = `fsd3-one-shot:${hostname()}:${input.scope.discoveryRequestKey}`;
    const leaseExpiresAt = new Date(Date.now() + LEASE_TTL_MS);

    const result = await orchestrator.runCatalogSnapshotDiscovery({
      organizationId: input.scope.organizationId,
      vehicleId: input.scope.vehicleId,
      providerSourceLinkId: input.scope.providerSourceLinkId,
      dimoVehicleId: input.preflight.dimoVehicleId,
      dimoTokenId: input.preflight.dimoTokenId,
      discoveryRequestKey: input.scope.discoveryRequestKey,
      leaseOwner,
      leaseExpiresAt,
      budget: p6bCliDiscoveryBudget(),
    });

    if (result.status === 'SKIPPED') {
      return {
        mode: 'EXECUTE',
        discoveryRequestKey: input.scope.discoveryRequestKey,
        runId: '',
        terminalStatus: result.status,
        reason: result.reason,
        approvalReference: input.approvalReference,
        executableReleaseSha: input.scope.executableReleaseSha,
      };
    }
    return {
      mode: 'EXECUTE',
      discoveryRequestKey: input.scope.discoveryRequestKey,
      runId: result.runId,
      terminalStatus: result.status,
      reason: result.failureReason,
      approvalReference: input.approvalReference,
      executableReleaseSha: input.scope.executableReleaseSha,
    };
  }
}
