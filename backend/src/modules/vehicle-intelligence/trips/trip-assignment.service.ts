import { Injectable, Optional, Inject, forwardRef } from '@nestjs/common';
import {
  TripAssignmentStatus,
  TripAssignmentSubjectType,
  TripBookingLinkSource,
  VehicleTrip,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TripMetricsService } from '../../observability/trip-metrics.service';
import { resolveDrivingAttributionRoles } from './driving-attribution-roles/driving-attribution-roles';
import type { BookingOverlapCandidate } from './trip-canonical-hydration.types';
import { pickBookingForAssignment } from './trip-canonical-hydration.booking-match';
import { RentalDrivingAnalysisRecomputeTriggerService } from '../../rental-driving-analysis/rental-driving-analysis-recompute.trigger';
import { RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS } from '../../rental-driving-analysis/rental-driving-analysis.recompute.types';
import {
  TRIP_BOOKING_OVERLAP_PORT,
  type TripBookingOverlapPort,
} from './ports/trip-booking-overlap.port';

export interface TripAssignmentResolution {
  assignmentStatus: TripAssignmentStatus;
  assignmentSubjectType: TripAssignmentSubjectType | null;
  assignmentSubjectId: string | null;
  assignedBookingId: string | null;
  bookingLinkSource: TripBookingLinkSource | null;
  bookingCustomerId: string | null;
  assignedDriverId: string | null;
  actualDriverId: string | null;
  isPrivateTrip: boolean;
  scoreEligible: boolean;
}

export type TripAssignmentInput = Pick<
  VehicleTrip,
  | 'id'
  | 'vehicleId'
  | 'startTime'
  | 'endTime'
  | 'driverName'
  | 'assignmentStatus'
  | 'assignmentSubjectType'
  | 'assignmentSubjectId'
  | 'assignedBookingId'
  | 'bookingLinkSource'
  | 'bookingCustomerId'
  | 'assignedDriverId'
  | 'actualDriverId'
  | 'isPrivateTrip'
>;

@Injectable()
export class TripAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TRIP_BOOKING_OVERLAP_PORT)
    private readonly bookingOverlap: TripBookingOverlapPort,
    @Optional() private readonly tripMetrics?: TripMetricsService,
    @Optional()
    @Inject(forwardRef(() => RentalDrivingAnalysisRecomputeTriggerService))
    private readonly rentalRecomputeTrigger?: RentalDrivingAnalysisRecomputeTriggerService,
  ) {}

  async applyAssignmentToTrip(tripId: string): Promise<TripAssignmentResolution | null> {
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        vehicleId: true,
        startTime: true,
        endTime: true,
        driverName: true,
        assignmentStatus: true,
        assignmentSubjectType: true,
        assignmentSubjectId: true,
        assignedBookingId: true,
        bookingLinkSource: true,
        bookingCustomerId: true,
        assignedDriverId: true,
        actualDriverId: true,
        isPrivateTrip: true,
      },
    });
    if (!trip) return null;

    const resolution = await this.resolveForTrip(trip, { recordMetric: true });
    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: {
        assignmentStatus: resolution.assignmentStatus,
        assignmentSubjectType: resolution.assignmentSubjectType ?? undefined,
        assignmentSubjectId: resolution.assignmentSubjectId ?? undefined,
        assignedBookingId: resolution.assignedBookingId ?? undefined,
        bookingLinkSource: resolution.bookingLinkSource ?? undefined,
        bookingCustomerId: resolution.bookingCustomerId ?? undefined,
        assignedDriverId: resolution.assignedDriverId ?? undefined,
        actualDriverId: resolution.actualDriverId ?? undefined,
        isPrivateTrip: resolution.isPrivateTrip,
      },
    });

    if (resolution.assignedBookingId) {
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: trip.vehicleId },
        select: { organizationId: true },
      });
      if (vehicle?.organizationId) {
        void this.rentalRecomputeTrigger
          ?.enqueueForBooking({
            organizationId: vehicle.organizationId,
            vehicleId: trip.vehicleId,
            bookingId: resolution.assignedBookingId,
            tripId,
            reason: RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.BOOKING_ASSIGNMENT_CORRECTED,
            correlationId: `rental-recompute:${resolution.assignedBookingId}:${RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.BOOKING_ASSIGNMENT_CORRECTED}`,
          })
          .catch(() => {});
      }
    }

    return resolution;
  }

  async resolveForTrip(
    trip: TripAssignmentInput,
    options: { recordMetric?: boolean } = {},
  ): Promise<TripAssignmentResolution> {
    const fallback = this.normalizeFallbackAssignment(trip);
    const bookingAssignment = await this.findBookingAssignment(trip);
    const resolution = bookingAssignment ?? fallback;
    if (options.recordMetric) {
      this.tripMetrics?.tripAssignmentResolutions.inc({
        status: resolution.assignmentStatus,
        score_eligible: resolution.scoreEligible ? 'yes' : 'no',
      });
    }
    return resolution;
  }

  async linkTripToBookingExplicitly(
    tripId: string,
    bookingId: string,
    customerId: string,
    assignedDriverId?: string | null,
  ): Promise<TripAssignmentResolution | null> {
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        vehicleId: true,
        startTime: true,
        endTime: true,
        driverName: true,
        assignmentStatus: true,
        assignmentSubjectType: true,
        assignmentSubjectId: true,
        assignedBookingId: true,
        bookingLinkSource: true,
        bookingCustomerId: true,
        assignedDriverId: true,
        actualDriverId: true,
        isPrivateTrip: true,
      },
    });
    if (!trip) return null;

    const roles = resolveDrivingAttributionRoles({
      isPrivateTrip: false,
      assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
      assignmentSubjectType: TripAssignmentSubjectType.BOOKING_CUSTOMER,
      assignmentSubjectId: customerId,
      assignedBookingId: bookingId,
      bookingLinkSource: TripBookingLinkSource.EXPLICIT,
      bookingCustomerId: customerId,
      bookingAssignedDriverId: assignedDriverId ?? null,
    });

    const resolution: TripAssignmentResolution = {
      assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
      assignmentSubjectType: TripAssignmentSubjectType.BOOKING_CUSTOMER,
      assignmentSubjectId: customerId,
      assignedBookingId: bookingId,
      bookingLinkSource: TripBookingLinkSource.EXPLICIT,
      bookingCustomerId: roles.bookingCustomerId,
      assignedDriverId: roles.assignedDriverId,
      actualDriverId: roles.actualDriverId,
      isPrivateTrip: false,
      scoreEligible: true,
    };

    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: {
        assignmentStatus: resolution.assignmentStatus,
        assignmentSubjectType: resolution.assignmentSubjectType,
        assignmentSubjectId: resolution.assignmentSubjectId,
        assignedBookingId: resolution.assignedBookingId,
        bookingLinkSource: resolution.bookingLinkSource,
        bookingCustomerId: resolution.bookingCustomerId,
        assignedDriverId: resolution.assignedDriverId,
        actualDriverId: resolution.actualDriverId,
        isPrivateTrip: false,
      },
    });

    return resolution;
  }

  private normalizeFallbackAssignment(trip: TripAssignmentInput): TripAssignmentResolution {
    if (trip.assignmentStatus && trip.assignmentStatus !== TripAssignmentStatus.UNKNOWN_ASSIGNMENT) {
      const explicitBooking =
        trip.bookingLinkSource === TripBookingLinkSource.EXPLICIT &&
        trip.assignedBookingId != null;
      const roles = resolveDrivingAttributionRoles({
        isPrivateTrip: trip.isPrivateTrip === true,
        assignmentStatus: trip.assignmentStatus,
        assignmentSubjectType: trip.assignmentSubjectType,
        assignmentSubjectId: trip.assignmentSubjectId,
        assignedBookingId: trip.assignedBookingId,
        bookingLinkSource: trip.bookingLinkSource,
        tripBookingCustomerId: trip.bookingCustomerId,
        tripAssignedDriverId: trip.assignedDriverId,
        tripActualDriverId: trip.actualDriverId,
      });
      return {
        assignmentStatus: trip.assignmentStatus,
        assignmentSubjectType: trip.assignmentSubjectType ?? null,
        assignmentSubjectId: trip.assignmentSubjectId ?? null,
        assignedBookingId: trip.assignedBookingId ?? null,
        bookingLinkSource: trip.bookingLinkSource ?? null,
        bookingCustomerId: roles.bookingCustomerId,
        assignedDriverId: roles.assignedDriverId,
        actualDriverId: roles.actualDriverId,
        isPrivateTrip: trip.isPrivateTrip === true,
        scoreEligible:
          explicitBooking ||
          (trip.isPrivateTrip !== true &&
            trip.assignmentSubjectType != null &&
            !!trip.assignmentSubjectId &&
            trip.bookingLinkSource !== TripBookingLinkSource.TIME_WINDOW),
      };
    }

    const normalizedDriver = this.normalizeSubjectId(trip.driverName);
    if (normalizedDriver) {
      const roles = resolveDrivingAttributionRoles({
        isPrivateTrip: false,
        assignmentStatus: TripAssignmentStatus.ASSIGNED_DRIVER,
        assignmentSubjectType: TripAssignmentSubjectType.DRIVER,
        assignmentSubjectId: normalizedDriver,
        assignedBookingId: null,
        bookingLinkSource: null,
      });
      return {
        assignmentStatus: TripAssignmentStatus.ASSIGNED_DRIVER,
        assignmentSubjectType: TripAssignmentSubjectType.DRIVER,
        assignmentSubjectId: normalizedDriver,
        assignedBookingId: null,
        bookingLinkSource: null,
        bookingCustomerId: roles.bookingCustomerId,
        assignedDriverId: roles.assignedDriverId,
        actualDriverId: roles.actualDriverId,
        isPrivateTrip: false,
        scoreEligible: true,
      };
    }

    if (!trip.endTime) {
      return {
        assignmentStatus: TripAssignmentStatus.UNKNOWN_ASSIGNMENT,
        assignmentSubjectType: null,
        assignmentSubjectId: null,
        assignedBookingId: null,
        bookingLinkSource: null,
        bookingCustomerId: null,
        assignedDriverId: null,
        actualDriverId: null,
        isPrivateTrip: false,
        scoreEligible: false,
      };
    }

    return {
      assignmentStatus: TripAssignmentStatus.PRIVATE_UNASSIGNED,
      assignmentSubjectType: null,
      assignmentSubjectId: null,
      assignedBookingId: null,
      bookingLinkSource: null,
      bookingCustomerId: null,
      assignedDriverId: null,
      actualDriverId: null,
      isPrivateTrip: true,
      scoreEligible: false,
    };
  }

  resolveForTripWithCandidates(
    trip: TripAssignmentInput,
    candidates: BookingOverlapCandidate[],
    options: { recordMetric?: boolean } = {},
  ): TripAssignmentResolution {
    const fallback = this.normalizeFallbackAssignment(trip);
    const bookingAssignment = this.resolveBookingAssignmentFromCandidates(trip, candidates);
    const resolution = bookingAssignment ?? fallback;
    if (options.recordMetric) {
      this.tripMetrics?.tripAssignmentResolutions.inc({
        status: resolution.assignmentStatus,
        score_eligible: resolution.scoreEligible ? 'yes' : 'no',
      });
    }
    return resolution;
  }

  private resolveBookingAssignmentFromCandidates(
    trip: TripAssignmentInput,
    candidates: BookingOverlapCandidate[],
  ): TripAssignmentResolution | null {
    const booking = pickBookingForAssignment(trip, candidates);
    if (!booking) return null;

    const roles = resolveDrivingAttributionRoles({
      isPrivateTrip: false,
      assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
      assignmentSubjectType: TripAssignmentSubjectType.BOOKING_CUSTOMER,
      assignmentSubjectId: booking.customerId,
      assignedBookingId: booking.id,
      bookingLinkSource: TripBookingLinkSource.TIME_WINDOW,
      bookingCustomerId: booking.customerId,
      bookingAssignedDriverId: booking.assignedDriverId,
      bookingCustomerType: booking.customer.customerType,
    });

    return {
      assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
      assignmentSubjectType: TripAssignmentSubjectType.BOOKING_CUSTOMER,
      assignmentSubjectId: booking.customerId,
      assignedBookingId: booking.id,
      bookingLinkSource: TripBookingLinkSource.TIME_WINDOW,
      bookingCustomerId: roles.bookingCustomerId,
      assignedDriverId: roles.assignedDriverId,
      actualDriverId: roles.actualDriverId,
      isPrivateTrip: false,
      scoreEligible: false,
    };
  }

  private async findBookingAssignment(
    trip: TripAssignmentInput,
  ): Promise<TripAssignmentResolution | null> {
    const tripEnd = trip.endTime ?? trip.startTime;

    const booking = await this.bookingOverlap.findFirstOverlapForTrip({
      vehicleId: trip.vehicleId,
      tripStart: trip.startTime,
      tripEnd,
    });
    if (!booking) return null;

    return this.resolveBookingAssignmentFromCandidates(trip, [booking]);
  }

  private normalizeSubjectId(value: string | null | undefined): string | null {
    const normalized = value?.trim() ?? '';
    return normalized.length > 0 ? normalized : null;
  }
}
