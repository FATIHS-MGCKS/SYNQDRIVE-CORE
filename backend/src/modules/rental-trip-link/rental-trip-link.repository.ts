import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, RentalTripLinkStatus, TripBookingLinkSource } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { EstablishRentalTripLinkInput } from './rental-trip-link.types';

@Injectable()
export class RentalTripLinkRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCurrentByTrip(organizationId: string, tripId: string) {
    return this.prisma.rentalTripLink.findFirst({
      where: { organizationId, tripId, supersededAt: null },
      orderBy: { linkedAt: 'desc' },
    });
  }

  async assertTripAndBookingInvariants(
    organizationId: string,
    tripId: string,
    bookingId: string,
  ): Promise<void> {
    const trip = await this.prisma.vehicleTrip.findFirst({
      where: { id: tripId, vehicle: { organizationId } },
      select: { id: true, vehicleId: true },
    });
    if (!trip) {
      throw new BadRequestException('Trip not found for organization');
    }
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId },
      select: { id: true, vehicleId: true },
    });
    if (!booking) {
      throw new BadRequestException('Booking not found for organization');
    }
    if (booking.vehicleId !== trip.vehicleId) {
      throw new BadRequestException('Booking vehicle mismatch for trip');
    }
  }

  async supersedeAndEstablishCurrent(input: EstablishRentalTripLinkInput) {
    if (input.status === RentalTripLinkStatus.ACTIVE) {
      if (!input.bookingId) {
        throw new BadRequestException('ACTIVE link requires bookingId');
      }
      await this.assertTripAndBookingInvariants(input.organizationId, input.tripId, input.bookingId);
    }
    if (input.status === RentalTripLinkStatus.UNLINKED && input.bookingId) {
      throw new BadRequestException('UNLINKED link must not carry bookingId');
    }

    const explicitBlocksAuto =
      input.status === RentalTripLinkStatus.ACTIVE &&
      input.linkSource === TripBookingLinkSource.TIME_WINDOW;

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.rentalTripLink.findFirst({
        where: {
          organizationId: input.organizationId,
          tripId: input.tripId,
          supersededAt: null,
        },
      });

      if (
        current &&
        current.status === RentalTripLinkStatus.ACTIVE &&
        current.linkSource === TripBookingLinkSource.EXPLICIT &&
        explicitBlocksAuto
      ) {
        throw new BadRequestException('EXPLICIT link blocks automatic TIME_WINDOW supersession');
      }

      const linkedAt = new Date();
      const created = await tx.rentalTripLink.create({
        data: {
          organizationId: input.organizationId,
          tripId: input.tripId,
          bookingId: input.status === RentalTripLinkStatus.UNLINKED ? null : input.bookingId ?? null,
          customerId: input.customerId ?? null,
          linkSource:
            input.status === RentalTripLinkStatus.UNLINKED ? null : input.linkSource ?? null,
          status: input.status,
          correctionReason: input.correctionReason ?? null,
          legacyFingerprint: input.legacyFingerprint ?? null,
          linkedAt,
          createdBy: input.createdBy ?? 'SYSTEM',
          createdByUserId: input.createdByUserId ?? null,
          correlationId: input.correlationId ?? null,
        },
      });

      if (current) {
        await tx.rentalTripLink.update({
          where: { id: current.id },
          data: {
            status: RentalTripLinkStatus.SUPERSEDED,
            supersededAt: linkedAt,
            supersededById: created.id,
          },
        });
      }

      return created;
    });
  }
}
