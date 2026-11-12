import { Test } from '@nestjs/testing';
import { TRIP_BOOKING_OVERLAP_PORT } from '@modules/vehicle-intelligence/trips/ports/trip-booking-overlap.port';
import { TripBookingOverlapModule } from './trip-booking-overlap.module';
import { TripBookingOverlapPrismaAdapter } from './trip-booking-overlap.adapter';
import { PrismaService } from '@shared/database/prisma.service';

describe('TripBookingOverlapModule — minimal module graph', () => {
  it('binds TRIP_BOOKING_OVERLAP_PORT via TripBookingOverlapModule exports', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TripBookingOverlapModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ booking: { findFirst: jest.fn(), findMany: jest.fn() } })
      .compile();

    const port = moduleRef.get(TRIP_BOOKING_OVERLAP_PORT);
    expect(port).toBeInstanceOf(TripBookingOverlapPrismaAdapter);
    expect(port).toBe(moduleRef.get(TripBookingOverlapPrismaAdapter));
    await moduleRef.close();
  });
});
