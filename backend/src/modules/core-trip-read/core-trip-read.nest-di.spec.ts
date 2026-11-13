import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { CoreTripReadModule } from './core-trip-read.module';
import { CoreTripReadV1Controller } from './core-trip-read.v1.controller';
import { CoreTripReadV1Service } from './core-trip-read.v1.service';

describe('CoreTripReadModule — scoped Nest DI', () => {
  it('wires controller and service without VehicleIntelligenceModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CoreTripReadModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        vehicle: { findFirst: jest.fn() },
        vehicleTrip: { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
        organizationProduct: { findFirst: jest.fn() },
      })
      .compile();

    expect(moduleRef.get(CoreTripReadV1Controller)).toBeInstanceOf(CoreTripReadV1Controller);
    expect(moduleRef.get(CoreTripReadV1Service)).toBeInstanceOf(CoreTripReadV1Service);
    await moduleRef.close();
  });
});
