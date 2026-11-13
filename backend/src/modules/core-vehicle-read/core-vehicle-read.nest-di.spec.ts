import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { CoreVehicleReadModule } from './core-vehicle-read.module';
import { CoreVehicleReadV1Controller } from './core-vehicle-read.v1.controller';
import { CoreVehicleReadV1Service } from './core-vehicle-read.v1.service';

describe('CoreVehicleReadModule — scoped Nest DI', () => {
  it('wires controller and service without VehiclesModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CoreVehicleReadModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        vehicle: { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
        organizationProduct: { findFirst: jest.fn() },
      })
      .compile();

    expect(moduleRef.get(CoreVehicleReadV1Controller)).toBeInstanceOf(CoreVehicleReadV1Controller);
    expect(moduleRef.get(CoreVehicleReadV1Service)).toBeInstanceOf(CoreVehicleReadV1Service);
    await moduleRef.close();
  });
});
