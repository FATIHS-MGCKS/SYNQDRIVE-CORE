import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { FsdDiscoveryPersistenceRepository } from '@modules/vehicle-intelligence/full-signal-discovery/persistence/fsd-discovery-persistence.repository';
import { DimoSourceLinkOperatorAuthorizationService } from '@modules/vehicle-onboarding/services/dimo-source-link-operator-authorization.service';
import { Fsd3OneShotPreflightService } from './fsd3-one-shot-preflight.service';
import { Fsd3OneShotExecutionService } from './fsd3-one-shot-execution.service';
import { Fsd4OneShotExecutionService } from './fsd4-one-shot-execution.service';
import { FsdP6cFleetDiscoveryService } from './fsd-p6c-fleet-discovery.service';
import { Fsd3DiscoveryRunInspectorService } from './fsd3-discovery-run-inspector.service';

/**
 * Minimal Nest surface for FSD3 one-shot ops CLIs — no BullMQ, cron, HTTP or AppModule.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    FsdDiscoveryPersistenceRepository,
    DimoSourceLinkOperatorAuthorizationService,
    Fsd3OneShotPreflightService,
    Fsd3OneShotExecutionService,
    Fsd4OneShotExecutionService,
    FsdP6cFleetDiscoveryService,
    Fsd3DiscoveryRunInspectorService,
  ],
  exports: [
    FsdDiscoveryPersistenceRepository,
    DimoSourceLinkOperatorAuthorizationService,
    Fsd3OneShotPreflightService,
    Fsd3OneShotExecutionService,
    Fsd4OneShotExecutionService,
    FsdP6cFleetDiscoveryService,
    Fsd3DiscoveryRunInspectorService,
  ],
})
export class FsdDiscoveryOpsModule {}
