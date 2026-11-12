/**
 * Isolated Postgres for RentalTripLink current-row invariant.
 * Run: RENTAL_TRIP_LINK_POSTGRES_INTEGRATION=1 DATABASE_URL=postgresql://... npm test -- rental-trip-link.postgres
 */
import {
  BookingStatus,
  PrismaClient,
  RentalTripLinkCreatedBy,
  RentalTripLinkStatus,
  TripBookingLinkSource,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { RentalTripLinkRepository } from './rental-trip-link.repository';
import { RentalTripLinkResolver } from './rental-trip-link.resolver';

const LIVE = process.env.RENTAL_TRIP_LINK_POSTGRES_INTEGRATION === '1';

(LIVE ? describe : describe.skip)('RentalTripLink — postgres', () => {
  const prisma = new PrismaClient();
  let repository: RentalTripLinkRepository;
  let resolver: RentalTripLinkResolver;

  const orgIds: string[] = [];
  const vehicleIds: string[] = [];
  const tripIds: string[] = [];
  const bookingIds: string[] = [];
  const linkIds: string[] = [];

  beforeAll(() => {
    const url = process.env.DATABASE_URL ?? '';
    if (!url || /production|staging|app\.synqdrive/i.test(url)) {
      throw new Error('RENTAL_TRIP_LINK_POSTGRES_INTEGRATION requires isolated DATABASE_URL');
    }
    const svc = prisma as unknown as PrismaService;
    repository = new RentalTripLinkRepository(svc);
    resolver = new RentalTripLinkResolver(svc, repository);
  });

  afterAll(async () => {
    if (linkIds.length) {
      await prisma.rentalTripLink.deleteMany({ where: { id: { in: linkIds } } });
    }
    if (tripIds.length) {
      await prisma.vehicleTrip.deleteMany({ where: { id: { in: tripIds } } });
    }
    if (bookingIds.length) {
      await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    }
    if (vehicleIds.length) {
      await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    }
    if (orgIds.length) {
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
    await prisma.$disconnect();
  });

  async function seedOrg() {
    const org = await prisma.organization.create({
      data: { companyName: `RTL PG ${Date.now()}`, businessType: 'RENTAL' },
    });
    orgIds.push(org.id);
    return org.id;
  }

  async function seedVehicle(orgId: string) {
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: orgId,
        vin: `VIN-RTL-${Date.now()}`,
        make: 'Test',
        model: 'Car',
        year: 2024,
        fuelType: 'ELECTRIC',
        licensePlate: `RTL-${Date.now()}`,
        status: 'AVAILABLE',
      },
    });
    vehicleIds.push(vehicle.id);
    return vehicle.id;
  }

  async function seedTrip(vehicleId: string, bookingId: string | null) {
    const trip = await prisma.vehicleTrip.create({
      data: {
        vehicleId,
        startTime: new Date('2026-06-01T08:00:00Z'),
        endTime: new Date('2026-06-01T09:00:00Z'),
        assignedBookingId: bookingId,
        bookingLinkSource: bookingId ? TripBookingLinkSource.EXPLICIT : null,
      },
    });
    tripIds.push(trip.id);
    return trip;
  }

  async function seedBooking(orgId: string, vehicleId: string) {
    const customer = await prisma.customer.create({
      data: {
        organizationId: orgId,
        firstName: 'RTL',
        lastName: 'Tester',
        status: 'ACTIVE',
      },
    });
    const booking = await prisma.booking.create({
      data: {
        organizationId: orgId,
        customerId: customer.id,
        vehicleId,
        startDate: new Date('2026-06-01T07:00:00Z'),
        endDate: new Date('2026-06-01T18:00:00Z'),
        status: BookingStatus.ACTIVE,
      },
    });
    bookingIds.push(booking.id);
    return booking;
  }

  it('enforces partial unique current row at database level', async () => {
    const orgId = await seedOrg();
    const vehicleId = await seedVehicle(orgId);
    const booking = await seedBooking(orgId, vehicleId);
    const trip = await seedTrip(vehicleId, booking.id);

    const first = await repository.supersedeAndEstablishCurrent({
      organizationId: orgId,
      tripId: trip.id,
      status: RentalTripLinkStatus.ACTIVE,
      bookingId: booking.id,
      linkSource: TripBookingLinkSource.EXPLICIT,
      createdBy: RentalTripLinkCreatedBy.SYSTEM,
    });
    linkIds.push(first.id);

    await expect(
      prisma.rentalTripLink.create({
        data: {
          organizationId: orgId,
          tripId: trip.id,
          status: RentalTripLinkStatus.UNLINKED,
          createdBy: RentalTripLinkCreatedBy.SYSTEM,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('resolver returns UNLINKED over legacy trip assignment', async () => {
    const orgId = await seedOrg();
    const vehicleId = await seedVehicle(orgId);
    const booking = await seedBooking(orgId, vehicleId);
    const trip = await seedTrip(vehicleId, booking.id);

    const row = await repository.supersedeAndEstablishCurrent({
      organizationId: orgId,
      tripId: trip.id,
      status: RentalTripLinkStatus.UNLINKED,
      createdBy: RentalTripLinkCreatedBy.USER,
    });
    linkIds.push(row.id);

    const effective = await resolver.resolveEffectiveLink(orgId, trip.id);
    expect(effective.source).toBe('OVERLAY_UNLINKED');
    expect(effective.bookingId).toBeNull();
  });
});
