import { Inject, Injectable } from '@nestjs/common';
import { TripAssignmentStatus } from '@prisma/client';
import type {
  TripAttribution,
  TripAttributionBookingOverlap,
  TripAttributionInput,
} from './trip-attribution.types';
import { resolveDrivingAttributionRoles } from './driving-attribution-roles/driving-attribution-roles';
import { pickBookingOverlapCandidate } from './trip-canonical-hydration.booking-match';
import type {
  BookingDriverPoolContext,
  BookingOverlapCandidate,
} from './trip-canonical-hydration.types';
import type { TripAssignmentResolution } from './trip-assignment.service';
import type { TripHydrationTripInput } from './trip-canonical-hydration.types';
import {
  TRIP_BOOKING_OVERLAP_PORT,
  type TripBookingOverlapPort,
} from './ports/trip-booking-overlap.port';

@Injectable()
export class TripAttributionService {
  constructor(
    @Inject(TRIP_BOOKING_OVERLAP_PORT)
    private readonly bookingOverlap: TripBookingOverlapPort,
  ) {}

  resolveAttribution(input: TripAttributionInput): TripAttribution {
    const roles = resolveDrivingAttributionRoles({
      isPrivateTrip: input.isPrivateTrip,
      assignmentStatus: input.assignmentStatus as TripAssignmentStatus | null,
      assignmentSubjectType: input.assignmentSubjectType ?? null,
      assignmentSubjectId: input.assignmentSubjectId,
      assignedBookingId: input.assignedBookingId,
      bookingLinkSource: input.bookingLinkSource,
      bookingCustomerId: input.bookingCustomerId,
      bookingAssignedDriverId: input.bookingAssignedDriverId,
      bookingCustomerType: input.bookingCustomerType,
      tripBookingCustomerId: input.tripBookingCustomerId,
      tripAssignedDriverId: input.tripAssignedDriverId,
      tripActualDriverId: input.tripActualDriverId,
      bookingAllowedDriverIds: input.bookingAllowedDriverIds,
      bookingPrimaryDriverId: input.bookingPrimaryDriverId,
    });

    if (
      input.isPrivateTrip ||
      input.assignmentStatus === TripAssignmentStatus.PRIVATE_UNASSIGNED
    ) {
      return {
        scope: 'PRIVATE',
        confidence: 'HIGH',
        customerRelevant: false,
        bookingRelevant: false,
        customerChargeable: false,
        bookingId: null,
        customerId: null,
        bookingCustomerId: null,
        assignedDriverId: null,
        actualDriverId: null,
        customerDecisionEligible: false,
        driverDecisionEligible: false,
        attributionType: roles.attributionType,
        reason: 'Privatfahrt — nicht kunden- oder buchungsrelevant',
      };
    }

    if (
      input.assignedBookingId &&
      input.bookingLinkSource === 'EXPLICIT'
    ) {
      return {
        scope: 'BOOKING_ASSIGNED',
        confidence: 'HIGH',
        customerRelevant: true,
        bookingRelevant: true,
        customerChargeable: false,
        bookingId: input.assignedBookingId,
        customerId: roles.bookingCustomerId,
        bookingCustomerId: roles.bookingCustomerId,
        assignedDriverId: roles.assignedDriverId,
        actualDriverId: roles.actualDriverId,
        customerDecisionEligible: roles.customerDecisionEligible,
        driverDecisionEligible: roles.driverDecisionEligible,
        attributionType: roles.attributionType,
        reason: 'Explizit mit Buchung verknüpft',
      };
    }

    const overlap = input.bookingOverlap ?? null;
    if (
      input.assignedBookingId &&
      (input.bookingLinkSource === 'TIME_WINDOW' || input.bookingLinkSource == null)
    ) {
      return {
        scope: 'BOOKING_TIME_WINDOW_MATCH',
        confidence: 'MEDIUM',
        customerRelevant: true,
        bookingRelevant: true,
        customerChargeable: false,
        bookingId: input.assignedBookingId,
        customerId: roles.bookingCustomerId ?? overlap?.bookingCustomerId ?? null,
        bookingCustomerId: roles.bookingCustomerId ?? overlap?.bookingCustomerId ?? null,
        assignedDriverId: roles.assignedDriverId ?? overlap?.assignedDriverId ?? null,
        actualDriverId: roles.actualDriverId,
        customerDecisionEligible: false,
        driverDecisionEligible: roles.driverDecisionEligible,
        attributionType: roles.attributionType,
        reason: 'Nur über Buchungszeitfenster gefunden — Zuordnung nicht bestätigt',
      };
    }

    if (overlap) {
      return {
        scope: 'BOOKING_TIME_WINDOW_MATCH',
        confidence: 'LOW',
        customerRelevant: true,
        bookingRelevant: true,
        customerChargeable: false,
        bookingId: overlap.bookingId,
        customerId: overlap.bookingCustomerId,
        bookingCustomerId: overlap.bookingCustomerId,
        assignedDriverId: overlap.assignedDriverId,
        actualDriverId: null,
        customerDecisionEligible: false,
        driverDecisionEligible: Boolean(overlap.assignedDriverId),
        attributionType: roles.attributionType,
        reason: 'Nur über Buchungszeitfenster gefunden — Zuordnung nicht bestätigt',
      };
    }

    return {
      scope: 'UNASSIGNED',
      confidence: 'LOW',
      customerRelevant: false,
      bookingRelevant: false,
      customerChargeable: false,
      bookingId: null,
      customerId: null,
      bookingCustomerId: null,
      assignedDriverId: null,
      actualDriverId: null,
      customerDecisionEligible: false,
      driverDecisionEligible: false,
      attributionType: roles.attributionType,
      reason: 'Keine Buchung verknüpft',
    };
  }

  async resolveAttributionForTrip(
    organizationId: string,
    trip: {
    isPrivateTrip: boolean;
    assignmentStatus: TripAssignmentStatus | null;
    assignedBookingId: string | null;
    assignmentSubjectId: string | null;
    assignmentSubjectType: string | null;
    bookingLinkSource: 'EXPLICIT' | 'TIME_WINDOW' | null;
    bookingCustomerId?: string | null;
    assignedDriverId?: string | null;
    actualDriverId?: string | null;
    vehicleId: string;
    startTime: Date;
    endTime: Date | null;
  }): Promise<TripAttribution> {
    const overlap =
      trip.assignedBookingId && trip.bookingLinkSource === 'EXPLICIT'
        ? null
        : await this.findBookingOverlap(organizationId, trip);

    const allowedDriverContext =
      trip.assignedBookingId != null
        ? await this.loadBookingDriverPool(organizationId, trip.assignedBookingId)
        : null;

    return this.resolveAttribution({
      isPrivateTrip: trip.isPrivateTrip,
      assignmentStatus: trip.assignmentStatus,
      assignedBookingId: trip.assignedBookingId,
      assignmentSubjectId: trip.assignmentSubjectId,
      assignmentSubjectType: trip.assignmentSubjectType,
      bookingLinkSource: trip.bookingLinkSource,
      tripBookingCustomerId: trip.bookingCustomerId,
      tripAssignedDriverId: trip.assignedDriverId,
      tripActualDriverId: trip.actualDriverId,
      bookingAllowedDriverIds: allowedDriverContext?.allowedDriverIds,
      bookingPrimaryDriverId: allowedDriverContext?.primaryDriverId,
      bookingOverlap: overlap,
    });
  }

  resolveAttributionWithPrefetch(
    trip: {
      isPrivateTrip: boolean;
      assignmentStatus: TripAssignmentStatus | null;
      assignedBookingId: string | null;
      assignmentSubjectId: string | null;
      assignmentSubjectType: string | null;
      bookingLinkSource: 'EXPLICIT' | 'TIME_WINDOW' | null;
      bookingCustomerId?: string | null;
      assignedDriverId?: string | null;
      actualDriverId?: string | null;
      vehicleId: string;
      startTime: Date;
      endTime: Date | null;
    },
    prefetch: {
      bookingsByVehicle: Map<string, BookingOverlapCandidate[]>;
      driverPoolByBookingId: Map<string, BookingDriverPoolContext>;
    },
  ): TripAttribution {
    const overlap =
      trip.assignedBookingId && trip.bookingLinkSource === 'EXPLICIT'
        ? null
        : pickBookingOverlapCandidate(
            trip,
            prefetch.bookingsByVehicle.get(trip.vehicleId) ?? [],
          );

    const allowedDriverContext =
      trip.assignedBookingId != null
        ? prefetch.driverPoolByBookingId.get(trip.assignedBookingId) ?? null
        : null;

    return this.resolveAttribution({
      isPrivateTrip: trip.isPrivateTrip,
      assignmentStatus: trip.assignmentStatus,
      assignedBookingId: trip.assignedBookingId,
      assignmentSubjectId: trip.assignmentSubjectId,
      assignmentSubjectType: trip.assignmentSubjectType,
      bookingLinkSource: trip.bookingLinkSource,
      tripBookingCustomerId: trip.bookingCustomerId,
      tripAssignedDriverId: trip.assignedDriverId,
      tripActualDriverId: trip.actualDriverId,
      bookingAllowedDriverIds: allowedDriverContext?.allowedDriverIds,
      bookingPrimaryDriverId: allowedDriverContext?.primaryDriverId,
      bookingOverlap: overlap,
    });
  }

  resolveAttributionForHydratedTrip(
    trip: TripHydrationTripInput,
    assignment: TripAssignmentResolution,
    prefetch: {
      bookingsByVehicle: Map<string, BookingOverlapCandidate[]>;
      driverPoolByBookingId: Map<string, BookingDriverPoolContext>;
    },
  ): TripAttribution {
    return this.resolveAttributionWithPrefetch(
      {
        isPrivateTrip: assignment.isPrivateTrip,
        assignmentStatus: assignment.assignmentStatus,
        assignedBookingId: assignment.assignedBookingId,
        assignmentSubjectId: assignment.assignmentSubjectId,
        assignmentSubjectType: assignment.assignmentSubjectType,
        bookingLinkSource: assignment.bookingLinkSource,
        bookingCustomerId: assignment.bookingCustomerId,
        assignedDriverId: assignment.assignedDriverId,
        actualDriverId: assignment.actualDriverId,
        vehicleId: trip.vehicleId,
        startTime: trip.startTime,
        endTime: trip.endTime,
      },
      prefetch,
    );
  }

  private async loadBookingDriverPool(organizationId: string, bookingId: string) {
    return this.bookingOverlap.loadDriverPoolForBooking({ organizationId, bookingId });
  }

  async findBookingOverlap(
    organizationId: string,
    trip: {
      vehicleId: string;
      startTime: Date;
      endTime: Date | null;
      assignedBookingId?: string | null;
    },
  ): Promise<TripAttributionBookingOverlap | null> {
    const tripEnd = trip.endTime ?? trip.startTime;
    const booking = await this.bookingOverlap.findFirstOverlapForTrip({
      organizationId,
      vehicleId: trip.vehicleId,
      tripStart: trip.startTime,
      tripEnd,
      bookingId: trip.assignedBookingId ?? undefined,
    });
    if (!booking) return null;
    return pickBookingOverlapCandidate(trip, [booking]);
  }

  isCustomerAnalyticsEligible(attribution: TripAttribution): boolean {
    return attribution.scope === 'BOOKING_ASSIGNED' && attribution.customerDecisionEligible;
  }

  isBookingAnalyticsEligible(attribution: TripAttribution): boolean {
    return attribution.scope === 'BOOKING_ASSIGNED';
  }

  isHintOnlyAttribution(attribution: TripAttribution): boolean {
    return attribution.scope === 'BOOKING_TIME_WINDOW_MATCH';
  }
}
