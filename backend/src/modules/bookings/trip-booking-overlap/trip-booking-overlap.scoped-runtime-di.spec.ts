import { Test, type TestingModule } from '@nestjs/testing';
import { TripAssignmentService } from '@modules/vehicle-intelligence/trips/trip-assignment.service';
import { TripAnalyticsCanonicalService } from '@modules/vehicle-intelligence/trips/trip-analytics-canonical.service';
import { TripAttributionService } from '@modules/vehicle-intelligence/trips/trip-attribution.service';
import { TRIP_BOOKING_OVERLAP_PORT } from '@modules/vehicle-intelligence/trips/ports/trip-booking-overlap.port';
import { TripBookingOverlapModule } from './trip-booking-overlap.module';
import { TripBookingOverlapPrismaAdapter } from './trip-booking-overlap.adapter';
import { PrismaService } from '@shared/database/prisma.service';

/**
 * Scoped runtime DI — real TripBookingOverlapModule wiring (not manual token binding).
 */
describe('TripBookingOverlap — scoped runtime DI', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [TripBookingOverlapModule],
      providers: [
        TripAssignmentService,
        TripAnalyticsCanonicalService,
        TripAttributionService,
        {
          provide: PrismaService,
          useValue: {
            vehicle: { findUnique: jest.fn() },
            vehicleTrip: { findMany: jest.fn(), aggregate: jest.fn(), count: jest.fn() },
            tripDrivingImpact: { findMany: jest.fn(), findUnique: jest.fn(), aggregate: jest.fn() },
            driverAttribution: { findMany: jest.fn() },
            booking: { findFirst: jest.fn(), findMany: jest.fn() },
            tripBehaviorEvent: { findMany: jest.fn(), groupBy: jest.fn() },
            $queryRaw: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('resolves TRIP_BOOKING_OVERLAP_PORT as TripBookingOverlapPrismaAdapter from the module', () => {
    const port = moduleRef.get(TRIP_BOOKING_OVERLAP_PORT);
    const adapter = moduleRef.get(TripBookingOverlapPrismaAdapter);
    expect(port).toBe(adapter);
    expect(port).toBeInstanceOf(TripBookingOverlapPrismaAdapter);
  });

  it('injects the same port instance into TripAssignmentService and TripAnalyticsCanonicalService', () => {
    const port = moduleRef.get(TRIP_BOOKING_OVERLAP_PORT);
    const assignment = moduleRef.get(TripAssignmentService);
    const analytics = moduleRef.get(TripAnalyticsCanonicalService);
    expect(assignment).toBeInstanceOf(TripAssignmentService);
    expect(analytics).toBeInstanceOf(TripAnalyticsCanonicalService);
    expect((assignment as unknown as { bookingOverlap: unknown }).bookingOverlap).toBe(port);
    expect((analytics as unknown as { bookingOverlap: unknown }).bookingOverlap).toBe(port);
  });

  it('injects TRIP_BOOKING_OVERLAP_PORT into TripAttributionService', () => {
    const port = moduleRef.get(TRIP_BOOKING_OVERLAP_PORT);
    const attribution = moduleRef.get(TripAttributionService);
    expect(attribution).toBeInstanceOf(TripAttributionService);
    expect((attribution as unknown as { bookingOverlap: unknown }).bookingOverlap).toBe(port);
  });
});
