import { Module } from '@nestjs/common';
import { CoreVehicleReadModule } from '@modules/core-vehicle-read/core-vehicle-read.module';
import { PrismaModule } from '@shared/database/prisma.module';
import { CoreDrivingAssessmentReadV1Controller } from './core-driving-assessment-read.v1.controller';
import { CoreDrivingAssessmentReadV1Service } from './core-driving-assessment-read.v1.service';

@Module({
  imports: [PrismaModule, CoreVehicleReadModule],
  controllers: [CoreDrivingAssessmentReadV1Controller],
  providers: [CoreDrivingAssessmentReadV1Service],
  exports: [CoreDrivingAssessmentReadV1Service],
})
export class CoreDrivingAssessmentReadModule {}
