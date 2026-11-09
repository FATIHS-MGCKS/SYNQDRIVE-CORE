import { Module } from '@nestjs/common';
import { Fsd3OneShotDimoLiveSliceModule } from './fsd3-one-shot-dimo-live-slice.module';
import { FsdP6dFleetLiveExecutorService } from './fsd-p6d-fleet-live-executor.service';

/** P6D fleet live executor — DIMO adapter slice + fleet ops; not loaded on PM2 replicas. */
@Module({
  imports: [Fsd3OneShotDimoLiveSliceModule],
  providers: [FsdP6dFleetLiveExecutorService],
  exports: [FsdP6dFleetLiveExecutorService, Fsd3OneShotDimoLiveSliceModule],
})
export class FsdP6dLiveFleetBootstrapModule {}
