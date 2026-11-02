import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import tireWearV3CalibrationShadowConfig from '@config/tire-wear-v3-calibration-shadow.config';
import { TireWearV3PriorModule } from '../wear-v3-prior/tire-wear-v3-prior.module';
import { TireWearV3CalibrationShadowMasterReadController } from './tire-wear-v3-calibration-shadow-master-read.controller';
import { TireWearV3CalibrationShadowMasterReadService } from './tire-wear-v3-calibration-shadow-master-read.service';
import { TireWearV3CalibrationShadowWriterService } from './tire-wear-v3-calibration-shadow-writer.service';
import { TireWearV3CalibrationEligibilityService } from './tire-wear-v3-calibration-eligibility.service';
import { TireWearV3CalibrationSnapshotRepository } from './tire-wear-v3-calibration-snapshot.repository';

@Module({
  imports: [
    ConfigModule.forFeature(tireWearV3CalibrationShadowConfig),
    TireWearV3PriorModule,
  ],
  controllers: [TireWearV3CalibrationShadowMasterReadController],
  providers: [
    TireWearV3CalibrationSnapshotRepository,
    TireWearV3CalibrationEligibilityService,
    TireWearV3CalibrationShadowWriterService,
    TireWearV3CalibrationShadowMasterReadService,
  ],
  exports: [TireWearV3CalibrationShadowWriterService, TireWearV3CalibrationSnapshotRepository],
})
export class TireWearV3CalibrationShadowModule {}
