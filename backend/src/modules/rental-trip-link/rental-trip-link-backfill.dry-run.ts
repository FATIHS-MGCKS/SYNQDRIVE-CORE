import { Injectable } from '@nestjs/common';
import { RentalTripLinkStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildLegacyTripLinkFingerprint } from './rental-trip-link.fingerprint';
import { RentalTripLinkRepository } from './rental-trip-link.repository';
import type { BackfillDryRunIssueCode, BackfillDryRunReport, BackfillDryRunRow } from './rental-trip-link.types';

export type BackfillDryRunOptions = {
  organizationId: string;
  limit?: number;
  tripIds?: string[];
};

/**
 * Read-only analysis for G2 — never mutates overlay or legacy columns.
 *
 * Idempotency: proposed rows key on (organizationId, tripId); `legacyFingerprint` hashes
 * assignedBookingId|linkSource|customerId so re-runs detect drift vs overlay (`OVERLAY_NEWER_THAN_LEGACY`).
 * Legacy `assignedBookingId=null` is **SKIP** (NONE), not an implied UNLINKED — explicit UNLINKED only
 * when a current overlay row already records authorized UNLINKED.
 */
@Injectable()
export class RentalTripLinkBackfillDryRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: RentalTripLinkRepository,
  ) {}

  async analyze(options: BackfillDryRunOptions): Promise<BackfillDryRunReport> {
    const limit = options.limit ?? 500;
    const trips = await this.prisma.vehicleTrip.findMany({
      where: {
        vehicle: { organizationId: options.organizationId },
        ...(options.tripIds?.length ? { id: { in: options.tripIds } } : {}),
      },
      select: {
        id: true,
        vehicleId: true,
        assignedBookingId: true,
        bookingLinkSource: true,
        bookingCustomerId: true,
      },
      take: limit,
      orderBy: { startTime: 'desc' },
    });

    const issueCounts: Partial<Record<BackfillDryRunIssueCode, number>> = {};
    const rows: BackfillDryRunRow[] = [];
    let proposedActive = 0;
    let proposedUnlinked = 0;
    let proposedSkip = 0;

    const bump = (code: BackfillDryRunIssueCode) => {
      issueCounts[code] = (issueCounts[code] ?? 0) + 1;
    };

    for (const trip of trips) {
      const issues: BackfillDryRunIssueCode[] = [];
      const fingerprint = buildLegacyTripLinkFingerprint({
        assignedBookingId: trip.assignedBookingId,
        bookingLinkSource: trip.bookingLinkSource,
        bookingCustomerId: trip.bookingCustomerId,
      });

      const overlay = await this.repository.findCurrentByTrip(options.organizationId, trip.id);
      if (overlay && overlay.legacyFingerprint && fingerprint && overlay.legacyFingerprint !== fingerprint) {
        issues.push('OVERLAY_NEWER_THAN_LEGACY');
      }

      if (!trip.assignedBookingId) {
        if (overlay?.status === RentalTripLinkStatus.UNLINKED) {
          proposedUnlinked += 1;
          issues.push('OVERLAY_AUTHORIZED_UNLINK');
          bump('OVERLAY_AUTHORIZED_UNLINK');
          rows.push({
            organizationId: options.organizationId,
            tripId: trip.id,
            legacyFingerprint: fingerprint,
            proposedStatus: 'UNLINKED',
            proposedBookingId: null,
            proposedCustomerId: null,
            proposedLinkSource: null,
            issues,
          });
        } else {
          proposedSkip += 1;
          issues.push('LEGACY_NULL_ASSIGNMENT');
          bump('LEGACY_NULL_ASSIGNMENT');
          rows.push({
            organizationId: options.organizationId,
            tripId: trip.id,
            legacyFingerprint: fingerprint,
            proposedStatus: 'SKIP',
            proposedBookingId: null,
            proposedCustomerId: null,
            proposedLinkSource: null,
            issues,
          });
        }
        continue;
      }

      const booking = await this.prisma.booking.findFirst({
        where: { id: trip.assignedBookingId },
        select: { id: true, organizationId: true, vehicleId: true, customerId: true },
      });
      if (!booking) {
        issues.push('MISSING_BOOKING');
        bump('MISSING_BOOKING');
      } else {
        if (booking.organizationId !== options.organizationId) {
          issues.push('BOOKING_ORG_MISMATCH');
          bump('BOOKING_ORG_MISMATCH');
        }
        if (booking.vehicleId !== trip.vehicleId) {
          issues.push('BOOKING_VEHICLE_MISMATCH');
          bump('BOOKING_VEHICLE_MISMATCH');
        }
      }

      proposedActive += 1;
      rows.push({
        organizationId: options.organizationId,
        tripId: trip.id,
        legacyFingerprint: fingerprint,
        proposedStatus: 'ACTIVE',
        proposedBookingId: trip.assignedBookingId,
        proposedCustomerId: trip.bookingCustomerId ?? booking?.customerId ?? null,
        proposedLinkSource: trip.bookingLinkSource,
        issues,
      });
    }

    return {
      scannedTrips: trips.length,
      proposedActive,
      proposedUnlinked,
      proposedSkip,
      issueCounts,
      rows,
    };
  }
}
