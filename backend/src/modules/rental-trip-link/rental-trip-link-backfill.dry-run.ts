import { Injectable } from '@nestjs/common';
import { RentalTripLinkStatus, TripBookingLinkSource } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildLegacyTripLinkFingerprint } from './rental-trip-link.fingerprint';
import type {
  BackfillDryRunClassification,
  BackfillDryRunCursor,
  BackfillDryRunIssueCode,
  BackfillDryRunPageReport,
  BackfillDryRunReport,
  BackfillDryRunRow,
} from './rental-trip-link.types';

export type BackfillDryRunOptions = {
  organizationId: string;
  /** @deprecated Prefer `analyzePage` with explicit paging for full org coverage. */
  limit?: number;
  tripIds?: string[];
  cursor?: BackfillDryRunCursor | null;
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGE_SIZE = 500;

type TripRow = {
  id: string;
  vehicleId: string;
  startTime: Date;
  assignedBookingId: string | null;
  bookingLinkSource: TripBookingLinkSource | null;
  bookingCustomerId: string | null;
};

type BookingRow = {
  id: string;
  organizationId: string;
  vehicleId: string;
  customerId: string | null;
};

type OverlayRow = {
  tripId: string;
  status: RentalTripLinkStatus;
  bookingId: string | null;
  linkSource: TripBookingLinkSource | null;
  legacyFingerprint: string | null;
};

export function classifyBackfillDryRunTrip(input: {
  organizationId: string;
  trip: TripRow;
  booking: BookingRow | null;
  overlay: OverlayRow | null;
  fingerprint: string | null;
}): { classification: BackfillDryRunClassification; issues: BackfillDryRunIssueCode[] } {
  const { trip, booking, overlay, fingerprint } = input;
  const issues: BackfillDryRunIssueCode[] = [];

  if (overlay) {
    if (overlay.status === RentalTripLinkStatus.UNLINKED) {
      if (trip.assignedBookingId) {
        issues.push('OVERLAY_AUTHORIZED_UNLINK');
        return { classification: 'BLOCK_OTHER_CONFLICT', issues };
      }
      issues.push('OVERLAY_AUTHORIZED_UNLINK');
      return { classification: 'SKIP_EXISTING_OVERLAY', issues };
    }
    if (overlay.status === RentalTripLinkStatus.ACTIVE) {
      if (overlay.legacyFingerprint && fingerprint && overlay.legacyFingerprint !== fingerprint) {
        issues.push('OVERLAY_NEWER_THAN_LEGACY');
      }
      if (
        overlay.linkSource === TripBookingLinkSource.EXPLICIT &&
        trip.bookingLinkSource === TripBookingLinkSource.TIME_WINDOW
      ) {
        issues.push('OVERLAY_EXPLICIT_LEGACY_TIME_WINDOW');
      }
      issues.push('OVERLAY_ACTIVE_PRESENT');
      return { classification: 'SKIP_EXISTING_OVERLAY', issues };
    }
  }

  if (!trip.assignedBookingId) {
    issues.push('LEGACY_NULL_ASSIGNMENT');
    return { classification: 'SKIP_NO_ASSIGNMENT', issues };
  }

  if (!booking) {
    issues.push('MISSING_BOOKING');
    return { classification: 'BLOCK_MISSING_BOOKING', issues };
  }
  if (booking.organizationId !== input.organizationId) {
    issues.push('BOOKING_ORG_MISMATCH');
    return { classification: 'BLOCK_TENANT_MISMATCH', issues };
  }
  if (booking.vehicleId !== trip.vehicleId) {
    issues.push('BOOKING_VEHICLE_MISMATCH');
    return { classification: 'BLOCK_VEHICLE_MISMATCH', issues };
  }
  if (trip.bookingCustomerId != null && trip.bookingCustomerId !== booking.customerId) {
    issues.push('BOOKING_CUSTOMER_MISMATCH');
    return { classification: 'BLOCK_CUSTOMER_MISMATCH', issues };
  }

  return { classification: 'SAFE_ACTIVE', issues };
}

function emptyClassificationCounts(): Record<BackfillDryRunClassification, number> {
  return {
    SAFE_ACTIVE: 0,
    SKIP_NO_ASSIGNMENT: 0,
    SKIP_EXISTING_OVERLAY: 0,
    BLOCK_MISSING_BOOKING: 0,
    BLOCK_TENANT_MISMATCH: 0,
    BLOCK_VEHICLE_MISMATCH: 0,
    BLOCK_CUSTOMER_MISMATCH: 0,
    BLOCK_INCOMPLETE_OR_INVALID_LEGACY: 0,
    BLOCK_OTHER_CONFLICT: 0,
  };
}

function toDryRunRow(
  organizationId: string,
  trip: TripRow,
  classification: BackfillDryRunClassification,
  fingerprint: string | null,
  booking: BookingRow | null,
  issues: BackfillDryRunIssueCode[],
): BackfillDryRunRow {
  const importable = classification === 'SAFE_ACTIVE';
  return {
    organizationId,
    tripId: trip.id,
    legacyFingerprint: fingerprint,
    classification,
    proposedBookingId: importable ? trip.assignedBookingId : null,
    proposedCustomerId: importable
      ? trip.bookingCustomerId ?? booking?.customerId ?? null
      : null,
    proposedLinkSource: importable ? trip.bookingLinkSource : null,
    issues,
    fingerprintConflict: issues.includes('OVERLAY_NEWER_THAN_LEGACY'),
    proposedStatus: importable ? 'ACTIVE' : classification.startsWith('SKIP_') ? 'SKIP' : 'SKIP',
  };
}

/**
 * Read-only analysis for G2 — never mutates overlay or legacy columns.
 *
 * Full org coverage requires paginating with `cursor` until `hasNextPage` is false.
 * Without a stable DB snapshot, completeness is best-effort only (document in report).
 */
@Injectable()
export class RentalTripLinkBackfillDryRunService {
  constructor(private readonly prisma: PrismaService) {}

  async analyzePage(options: BackfillDryRunOptions): Promise<BackfillDryRunPageReport> {
    const organizationId = options.organizationId;
    const pageSize = Math.min(options.pageSize ?? options.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const cursor = options.cursor ?? null;

    const tripWhere = options.tripIds?.length
      ? { vehicle: { organizationId }, id: { in: options.tripIds } }
      : {
          vehicle: { organizationId },
          ...(cursor
            ? {
                OR: [
                  { startTime: { lt: cursor.startTime } },
                  { AND: [{ startTime: cursor.startTime }, { id: { lt: cursor.id } }] },
                ],
              }
            : {}),
        };

    const [totalTripsInOrg, trips] = await Promise.all([
      options.tripIds?.length
        ? this.prisma.vehicleTrip.count({
            where: { vehicle: { organizationId }, id: { in: options.tripIds } },
          })
        : this.prisma.vehicleTrip.count({ where: { vehicle: { organizationId } } }),
      this.prisma.vehicleTrip.findMany({
        where: tripWhere,
        select: {
          id: true,
          vehicleId: true,
          startTime: true,
          assignedBookingId: true,
          bookingLinkSource: true,
          bookingCustomerId: true,
        },
        orderBy: [{ startTime: 'desc' }, { id: 'desc' }],
        take: pageSize,
      }),
    ]);

    const bookingIds = [
      ...new Set(trips.map((t) => t.assignedBookingId).filter((id): id is string => !!id)),
    ];
    const tripIds = trips.map((t) => t.id);

    const [bookings, overlays] = await Promise.all([
      bookingIds.length
        ? this.prisma.booking.findMany({
            where: { id: { in: bookingIds } },
            select: { id: true, organizationId: true, vehicleId: true, customerId: true },
          })
        : Promise.resolve([] as BookingRow[]),
      tripIds.length
        ? this.prisma.rentalTripLink.findMany({
            where: { organizationId, tripId: { in: tripIds }, supersededAt: null },
            select: {
              tripId: true,
              status: true,
              bookingId: true,
              linkSource: true,
              legacyFingerprint: true,
            },
          })
        : Promise.resolve([] as OverlayRow[]),
    ]);

    const bookingById = new Map(bookings.map((b) => [b.id, b]));
    const overlayByTripId = new Map(overlays.map((o) => [o.tripId, o]));

    const classificationCounts = emptyClassificationCounts();
    const issueCounts: Partial<Record<BackfillDryRunIssueCode, number>> = {};
    const rows: BackfillDryRunRow[] = [];

    const bumpIssue = (code: BackfillDryRunIssueCode) => {
      issueCounts[code] = (issueCounts[code] ?? 0) + 1;
    };

    for (const trip of trips) {
      const fingerprint = buildLegacyTripLinkFingerprint({
        assignedBookingId: trip.assignedBookingId,
        bookingLinkSource: trip.bookingLinkSource,
        bookingCustomerId: trip.bookingCustomerId,
      });
      const booking = trip.assignedBookingId ? bookingById.get(trip.assignedBookingId) ?? null : null;
      const overlay = overlayByTripId.get(trip.id) ?? null;

      const { classification, issues } = classifyBackfillDryRunTrip({
        organizationId,
        trip,
        booking,
        overlay,
        fingerprint,
      });
      classificationCounts[classification] += 1;
      for (const code of issues) {
        bumpIssue(code);
      }
      rows.push(toDryRunRow(organizationId, trip, classification, fingerprint, booking, issues));
    }

    const last = trips[trips.length - 1];
    const hasNextPage = !options.tripIds?.length && trips.length === pageSize;
    const nextCursor: BackfillDryRunCursor | null =
      hasNextPage && last ? { startTime: last.startTime, id: last.id } : null;

    const processedTripsThisPage = trips.length;
    const coverageCompleteThisScan =
      !options.tripIds?.length && !hasNextPage && processedTripsThisPage <= totalTripsInOrg;

    return {
      organizationId,
      pageSize,
      totalTripsInOrg,
      processedTripsThisPage,
      cursorUsed: cursor,
      nextCursor,
      hasNextPage,
      coverageCompleteThisScan,
      snapshotRequiredForGuaranteedCompleteness: true,
      completenessNote:
        'Paging is deterministic on (startTime desc, id desc) for a fixed DB snapshot; concurrent legacy/overlay writes can shift totals between pages.',
      classificationCounts,
      issueCounts,
      rows,
    };
  }

  /** Single-page analysis (backward compatible). */
  async analyze(options: BackfillDryRunOptions): Promise<BackfillDryRunReport> {
    const page = await this.analyzePage(options);
    return {
      scannedTrips: page.processedTripsThisPage,
      proposedActive: page.classificationCounts.SAFE_ACTIVE,
      proposedUnlinked: 0,
      proposedSkip:
        page.classificationCounts.SKIP_NO_ASSIGNMENT +
        page.classificationCounts.SKIP_EXISTING_OVERLAY,
      issueCounts: page.issueCounts,
      rows: page.rows,
      totalTripsInOrg: page.totalTripsInOrg,
      hasNextPage: page.hasNextPage,
      nextCursor: page.nextCursor,
    };
  }
}
