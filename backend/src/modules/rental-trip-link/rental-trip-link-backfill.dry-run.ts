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
  /** Caller-maintained count from earlier pages in the same scan chain. */
  priorPagesProcessed?: number;
};

const DEFAULT_PAGE_SIZE = 500;
const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 500;

const VALID_LINK_SOURCES = new Set<TripBookingLinkSource>([
  TripBookingLinkSource.EXPLICIT,
  TripBookingLinkSource.TIME_WINDOW,
]);

function clampPageSize(raw: number | undefined): number {
  const size = raw ?? DEFAULT_PAGE_SIZE;
  return Math.max(MIN_PAGE_SIZE, Math.min(MAX_PAGE_SIZE, size));
}

function isValidLinkSource(linkSource: TripBookingLinkSource | null): boolean {
  return linkSource != null && VALID_LINK_SOURCES.has(linkSource);
}

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
      if (
        overlay.bookingId &&
        trip.assignedBookingId &&
        overlay.bookingId !== trip.assignedBookingId
      ) {
        issues.push('OVERLAY_BOOKING_MISMATCH');
      }
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

  if (!isValidLinkSource(trip.bookingLinkSource)) {
    issues.push('LEGACY_INVALID_LINK_SOURCE');
    return { classification: 'BLOCK_INCOMPLETE_OR_INVALID_LEGACY', issues };
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
    overlayReconciliationRequired:
      issues.includes('OVERLAY_BOOKING_MISMATCH') ||
      issues.includes('OVERLAY_NEWER_THAN_LEGACY') ||
      issues.includes('OVERLAY_EXPLICIT_LEGACY_TIME_WINDOW'),
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
    const pageSize = clampPageSize(options.pageSize ?? options.limit);
    const cursor = options.cursor ?? null;
    const priorPagesProcessed = options.priorPagesProcessed ?? 0;
    const tripIdsFilterActive = Boolean(options.tripIds?.length);

    const tripWhere = {
      vehicle: { organizationId },
      ...(options.tripIds?.length ? { id: { in: options.tripIds } } : {}),
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
        take: pageSize + 1,
      }),
    ]);

    const hasNextPage = trips.length > pageSize;
    const pageTrips = hasNextPage ? trips.slice(0, pageSize) : trips;

    const bookingIds = [
      ...new Set(pageTrips.map((t) => t.assignedBookingId).filter((id): id is string => !!id)),
    ];
    const tripIds = pageTrips.map((t) => t.id);

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

    for (const trip of pageTrips) {
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

    const last = pageTrips[pageTrips.length - 1];
    const nextCursor: BackfillDryRunCursor | null =
      hasNextPage && last ? { startTime: last.startTime, id: last.id } : null;

    const processedTripsThisPage = pageTrips.length;
    const cumulativeProcessedThisScan = priorPagesProcessed + processedTripsThisPage;
    const startedFromBeginning = cursor == null && priorPagesProcessed === 0;
    const singlePageOrg = totalTripsInOrg <= pageSize;
    const coverageCompleteThisScan =
      !hasNextPage &&
      cumulativeProcessedThisScan === totalTripsInOrg &&
      (singlePageOrg && startedFromBeginning
        ? true
        : priorPagesProcessed > 0 && cumulativeProcessedThisScan === totalTripsInOrg);

    return {
      organizationId,
      pageSize,
      totalTripsInOrg,
      processedTripsThisPage,
      cumulativeProcessedThisScan,
      cursorUsed: cursor,
      nextCursor,
      hasNextPage,
      tripIdsFilterActive,
      coverageCompleteThisScan,
      snapshotRequiredForGuaranteedCompleteness: true,
      completenessNote:
        'Paging uses pageSize+1 probe and (startTime desc, id desc). coverageCompleteThisScan is true only for a proven scan chain (full single page from start, or final page with priorPagesProcessed). tripIds filter participates in paging — pass cursor until hasNextPage is false. Concurrent writes can shift totals between pages.',
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
