import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { FsdDiscoveryPersistenceRepository } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.repository';
import { Fsd3CatalogSnapshotOrchestratorService } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-orchestration.service.v1';
import type { Fsd3DiscoveryProviderPortV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-provider.port.v1';
import { buildFsd3DiscoveryRequestRunKeyV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-discovery-request.v1';
import { buildFsd3OneShotCliOrchestrationConfigV1 } from './fsd3-one-shot-cli-fsd3-config.v1';
import { p6bCliDiscoveryBudget } from './fsd3-one-shot-cli-budget.v1';
import { Fsd3OneShotCapabilityService } from './fsd3-one-shot-capability.service';
import type { Fsd3OneShotLiveProviderV1 } from './fsd3-one-shot-execution-capability.v1';

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
  constructor(
    private readonly persistence: FsdDiscoveryPersistenceRepository,
    private readonly capability: Fsd3OneShotCapabilityService,
  ) {}

  async executeAuthorizedOneShot(input: {
    executionCapability: string;
    provider: Fsd3DiscoveryProviderPortV1;
    expectedLiveProvider: Fsd3OneShotLiveProviderV1;
  }): Promise<Fsd3OneShotExecutionResultV1> {
    const cap = this.capability.verify(input.executionCapability);
    if (cap.liveProvider !== input.expectedLiveProvider) {
      throw new Error('FSD3_EXECUTION_PROVIDER_MISMATCH');
    }
    if (input.expectedLiveProvider === 'dimo_live' && input.provider.providerKind !== 'live') {
      throw new Error('FSD3_EXECUTION_PROVIDER_KIND_MISMATCH');
    }
    if (input.expectedLiveProvider === 'mock' && input.provider.providerKind === 'live') {
      throw new Error('FSD3_EXECUTION_PROVIDER_KIND_MISMATCH');
    }

    const scope = {
      organizationId: cap.organizationId,
      vehicleId: cap.vehicleId,
      providerSourceLinkId: cap.providerSourceLinkId,
    };

    await this.persistence.assertActiveSourceLinkForDispatch(scope);
    const runKey = buildFsd3DiscoveryRequestRunKeyV1({
      discoveryRequestKey: cap.discoveryRequestKey,
      connectionIdentityFingerprint: cap.connectionIdentityFingerprint,
    });
    await this.persistence.assertDimoDispatchBinding({
      organizationId: cap.organizationId,
      vehicleId: cap.vehicleId,
      providerSourceLinkId: cap.providerSourceLinkId,
      runKey,
      dimoTokenId: cap.dimoTokenId,
      connectionIdentityFingerprint: cap.connectionIdentityFingerprint,
      discoveryStream: 'FSD3_CATALOG_SNAPSHOT',
    });

    const config = buildFsd3OneShotCliOrchestrationConfigV1(cap.vehicleId);
    const orchestrator = new Fsd3CatalogSnapshotOrchestratorService(
      this.persistence,
      input.provider,
      config,
    );

    const leaseOwner = `fsd3-one-shot:${hostname()}:${cap.discoveryRequestKey}:${randomUUID()}`;
    const leaseExpiresAt = new Date(Date.now() + LEASE_TTL_MS);

    const result = await orchestrator.runCatalogSnapshotDiscovery({
      organizationId: cap.organizationId,
      vehicleId: cap.vehicleId,
      providerSourceLinkId: cap.providerSourceLinkId,
      dimoVehicleId: cap.dimoVehicleId,
      dimoTokenId: cap.dimoTokenId,
      discoveryRequestKey: cap.discoveryRequestKey,
      leaseOwner,
      leaseExpiresAt,
      budget: p6bCliDiscoveryBudget(),
    });

    if (result.status === 'SKIPPED') {
      return {
        mode: 'EXECUTE',
        discoveryRequestKey: cap.discoveryRequestKey,
        runId: '',
        terminalStatus: result.status,
        reason: result.reason,
        approvalReference: cap.approvalReference,
        executableReleaseSha: cap.attestedExecutableReleaseSha,
      };
    }
    return {
      mode: 'EXECUTE',
      discoveryRequestKey: cap.discoveryRequestKey,
      runId: result.runId,
      terminalStatus: result.status,
      reason: result.failureReason,
      approvalReference: cap.approvalReference,
      executableReleaseSha: cap.attestedExecutableReleaseSha,
    };
  }
}
