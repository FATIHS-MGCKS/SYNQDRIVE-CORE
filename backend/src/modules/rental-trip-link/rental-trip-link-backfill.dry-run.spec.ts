import { RentalTripLinkBackfillDryRunService } from './rental-trip-link-backfill.dry-run';
import { RentalTripLinkRepository } from './rental-trip-link.repository';
import type { PrismaService } from '@shared/database/prisma.service';

describe('RentalTripLinkBackfillDryRunService', () => {
  it('does not write overlay rows (read-only analyze)', async () => {
    const create = jest.fn();
    const update = jest.fn();
    const repository = {
      findCurrentByTrip: jest.fn().mockResolvedValue(null),
    } as unknown as RentalTripLinkRepository;
    const prisma = {
      vehicleTrip: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'trip-1',
            vehicleId: 'v-1',
            assignedBookingId: null,
            bookingLinkSource: null,
            bookingCustomerId: null,
          },
        ]),
      },
      booking: { findFirst: jest.fn() },
      rentalTripLink: { create, update },
    } as unknown as PrismaService;

    const svc = new RentalTripLinkBackfillDryRunService(prisma, repository);
    const report = await svc.analyze({ organizationId: 'org-1' });

    expect(report.scannedTrips).toBe(1);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(report.proposedUnlinked).toBe(1);
  });
});
