import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { resolveBookingDriverPool } from '../booking-allowed-drivers/booking-allowed-drivers.util';
import type { TripBookingOverlapPort } from '@modules/vehicle-intelligence/trips/ports/trip-booking-overlap.port';
import type {
  BookingDriverPoolContext,
  BookingOverlapCandidate,
} from '@modules/vehicle-intelligence/trips/trip-canonical-hydration.types';

@Injectable()
export class TripBookingOverlapPrismaAdapter implements TripBookingOverlapPort {
  constructor(private readonly prisma: PrismaService) {}

  async findFirstOverlapForTrip(input: {
    vehicleId: string;
    tripStart: Date;
    tripEnd: Date;
  }): Promise<BookingOverlapCandidate | null> {
    const booking = await this.prisma.booking.findFirst({
      where: {
        vehicleId: input.vehicleId,
        status: { in: [BookingStatus.ACTIVE, BookingStatus.COMPLETED] },
        startDate: { lte: input.tripEnd },
        endDate: { gte: input.tripStart },
      },
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
}
