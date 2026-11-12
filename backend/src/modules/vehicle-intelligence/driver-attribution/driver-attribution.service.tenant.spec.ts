import { NotFoundException } from '@nestjs/common';
import { DriverAttributionService } from './driver-attribution.service';

function makePrisma() {
  return {
    vehicleTrip: { findFirst: jest.fn(), update: jest.fn() },
    booking: { findFirst: jest.fn() },
    bookingHandoverProtocol: { findFirst: jest.fn() },
    bookingAllowedDriver: { findMany: jest.fn() },
  } as any;
}

describe('DriverAttributionService tenant security', () => {
  it('rejects evaluateTripAttribution for trip outside organization', async () => {
    const prisma = makePrisma();
    prisma.vehicleTrip.findFirst.mockResolvedValue(null);

    const bookingOverlap = {
      loadBookingAttributionContext: jest.fn(),
      findPickupHandoverProofForTrip: jest.fn(),
      loadDriverPoolForBooking: jest.fn(),
      findFirstOverlapForTrip: jest.fn(),
      findOverlapsForVehicleWindow: jest.fn(),
      loadDriverPoolsForBookings: jest.fn(),
    };
    const service = new DriverAttributionService(
      prisma,
      { findByTrip: jest.fn() } as any,
      { resolveAttributionForTrip: jest.fn() } as any,
      { enqueue: jest.fn() } as any,
      bookingOverlap as any,
    );

    await expect(
      service.evaluateTripAttribution({
        organizationId: 'org-a',
        tripId: 'trip-foreign',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
