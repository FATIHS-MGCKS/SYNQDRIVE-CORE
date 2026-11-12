import { RentalTripLinkStatus, TripBookingLinkSource } from '@prisma/client';
import { RentalTripLinkResolver } from './rental-trip-link.resolver';
import { RentalTripLinkRepository } from './rental-trip-link.repository';
import type { PrismaService } from '@shared/database/prisma.service';

describe('RentalTripLinkResolver', () => {
  const organizationId = 'org-1';
  const tripId = 'trip-1';

  function createResolver(overlay: Awaited<ReturnType<RentalTripLinkRepository['findCurrentByTrip']>>, legacy: {
    assignedBookingId: string | null;
    bookingLinkSource: TripBookingLinkSource | null;
    bookingCustomerId: string | null;
  } | null) {
    const repository = {
      findCurrentByTrip: jest.fn().mockResolvedValue(overlay),
    } as unknown as RentalTripLinkRepository;
    const prisma = {
      vehicleTrip: {
        findFirst: jest.fn().mockResolvedValue(legacy),
      },
    } as unknown as PrismaService;
    return { resolver: new RentalTripLinkResolver(prisma, repository), repository, prisma };
  }

  it('returns OVERLAY_UNLINKED and never consults legacy', async () => {
    const { resolver, prisma } = createResolver(
      {
        id: 'rtl-1',
        status: RentalTripLinkStatus.UNLINKED,
        bookingId: null,
        customerId: null,
        linkSource: null,
      } as Awaited<ReturnType<RentalTripLinkRepository['findCurrentByTrip']>>,
      {
        assignedBookingId: 'booking-legacy',
        bookingLinkSource: TripBookingLinkSource.EXPLICIT,
        bookingCustomerId: 'cust-1',
      },
    );
    const result = await resolver.resolveEffectiveLink(organizationId, tripId);
    expect(result.source).toBe('OVERLAY_UNLINKED');
    expect(result.bookingId).toBeNull();
    expect(result.isUnlinked).toBe(true);
    expect(prisma.vehicleTrip.findFirst).not.toHaveBeenCalled();
  });

  it('returns OVERLAY_ACTIVE over legacy assignment', async () => {
    const { resolver } = createResolver(
      {
        id: 'rtl-2',
        status: RentalTripLinkStatus.ACTIVE,
        bookingId: 'booking-overlay',
        customerId: 'cust-o',
        linkSource: TripBookingLinkSource.EXPLICIT,
      } as Awaited<ReturnType<RentalTripLinkRepository['findCurrentByTrip']>>,
      {
        assignedBookingId: 'booking-legacy',
        bookingLinkSource: TripBookingLinkSource.TIME_WINDOW,
        bookingCustomerId: null,
      },
    );
    const result = await resolver.resolveEffectiveLink(organizationId, tripId);
    expect(result.source).toBe('OVERLAY_ACTIVE');
    expect(result.bookingId).toBe('booking-overlay');
    expect(result.prefersExplicit).toBe(true);
  });

  it('falls back to legacy when no overlay', async () => {
    const { resolver } = createResolver(null, {
      assignedBookingId: 'booking-legacy',
      bookingLinkSource: TripBookingLinkSource.TIME_WINDOW,
      bookingCustomerId: 'cust-l',
    });
    const result = await resolver.resolveEffectiveLink(organizationId, tripId);
    expect(result.source).toBe('LEGACY_FALLBACK');
    expect(result.bookingId).toBe('booking-legacy');
    expect(result.prefersExplicit).toBe(false);
  });

  it('returns NONE when no overlay and no legacy assignment', async () => {
    const { resolver } = createResolver(null, {
      assignedBookingId: null,
      bookingLinkSource: null,
      bookingCustomerId: null,
    });
    const result = await resolver.resolveEffectiveLink(organizationId, tripId);
    expect(result.source).toBe('NONE');
    expect(result.bookingId).toBeNull();
  });
});
