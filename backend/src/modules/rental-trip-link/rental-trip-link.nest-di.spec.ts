import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { RentalTripLinkModule } from './rental-trip-link.module';
import { RentalTripLinkResolver } from './rental-trip-link.resolver';
import { RentalTripLinkRepository } from './rental-trip-link.repository';

describe('RentalTripLinkModule — scoped rental DI', () => {
  it('wires resolver and repository without VehicleIntelligence', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [RentalTripLinkModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        vehicleTrip: { findFirst: jest.fn() },
        rentalTripLink: { findFirst: jest.fn() },
      })
      .compile();

    expect(moduleRef.get(RentalTripLinkResolver)).toBeInstanceOf(RentalTripLinkResolver);
    expect(moduleRef.get(RentalTripLinkRepository)).toBeInstanceOf(RentalTripLinkRepository);
    await moduleRef.close();
  });
});
