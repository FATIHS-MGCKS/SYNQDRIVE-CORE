/**
 * Isolated Postgres gate for RentalTripLink (migration must be applied).
 * Run: RENTAL_TRIP_LINK_POSTGRES_INTEGRATION=1 DATABASE_URL=postgresql://synqdrive:synqdrive@127.0.0.1:5432/... npm test -- rental-trip-link.postgres
 */
import { BadRequestException } from '@nestjs/common';
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

(LIVE ? describe : describe.skip)('RentalTripLink — postgres gate', () => {
  const prisma = new PrismaClient();
  let repository: RentalTripLinkRepository;
  let resolver: RentalTripLinkResolver;

  const orgIds: string[] = [];
  const vehicleIds: string[] = [];
  const tripIds: string[] = [];
  const bookingIds: string[] = [];
  const customerIds: string[] = [];
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
    if (customerIds.length) {
      await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    }
    if (vehicleIds.length) {
      await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    }
    if (orgIds.length) {
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
    await prisma.$disconnect();
  });

  const trackLink = (id: string) => {
    linkIds.push(id);
  };

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
        vin: `VIN-RTL-${Date.now()}-${Math.random()}`,
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

  async function seedBooking(orgId: string, vehicleId: string, suffix = '') {
    const customer = await prisma.customer.create({
      data: {
        organizationId: orgId,
        firstName: 'RTL',
        lastName: `Tester${suffix}`,
        status: 'ACTIVE',
      },
    });
    customerIds.push(customer.id);
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
    return { booking, customerId: customer.id };
  }

  it('1 — first ACTIVE assignment', async () => {
    const orgId = await seedOrg();
    const vehicleId = await seedVehicle(orgId);
    const { booking, customerId } = await seedBooking(orgId, vehicleId, '1');
    const trip = await seedTrip(vehicleId, booking.id);

    const row = await repository.supersedeAndEstablishCurrent({
      organizationId: orgId,
      tripId: trip.id,
      status: RentalTripLinkStatus.ACTIVE,
      bookingId: booking.id,
      customerId,
      linkSource: TripBookingLinkSource.EXPLICIT,
      createdBy: RentalTripLinkCreatedBy.USER,
    });
    trackLink(row.id);
    expect(row.status).toBe(RentalTripLinkStatus.ACTIVE);
    expect(row.supersededAt).toBeNull();
  });

  it('2 — ACTIVE A superseded by ACTIVE B with history', async () => {
    const orgId = await seedOrg();
    const vehicleId = await seedVehicle(orgId);
    const { booking: bookingA } = await seedBooking(orgId, vehicleId, '2a');
    const { booking: bookingB } = await seedBooking(orgId, vehicleId, '2b');
    const trip = await seedTrip(vehicleId, bookingA.id);

    const a = await repository.supersedeAndEstablishCurrent({
      organizationId: orgId,
      tripId: trip.id,
      status: RentalTripLinkStatus.ACTIVE,
      bookingId: bookingA.id,
      linkSource: TripBookingLinkSource.EXPLICIT,
    });
    trackLink(a.id);
    const b = await repository.supersedeAndEstablishCurrent({
      organizationId: orgId,
      tripId: trip.id,
      status: RentalTripLinkStatus.ACTIVE,
      bookingId: bookingB.id,
      linkSource: TripBookingLinkSource.EXPLICIT,
      createdBy: RentalTripLinkCreatedBy.USER,
    });
    trackLink(b.id);

    const prior = await prisma.rentalTripLink.findUnique({ where: { id: a.id } });
    expect(prior?.status).toBe(RentalTripLinkStatus.SUPERSEDED);
    expect(prior?.supersededById).toBe(b.id);
    const current = await repository.findCurrentByTrip(orgId, trip.id);
    expect(current?.id).toBe(b.id);
  });

  it('3 — ACTIVE → UNLINKED', async () => {
    const orgId = await seedOrg();
    const vehicleId = await seedVehicle(orgId);
    const { booking } = await seedBooking(orgId, vehicleId, '3');
    const trip = await seedTrip(vehicleId, booking.id);
    const active = await repository.supersedeAndEstablishCurrent({
      organizationId: orgId,
      tripId: trip.id,
      status: RentalTripLinkStatus.ACTIVE,
      bookingId: booking.id,
      linkSource: TripBookingLinkSource.EXPLICIT,
    });
    trackLink(active.id);
    const unlinked = await repository.supersedeAndEstablishCurrent({
      organizationId: orgId,
      tripId: trip.id,
      status: RentalTripLinkStatus.UNLINKED,
      createdBy: RentalTripLinkCreatedBy.USER,
    });
    trackLink(unlinked.id);
    expect(unlinked.bookingId).toBeNull();
    expect(unlinked.customerId).toBeNull();
    expect(unlinked.linkSource).toBeNull();
  });

  it('4 — UNLINKED → authorized ACTIVE correction', async () => {
    const orgId = await seedOrg();
    const vehicleId = await seedVehicle(orgId);
    const { booking } = await seedBooking(orgId, vehicleId, '4');
    const trip = await seedTrip(vehicleId, booking.id);
    const unlinked = await repository.supersedeAndEstablishCurrent({
      organizationId: orgId,
      tripId: trip.id,
      status: RentalTripLinkStatus.UNLINKED,
      createdBy: RentalTripLinkCreatedBy.USER,
    });
    trackLink(unlinked.id);
    const active = await repository.supersedeAndEstablishCurrent({
      organizationId: orgId,
      tripId: trip.id,
      status: RentalTripLinkStatus.ACTIVE,
      bookingId: booking.id,
      linkSource: TripBookingLinkSource.EXPLICIT,
      createdBy: RentalTripLinkCreatedBy.USER,
    });
    trackLink(active.id);
    expect(active.bookingId).toBe(booking.id);
  });

  it('5 — EXPLICIT blocks TIME_WINDOW supersession', async () => {
    const orgId = await seedOrg();
    const vehicleId = await seedVehicle(orgId);
    const { booking: b1 } = await seedBooking(orgId, vehicleId, '5a');
    const { booking: b2 } = await seedBooking(orgId, vehicleId, '5b');
    const trip = await seedTrip(vehicleId, b1.id);
    const explicit = await repository.supersedeAndEstablishCurrent({
      organizationId: orgId,
      tripId: trip.id,
      status: RentalTripLinkStatus.ACTIVE,
      bookingId: b1.id,
      linkSource: TripBookingLinkSource.EXPLICIT,
    });
    trackLink(explicit.id);
    await expect(
      repository.supersedeAndEstablishCurrent({
        organizationId: orgId,
        tripId: trip.id,
        status: RentalTripLinkStatus.ACTIVE,
        bookingId: b2.id,
        linkSource: TripBookingLinkSource.TIME_WINDOW,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const current = await repository.findCurrentByTrip(orgId, trip.id);
    expect(current?.id).toBe(explicit.id);
  });

  it('6 — concurrent writes leave single current row', async () => {
    const orgId = await seedOrg();
    const vehicleId = await seedVehicle(orgId);
    const { booking: b1 } = await seedBooking(orgId, vehicleId, '6a');
    const { booking: b2 } = await seedBooking(orgId, vehicleId, '6b');
    const trip = await seedTrip(vehicleId, null);

    const results = await Promise.allSettled([
      repository.supersedeAndEstablishCurrent({
        organizationId: orgId,
        tripId: trip.id,
        status: RentalTripLinkStatus.ACTIVE,
        bookingId: b1.id,
        linkSource: TripBookingLinkSource.TIME_WINDOW,
      }),
      repository.supersedeAndEstablishCurrent({
        organizationId: orgId,
        tripId: trip.id,
        status: RentalTripLinkStatus.ACTIVE,
        bookingId: b2.id,
        linkSource: TripBookingLinkSource.TIME_WINDOW,
      }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{ id: string }>[];
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    fulfilled.forEach((r) => trackLink(r.value.id));

    const currents = await prisma.rentalTripLink.findMany({
      where: { organizationId: orgId, tripId: trip.id, supersededAt: null },
    });
    expect(currents).toHaveLength(1);
  });

  it('7 — transaction rollback after supersede leaves prior current intact', async () => {
    const orgId = await seedOrg();
    const vehicleId = await seedVehicle(orgId);
    const { booking } = await seedBooking(orgId, vehicleId, '7');
    const trip = await seedTrip(vehicleId, booking.id);
    const row = await repository.supersedeAndEstablishCurrent({
      organizationId: orgId,
      tripId: trip.id,
      status: RentalTripLinkStatus.ACTIVE,
      bookingId: booking.id,
      linkSource: TripBookingLinkSource.EXPLICIT,
    });
    trackLink(row.id);

    await expect(
      repository.supersedeAndEstablishCurrent({
        organizationId: orgId,
        tripId: trip.id,
        status: RentalTripLinkStatus.ACTIVE,
        bookingId: booking.id,
        linkSource: TripBookingLinkSource.EXPLICIT,
        createdBy: 'INVALID_CREATED_BY' as RentalTripLinkCreatedBy,
      }),
    ).rejects.toThrow(/invalid input value for enum|RentalTripLinkCreatedBy/i);

    const reloaded = await prisma.rentalTripLink.findUnique({ where: { id: row.id } });
    expect(reloaded?.status).toBe(RentalTripLinkStatus.ACTIVE);
    expect(reloaded?.supersededAt).toBeNull();
    expect(reloaded?.supersededById).toBeNull();

    const currents = await prisma.rentalTripLink.findMany({
      where: { organizationId: orgId, tripId: trip.id, supersededAt: null },
    });
    expect(currents).toHaveLength(1);
    expect(currents[0]?.id).toBe(row.id);

    const allRows = await prisma.rentalTripLink.count({
      where: { organizationId: orgId, tripId: trip.id },
    });
    expect(allRows).toBe(1);
  });

  it('8 — cross-tenant and missing trip/booking rejected', async () => {
    const orgA = await seedOrg();
    const orgB = await seedOrg();
    const vehicleA = await seedVehicle(orgA);
    const { booking: bookingB } = await seedBooking(orgB, await seedVehicle(orgB), '8');
    const tripA = await seedTrip(vehicleA, null);

    await expect(
      repository.supersedeAndEstablishCurrent({
        organizationId: orgA,
        tripId: tripA.id,
        status: RentalTripLinkStatus.ACTIVE,
        bookingId: bookingB.id,
        linkSource: TripBookingLinkSource.EXPLICIT,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      repository.supersedeAndEstablishCurrent({
        organizationId: orgA,
        tripId: 'non-existent-trip',
        status: RentalTripLinkStatus.UNLINKED,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('9 — SQL CHECK constraints (not FK noise) block invalid rows', async () => {
    const orgId = await seedOrg();
    const vehicleId = await seedVehicle(orgId);
    const trip = await seedTrip(vehicleId, null);

    await expect(
      prisma.rentalTripLink.create({
        data: {
          organizationId: orgId,
          tripId: trip.id,
          status: RentalTripLinkStatus.UNLINKED,
          bookingId: '00000000-0000-0000-0000-000000000001',
          createdBy: RentalTripLinkCreatedBy.SYSTEM,
        },
      }),
    ).rejects.toThrow(/rental_trip_links_unlinked_payload_chk|check constraint/i);

    await expect(
      prisma.rentalTripLink.create({
        data: {
          organizationId: orgId,
          tripId: trip.id,
          status: RentalTripLinkStatus.ACTIVE,
          createdBy: RentalTripLinkCreatedBy.SYSTEM,
        },
      }),
    ).rejects.toThrow(/rental_trip_links_active_booking_chk|check constraint/i);

    await expect(
      prisma.rentalTripLink.create({
        data: {
          organizationId: orgId,
          tripId: trip.id,
          status: RentalTripLinkStatus.SUPERSEDED,
          supersededAt: null,
          createdBy: RentalTripLinkCreatedBy.SYSTEM,
        },
      }),
    ).rejects.toThrow(/rental_trip_links_superseded_status_chk|check constraint/i);

    const { booking } = await seedBooking(orgId, vehicleId, '9');
    const active = await repository.supersedeAndEstablishCurrent({
      organizationId: orgId,
      tripId: trip.id,
      status: RentalTripLinkStatus.ACTIVE,
      bookingId: booking.id,
      linkSource: TripBookingLinkSource.EXPLICIT,
    });
    trackLink(active.id);

    await expect(
      prisma.rentalTripLink.update({
        where: { id: active.id },
        data: { supersededAt: new Date() },
      }),
    ).rejects.toThrow(/rental_trip_links_current_requires_null_superseded_at_chk|check constraint/i);

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

  it('resolver returns UNLINKED over legacy assignment', async () => {
    const orgId = await seedOrg();
    const vehicleId = await seedVehicle(orgId);
    const { booking } = await seedBooking(orgId, vehicleId, 'res');
    const trip = await seedTrip(vehicleId, booking.id);
    const row = await repository.supersedeAndEstablishCurrent({
      organizationId: orgId,
      tripId: trip.id,
      status: RentalTripLinkStatus.UNLINKED,
      createdBy: RentalTripLinkCreatedBy.USER,
    });
    trackLink(row.id);
    const effective = await resolver.resolveEffectiveLink(orgId, trip.id);
    expect(effective.source).toBe('OVERLAY_UNLINKED');
    expect(effective.bookingId).toBeNull();
  });
});
