import { Module, forwardRef } from '@nestjs/common';
import { DimoModule } from '@modules/dimo/dimo.module';
import { FsdDimoAdapterFactoryService } from '../fsd-dimo-adapter-factory.service';
import { FsdDiscoveryOpsModule } from './fsd-discovery-ops.module';

/**
 * Live DIMO dispatch bootstrap for the one-shot CLI only — not loaded for mock/offline modes.
 */
@Module({
  imports: [FsdDiscoveryOpsModule, forwardRef(() => DimoModule)],
  providers: [FsdDimoAdapterFactoryService],
  exports: [FsdDimoAdapterFactoryService, FsdDiscoveryOpsModule],
})
export class Fsd3OneShotLiveBootstrapModule {}
