import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { TripAssignmentService } from '@modules/vehicle-intelligence/trips/trip-assignment.service';
import { TripAnalyticsCanonicalService } from '@modules/vehicle-intelligence/trips/trip-analytics-canonical.service';
import { TripAttributionService } from '@modules/vehicle-intelligence/trips/trip-attribution.service';
import { TRIP_BOOKING_OVERLAP_PORT } from '@modules/vehicle-intelligence/trips/ports/trip-booking-overlap.port';
import { TripBookingOverlapPrismaAdapter } from './trip-booking-overlap.adapter';
import { TripBookingOverlapModule } from './trip-booking-overlap.module';
import { VehicleIntelligenceModule } from '@modules/vehicle-intelligence/vehicle-intelligence.module';
import { PrismaService } from '@shared/database/prisma.service';

describe('VehicleIntelligenceModule — TripBookingOverlap wiring', () => {
  it('imports TripBookingOverlapModule without importing BookingsModule', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, VehicleIntelligenceModule) as
      | unknown[]
      | undefined;
    expect(imports).toEqual(expect.arrayContaining([TripBookingOverlapModule]));
    const importNames = (imports ?? []).map((entry) =>
      typeof entry === 'function' ? entry.name : String(entry),
    );
    expect(importNames.some((name) => name.includes('BookingsModule'))).toBe(false);
  });

  it('resolves TripAssignmentService and TripAnalyticsCanonicalService with the same port instance', async () => {
    const prismaMock = {
      vehicle: { findUnique: jest.fn() },
      vehicleTrip: { findMany: jest.fn(), aggregate: jest.fn(), count: jest.fn() },
      tripDrivingImpact: { findMany: jest.fn(), findUnique: jest.fn(), aggregate: jest.fn() },
      driverAttribution: { findMany: jest.fn() },
      booking: { findFirst: jest.fn(), findMany: jest.fn() },
      tripBehaviorEvent: { findMany: jest.fn(), groupBy: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [TripBookingOverlapModule],
      providers: [
        TripAssignmentService,
        TripAnalyticsCanonicalService,
        TripAttributionService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    const port = moduleRef.get(TRIP_BOOKING_OVERLAP_PORT);
    expect(port).toBeInstanceOf(TripBookingOverlapPrismaAdapter);

    const assignment = moduleRef.get(TripAssignmentService);
    const analytics = moduleRef.get(TripAnalyticsCanonicalService);
    expect((assignment as unknown as { bookingOverlap: unknown }).bookingOverlap).toBe(port);
    expect((analytics as unknown as { bookingOverlap: unknown }).bookingOverlap).toBe(port);

    await moduleRef.close();
  });
});
