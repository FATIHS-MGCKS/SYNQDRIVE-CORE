import { Inject, Injectable } from '@nestjs/common';
import { FsdDiscoveryPersistenceRepository } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.repository';
import { Fsd3CatalogSnapshotOrchestratorService } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-orchestration.service.v1';
import { Fsd4HistoricalDiscoveryOrchestratorService } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd4-orchestration.service.v1';
import type { Fsd3OrchestrationConfigV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-orchestration.config.v1';
import type { Fsd4OrchestrationConfigV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd4-orchestration.config.v1';
import type { Fsd3DiscoveryProviderPortV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd3-provider.port.v1';
import type { Fsd4HistoricalDiscoveryProviderPortV1 } from '@modules/vehicle-intelligence/full-signal-discovery/orchestration/fsd4-provider.port.v1';
import { FSD3_ORCHESTRATION_CONFIG, FSD4_ORCHESTRATION_CONFIG } from './fsd-integration.tokens';

/**
 * Factory for FSD orchestrators — no default provider wiring (callers pass mock or live port).
 */
@Injectable()
export class FsdDiscoveryOrchestratorFactoryService {
  constructor(
    private readonly persistence: FsdDiscoveryPersistenceRepository,
    @Inject(FSD3_ORCHESTRATION_CONFIG) private readonly fsd3Config: Fsd3OrchestrationConfigV1,
    @Inject(FSD4_ORCHESTRATION_CONFIG) private readonly fsd4Config: Fsd4OrchestrationConfigV1,
  ) {}

  createFsd3Orchestrator(provider: Fsd3DiscoveryProviderPortV1): Fsd3CatalogSnapshotOrchestratorService {
    return new Fsd3CatalogSnapshotOrchestratorService(this.persistence, provider, this.fsd3Config);
  }

  createFsd4Orchestrator(
    provider: Fsd4HistoricalDiscoveryProviderPortV1,
  ): Fsd4HistoricalDiscoveryOrchestratorService {
    return new Fsd4HistoricalDiscoveryOrchestratorService(this.persistence, provider, this.fsd4Config);
  }
}
