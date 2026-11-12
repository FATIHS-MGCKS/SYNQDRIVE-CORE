/**
 * Isolated Postgres tenant-isolation for booking overlap adapter.
 * Run: TRIP_BOOKING_OVERLAP_POSTGRES_INTEGRATION=1 DATABASE_URL=postgresql://... npm test -- trip-booking-overlap.postgres
 */
import { BookingStatus, PrismaClient } from '@prisma/client';
import { TripBookingOverlapPrismaAdapter } from './trip-booking-overlap.adapter';
import { PrismaService } from '@shared/database/prisma.service';

const LIVE = process.env.TRIP_BOOKING_OVERLAP_POSTGRES_INTEGRATION === '1';

(LIVE ? describe : describe.skip)('TripBookingOverlapPrismaAdapter — postgres', () => {
  const prisma = new PrismaClient();
  let adapter: TripBookingOverlapPrismaAdapter;

  const orgIds: string[] = [];
  const vehicleIds: string[] = [];
  const customerIds: string[] = [];
  const bookingIds: string[] = [];

  beforeAll(() => {
    const url = process.env.DATABASE_URL ?? '';
    if (!url || /production|staging|app\.synqdrive/i.test(url)) {
      throw new Error('TRIP_BOOKING_OVERLAP_POSTGRES_INTEGRATION requires isolated DATABASE_URL');
    }
    adapter = new TripBookingOverlapPrismaAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    if (bookingIds.length > 0) {
      await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    }
    if (customerIds.length > 0) {
      await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    }
    if (vehicleIds.length > 0) {
      await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    }
    if (orgIds.length > 0) {
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
    await prisma.$disconnect();
  });

  async function seedOrg(label: string) {
    const org = await prisma.organization.create({
      data: { companyName: `Overlap PG ${label} ${Date.now()}`, businessType: 'RENTAL' },
    });
    orgIds.push(org.id);
    return org.id;
  }

  async function seedVehicle(orgId: string, suffix: string) {
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: orgId,
        vin: `VIN-OVR-${suffix}-${Date.now()}`,
        make: 'Test',
        model: 'Car',
        year: 2024,
        fuelType: 'ELECTRIC',
        licensePlate: `OVR-${suffix}`,
        status: 'AVAILABLE',
      },
    });
    vehicleIds.push(vehicle.id);
    return vehicle.id;
  }

  async function seedBooking(orgId: string, vehicleId: string, start: Date, end: Date) {
    const customer = await prisma.customer.create({
      data: {
        organizationId: orgId,
        firstName: 'Overlap',
        lastName: 'Tester',
        status: 'ACTIVE',
      },
    });
    customerIds.push(customer.id);
    const booking = await prisma.booking.create({
      data: {
        organizationId: orgId,
        customerId: customer.id,
        vehicleId,
        startDate: start,
        endDate: end,
        status: BookingStatus.ACTIVE,
      },
    });
    bookingIds.push(booking.id);
    return booking;
  }

  it('returns org-A booking for trusted org-A scope', async () => {
    const orgA = await seedOrg('A');
    const vehicleA = await seedVehicle(orgA, 'A');
    const booking = await seedBooking(
      orgA,
      vehicleA,
      new Date('2026-04-01T07:00:00Z'),
      new Date('2026-04-01T18:00:00Z'),
    );

    const result = await adapter.findFirstOverlapForTrip({
      organizationId: orgA,
      vehicleId: vehicleA,
      tripStart: new Date('2026-04-01T08:00:00Z'),
      tripEnd: new Date('2026-04-01T09:00:00Z'),
    });

    expect(result?.id).toBe(booking.id);
  });

  it('does not return org-A booking when organizationId is org-B (cross-tenant negative)', async () => {
    const orgA = await seedOrg('A-neg');
    const orgB = await seedOrg('B-neg');
    const vehicleA = await seedVehicle(orgA, 'A-neg');
    await seedBooking(
      orgA,
      vehicleA,
      new Date('2026-05-01T07:00:00Z'),
      new Date('2026-05-01T18:00:00Z'),
    );

    const result = await adapter.findFirstOverlapForTrip({
      organizationId: orgB,
      vehicleId: vehicleA,
      tripStart: new Date('2026-05-01T08:00:00Z'),
      tripEnd: new Date('2026-05-01T09:00:00Z'),
    });

    expect(result).toBeNull();
  });

  it('respects COMPLETED status and startDate desc ordering', async () => {
    const orgId = await seedOrg('order');
    const vehicleId = await seedVehicle(orgId, 'order');
    const older = await seedBooking(
      orgId,
      vehicleId,
      new Date('2026-06-01T07:00:00Z'),
      new Date('2026-06-01T20:00:00Z'),
    );
    await prisma.booking.update({
      where: { id: older.id },
      data: { status: BookingStatus.COMPLETED },
    });
    const newer = await seedBooking(
      orgId,
      vehicleId,
      new Date('2026-06-01T12:00:00Z'),
      new Date('2026-06-01T20:00:00Z'),
    );

    const result = await adapter.findFirstOverlapForTrip({
      organizationId: orgId,
      vehicleId,
      tripStart: new Date('2026-06-01T13:00:00Z'),
      tripEnd: new Date('2026-06-01T14:00:00Z'),
    });

    expect(result?.id).toBe(newer.id);
  });
});
