import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  type Prisma,
  TripAssignmentStatus,
  TripAssignmentSubjectType,
  TripDrivingImpact,
  TripDrivingImpactAnalysisStatus,
  VehicleTrip,
} from '@prisma/client';
import { TripAssignmentResolution, TripAssignmentService, type TripAssignmentInput } from './trip-assignment.service';
import { TripAttributionService } from './trip-attribution.service';
import type { TripAttribution } from './trip-attribution.types';
import {
  classifyStressLevel,
  type StressLevel,
} from '../driving-impact/stress-level.util';
import {
  buildUnifiedBehaviorEvents,
  type UnifiedBehaviorEvent,
} from './unified-behavior-read-model';
import { buildTripAssessmentFromSignals } from './trip-assessment.builder';
import type { TripAssessment } from './trip-assessment.types';
import { deriveAnalysisAssessability } from './trip-analysis-status';
import { maxEvidenceLevelFromCases } from './trip-evidence-case.builder';
import type { TripEvidenceLevel } from './trip-evidence-level.types';
import {
  readTripDrivingImpactModelProfile,
} from '../driving-impact-model-profile/driving-impact-model-profile.reader';
import type { DrivingImpactModelProfileManifest } from '../driving-impact-model-profile/driving-impact-model-profile.types';
import {
  assertVehicleInOrganization,
  scopedVehicleTripWhere,
} from '../tenant/vehicle-intelligence-tenant.scope';
import { CanonicalTripHydrationBatchLoader } from './trip-canonical-hydration.batch';
import type { CanonicalTripDecisionSummary } from './trip-canonical-hydration.types';
import type { TripHydrationTripInput } from './trip-canonical-hydration.types';
import {
  hasUncertainHistoricalObdRecordTime,
  resolveTelemetrySourceFamily,
} from '../telemetry-source-family';
import {
  containTripEventCounters,
  countContainedAbuseRowsForReadAdjustment,
  R1_CONTAINED_HF_ABUSE_EVENT_TYPES,
  shouldWithholdR1PersistedDrivingStressScore,
} from '../r1-temporal-containment';
import { listReconciledGapSplitSuffixTripIdsHiddenFromCustomerList, applyHiddenCustomerSuffixTripExclusion } from './trip-customer-list-reconciled-gap-split-suffix.util';

export interface CanonicalTripEventSummary {
  totalAccelerationEvents: number;
  hardAccelerationEvents: number;
  totalBrakingEvents: number;
  hardBrakingEvents: number;
  fullBrakingEvents: number;
  corneringEvents: number;
  abuseEvents: number;
  speedingEvents: number;
  /** Technical exposure metric — not a compliance/safety score. */
  speedingExposurePct: number | null;
}

export interface CanonicalTripScoreSummary {
  /** Composite vehicle stress 0–100. Higher = more load. */
  drivingStressScore: number | null;
  stressLevel: StressLevel | null;
  scoreSource:
    | 'trip_driving_impact'
    | 'vehicle_trip_compat'
    | 'derived'
    | 'r1_temporal_containment_unavailable';
  /** TripDrivingImpact.analysisStatus when a TDI row exists; null when absent (never fabricated). */
  drivingImpactAnalysisStatus: TripDrivingImpactAnalysisStatus | null;
  /** Explicit provenance alias for API consumers (mirrors scoreSource). */
  drivingImpactScoreSource: CanonicalTripScoreSummary['scoreSource'];
  /** Persisted TDI source_completeness 0–1 when available. */
  drivingImpactSourceCompleteness: number | null;
  /** @deprecated Use drivingStressScore */
  drivingStyleScore?: number | null;
}

export interface CanonicalTripAssignmentSummary extends TripAssignmentResolution {}

export interface CanonicalTripSummary {
  events: CanonicalTripEventSummary;
  scores: CanonicalTripScoreSummary;
  assignment: CanonicalTripAssignmentSummary;
  attribution?: TripAttribution;
  drivingImpactModelProfile?: DrivingImpactModelProfileManifest | null;
  /** Materialized pipeline decision snapshot (not exposed on vehicle API mapper). */
  decisionSummary?: CanonicalTripDecisionSummary | null;
}

export interface CanonicalTripStats {
  totalTrips: number;
  totalDistanceKm: number;
  avgDrivingStressScore: number | null;
  stressLevel: StressLevel | null;
  /** @deprecated Mirror of avgDrivingStressScore */
  avgDrivingScore: number | null;
  avgDrivingStyleScore: number | null;
  totalAccelerationEvents: number;
  totalHardAccelerationEvents: number;
  totalBrakingEvents: number;
  totalHardBrakingEvents: number;
  totalAbuseEvents: number;
  totalSpeedingEvents: number;
  privateTripCount: number;
  assignedTripCount: number;
}

type TripProjection = Pick<
  VehicleTrip,
  | 'id'
  | 'vehicleId'
  | 'driverName'
  | 'startTime'
  | 'endTime'
  | 'drivingScore'
  | 'speedingSectionCount'
  | 'speedingSegments'
  | 'speedingExposurePct'
  | 'maxOverSpeedKmh'
  | 'avgOverSpeedKmh'
  | 'accelerationEventCount'
  | 'hardAccelerationCount'
  | 'brakingEventCount'
  | 'hardBrakingCount'
  | 'fullBrakingCount'
  | 'harshCornerCount'
  | 'abuseEventCount'
  | 'totalAccelerationEvents'
  | 'hardAccelerationEvents'
  | 'totalBrakingEvents'
  | 'hardBrakingEvents'
  | 'fullBrakingEvents'
  | 'corneringEvents'
  | 'abuseEvents'
  | 'speedingEvents'
  | 'assignmentStatus'
  | 'assignmentSubjectType'
  | 'assignmentSubjectId'
  | 'assignedBookingId'
  | 'bookingLinkSource'
  | 'bookingCustomerId'
  | 'assignedDriverId'
  | 'actualDriverId'
  | 'isPrivateTrip'
  | 'distanceKm'
  | 'durationMinutes'
  | 'behaviorSummaryJson'
  | 'behaviorEnrichmentStatus'
  | 'tripAnalysisStatus'
  | 'qualityStatus'
>;

@Injectable()
export class TripAnalyticsCanonicalService {
  private readonly hydrationBatchLoader: CanonicalTripHydrationBatchLoader;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tripAssignmentService: TripAssignmentService,
    private readonly tripAttributionService: TripAttributionService,
  ) {
    this.hydrationBatchLoader = new CanonicalTripHydrationBatchLoader(prisma);
  }

  async hydrateTrips<T extends TripProjection>(
    organizationId: string,
    trips: T[],
  ): Promise<Array<T & { canonicalTripSummary: CanonicalTripSummary }>> {
    if (trips.length === 0) return [];

    const hydrationInputs = trips.map((trip) => this.toHydrationInput(trip));
    const prefetch = await this.hydrationBatchLoader.prefetch(organizationId, hydrationInputs);
    const uncertainObdVehicleIds = await this.loadUncertainObdVehicleIds(
      organizationId,
      trips.map((trip) => trip.vehicleId),
    );
    const containedAbuseByTrip = await this.countContainedAbuseEventsByTrip(
      trips.filter((trip) => uncertainObdVehicleIds.has(trip.vehicleId)).map((trip) => trip.id),
    );

    return trips.map((trip, index) => {
      const hydrationTrip = hydrationInputs[index]!;
      const bookingCandidates = prefetch.bookingsByVehicle.get(trip.vehicleId) ?? [];
      const assignment = this.tripAssignmentService.resolveForTripWithCandidates(
        hydrationTrip as TripAssignmentInput,
        bookingCandidates,
      );
      const attribution = this.tripAttributionService.resolveAttributionForHydratedTrip(
        hydrationTrip,
        assignment,
        prefetch,
      );
      return {
        ...trip,
        canonicalTripSummary: this.buildSummary(
          trip,
          prefetch.impactByTripId.get(trip.id) ?? null,
          assignment,
          attribution,
          prefetch.decisionSummaryByTripId.get(trip.id) ?? null,
          uncertainObdVehicleIds.has(trip.vehicleId)
            ? {
                family: 'RUPTELA_R1' as const,
                containedAbuseEvents: containedAbuseByTrip.get(trip.id) ?? 0,
              }
            : null,
        ),
      };
    });
  }

  /** Vehicles whose historical OBD record time is uncertain (Ruptela R1). */
  private async loadUncertainObdVehicleIds(
    organizationId: string,
    vehicleIds: string[],
  ): Promise<Set<string>> {
    const ids = [...new Set(vehicleIds)];
    if (ids.length === 0) return new Set();
    const vehicles = await this.prisma.vehicle.findMany({
      where: { id: { in: ids }, organizationId },
      select: { id: true, dimoVehicle: { select: { rawJson: true } } },
    });
    return new Set(
      vehicles
        .filter((v) =>
          hasUncertainHistoricalObdRecordTime(resolveTelemetrySourceFamily(v.dimoVehicle?.rawJson)),
        )
        .map((v) => v.id),
    );
  }

  private async countContainedAbuseEventsByTrip(tripIds: string[]): Promise<Map<string, number>> {
    if (tripIds.length === 0) return new Map();
    return this.countContainedAbuseEvents({ tripId: { in: tripIds } });
  }

  /**
   * Persisted contained HF abuse rows per trip that are still included in the
   * trip's persisted counters. Trips re-enriched under containment carry the
   * `r1TemporalContainment` summary marker: their counters already exclude these
   * rows (kept only because containment never deletes history), so they are skipped.
   */
  private async countContainedAbuseEvents(
    scope: Prisma.TripBehaviorEventWhereInput,
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.tripBehaviorEvent.findMany({
      where: {
        ...scope,
        eventCategory: 'ABUSE',
        eventType: { in: [...R1_CONTAINED_HF_ABUSE_EVENT_TYPES] },
      },
      select: { tripId: true, eventType: true },
    });
    if (rows.length === 0) return new Map();
    const tripIds = [...new Set(rows.map((r) => r.tripId))];
    const trips = await this.prisma.vehicleTrip.findMany({
      where: { id: { in: tripIds } },
      select: { id: true, behaviorSummaryJson: true },
    });
    const summaryByTrip = new Map(trips.map((t) => [t.id, t.behaviorSummaryJson]));
    const byTrip = new Map<string, Array<{ eventType: string }>>();
    for (const row of rows) {
      const list = byTrip.get(row.tripId) ?? [];
      list.push({ eventType: row.eventType });
      byTrip.set(row.tripId, list);
    }
    const counts = new Map<string, number>();
    for (const [tripId, eventRows] of byTrip) {
      const adjusted = countContainedAbuseRowsForReadAdjustment(
        eventRows,
        summaryByTrip.get(tripId),
      );
      if (adjusted > 0) counts.set(tripId, adjusted);
    }
    return counts;
  }

  async hydrateTrip<T extends TripProjection>(
    organizationId: string,
    trip: T,
  ): Promise<T & { canonicalTripSummary: CanonicalTripSummary }> {
    const [hydrated] = await this.hydrateTrips(organizationId, [trip]);
    return hydrated;
  }

  async buildTripAssessmentForTrip(
    organizationId: string,
    trip: TripProjection & {
      distanceKm?: number | null;
      durationMinutes?: number | null;
      behaviorSummaryJson?: unknown;
      behaviorEnrichmentStatus?: string | null;
      tripAnalysisStatus?: string | null;
      endTime?: Date | string | null;
      qualityStatus?: string | null;
    },
    canonicalSummary: CanonicalTripSummary,
  ): Promise<TripAssessment> {
    const [behaviorEvents, drivingEvents, misuseCases, vehicle] = await Promise.all([
      this.prisma.tripBehaviorEvent.findMany({
        where: { tripId: trip.id, vehicleId: trip.vehicleId, vehicle: { organizationId } },
        orderBy: { startedAt: 'asc' },
      }),
      this.prisma.drivingEvent.findMany({
        where: { tripId: trip.id, vehicleId: trip.vehicleId, vehicle: { organizationId } },
        orderBy: { recordedAt: 'asc' },
      }),
      this.prisma.misuseCase.findMany({
        where: { tripId: trip.id, vehicleId: trip.vehicleId, organizationId },
        select: { evidenceSummary: true },
      }),
      this.prisma.vehicle.findFirst({
        where: { id: trip.vehicleId, organizationId },
        select: { dimoVehicle: { select: { rawJson: true } } },
      }),
    ]);

    const misuseCaseCount = misuseCases.length;
    const evidenceLevels = misuseCases
      .map((row) => {
        const summary = row.evidenceSummary as Record<string, unknown> | null;
        const evidenceCase = summary?.evidenceCase as { evidenceLevel?: TripEvidenceLevel } | undefined;
        return evidenceCase?.evidenceLevel;
      })
      .filter((level): level is TripEvidenceLevel => Boolean(level));
    const maxEvidenceLevel =
      evidenceLevels.length > 0 ? maxEvidenceLevelFromCases(evidenceLevels) : null;

    const unifiedEvents: UnifiedBehaviorEvent[] = buildUnifiedBehaviorEvents({
      behaviorEvents,
      drivingEvents,
      tripId: trip.id,
      telemetrySourceFamily: resolveTelemetrySourceFamily(vehicle?.dimoVehicle?.rawJson),
    });

    const assessability = deriveAnalysisAssessability(trip);

    return buildTripAssessmentFromSignals({
      unifiedEvents,
      scores: canonicalSummary.scores,
      misuseCaseCount,
      maxEvidenceLevel,
      distanceKm: trip.distanceKm ?? null,
      durationMinutes: trip.durationMinutes ?? null,
      assessability,
    });
  }

  async getVehicleStats(organizationId: string, vehicleId: string): Promise<CanonicalTripStats> {
    await assertVehicleInOrganization(this.prisma, organizationId, vehicleId);
    const hiddenSuffixIds = await listReconciledGapSplitSuffixTripIdsHiddenFromCustomerList(
      this.prisma,
      vehicleId,
    );
    const where = applyHiddenCustomerSuffixTripExclusion(
      scopedVehicleTripWhere(organizationId, vehicleId),
      hiddenSuffixIds,
    );
    const impactWhere = {
      vehicleId,
      vehicle: { organizationId },
      ...(hiddenSuffixIds.length > 0 ? { tripId: { notIn: hiddenSuffixIds } } : {}),
    };

    const [tripSummary, impactAvg] = await Promise.all([
      this.prisma.vehicleTrip.aggregate({
        where,
        _count: { _all: true },
        _sum: {
          distanceKm: true,
          totalAccelerationEvents: true,
          hardAccelerationEvents: true,
          totalBrakingEvents: true,
          hardBrakingEvents: true,
          fullBrakingEvents: true,
          abuseEvents: true,
          speedingEvents: true,
        },
      }),
      this.prisma.tripDrivingImpact.aggregate({
        where: impactWhere,
        _avg: { drivingStressScore: true, fullBrakingPer100Km: true },
      }),
    ]);

    const [privateTripCount, assignedTripCount] = await Promise.all([
      this.prisma.vehicleTrip.count({
        where: { ...where, isPrivateTrip: true },
      }),
      this.prisma.vehicleTrip.count({
        where: {
          ...where,
          isPrivateTrip: false,
          assignmentStatus: {
            in: [
              TripAssignmentStatus.ASSIGNED_DRIVER,
              TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
            ],
          },
        },
      }),
    ]);

    let avgDrivingStressScore =
      impactAvg._avg.drivingStressScore != null
        ? this.round2(impactAvg._avg.drivingStressScore)
        : null;
    const persistedEventTotals = {
      totalBrakingEvents: tripSummary._sum.totalBrakingEvents ?? 0,
      fullBrakingEvents: tripSummary._sum.fullBrakingEvents ?? 0,
      abuseEvents: tripSummary._sum.abuseEvents ?? 0,
    };
    const uncertainObd = (await this.loadUncertainObdVehicleIds(organizationId, [vehicleId])).has(
      vehicleId,
    );
    let eventTotals = persistedEventTotals;
    if (uncertainObd) {
      const containedByTrip = await this.countContainedAbuseEvents({ vehicleId, trip: where });
      let containedAbuseEvents = 0;
      for (const count of containedByTrip.values()) containedAbuseEvents += count;
      eventTotals = containTripEventCounters(persistedEventTotals, containedAbuseEvents);
      if (
        shouldWithholdR1PersistedDrivingStressScore('RUPTELA_R1', {
          persistedFullBrakingEvents: persistedEventTotals.fullBrakingEvents,
          containedAbuseEventCount: containedAbuseEvents,
          impactFullBrakingPer100Km: impactAvg._avg.fullBrakingPer100Km,
        })
      ) {
        avgDrivingStressScore = null;
      }
    }
    return {
      totalTrips: tripSummary._count._all ?? 0,
      totalDistanceKm: this.round2(tripSummary._sum.distanceKm ?? 0),
      avgDrivingStressScore,
      stressLevel: classifyStressLevel(avgDrivingStressScore),
      avgDrivingScore: avgDrivingStressScore,
      avgDrivingStyleScore: avgDrivingStressScore,
      totalAccelerationEvents: tripSummary._sum.totalAccelerationEvents ?? 0,
      totalHardAccelerationEvents: tripSummary._sum.hardAccelerationEvents ?? 0,
      totalBrakingEvents: eventTotals.totalBrakingEvents,
      totalHardBrakingEvents: tripSummary._sum.hardBrakingEvents ?? 0,
      totalAbuseEvents: eventTotals.abuseEvents,
      totalSpeedingEvents: tripSummary._sum.speedingEvents ?? 0,
      privateTripCount,
      assignedTripCount,
    };
  }

  private buildSummary(
    trip: TripProjection,
    impact: Pick<
      TripDrivingImpact,
      | 'drivingStressScore'
      | 'sourceSummaryJson'
      | 'fullBrakingPer100Km'
      | 'analysisStatus'
      | 'sourceCompleteness'
    > | null,
    assignment: TripAssignmentResolution,
    attribution?: TripAttribution,
    decisionSummary?: CanonicalTripDecisionSummary | null,
    uncertainObdContainment?: {
      family: 'RUPTELA_R1';
      containedAbuseEvents: number;
    } | null,
  ): CanonicalTripSummary {
    const persistedEvents: CanonicalTripEventSummary = {
      totalAccelerationEvents: trip.totalAccelerationEvents ?? trip.accelerationEventCount ?? 0,
      hardAccelerationEvents: trip.hardAccelerationEvents ?? trip.hardAccelerationCount ?? 0,
      totalBrakingEvents: trip.totalBrakingEvents ?? trip.brakingEventCount ?? 0,
      hardBrakingEvents: trip.hardBrakingEvents ?? trip.hardBrakingCount ?? 0,
      fullBrakingEvents: trip.fullBrakingEvents ?? trip.fullBrakingCount ?? 0,
      corneringEvents: trip.corneringEvents ?? trip.harshCornerCount ?? 0,
      abuseEvents: trip.abuseEvents ?? trip.abuseEventCount ?? 0,
      speedingEvents: trip.speedingEvents ?? trip.speedingSectionCount ?? trip.speedingSegments ?? 0,
      speedingExposurePct: trip.speedingExposurePct ?? null,
    };
    const events = uncertainObdContainment
      ? containTripEventCounters(persistedEvents, uncertainObdContainment.containedAbuseEvents)
      : persistedEvents;

    const persistedFullBrakingBeforeContainment =
      trip.fullBrakingEvents ?? trip.fullBrakingCount ?? 0;
    const withholdStress =
      uncertainObdContainment != null &&
      shouldWithholdR1PersistedDrivingStressScore(uncertainObdContainment.family, {
        persistedFullBrakingEvents: persistedFullBrakingBeforeContainment,
        containedAbuseEventCount: uncertainObdContainment.containedAbuseEvents,
        impactFullBrakingPer100Km: impact?.fullBrakingPer100Km,
      });

    const impactHasStress = impact?.drivingStressScore != null;
    let drivingStressScore = withholdStress
      ? null
      : impactHasStress
        ? impact!.drivingStressScore
        : (trip.drivingScore ?? null);
    let scoreSource: CanonicalTripScoreSummary['scoreSource'] = withholdStress
      ? 'r1_temporal_containment_unavailable'
      : impactHasStress
        ? 'trip_driving_impact'
        : drivingStressScore != null
          ? 'vehicle_trip_compat'
          : 'derived';

    const drivingImpactModelProfile = impact?.sourceSummaryJson
      ? readTripDrivingImpactModelProfile(impact.sourceSummaryJson)
      : null;

    const drivingImpactAnalysisStatus = impact?.analysisStatus ?? null;
    const drivingImpactSourceCompleteness = impact?.sourceCompleteness ?? null;

    return {
      events,
      scores: {
        drivingStressScore,
        stressLevel: classifyStressLevel(drivingStressScore),
        scoreSource,
        drivingImpactAnalysisStatus,
        drivingImpactScoreSource: scoreSource,
        drivingImpactSourceCompleteness,
        drivingStyleScore: drivingStressScore,
      },
      assignment,
      attribution,
      drivingImpactModelProfile,
      decisionSummary: decisionSummary ?? null,
    };
  }

  private toHydrationInput(trip: TripProjection): TripHydrationTripInput {
    return {
      id: trip.id,
      vehicleId: trip.vehicleId,
      startTime: trip.startTime,
      endTime: trip.endTime,
      driverName: trip.driverName,
      assignmentStatus: trip.assignmentStatus,
      assignmentSubjectType: trip.assignmentSubjectType,
      assignmentSubjectId: trip.assignmentSubjectId,
      assignedBookingId: trip.assignedBookingId,
      bookingLinkSource: trip.bookingLinkSource,
      bookingCustomerId: trip.bookingCustomerId ?? null,
      assignedDriverId: trip.assignedDriverId ?? null,
      actualDriverId: trip.actualDriverId ?? null,
      isPrivateTrip: trip.isPrivateTrip,
    };
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
