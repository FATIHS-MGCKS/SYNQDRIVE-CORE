import { Test } from '@nestjs/testing';
import { CanonicalBatteryHealthService } from '@modules/vehicle-intelligence/battery-health/canonical-battery-health.service';
import { CoreVehicleReadModule } from '@modules/core-vehicle-read/core-vehicle-read.module';
import { PrismaModule } from '@shared/database/prisma.module';
import { PrismaService } from '@shared/database/prisma.service';
import { CoreBatteryReadV1Controller } from './core-battery-read.v1.controller';
import { CoreBatteryReadV1Service } from './core-battery-read.v1.service';

/**
 * Runtime DI proof without booting the full VehicleIntelligenceModule graph
 * (platform baseline may block VI full compile). Production wiring uses
 * CanonicalBatteryHealthConsumerModule in CoreBatteryReadModule.
 */
describe('CoreBatteryReadModule — scoped Nest DI (F2)', () => {
  it('wires controller and service with mocked CanonicalBatteryHealthService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, CoreVehicleReadModule],
      controllers: [CoreBatteryReadV1Controller],
      providers: [
        CoreBatteryReadV1Service,
        {
          provide: CanonicalBatteryHealthService,
          useValue: { getSummary: jest.fn() },
        },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({
        vehicle: { findFirst: jest.fn() },
        organizationProduct: { findFirst: jest.fn() },
      })
      .compile();

    expect(moduleRef.get(CoreBatteryReadV1Controller)).toBeInstanceOf(CoreBatteryReadV1Controller);
    expect(moduleRef.get(CoreBatteryReadV1Service)).toBeInstanceOf(CoreBatteryReadV1Service);
    await moduleRef.close();
  });
});
