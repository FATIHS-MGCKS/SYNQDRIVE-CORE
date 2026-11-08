import { Module } from '@nestjs/common';
import { Fsd3OneShotDimoLiveSliceModule } from './fsd3-one-shot-dimo-live-slice.module';

/** Live DIMO dispatch bootstrap for the one-shot CLI only — not loaded for mock/offline modes. */
@Module({
  imports: [Fsd3OneShotDimoLiveSliceModule],
  exports: [Fsd3OneShotDimoLiveSliceModule],
})
export class Fsd3OneShotLiveBootstrapModule {}
