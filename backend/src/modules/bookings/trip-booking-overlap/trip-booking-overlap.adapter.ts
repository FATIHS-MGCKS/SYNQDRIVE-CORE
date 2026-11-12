import { Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, HandoverKind } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { resolveBookingDriverPool } from '../booking-allowed-drivers/booking-allowed-drivers.util';
import {
  BOOKING_PICKUP_HANDOVER_WINDOW_MS,
  type TripBookingOverlapPort,
} from '@modules/vehicle-intelligence/trips/ports/trip-booking-overlap.port';
import type {
  BookingDriverPoolContext,
  BookingOverlapCandidate,
} from '@modules/vehicle-intelligence/trips/trip-canonical-hydration.types';

@Injectable()
export class TripBookingOverlapPrismaAdapter implements TripBookingOverlapPort {
  constructor(private readonly prisma: PrismaService) {}

  async findFirstOverlapForTrip(input: {
    organizationId: string;
    vehicleId: string;
    tripStart: Date;
    tripEnd: Date;
    bookingId?: string | null;
  }): Promise<BookingOverlapCandidate | null> {
    const where = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      status: { in: [BookingStatus.ACTIVE, BookingStatus.COMPLETED] },
      startDate: { lte: input.tripEnd },
      endDate: { gte: input.tripStart },
      ...(input.bookingId ? { id: input.bookingId } : {}),
    };
    const booking = await this.prisma.booking.findFirst({
      where,
      orderBy: { startDate: 'desc' },
      select: {
        id: true,
        vehicleId: true,
        customerId: true,
        assignedDriverId: true,
        startDate: true,
        endDate: true,
        customer: { select: { customerType: true } },
      },
    });
    return booking;
  }

  async findOverlapsForVehicleWindow(input: {
    organizationId: string;
    vehicleId: string;
    windowStart: Date;
    windowEnd: Date;
  }): Promise<BookingOverlapCandidate[]> {
    return this.prisma.booking.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        status: { in: [BookingStatus.ACTIVE, BookingStatus.COMPLETED] },
        startDate: { lte: input.windowEnd },
        endDate: { gte: input.windowStart },
      },
      select: {
        id: true,
        vehicleId: true,
        customerId: true,
        assignedDriverId: true,
        startDate: true,
        endDate: true,
        customer: { select: { customerType: true } },
      },
      orderBy: { startDate: 'desc' },
    });
  }

  async loadDriverPoolsForBookings(input: {
    organizationId: string;
    bookingIds: string[];
  }): Promise<Map<string, BookingDriverPoolContext>> {
    const map = new Map<string, BookingDriverPoolContext>();
    if (input.bookingIds.length === 0) {
      return map;
    }

    const bookings = await this.prisma.booking.findMany({
      where: { organizationId: input.organizationId, id: { in: input.bookingIds } },
      select: {
        id: true,
        customerId: true,
        assignedDriverId: true,
        allowedDrivers: { select: { customerId: true, role: true } },
      },
    });

    for (const booking of bookings) {
      const pool = resolveBookingDriverPool({
        bookingCustomerId: booking.customerId,
        assignedDriverId: booking.assignedDriverId,
        allowedRows: booking.allowedDrivers,
      });
      map.set(booking.id, {
        allowedDriverIds: pool.allowedDriverIds,
        primaryDriverId: pool.primaryDriverId,
      });
    }

    return map;
  }

  async loadDriverPoolForBooking(input: {
    organizationId: string;
    bookingId: string;
  }): Promise<BookingDriverPoolContext> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: input.bookingId, organizationId: input.organizationId },
      select: {
        customerId: true,
        assignedDriverId: true,
        allowedDrivers: { select: { customerId: true, role: true } },
      },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found for organization');
    }
    const pool = resolveBookingDriverPool({
      bookingCustomerId: booking.customerId,
      assignedDriverId: booking.assignedDriverId,
      allowedRows: booking.allowedDrivers,
    });
    return {
      allowedDriverIds: pool.allowedDriverIds,
      primaryDriverId: pool.primaryDriverId,
    };
  }

  async loadBookingAttributionContext(input: {
    organizationId: string;
    bookingId: string;
  }) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: input.bookingId, organizationId: input.organizationId },
      select: {
        customerId: true,
        assignedDriverId: true,
        customer: { select: { customerType: true } },
      },
    });
    if (!booking) {
      return null;
    }
    return {
      customerId: booking.customerId,
      assignedDriverId: booking.assignedDriverId,
      customerType: booking.customer?.customerType ?? null,
    };
  }

  async findPickupHandoverProofForTrip(input: {
    organizationId: string;
    bookingId: string;
    tripStart: Date;
    tripEnd: Date | null;
  }) {
    const windowStart = new Date(input.tripStart.getTime() - BOOKING_PICKUP_HANDOVER_WINDOW_MS);
    const windowEnd = new Date(
      (input.tripEnd ?? input.tripStart).getTime() + BOOKING_PICKUP_HANDOVER_WINDOW_MS,
    );

    const protocol = await this.prisma.bookingHandoverProtocol.findFirst({
      where: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        kind: HandoverKind.PICKUP,
        performedAt: { gte: windowStart, lte: windowEnd },
        OR: [
          { customerSignatureName: { not: null } },
          { staffSignatureName: { not: null } },
        ],
      },
      orderBy: { performedAt: 'desc' },
      select: {
        id: true,
        bookingId: true,
        kind: true,
        performedAt: true,
        customerSignatureName: true,
        staffSignatureName: true,
      },
    });

    if (!protocol) {
      return null;
    }

    return {
      protocolId: protocol.id,
      bookingId: protocol.bookingId,
      kind: protocol.kind,
      performedAt: protocol.performedAt,
      customerSignatureName: protocol.customerSignatureName,
      staffSignatureName: protocol.staffSignatureName,
    };
  }

  async resolveBookingVehicleForOrganization(input: {
    organizationId: string;
    bookingId: string;
  }): Promise<{ vehicleId: string | null }> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: input.bookingId, organizationId: input.organizationId },
      select: { id: true, vehicleId: true },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found for organization');
    }
    return { vehicleId: booking.vehicleId };
  }
}
