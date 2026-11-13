import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { CoreDrivingAssessmentReadModule } from './core-driving-assessment-read.module';
import { CoreDrivingAssessmentReadV1Controller } from './core-driving-assessment-read.v1.controller';
import { CoreDrivingAssessmentReadV1Service } from './core-driving-assessment-read.v1.service';

describe('CoreDrivingAssessmentReadModule — scoped Nest DI', () => {
  it('wires controller and service without Ds4AssessmentModule workers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CoreDrivingAssessmentReadModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $queryRaw: jest.fn(),
        vehicle: { findFirst: jest.fn() },
        vehicleTrip: { findFirst: jest.fn() },
        diV0Ds4TripAssessmentV1: { findFirst: jest.fn() },
        diV0Ds4TripDrivingImpactV2: { findUnique: jest.fn() },
        organizationProduct: { findFirst: jest.fn() },
      })
      .compile();

    expect(moduleRef.get(CoreDrivingAssessmentReadV1Controller)).toBeInstanceOf(
      CoreDrivingAssessmentReadV1Controller,
    );
    expect(moduleRef.get(CoreDrivingAssessmentReadV1Service)).toBeInstanceOf(CoreDrivingAssessmentReadV1Service);
    await moduleRef.close();
  });
});
