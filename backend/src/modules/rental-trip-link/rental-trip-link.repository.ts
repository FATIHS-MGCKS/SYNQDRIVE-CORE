import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
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

  async assertTripInOrganization(organizationId: string, tripId: string) {
    const trip = await this.prisma.vehicleTrip.findFirst({
      where: { id: tripId, vehicle: { organizationId } },
      select: { id: true, vehicleId: true },
    });
    if (!trip) {
      throw new BadRequestException('Trip not found for organization');
    }
    return trip;
  }

  async assertTripAndBookingInvariants(
    organizationId: string,
    tripId: string,
    bookingId: string,
    customerId?: string | null,
  ) {
    const trip = await this.assertTripInOrganization(organizationId, tripId);
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId },
      select: { id: true, vehicleId: true, customerId: true },
    });
    if (!booking) {
      throw new BadRequestException('Booking not found for organization');
    }
    if (booking.vehicleId !== trip.vehicleId) {
      throw new BadRequestException('Booking vehicle mismatch for trip');
    }
    if (customerId != null && customerId !== booking.customerId) {
      throw new BadRequestException('customerId does not match booking');
    }
    return { trip, booking };
  }

  private validateEstablishInput(input: EstablishRentalTripLinkInput) {
    if (input.status === RentalTripLinkStatus.UNLINKED) {
      if (input.bookingId) {
        throw new BadRequestException('UNLINKED link must not carry bookingId');
      }
      if (input.customerId) {
        throw new BadRequestException('UNLINKED link must not carry customerId');
      }
      if (input.linkSource) {
        throw new BadRequestException('UNLINKED link must not carry linkSource');
      }
    }
    if (input.status === RentalTripLinkStatus.ACTIVE && !input.bookingId) {
      throw new BadRequestException('ACTIVE link requires bookingId');
    }
  }

  async supersedeAndEstablishCurrent(input: EstablishRentalTripLinkInput) {
    this.validateEstablishInput(input);

    if (input.status === RentalTripLinkStatus.UNLINKED) {
      await this.assertTripInOrganization(input.organizationId, input.tripId);
    } else {
      await this.assertTripAndBookingInvariants(
        input.organizationId,
        input.tripId,
        input.bookingId!,
        input.customerId,
      );
    }

    const explicitBlocksAuto =
      input.status === RentalTripLinkStatus.ACTIVE &&
      input.linkSource === TripBookingLinkSource.TIME_WINDOW;

    return this.prisma.$transaction(
      async (tx) => {
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
        let supersededRowId: string | null = null;

        if (current) {
          const superseded = await tx.rentalTripLink.updateMany({
            where: {
              id: current.id,
              organizationId: input.organizationId,
              tripId: input.tripId,
              supersededAt: null,
            },
            data: {
              status: RentalTripLinkStatus.SUPERSEDED,
              supersededAt: linkedAt,
            },
          });
          if (superseded.count !== 1) {
            throw new ConflictException('Concurrent supersession; current row changed');
          }
          supersededRowId = current.id;
        }

        const created = await tx.rentalTripLink.create({
          data: {
            organizationId: input.organizationId,
            tripId: input.tripId,
            bookingId:
              input.status === RentalTripLinkStatus.UNLINKED ? null : input.bookingId ?? null,
            customerId:
              input.status === RentalTripLinkStatus.UNLINKED ? null : input.customerId ?? null,
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

        if (supersededRowId) {
          await tx.rentalTripLink.update({
            where: { id: supersededRowId },
            data: { supersededById: created.id },
          });
        }

        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
