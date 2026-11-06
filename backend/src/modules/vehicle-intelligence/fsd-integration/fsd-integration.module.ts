import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { DimoModule } from '@modules/dimo/dimo.module';
import { FsdDiscoveryPersistenceRepository } from '@fsd/persistence/fsd-discovery-persistence.repository';
import { resolveFsd3OrchestrationConfigFromEnv } from '@fsd/orchestration/fsd3-orchestration.config.v1';
import { resolveFsd4OrchestrationConfigFromEnv } from '@fsd/orchestration/fsd4-orchestration.config.v1';
import { FsdDiscoveryOrchestratorFactoryService } from './fsd-orchestrator-factory.service';
import { FsdDimoAdapterFactoryService } from './fsd-dimo-adapter-factory.service';
import { FSD3_ORCHESTRATION_CONFIG, FSD4_ORCHESTRATION_CONFIG } from './fsd-integration.tokens';

/**
 * Dormant FSD × DIMO integration: persistence, env-resolved config, live adapter factory, orchestrator factory.
 * No HTTP surface, schedulers, or startup jobs.
 */
@Module({
  imports: [PrismaModule, forwardRef(() => DimoModule)],
  providers: [
    FsdDiscoveryPersistenceRepository,
    FsdDimoAdapterFactoryService,
    FsdDiscoveryOrchestratorFactoryService,
    {
      provide: FSD3_ORCHESTRATION_CONFIG,
      useFactory: () => resolveFsd3OrchestrationConfigFromEnv(),
    },
    {
      provide: FSD4_ORCHESTRATION_CONFIG,
      useFactory: () => resolveFsd4OrchestrationConfigFromEnv(),
    },
  ],
  exports: [
    FsdDiscoveryPersistenceRepository,
    FsdDimoAdapterFactoryService,
    FsdDiscoveryOrchestratorFactoryService,
    FSD3_ORCHESTRATION_CONFIG,
    FSD4_ORCHESTRATION_CONFIG,
  ],
})
export class FsdDiscoveryIntegrationModule {}
