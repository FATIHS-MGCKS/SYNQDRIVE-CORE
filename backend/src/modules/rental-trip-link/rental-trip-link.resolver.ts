import { Injectable } from '@nestjs/common';
import { RentalTripLinkStatus, TripBookingLinkSource } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { RentalTripLinkRepository } from './rental-trip-link.repository';
import type { EffectiveRentalTripLink } from './rental-trip-link.types';

@Injectable()
export class RentalTripLinkResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: RentalTripLinkRepository,
  ) {}

  /**
   * P6-PR1: overlay-first read model with legacy fallback only when no current overlay exists.
   * UNLINKED overlay must never be overridden by legacy columns.
   */
  async resolveEffectiveLink(
    organizationId: string,
    tripId: string,
  ): Promise<EffectiveRentalTripLink> {
    const overlay = await this.repository.findCurrentByTrip(organizationId, tripId);
    if (overlay?.status === RentalTripLinkStatus.UNLINKED) {
      return {
        source: 'OVERLAY_UNLINKED',
        organizationId,
        tripId,
        bookingId: null,
        customerId: null,
        linkSource: null,
        isUnlinked: true,
        prefersExplicit: true,
      };
    }
    if (overlay?.status === RentalTripLinkStatus.ACTIVE) {
      return {
        source: 'OVERLAY_ACTIVE',
        organizationId,
        tripId,
        bookingId: overlay.bookingId,
        customerId: overlay.customerId,
        linkSource: overlay.linkSource,
        isUnlinked: false,
        prefersExplicit: overlay.linkSource === TripBookingLinkSource.EXPLICIT,
      };
    }

    const trip = await this.prisma.vehicleTrip.findFirst({
      where: { id: tripId, vehicle: { organizationId } },
      select: {
        assignedBookingId: true,
        bookingLinkSource: true,
        bookingCustomerId: true,
      },
    });
    if (!trip?.assignedBookingId) {
      return {
        source: 'NONE',
        organizationId,
        tripId,
        bookingId: null,
        customerId: null,
        linkSource: null,
        isUnlinked: false,
        prefersExplicit: false,
      };
    }

    return {
      source: 'LEGACY_FALLBACK',
      organizationId,
      tripId,
      bookingId: trip.assignedBookingId,
      customerId: trip.bookingCustomerId,
      linkSource: trip.bookingLinkSource,
      isUnlinked: false,
      prefersExplicit: trip.bookingLinkSource === TripBookingLinkSource.EXPLICIT,
    };
  }
}
