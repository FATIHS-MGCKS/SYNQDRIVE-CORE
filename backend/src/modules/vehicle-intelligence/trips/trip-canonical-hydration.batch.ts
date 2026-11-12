import { Prisma, type TripDrivingImpactAnalysisStatus } from '@prisma/client';
import type {
  DriverAttributionSource,
  DriverAttributionType,
  DrivingAttributionConfidence,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { pickCanonicalDriverAttribution } from '../driver-attribution/driver-attribution-priority';
import type { TripBookingOverlapPort } from './ports/trip-booking-overlap.port';
import type { TripAttributionBookingOverlap } from './trip-attribution.types';
import {
  CANONICAL_HYDRATION_TRIP_ID_BATCH,
  type BookingDriverPoolContext,
  type BookingOverlapCandidate,
  type CanonicalTripDecisionSummary,
  type CanonicalTripHydrationPrefetch,
  type TripHydrationTripInput,
} from './trip-canonical-hydration.types';

function groupTripsByVehicle<T extends { vehicleId: string }>(trips: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const trip of trips) {
    const bucket = map.get(trip.vehicleId) ?? [];
    bucket.push(trip);
    map.set(trip.vehicleId, bucket);
  }
  return map;
}

function uniqueBookingIds(ids: Iterable<string | null | undefined>): string[] {
  return [
    ...new Set(
      [...ids].filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];
}

function collectDriverPoolBookingIds(
  trips: TripHydrationTripInput[],
  bookingsByVehicle: Map<string, BookingOverlapCandidate[]>,
): string[] {
  const ids = new Set<string>();
  for (const trip of trips) {
    if (trip.assignedBookingId) ids.add(trip.assignedBookingId);
  }
  for (const candidates of bookingsByVehicle.values()) {
    for (const booking of candidates) {
      ids.add(booking.id);
    }
  }
  return [...ids];
}

function chunkIds(ids: string[], size: number): string[][] {
  if (ids.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

export class CanonicalTripHydrationBatchLoader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingOverlap: TripBookingOverlapPort,
  ) {}

  async prefetch(
    organizationId: string,
    trips: TripHydrationTripInput[],
  ): Promise<CanonicalTripHydrationPrefetch> {
    let queryCount = 0;
    const tripIds = trips.map((trip) => trip.id);

    const impactByTripId = await this.loadImpactMap(tripIds, () => {
      queryCount += 1;
    });
    const bookingsByVehicle = await this.loadBookingsByVehicle(organizationId, trips, () => {
      queryCount += 1;
    });
    const driverPoolBookingIds = collectDriverPoolBookingIds(trips, bookingsByVehicle);
    const driverPoolByBookingId = await this.loadDriverPools(
      organizationId,
      driverPoolBookingIds,
      () => {
        queryCount += 1;
      },
    );
    const decisionSummaryByTripId = await this.loadDecisionSummaries(
      organizationId,
      tripIds,
      () => {
        queryCount += 1;
      },
    );

    return {
      impactByTripId,
      bookingsByVehicle,
      driverPoolByBookingId,
      decisionSummaryByTripId,
      queryCount,
    };
  }

  private async loadImpactMap(
    tripIds: string[],
    onQuery: () => void,
  ): Promise<
    Map<
      string,
      {
        drivingStressScore: number | null;
        fullBrakingPer100Km: number | null;
        sourceSummaryJson: Prisma.JsonValue | null;
        analysisStatus: TripDrivingImpactAnalysisStatus;
        sourceCompleteness: number | null;
      }
    >
  > {
    const map = new Map<
      string,
      {
        drivingStressScore: number | null;
        fullBrakingPer100Km: number | null;
        sourceSummaryJson: Prisma.JsonValue | null;
        analysisStatus: TripDrivingImpactAnalysisStatus;
        sourceCompleteness: number | null;
      }
    >();
    if (tripIds.length === 0) return map;

    for (const chunk of chunkIds(tripIds, CANONICAL_HYDRATION_TRIP_ID_BATCH)) {
      onQuery();
      const rows = await this.prisma.tripDrivingImpact.findMany({
        where: { tripId: { in: chunk } },
        select: {
          tripId: true,
          drivingStressScore: true,
          fullBrakingPer100Km: true,
          sourceSummaryJson: true,
          analysisStatus: true,
          sourceCompleteness: true,
        },
      });
      for (const row of rows) {
        map.set(row.tripId, {
          drivingStressScore: row.drivingStressScore,
          fullBrakingPer100Km: row.fullBrakingPer100Km,
          sourceSummaryJson: row.sourceSummaryJson,
          analysisStatus: row.analysisStatus,
          sourceCompleteness: row.sourceCompleteness,
        });
      }
    }
    return map;
  }

  private async loadBookingsByVehicle(
    organizationId: string,
    trips: TripHydrationTripInput[],
    onQuery: () => void,
  ): Promise<Map<string, BookingOverlapCandidate[]>> {
    const map = new Map<string, BookingOverlapCandidate[]>();
    const tripsByVehicle = groupTripsByVehicle(trips);
    if (tripsByVehicle.size === 0) return map;

    for (const [vehicleId, vehicleTrips] of tripsByVehicle) {
      const minStart = vehicleTrips.reduce(
        (min, trip) => (trip.startTime < min ? trip.startTime : min),
        vehicleTrips[0]!.startTime,
      );
      const maxEnd = vehicleTrips.reduce((max, trip) => {
        const end = trip.endTime ?? trip.startTime;
        return end > max ? end : max;
      }, vehicleTrips[0]!.endTime ?? vehicleTrips[0]!.startTime);

      onQuery();
      const bookings = await this.bookingOverlap.findOverlapsForVehicleWindow({
        organizationId,
        vehicleId,
        windowStart: minStart,
        windowEnd: maxEnd,
      });
      map.set(vehicleId, bookings);
    }

    return map;
  }

  private async loadDriverPools(
    organizationId: string,
    bookingIds: string[],
    onQuery: () => void,
  ): Promise<Map<string, BookingDriverPoolContext>> {
    const map = new Map<string, BookingDriverPoolContext>();
    if (bookingIds.length === 0) return map;

    onQuery();
    const pools = await this.bookingOverlap.loadDriverPoolsForBookings({
      organizationId,
      bookingIds,
    });
    for (const [bookingId, pool] of pools) {
      map.set(bookingId, pool);
    }
    return map;
  }

  private async loadDecisionSummaries(
    organizationId: string,
    tripIds: string[],
    onQuery: () => void,
  ): Promise<Map<string, CanonicalTripDecisionSummary | null>> {
    const map = new Map<string, CanonicalTripDecisionSummary | null>();
    if (tripIds.length === 0) return map;

    const grouped = new Map<string, Array<{
      tripId: string;
      attributionType: DriverAttributionType;
      confidence: DrivingAttributionConfidence;
      driverId: string | null;
      customerId: string | null;
      source: DriverAttributionSource;
      modelVersion: string;
      validFrom: Date;
      validUntil: Date | null;
      resolvedAt: Date | null;
    }>>();

    for (const chunk of chunkIds(tripIds, CANONICAL_HYDRATION_TRIP_ID_BATCH)) {
      onQuery();
      const rows = await this.prisma.driverAttribution.findMany({
        where: { organizationId, tripId: { in: chunk } },
        select: {
          tripId: true,
          attributionType: true,
          confidence: true,
          driverId: true,
          customerId: true,
          source: true,
          modelVersion: true,
          validFrom: true,
          validUntil: true,
          resolvedAt: true,
        },
        orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }],
      });
      for (const row of rows) {
        const bucket = grouped.get(row.tripId) ?? [];
        bucket.push(row);
        grouped.set(row.tripId, bucket);
      }
    }

    const at = new Date();
    for (const tripId of tripIds) {
      const canonical = pickCanonicalDriverAttribution(grouped.get(tripId) ?? [], at);
      map.set(
        tripId,
        canonical
          ? {
              tripId,
              attributionType: canonical.attributionType,
              confidence: canonical.confidence,
              driverId: canonical.driverId,
              customerId: canonical.customerId,
              source: canonical.source,
              modelVersion: canonical.modelVersion,
            }
          : null,
      );
    }

    return map;
  }
}
