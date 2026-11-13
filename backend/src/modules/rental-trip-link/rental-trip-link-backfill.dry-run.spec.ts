import { RentalTripLinkStatus, TripBookingLinkSource } from '@prisma/client';
import {
  classifyBackfillDryRunTrip,
  RentalTripLinkBackfillDryRunService,
} from './rental-trip-link-backfill.dry-run';
import type { PrismaService } from '@shared/database/prisma.service';

const baseTrip = {
  vehicleId: 'v-1',
  startTime: new Date('2026-01-01T00:00:00Z'),
  assignedBookingId: null as string | null,
  bookingLinkSource: null as TripBookingLinkSource | null,
  bookingCustomerId: null as string | null,
};

function trip(id: string, overrides: Partial<typeof baseTrip> & { startTime?: Date } = {}) {
  return { id, ...baseTrip, ...overrides };
}

describe('classifyBackfillDryRunTrip', () => {
  const orgId = 'org-1';

  it('BLOCK_INCOMPLETE_OR_INVALID_LEGACY when booking assigned but linkSource null', () => {
    const result = classifyBackfillDryRunTrip({
      organizationId: orgId,
      trip: trip('t1', { assignedBookingId: 'b1', bookingLinkSource: null }),
      booking: { id: 'b1', organizationId: orgId, vehicleId: 'v-1', customerId: 'c1' },
      overlay: null,
      fingerprint: 'fp',
    });
    expect(result.classification).toBe('BLOCK_INCOMPLETE_OR_INVALID_LEGACY');
    expect(result.issues).toContain('LEGACY_INVALID_LINK_SOURCE');
  });

  it('SAFE_ACTIVE for valid legacy assignment', () => {
    const result = classifyBackfillDryRunTrip({
      organizationId: orgId,
      trip: trip('t1', {
        assignedBookingId: 'b1',
        bookingLinkSource: TripBookingLinkSource.EXPLICIT,
      }),
      booking: {
        id: 'b1',
        organizationId: orgId,
        vehicleId: 'v-1',
        customerId: 'c1',
      },
      overlay: null,
      fingerprint: 'fp',
    });
    expect(result.classification).toBe('SAFE_ACTIVE');
  });

  it('SKIP_NO_ASSIGNMENT without overlay', () => {
    const result = classifyBackfillDryRunTrip({
      organizationId: orgId,
      trip: trip('t1'),
      booking: null,
      overlay: null,
      fingerprint: null,
    });
    expect(result.classification).toBe('SKIP_NO_ASSIGNMENT');
  });

  it('SKIP_EXISTING_OVERLAY when ACTIVE overlay present', () => {
    const result = classifyBackfillDryRunTrip({
      organizationId: orgId,
      trip: trip('t1', { assignedBookingId: 'b1' }),
      booking: { id: 'b1', organizationId: orgId, vehicleId: 'v-1', customerId: 'c1' },
      overlay: {
        tripId: 't1',
        status: RentalTripLinkStatus.ACTIVE,
        bookingId: 'b1',
        linkSource: TripBookingLinkSource.EXPLICIT,
        legacyFingerprint: 'fp',
      },
      fingerprint: 'fp',
    });
    expect(result.classification).toBe('SKIP_EXISTING_OVERLAY');
  });

  it('BLOCK_OTHER_CONFLICT when UNLINKED overlay and legacy booking', () => {
    const result = classifyBackfillDryRunTrip({
      organizationId: orgId,
      trip: trip('t1', { assignedBookingId: 'b1' }),
      booking: { id: 'b1', organizationId: orgId, vehicleId: 'v-1', customerId: 'c1' },
      overlay: {
        tripId: 't1',
        status: RentalTripLinkStatus.UNLINKED,
        bookingId: null,
        linkSource: null,
        legacyFingerprint: null,
      },
      fingerprint: 'fp',
    });
    expect(result.classification).toBe('BLOCK_OTHER_CONFLICT');
  });

  it('BLOCK_TENANT_MISMATCH for cross-tenant booking', () => {
    const result = classifyBackfillDryRunTrip({
      organizationId: orgId,
      trip: trip('t1', { assignedBookingId: 'b1' }),
      booking: { id: 'b1', organizationId: 'org-other', vehicleId: 'v-1', customerId: 'c1' },
      overlay: null,
      fingerprint: 'fp',
    });
    expect(result.classification).toBe('BLOCK_TENANT_MISMATCH');
  });

  it('OVERLAY_BOOKING_MISMATCH without fingerprint', () => {
    const result = classifyBackfillDryRunTrip({
      organizationId: orgId,
      trip: trip('t1', {
        assignedBookingId: 'b-legacy',
        bookingLinkSource: TripBookingLinkSource.EXPLICIT,
      }),
      booking: { id: 'b-legacy', organizationId: orgId, vehicleId: 'v-1', customerId: 'c1' },
      overlay: {
        tripId: 't1',
        status: RentalTripLinkStatus.ACTIVE,
        bookingId: 'b-overlay',
        linkSource: TripBookingLinkSource.EXPLICIT,
        legacyFingerprint: null,
      },
      fingerprint: null,
    });
    expect(result.issues).toContain('OVERLAY_BOOKING_MISMATCH');
    expect(result.classification).toBe('SKIP_EXISTING_OVERLAY');
  });

  it('flags EXPLICIT overlay vs TIME_WINDOW legacy in issues', () => {
    const result = classifyBackfillDryRunTrip({
      organizationId: orgId,
      trip: trip('t1', {
        assignedBookingId: 'b1',
        bookingLinkSource: TripBookingLinkSource.TIME_WINDOW,
      }),
      booking: { id: 'b1', organizationId: orgId, vehicleId: 'v-1', customerId: 'c1' },
      overlay: {
        tripId: 't1',
        status: RentalTripLinkStatus.ACTIVE,
        bookingId: 'b1',
        linkSource: TripBookingLinkSource.EXPLICIT,
        legacyFingerprint: 'fp',
      },
      fingerprint: 'fp2',
    });
    expect(result.issues).toContain('OVERLAY_EXPLICIT_LEGACY_TIME_WINDOW');
    expect(result.classification).toBe('SKIP_EXISTING_OVERLAY');
  });
});

describe('RentalTripLinkBackfillDryRunService', () => {
  it('does not mutate database', async () => {
    const create = jest.fn();
    const update = jest.fn();
    const prisma = {
      vehicleTrip: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'trip-1',
            vehicleId: 'v-1',
            startTime: new Date(),
            assignedBookingId: null,
            bookingLinkSource: null,
            bookingCustomerId: null,
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      booking: { findMany: jest.fn().mockResolvedValue([]) },
      rentalTripLink: { findMany: jest.fn().mockResolvedValue([]), create, update },
    } as unknown as PrismaService;

    const svc = new RentalTripLinkBackfillDryRunService(prisma);
    const report = await svc.analyze({ organizationId: 'org-1' });

    expect(report.scannedTrips).toBe(1);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(report.proposedActive).toBe(0);
    expect(report.rows[0]?.classification).toBe('SKIP_NO_ASSIGNMENT');
  });

  it('pages through >500 trips without duplicate or gap', async () => {
    const pageSize = 500;
    const total = 1200;
    const allTrips = Array.from({ length: total }, (_, i) => ({
      id: `trip-${String(i).padStart(5, '0')}`,
      vehicleId: 'v-1',
      startTime: new Date('2026-06-01T08:00:00.000Z'),
      assignedBookingId: null,
      bookingLinkSource: null,
      bookingCustomerId: null,
    }));

    const ordered = [...allTrips].sort((a, b) => {
      const dt = b.startTime.getTime() - a.startTime.getTime();
      if (dt !== 0) return dt;
      return b.id.localeCompare(a.id);
    });

    const findMany = jest.fn(
      async (args: {
        take: number;
        where?: {
          OR?: Array<
            | { startTime: { lt: Date } }
            | { AND: [{ startTime: Date }, { id: { lt: string } }] }
          >;
        };
      }) => {
        let slice = ordered;
        const or = args.where?.OR;
        if (or?.length === 2) {
          const cursorBranch = or[1] as {
            AND: [{ startTime: Date }, { id: { lt: string } }];
          };
          const cursorTime = cursorBranch.AND?.[0]?.startTime;
          const cursorId = cursorBranch.AND?.[1]?.id?.lt;
          if (cursorTime && cursorId) {
            slice = slice.filter(
              (t) =>
                t.startTime.getTime() < cursorTime.getTime() ||
                (t.startTime.getTime() === cursorTime.getTime() && t.id < cursorId),
            );
          }
        }
        return slice.slice(0, args.take);
      },
    );

    const prisma = {
      vehicleTrip: {
        findMany,
        count: jest.fn().mockResolvedValue(total),
      },
      booking: { findMany: jest.fn().mockResolvedValue([]) },
      rentalTripLink: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;

    const svc = new RentalTripLinkBackfillDryRunService(prisma);
    const seen = new Set<string>();
    let cursor: { startTime: Date; id: string } | null = null;
    let pages = 0;
    let processed = 0;
    let prior = 0;

    for (;;) {
      const page = await svc.analyzePage({
        organizationId: 'org-1',
        pageSize,
        cursor,
        priorPagesProcessed: prior,
      });
      pages += 1;
      processed += page.processedTripsThisPage;
      prior = page.cumulativeProcessedThisScan;
      for (const row of page.rows) {
        expect(seen.has(row.tripId)).toBe(false);
        seen.add(row.tripId);
      }
      if (!page.hasNextPage) break;
      cursor = page.nextCursor;
      expect(cursor).not.toBeNull();
    }

    expect(pages).toBe(3);
    expect(processed).toBe(total);
    expect(seen.size).toBe(total);
  });

  it('tie-breaks same startTime by id descending', async () => {
    const shared = new Date('2026-01-01T12:00:00.000Z');
    const trips = [
      {
        id: 'trip-b',
        vehicleId: 'v-1',
        startTime: shared,
        assignedBookingId: null,
        bookingLinkSource: null,
        bookingCustomerId: null,
      },
      {
        id: 'trip-a',
        vehicleId: 'v-1',
        startTime: shared,
        assignedBookingId: null,
        bookingLinkSource: null,
        bookingCustomerId: null,
      },
    ];

    const prisma = {
      vehicleTrip: {
        findMany: jest.fn(async (args: { take: number }) => trips.slice(0, args.take)),
        count: jest.fn().mockResolvedValue(2),
      },
      booking: { findMany: jest.fn().mockResolvedValue([]) },
      rentalTripLink: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;

    const svc = new RentalTripLinkBackfillDryRunService(prisma);
    const page = await svc.analyzePage({ organizationId: 'org-1', pageSize: 1 });
    expect(page.rows.map((r) => r.tripId)).toEqual(['trip-b']);
    expect(page.hasNextPage).toBe(true);
    expect(page.nextCursor).toEqual({ startTime: shared, id: 'trip-b' });
  });

  it('aggregates blocker counts on a mixed page', async () => {
    const prisma = {
      vehicleTrip: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 't-safe',
            vehicleId: 'v-1',
            startTime: new Date(),
            assignedBookingId: 'b1',
            bookingLinkSource: TripBookingLinkSource.EXPLICIT,
            bookingCustomerId: 'c1',
          },
          {
            id: 't-block',
            vehicleId: 'v-1',
            startTime: new Date(),
            assignedBookingId: 'missing',
            bookingLinkSource: null,
            bookingCustomerId: null,
          },
        ]),
        count: jest.fn().mockResolvedValue(2),
      },
      booking: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'b1', organizationId: 'org-1', vehicleId: 'v-1', customerId: 'c1' },
          ]),
      },
      rentalTripLink: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;

    const svc = new RentalTripLinkBackfillDryRunService(prisma);
    const page = await svc.analyzePage({ organizationId: 'org-1' });
    expect(page.classificationCounts.SAFE_ACTIVE).toBe(1);
    expect(page.classificationCounts.BLOCK_MISSING_BOOKING).toBe(1);
    expect(page.totalTripsInOrg).toBe(2);
  });

  function orderedTrips(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      id: `trip-${String(i).padStart(5, '0')}`,
      vehicleId: 'v-1',
      startTime: new Date(`2026-06-${String((i % 28) + 1).padStart(2, '0')}T08:00:00.000Z`),
      assignedBookingId: null,
      bookingLinkSource: null,
      bookingCustomerId: null,
    })).sort((a, b) => {
      const dt = b.startTime.getTime() - a.startTime.getTime();
      if (dt !== 0) return dt;
      return b.id.localeCompare(a.id);
    });
  }

  function pagingPrisma(allTrips: ReturnType<typeof orderedTrips>, total: number) {
    const findMany = jest.fn(async (args: { take: number; where?: { OR?: unknown[] } }) => {
      let slice = allTrips;
      const or = args.where?.OR as
        | Array<
            | { startTime: { lt: Date } }
            | { AND: [{ startTime: Date }, { id: { lt: string } }] }
          >
        | undefined;
      if (or?.length === 2) {
        const branch = or[1] as { AND: [{ startTime: Date }, { id: { lt: string } }] };
        const cursorTime = branch.AND[0].startTime;
        const cursorId = branch.AND[1].id.lt;
        slice = slice.filter(
          (t) =>
            t.startTime.getTime() < cursorTime.getTime() ||
            (t.startTime.getTime() === cursorTime.getTime() && t.id < cursorId),
        );
      }
      return slice.slice(0, args.take);
    });
    return {
      vehicleTrip: { findMany, count: jest.fn().mockResolvedValue(total) },
      booking: { findMany: jest.fn().mockResolvedValue([]) },
      rentalTripLink: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
  }

  it('hasNextPage false for exactly pageSize trips', async () => {
    const pageSize = 500;
    const total = 500;
    const prisma = pagingPrisma(orderedTrips(total), total);
    const svc = new RentalTripLinkBackfillDryRunService(prisma);
    const page = await svc.analyzePage({ organizationId: 'org-1', pageSize });
    expect(page.processedTripsThisPage).toBe(500);
    expect(page.hasNextPage).toBe(false);
    expect(page.coverageCompleteThisScan).toBe(true);
  });

  it('hasNextPage true for pageSize+1 trips', async () => {
    const pageSize = 500;
    const total = 501;
    const prisma = pagingPrisma(orderedTrips(total), total);
    const svc = new RentalTripLinkBackfillDryRunService(prisma);
    const page = await svc.analyzePage({ organizationId: 'org-1', pageSize });
    expect(page.processedTripsThisPage).toBe(500);
    expect(page.hasNextPage).toBe(true);
    expect(page.coverageCompleteThisScan).toBe(false);
  });

  it('last page alone does not mark coverage complete without priorPagesProcessed', async () => {
    const pageSize = 500;
    const all = orderedTrips(501);
    const prisma = pagingPrisma(all, 501);
    const svc = new RentalTripLinkBackfillDryRunService(prisma);
    const page1 = await svc.analyzePage({ organizationId: 'org-1', pageSize });
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await svc.analyzePage({
      organizationId: 'org-1',
      pageSize,
      cursor: page1.nextCursor,
      priorPagesProcessed: 0,
    });
    expect(page2.processedTripsThisPage).toBe(1);
    expect(page2.hasNextPage).toBe(false);
    expect(page2.coverageCompleteThisScan).toBe(false);
    const page2Complete = await svc.analyzePage({
      organizationId: 'org-1',
      pageSize,
      cursor: page1.nextCursor,
      priorPagesProcessed: page1.processedTripsThisPage,
    });
    expect(page2Complete.coverageCompleteThisScan).toBe(true);
  });

  it('tripIds filter pages when more ids than pageSize', async () => {
    const pageSize = 10;
    const ids = Array.from({ length: 25 }, (_, i) => `trip-${String(i).padStart(5, '0')}`);
    const all = orderedTrips(25);
    const prisma = pagingPrisma(all, 25);
    const svc = new RentalTripLinkBackfillDryRunService(prisma);
    let prior = 0;
    let cursor: { startTime: Date; id: string } | null = null;
    let totalProcessed = 0;
    for (let i = 0; i < 10; i++) {
      const page = await svc.analyzePage({
        organizationId: 'org-1',
        pageSize,
        tripIds: ids,
        cursor,
        priorPagesProcessed: prior,
      });
      expect(page.tripIdsFilterActive).toBe(true);
      totalProcessed += page.processedTripsThisPage;
      prior = page.cumulativeProcessedThisScan;
      if (!page.hasNextPage) break;
      cursor = page.nextCursor;
    }
    expect(totalProcessed).toBe(25);
  });
});
