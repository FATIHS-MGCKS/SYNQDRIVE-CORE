import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DimoSegmentsService,
  RoutePoint,
  PerformanceReading,
  TemperatureReading,
} from '../../dimo/dimo-segments.service';
import { MapboxService } from './mapbox.service';
import {
  assertTripInOrganization,
  assertVehicleInOrganization,
  buildTripDriverIdentityFilter,
  scopedVehicleTripWhere,
} from '../tenant/vehicle-intelligence-tenant.scope';
import { resolveEnrichmentDistanceKm } from './trip-distance.helpers';
import {
  TripRouteArtifactMaterializerService,
  TripRouteCanonicalReadService,
  selectWaypointsForPersistence,
  type CanonicalTripRouteResponse,
  type TripRouteWaypointFidelity,
} from './route-artifact';
import {
  DrivingIntelligenceJobRetryableError,
  DRIVING_INTELLIGENCE_JOB_ERROR_CODES,
} from '../driving-intelligence-jobs/driving-intelligence-jobs.errors';
import { buildDimoProviderRequestContext } from '../../dimo/provider/dimo-provider-request-context.util';
import { listReconciledGapSplitSuffixTripIdsHiddenFromCustomerList, applyHiddenCustomerSuffixTripExclusion } from './trip-customer-list-reconciled-gap-split-suffix.util';

export interface TripEnrichmentResult {
  citySharePercent: number;
  highwaySharePercent: number;
  countrySharePercent: number;
  cityKm: number;
  highwayKm: number;
  countryKm: number;
  outsideTemperatureStartC: number | null;
  fuelUsedLiters: number | null;
  avgConsumptionLPer100Km: number | null;
  fuelConfidence: string | null;
  energyUsedKwh: number | null;
  avgConsumptionKwhPer100Km: number | null;
  energyConfidence: string | null;
  engineTempStartC: number | null;
  engineTempEndC: number | null;
  avgRpm: number | null;
  avgThrottlePosition: number | null;
  avgEngineLoad: number | null;
  /** @deprecated Legacy point-based percentage */
  speedingPercent: number | null;
  maxOverSpeedKmh: number | null;
  /** @deprecated Now equals speedingSectionCount */
  speedingSegments: number | null;
  speedingSectionCount: number | null;
  speedingDistanceMeters: number | null;
  speedingDurationSeconds: number | null;
  speedingExposurePercent: number | null;
  avgOverSpeedKmh: number | null;
  speedingSections: any[] | null;
  mapMatchConfidence: number;
  matchedGeometry: [number, number][];
  enrichedAt: string;
}

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly segments: DimoSegmentsService,
    private readonly mapbox: MapboxService,
    private readonly routeArtifactMaterializer: TripRouteArtifactMaterializerService,
    private readonly routeCanonicalRead: TripRouteCanonicalReadService,
  ) {}

  // ────────────────────────────────────────────────────────
  // QUERIES
  // ────────────────────────────────────────────────────────

  async findByVehicle(
    organizationId: string,
    vehicleId: string,
    options?: {
      from?: Date;
      to?: Date;
      driverCustomerId?: string;
      /** @deprecated Prefer driverCustomerId — legacy display-name filter only. */
      driverName?: string;
      limit?: number;
    },
  ) {
    await assertVehicleInOrganization(this.prisma, organizationId, vehicleId);

    const where = scopedVehicleTripWhere(organizationId, vehicleId);
    if (options?.from || options?.to) {
      where.startTime = {};
      if (options.from) where.startTime.gte = options.from;
      if (options.to) where.startTime.lte = options.to;
    }
    const driverFilter = buildTripDriverIdentityFilter({
      driverCustomerId: options?.driverCustomerId,
      driverName: options?.driverName,
    });
    if (driverFilter) {
      Object.assign(where, driverFilter);
    }

    return this.prisma.vehicleTrip.findMany({
      where,
      orderBy: { startTime: 'desc' },
      take: options?.limit ?? 50,
    });
  }

  /**
   * Customer-facing trip list: excludes CANCELLED LIVE_FSM gap-split suffix rows that
   * reconciliation already absorbed into a canonical parent (DB rows unchanged).
   */
  async findCustomerVisibleTripsByVehicle(
    organizationId: string,
    vehicleId: string,
    options?: {
      from?: Date;
      to?: Date;
      driverCustomerId?: string;
      driverName?: string;
      limit?: number;
    },
  ) {
    await assertVehicleInOrganization(this.prisma, organizationId, vehicleId);

    const hiddenSuffixIds = await listReconciledGapSplitSuffixTripIdsHiddenFromCustomerList(
      this.prisma,
      vehicleId,
      { from: options?.from, to: options?.to },
    );

    const where = applyHiddenCustomerSuffixTripExclusion(
      scopedVehicleTripWhere(organizationId, vehicleId),
      hiddenSuffixIds,
    );
    if (options?.from || options?.to) {
      where.startTime = {};
      if (options.from) where.startTime.gte = options.from;
      if (options.to) where.startTime.lte = options.to;
    }
    const driverFilter = buildTripDriverIdentityFilter({
      driverCustomerId: options?.driverCustomerId,
      driverName: options?.driverName,
    });
    if (driverFilter) {
      Object.assign(where, driverFilter);
    }

    return this.prisma.vehicleTrip.findMany({
      where,
      orderBy: { startTime: 'desc' },
      take: options?.limit ?? 50,
    });
  }

  async findById(organizationId: string, tripId: string) {
    await assertTripInOrganization(this.prisma, organizationId, tripId);
    return this.prisma.vehicleTrip.findFirst({
      where: { id: tripId, vehicle: { organizationId } },
      include: {
        waypoints: { orderBy: { recordedAt: 'asc' } },
        events: { orderBy: { recordedAt: 'asc' } },
      },
    });
  }

  async getRouteForTrip(
    organizationId: string,
    vehicleId: string,
    tripId: string,
  ): Promise<CanonicalTripRouteResponse> {
    await assertVehicleInOrganization(this.prisma, organizationId, vehicleId);
    const { vehicleId: scopedVehicleId } = await assertTripInOrganization(
      this.prisma,
      organizationId,
      tripId,
    );
    if (scopedVehicleId !== vehicleId) {
      return this.emptyCanonicalRouteResponse(tripId, vehicleId);
    }

    return this.routeCanonicalRead.getCanonicalRouteForTrip(
      organizationId,
      vehicleId,
      tripId,
    );
  }

  private emptyCanonicalRouteResponse(
    tripId: string,
    vehicleId: string,
  ): CanonicalTripRouteResponse {
    return {
      tripId,
      vehicleId,
      routeQuality: null,
      geometry: null,
      source: {
        provider: null,
        algorithmVersion: null,
        processedAt: null,
      },
      quality: {
        matchConfidence: null,
        matchCoverage: null,
      },
      counts: {
        sourcePointCount: 0,
        filteredPointCount: 0,
        matchedPointCount: null,
      },
      continuity: {
        status: 'INSUFFICIENT_DATA',
        hasUnknownGaps: false,
        gapCount: 0,
      },
      status: {
        processingState: 'UNAVAILABLE',
        ready: false,
        retryableFailure: false,
        failureReason: 'TRIP_VEHICLE_MISMATCH',
      },
      speedPoints: [],
    };
  }

  async getStats(organizationId: string, vehicleId: string) {
    await assertVehicleInOrganization(this.prisma, organizationId, vehicleId);
    const where = scopedVehicleTripWhere(organizationId, vehicleId);
    const impactWhere = { vehicleId, vehicle: { organizationId } };

    const [totalTrips, tripAgg, impactAgg] = await Promise.all([
      this.prisma.vehicleTrip.count({ where }),
      this.prisma.vehicleTrip.aggregate({
        where,
        _sum: {
          distanceKm: true,
          totalAccelerationEvents: true,
          hardAccelerationEvents: true,
          totalBrakingEvents: true,
          hardBrakingEvents: true,
          abuseEvents: true,
          speedingEvents: true,
        },
      }),
      this.prisma.tripDrivingImpact.aggregate({
        where: impactWhere,
        _avg: { drivingStressScore: true },
      }),
    ]);

    const avgDrivingStressScore = impactAgg._avg.drivingStressScore ?? null;

    return {
      totalTrips,
      totalDistanceKm: tripAgg._sum.distanceKm ?? 0,
      avgDrivingScore: avgDrivingStressScore,
      avgDrivingStressScore,
      avgDrivingStyleScore: avgDrivingStressScore,
      totalAccelerationEvents: tripAgg._sum.totalAccelerationEvents ?? 0,
      totalHardAccelerationEvents: tripAgg._sum.hardAccelerationEvents ?? 0,
      totalBrakingEvents: tripAgg._sum.totalBrakingEvents ?? 0,
      totalHardBrakingEvents: tripAgg._sum.hardBrakingEvents ?? 0,
      totalAbuseEvents: tripAgg._sum.abuseEvents ?? 0,
      totalSpeedingEvents: tripAgg._sum.speedingEvents ?? 0,
    };
  }

  // V1 syncTripsFromSegments, finalizeStaleOngoingTrips, deduplicateTrips,
  // computeDrivingScore, and completeTrip have been removed.
  // Reconciliation and repair are now handled by TripReconciliationService
  // (see reconciliation/trip-reconciliation.service.ts).
  // Manual "Sync Trips" triggers TripReconciliationService.triggerManualReconciliation()
  // via the controller's POST /trips/reconcile endpoint.

  // ────────────────────────────────────────────────────────
  // ⚠️  LEGACY ROUTE-BASED ENRICHMENT — DEPRECATED
  //
  // enrichTrip() fetches route, temperature, and Performance (15s) signals
  // to compute road-type distribution (city/highway/country), speeding, and
  // basic avg RPM/throttle/load metrics.  It writes to:
  //   citySharePercent, highwaySharePercent, countrySharePercent,
  //   outsideTemperatureStartC, engineTempStartC, engineTempEndC,
  //   avgRpm, avgThrottlePosition, avgEngineLoad,
  //   speedingPercent, maxOverSpeedKmh, speedingSegments
  //
  // These fields are COMPLEMENTARY to HF enrichment, NOT conflicting.
  // The legacy fields it writes do NOT overlap with the HF behavior counters
  // (hardAccelerationCount, hardBrakingCount, abuseEventCount, etc.).
  //
  // CANONICAL TRUTH for post-trip behavior metrics (acceleration, braking,
  // abuse events, stress scores) is the HF enrichment pipeline:
  //   TripBehaviorEnrichmentService → DrivingImpactService
  //
  // This method is kept for its road-type and speeding enrichment which is
  // genuinely separate.  It is reachable via POST /vehicles/:id/trips/:tripId/enrich
  // and is callable from the rental app for manual or batch enrichment.
  //
  // DO NOT rely on harshBrakeCount / harshAccelCount / harshCornerCount written
  // anywhere in this method — those legacy fields are written by DrivingEvent
  // aggregation if applicable, not here.  For behavior truth, use behaviorEnrichedAt
  // and hardBrakingCount / hardAccelerationCount from the HF pipeline.
  // ────────────────────────────────────────────────────────

  /**
   * Route-based trip enrichment: road type, speeding, temperature, basic perf.
   *
   * This is NOT the canonical behavior analysis path.
   * For behavior metrics (acceleration / braking / abuse events), use the
   * HF enrichment pipeline (TripBehaviorEnrichmentService).
   */
  async enrichTrip(
    organizationId: string,
    vehicleId: string,
    tripId: string,
  ): Promise<TripEnrichmentResult | null> {
    await assertVehicleInOrganization(this.prisma, organizationId, vehicleId);
    const { vehicleId: scopedVehicleId } = await assertTripInOrganization(
      this.prisma,
      organizationId,
      tripId,
    );
    if (scopedVehicleId !== vehicleId) return null;

    const trip = await this.prisma.vehicleTrip.findFirst({
      where: { id: tripId, vehicle: { organizationId } },
    });
    if (!trip) return null;

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      include: { dimoVehicle: true },
    });
    const tokenId = vehicle?.dimoVehicle?.tokenId;
    if (!tokenId) return null;

    const endTime = trip.endTime ?? new Date();
    const providerContext = buildDimoProviderRequestContext(tokenId, {
      organizationId,
      vehicleId,
    });

    const [routePoints, tempReadings, perfReadings] = await Promise.all([
      this.segments.fetchRouteEnrichment(
        tokenId,
        trip.startTime,
        endTime,
        providerContext,
      ),
      this.segments.fetchEnvironmentTemperature(
        tokenId,
        trip.startTime,
        endTime,
        providerContext,
      ),
      this.segments.fetchPerformance(
        tokenId,
        trip.startTime,
        endTime,
        providerContext,
      ),
    ]);

    // Route V2 R2: persist canonical measured waypoints first (durable RAW authority),
    // then materialize artifact. Retryable artifact failures propagate to DRIVING_ROUTE_ENRICH.
    if (routePoints.length > 0) {
      await this.storeWaypoints(tripId, routePoints, { fidelity: 'canonical' });
    }

    const artifactOutcome = await this.materializeRouteArtifact(
      organizationId,
      vehicleId,
      tripId,
      routePoints,
    );

    const matchResult = artifactOutcome?.matchResult ?? null;

    const roadDist = matchResult
      ? this.mapbox.deriveRoadTypeDistribution(
          matchResult.legs,
          matchResult.totalDistance,
        )
      : { cityPercent: 0, highwayPercent: 0, countryPercent: 0, cityKm: 0, highwayKm: 0, countryKm: 0 };

    const speedingAnalysis =
      matchResult && routePoints.length >= 2
        ? this.mapbox.analyzeSpeedingSections(matchResult.legs, routePoints)
        : null;

    const outsideTempStart = this.findClosestTemperature(
      tempReadings,
      trip.startTime,
    );

    const perfMetrics = this.computePerformanceMetrics(
      perfReadings,
      trip.startTime,
      endTime,
    );

    const distanceKm = resolveEnrichmentDistanceKm(
      trip,
      matchResult?.totalDistance,
    );

    if (routePoints.length >= 2) {
      const firstPt = routePoints[0];
      const lastPt = routePoints[routePoints.length - 1];
      await this.prisma.vehicleTrip.update({
        where: { id: tripId },
        data: {
          startLatitude: firstPt.latitude,
          startLongitude: firstPt.longitude,
          endLatitude: lastPt.latitude,
          endLongitude: lastPt.longitude,
        },
      });
    }

    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: {
        citySharePercent: roadDist.cityPercent,
        highwaySharePercent: roadDist.highwayPercent,
        countrySharePercent: roadDist.countryPercent,
        outsideTemperatureStartC: outsideTempStart,
        engineTempStartC: perfMetrics.engineTempStartC,
        engineTempEndC: perfMetrics.engineTempEndC,
        avgRpm: perfMetrics.avgRpm,
        avgThrottlePosition: perfMetrics.avgThrottlePosition,
        avgEngineLoad: perfMetrics.avgEngineLoad,
        speedingPercent: speedingAnalysis?.speedingPercent ?? null,
        maxOverSpeedKmh: speedingAnalysis?.maxOverSpeedKmh ?? null,
        speedingSegments: speedingAnalysis?.speedingSectionCount ?? null,
        speedingSectionsJson: speedingAnalysis?.sections ? JSON.parse(JSON.stringify(speedingAnalysis.sections)) : undefined,
        speedingSectionCount: speedingAnalysis?.speedingSectionCount ?? null,
        speedingDistanceM: speedingAnalysis?.speedingDistanceMeters ?? null,
        speedingDurationS: speedingAnalysis?.speedingDurationSeconds ?? null,
        speedingExposurePct: speedingAnalysis?.speedingExposurePercent ?? null,
        avgOverSpeedKmh: speedingAnalysis?.avgOverSpeedKmh ?? null,
        speedingEvents: speedingAnalysis?.speedingSectionCount ?? 0,
        ...(distanceKm != null ? { distanceKm } : {}),
        enrichedAt: new Date(),
      },
    });

    return {
      citySharePercent: roadDist.cityPercent,
      highwaySharePercent: roadDist.highwayPercent,
      countrySharePercent: roadDist.countryPercent,
      cityKm: roadDist.cityKm,
      highwayKm: roadDist.highwayKm,
      countryKm: roadDist.countryKm,
      outsideTemperatureStartC: outsideTempStart,
      fuelUsedLiters: trip.fuelUsedLiters,
      avgConsumptionLPer100Km: trip.avgConsumptionLPer100Km,
      fuelConfidence: trip.fuelConfidence,
      energyUsedKwh: trip.energyUsedKwh,
      avgConsumptionKwhPer100Km: trip.avgConsumptionKwhPer100Km,
      energyConfidence: trip.energyConfidence,
      engineTempStartC: perfMetrics.engineTempStartC,
      engineTempEndC: perfMetrics.engineTempEndC,
      avgRpm: perfMetrics.avgRpm,
      avgThrottlePosition: perfMetrics.avgThrottlePosition,
      avgEngineLoad: perfMetrics.avgEngineLoad,
      speedingPercent: speedingAnalysis?.speedingPercent ?? null,
      maxOverSpeedKmh: speedingAnalysis?.maxOverSpeedKmh ?? null,
      speedingSegments: speedingAnalysis?.speedingSectionCount ?? null,
      speedingSectionCount: speedingAnalysis?.speedingSectionCount ?? null,
      speedingDistanceMeters: speedingAnalysis?.speedingDistanceMeters ?? null,
      speedingDurationSeconds: speedingAnalysis?.speedingDurationSeconds ?? null,
      speedingExposurePercent: speedingAnalysis?.speedingExposurePercent ?? null,
      avgOverSpeedKmh: speedingAnalysis?.avgOverSpeedKmh ?? null,
      speedingSections: speedingAnalysis?.sections ?? null,
      mapMatchConfidence: matchResult?.confidence ?? 0,
      matchedGeometry: matchResult?.matchedGeometry ?? [],
      enrichedAt: new Date().toISOString(),
    };
  }

  // ────────────────────────────────────────────────────────
  // PRIVATE: signal-based calculations
  // ────────────────────────────────────────────────────────

  private findClosestTemperature(
    readings: TemperatureReading[],
    targetTime: Date,
  ): number | null {
    const closest = DimoSegmentsService.closestReading(
      readings,
      targetTime,
    );
    return closest
      ? Math.round(closest.temperatureC * 10) / 10
      : null;
  }

  private computePerformanceMetrics(
    readings: PerformanceReading[],
    tripStart: Date,
    tripEnd: Date,
  ): {
    engineTempStartC: number | null;
    engineTempEndC: number | null;
    avgRpm: number | null;
    avgThrottlePosition: number | null;
    avgEngineLoad: number | null;
  } {
    if (readings.length === 0) {
      return {
        engineTempStartC: null,
        engineTempEndC: null,
        avgRpm: null,
        avgThrottlePosition: null,
        avgEngineLoad: null,
      };
    }

    const closestStart = DimoSegmentsService.closestReading(
      readings,
      tripStart,
    );
    const closestEnd = DimoSegmentsService.closestReading(
      readings,
      tripEnd,
    );

    const rpms = readings
      .filter((r) => r.rpm != null)
      .map((r) => r.rpm!);
    const throttles = readings
      .filter((r) => r.throttlePosition != null)
      .map((r) => r.throttlePosition!);
    const loads = readings
      .filter((r) => r.engineLoad != null)
      .map((r) => r.engineLoad!);

    return {
      engineTempStartC: closestStart?.engineCoolantTempC
        ? Math.round(closestStart.engineCoolantTempC * 10) / 10
        : null,
      engineTempEndC: closestEnd?.engineCoolantTempC
        ? Math.round(closestEnd.engineCoolantTempC * 10) / 10
        : null,
      avgRpm:
        rpms.length > 0
          ? Math.round(rpms.reduce((a, b) => a + b, 0) / rpms.length)
          : null,
      avgThrottlePosition:
        throttles.length > 0
          ? Math.round(
              (throttles.reduce((a, b) => a + b, 0) / throttles.length) *
                10,
            ) / 10
          : null,
      avgEngineLoad:
        loads.length > 0
          ? Math.round(
              (loads.reduce((a, b) => a + b, 0) / loads.length) * 10,
            ) / 10
          : null,
    };
  }

  // ────────────────────────────────────────────────────────
  // ROUTE V2 ARTIFACT (R2)
  // ────────────────────────────────────────────────────────

  private async materializeRouteArtifact(
    organizationId: string,
    vehicleId: string,
    tripId: string,
    routePoints: RoutePoint[],
  ): Promise<{ matchResult: import('./mapbox.service').MapMatchResult | null } | null> {
    const outcome = await this.routeArtifactMaterializer.materializeFromMeasuredRoute({
      organizationId,
      vehicleId,
      tripId,
      points: routePoints.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        recordedAt: p.timestamp,
      })),
    });
    if (!outcome.ok) {
      if (outcome.retryable) {
        throw new DrivingIntelligenceJobRetryableError(
          DRIVING_INTELLIGENCE_JOB_ERROR_CODES.HANDLER_TRANSIENT,
          `Route artifact materialization failed trip=${tripId}: ${outcome.error}`,
        );
      }
      this.logger.error(
        `Route V2 artifact permanent failure trip=${tripId}: ${outcome.error}`,
      );
      return null;
    }
    return { matchResult: outcome.matchResult };
  }

  // ────────────────────────────────────────────────────────
  // WAYPOINT STORAGE
  // ────────────────────────────────────────────────────────

  private async storeWaypoints(
    tripId: string,
    points: RoutePoint[],
    options?: { fidelity?: TripRouteWaypointFidelity },
  ): Promise<void> {
    const fidelity = options?.fidelity ?? 'bounded';
    const sampled = selectWaypointsForPersistence(points, fidelity);

    await this.prisma.vehicleTripWaypoint.deleteMany({
      where: { tripId },
    });
    await this.prisma.vehicleTripWaypoint.createMany({
      data: sampled.map((p) => ({
        tripId,
        latitude: p.latitude,
        longitude: p.longitude,
        speedKmh: p.speedKmh,
        recordedAt: new Date(p.timestamp),
      })),
    });
  }

  private async getStoredWaypoints(tripId: string): Promise<RoutePoint[]> {
    const waypoints = await this.prisma.vehicleTripWaypoint.findMany({
      where: { tripId },
      orderBy: { recordedAt: 'asc' },
    });
    return waypoints.map((w) => ({
      latitude: w.latitude,
      longitude: w.longitude,
      speedKmh: w.speedKmh,
      timestamp: w.recordedAt.toISOString(),
    }));
  }
}
