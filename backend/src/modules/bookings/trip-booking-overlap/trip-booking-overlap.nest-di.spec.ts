import { Test } from '@nestjs/testing';
import { TRIP_BOOKING_OVERLAP_PORT } from '@modules/vehicle-intelligence/trips/ports/trip-booking-overlap.port';
import { TripBookingOverlapPrismaAdapter } from './trip-booking-overlap.adapter';
import { PrismaService } from '@shared/database/prisma.service';

describe('TripBookingOverlapModule DI', () => {
  it('binds TRIP_BOOKING_OVERLAP_PORT to prisma adapter', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TripBookingOverlapPrismaAdapter,
        {
          provide: TRIP_BOOKING_OVERLAP_PORT,
          useExisting: TripBookingOverlapPrismaAdapter,
        },
        {
          provide: PrismaService,
          useValue: { booking: { findFirst: jest.fn(), findMany: jest.fn() } },
        },
      ],
    }).compile();

    const port = moduleRef.get(TRIP_BOOKING_OVERLAP_PORT);
    expect(port).toBeInstanceOf(TripBookingOverlapPrismaAdapter);
    await moduleRef.close();
  });
});
