import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DriverAttributionSource } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { BookingDriverPoolContext } from '../trips/trip-canonical-hydration.types';
import {
  TRIP_BOOKING_OVERLAP_PORT,
  type TripBookingOverlapPort,
} from '../trips/ports/trip-booking-overlap.port';
import { DRIVING_INTELLIGENCE_PIPELINE_MODEL_VERSION } from '../driving-analysis-init/driving-analysis-init.types';
import { DrivingIntelligenceJobDispatcherService } from '../driving-intelligence-jobs/driving-intelligence-jobs.dispatcher.service';
import { TripAttributionService } from '../trips/trip-attribution.service';
import { resolveTripAttribution } from './attribution-resolver';
import type {
  AttributionResolverInput,
  HandoverProofContext,
  ResolvedTripAttribution,
} from './attribution-resolver.types';
import { DRIVER_ATTRIBUTION_MODEL_VERSION } from './driver-attribution.config';
import { pickCanonicalDriverAttribution } from './driver-attribution-priority';
import { DriverAttributionRepository } from './driver-attribution.repository';
import type { DriverAttributionEvidence, UpsertDriverAttributionInput } from './driver-attribution.types';
import {
  TRIP_RENTAL_RECOMPUTE_PORT,
  type TripRentalRecomputePort,
} from '../trips/ports/trip-rental-recompute.port';

@Injectable()
export class DriverAttributionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: DriverAttributionRepository,
    private readonly tripAttributionService: TripAttributionService,
    private readonly jobDispatcher: DrivingIntelligenceJobDispatcherService,
    @Inject(TRIP_BOOKING_OVERLAP_PORT)
    private readonly bookingOverlap: TripBookingOverlapPort,
    @Optional()
    @Inject(TRIP_RENTAL_RECOMPUTE_PORT)
    private readonly rentalRecompute?: TripRentalRecomputePort,
  ) {}

  findByTrip(organizationId: string, tripId: string) {
    return this.repository.findByTrip(organizationId, tripId);
  }

  resolveCanonicalForTrip(organizationId: string, tripId: string, at: Date = new Date()) {
    return this.repository.findByTrip(organizationId, tripId).then((rows) =>
      pickCanonicalDriverAttribution(rows, at),
    );
  }

  upsertSnapshot(input: UpsertDriverAttributionInput) {
    return this.repository.upsertSnapshot(input);
  }

  /**
   * Pure resolver evaluation for a trip — loads context, does not persist.
   */
  async evaluateTripAttribution(input: {
    organizationId: string;
    tripId: string;
    manualOverride?: AttributionResolverInput['manualOverride'];
  }): Promise<ResolvedTripAttribution> {
    const context = await this.loadTripResolverContext(input.organizationId, input.tripId);
    return resolveTripAttribution({
      ...context.resolverInput,
      manualOverride: input.manualOverride ?? null,
    });
  }

  /**
   * Central resolver + persist snapshot. Triggers downstream reconciliation when attribution changes.
   */
  async resolveAndPersistTripAttribution(input: {
    organizationId: string;
    tripId: string;
    analysisRunId?: string | null;
    pipelineJobId?: string | null;
    source?: DriverAttributionSource;
    manualOverride?: AttributionResolverInput['manualOverride'];
    correlationId?: string;
    skipReconciliation?: boolean;
  }) {
    const context = await this.loadTripResolverContext(input.organizationId, input.tripId);
    const resolved = resolveTripAttribution({
      ...context.resolverInput,
      manualOverride: input.manualOverride ?? null,
    });

    const source = input.manualOverride
      ? DriverAttributionSource.MANUAL_RESOLUTION
      : (input.source ?? resolved.source);

    const evidence = this.buildResolverEvidence({
      resolved,
      rolesModelVersion: context.rolesModelVersion,
      attributionScope: context.attribution.scope,
      pipelineJobId: input.pipelineJobId ?? null,
      handoverProtocolId: context.handoverProof?.protocolId ?? null,
    });

    const previous = await this.resolveCanonicalForTrip(input.organizationId, input.tripId);
    const row = await this.repository.upsertSnapshot({
      organizationId: input.organizationId,
      vehicleId: context.trip.vehicleId,
      tripId: context.trip.id,
      analysisRunId: input.analysisRunId ?? null,
      bookingId: resolved.bookingId,
      customerId: resolved.customerId,
      driverId: resolved.driverId,
      attributionType: resolved.attributionType,
      confidence: resolved.confidence,
      source,
      validFrom: context.trip.startTime,
      validUntil: context.trip.endTime,
      evidence,
      resolvedByUserId: input.manualOverride?.resolvedByUserId ?? null,
      resolvedAt: input.manualOverride?.resolvedAt ?? null,
      modelVersion: DRIVER_ATTRIBUTION_MODEL_VERSION,
    });

    const changed =
      !previous ||
      previous.attributionType !== row.attributionType ||
      previous.driverId !== row.driverId ||
      previous.customerId !== row.customerId ||
      previous.confidence !== row.confidence;

    if (changed && !input.skipReconciliation) {
      await this.enqueueDownstreamReconciliation({
        organizationId: input.organizationId,
        vehicleId: context.trip.vehicleId,
        tripId: context.trip.id,
        bookingId: resolved.bookingId,
        analysisRunId: input.analysisRunId ?? null,
        correlationId: input.correlationId ?? `attribution-change:${context.trip.id}`,
      });
    }

    return { row, resolved, changed };
  }

  /**
   * Post-hoc manual correction — updates trip actualDriverId and persists MANUAL_RESOLUTION snapshot.
   */
  async correctAttribution(input: {
    organizationId: string;
    tripId: string;
    driverId: string;
    userId: string;
    analysisRunId?: string | null;
    correlationId?: string;
  }) {
    const trip = await this.prisma.vehicleTrip.findFirst({
      where: { id: input.tripId, vehicle: { organizationId: input.organizationId } },
      select: { id: true, assignedBookingId: true },
    });
    if (!trip) {
      throw new NotFoundException('Trip not found for organization');
    }

    if (trip.assignedBookingId) {
      await this.assertDriverAllowedForBooking({
        organizationId: input.organizationId,
        bookingId: trip.assignedBookingId,
        driverId: input.driverId,
      });
    }

    const resolvedAt = new Date();
    await this.prisma.vehicleTrip.update({
      where: { id: input.tripId },
      data: { actualDriverId: input.driverId },
    });

    return this.resolveAndPersistTripAttribution({
      organizationId: input.organizationId,
      tripId: input.tripId,
      analysisRunId: input.analysisRunId ?? null,
      correlationId: input.correlationId ?? `attribution-manual:${input.tripId}`,
      manualOverride: {
        driverId: input.driverId,
        resolvedByUserId: input.userId,
        resolvedAt,
      },
    });
  }

  /**
   * Pipeline job entry — delegates to central resolver (P55).
   */
  async materializePipelineSnapshot(input: {
    organizationId: string;
    tripId: string;
    analysisRunId?: string | null;
    pipelineJobId?: string | null;
    source?: DriverAttributionSource;
  }) {
    return this.resolveAndPersistTripAttribution({
      organizationId: input.organizationId,
      tripId: input.tripId,
      analysisRunId: input.analysisRunId ?? null,
      pipelineJobId: input.pipelineJobId ?? null,
      source: input.source,
      correlationId: input.pipelineJobId ? `attribution-pipeline:${input.pipelineJobId}` : undefined,
    });
  }

  private async loadTripResolverContext(organizationId: string, tripId: string) {
    const trip = await this.prisma.vehicleTrip.findFirst({
      where: { id: tripId, vehicle: { organizationId } },
      select: {
        id: true,
        vehicleId: true,
        startTime: true,
        endTime: true,
        isPrivateTrip: true,
        assignmentStatus: true,
        assignmentSubjectType: true,
        assignmentSubjectId: true,
        assignedBookingId: true,
        bookingLinkSource: true,
        bookingCustomerId: true,
        assignedDriverId: true,
        actualDriverId: true,
      },
    });
    if (!trip) {
      throw new NotFoundException('Trip not found for organization');
    }

    const booking =
      trip.assignedBookingId != null
        ? await this.bookingOverlap.loadBookingAttributionContext({
            organizationId,
            bookingId: trip.assignedBookingId,
          })
        : null;

    const attribution = await this.tripAttributionService.resolveAttributionForTrip(
      organizationId,
      {
        isPrivateTrip: trip.isPrivateTrip,
        assignmentStatus: trip.assignmentStatus,
        assignedBookingId: trip.assignedBookingId,
        assignmentSubjectId: trip.assignmentSubjectId,
        assignmentSubjectType: trip.assignmentSubjectType,
        bookingLinkSource: trip.bookingLinkSource,
        bookingCustomerId: booking?.customerId ?? trip.bookingCustomerId,
        assignedDriverId: booking?.assignedDriverId ?? trip.assignedDriverId,
        actualDriverId: trip.actualDriverId,
        vehicleId: trip.vehicleId,
        startTime: trip.startTime,
        endTime: trip.endTime,
      },
    );

    const handoverProof = await this.findHandoverProof({
      organizationId,
      bookingId: trip.assignedBookingId,
      tripStart: trip.startTime,
      tripEnd: trip.endTime,
    });

    const rolesModelVersion = 'driving-attribution-roles-v1';

    const resolverInput: Omit<AttributionResolverInput, 'manualOverride'> = {
      isPrivateTrip: trip.isPrivateTrip,
      assignmentStatus: trip.assignmentStatus,
      assignmentSubjectType: trip.assignmentSubjectType,
      assignmentSubjectId: trip.assignmentSubjectId,
      assignedBookingId: trip.assignedBookingId,
      bookingLinkSource: trip.bookingLinkSource,
      tripBookingCustomerId: trip.bookingCustomerId,
      tripAssignedDriverId: trip.assignedDriverId,
      tripActualDriverId: trip.actualDriverId,
      bookingCustomerId: booking?.customerId ?? trip.bookingCustomerId,
      bookingAssignedDriverId: booking?.assignedDriverId ?? trip.assignedDriverId,
      bookingCustomerType: booking?.customerType ?? null,
      tripAttributionScope: attribution.scope,
      tripAttributionConfidence: attribution.confidence,
      tripAttributionReason: attribution.reason,
      handoverProof,
    };

    return { trip, attribution, handoverProof, resolverInput, rolesModelVersion };
  }

  private async findHandoverProof(input: {
    organizationId: string;
    bookingId: string | null;
    tripStart: Date;
    tripEnd: Date | null;
  }): Promise<HandoverProofContext | null> {
    if (!input.bookingId) return null;

    return this.bookingOverlap.findPickupHandoverProofForTrip({
      organizationId: input.organizationId,
      bookingId: input.bookingId,
      tripStart: input.tripStart,
      tripEnd: input.tripEnd,
    });
  }

  private buildResolverEvidence(input: {
    resolved: ResolvedTripAttribution;
    rolesModelVersion: string;
    attributionScope: string;
    pipelineJobId: string | null;
    handoverProtocolId: string | null;
  }): DriverAttributionEvidence {
    return {
      attributionScope: input.attributionScope,
      reason: input.resolved.reasons[0],
      reasons: input.resolved.reasons,
      rolesModelVersion: input.rolesModelVersion,
      resolverVersion: input.resolved.resolverVersion,
      bookingCustomerId: input.resolved.bookingCustomerId,
      assignedDriverId: input.resolved.assignedDriverId,
      actualDriverId: input.resolved.actualDriverId,
      pipelineJobId: input.pipelineJobId,
      customerEligibility: input.resolved.customerEligibility,
      driverEligibility: input.resolved.driverEligibility,
      conflicts: input.resolved.conflicts,
      handoverProtocolId: input.handoverProtocolId,
    };
  }

  private async enqueueDownstreamReconciliation(input: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
    bookingId: string | null;
    analysisRunId: string | null;
    correlationId: string;
  }) {
    const analysisRunId =
      input.analysisRunId ??
      (
        await this.prisma.drivingAnalysisRun.findFirst({
          where: {
            organizationId: input.organizationId,
            tripId: input.tripId,
            analysisType: 'TRIP_ENRICHMENT',
            modelVersion: DRIVING_INTELLIGENCE_PIPELINE_MODEL_VERSION,
          },
          orderBy: { startedAt: 'desc' },
          select: { id: true },
        })
      )?.id;

    if (!analysisRunId) {
      return;
    }

    const requestedAt = new Date();
    const base = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      analysisRunId,
      modelVersion: DRIVING_INTELLIGENCE_PIPELINE_MODEL_VERSION,
      correlationId: input.correlationId,
      requestedAt,
    };

    await this.jobDispatcher.enqueue({
      ...base,
      jobType: 'DRIVING_MISUSE_RECONCILE',
      idempotencyKey: `${input.tripId}:misuse-reconcile:${analysisRunId}:attribution`,
    });

    if (input.bookingId) {
      await this.rentalRecompute?.notifyAttributionChanged({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        bookingId: input.bookingId,
        tripId: input.tripId,
      });
    }
  }

  private async assertDriverAllowedForBooking(input: {
    organizationId: string;
    bookingId: string;
    driverId: string;
  }) {
    const pool = await this.bookingOverlap.loadDriverPoolForBooking({
      organizationId: input.organizationId,
      bookingId: input.bookingId,
    });

    if (!this.isDriverAllowedInBookingPool(input.driverId, pool)) {
      throw new BadRequestException(
        'Driver is not in the allowed driver pool for this booking',
      );
    }
  }

  /**
   * Mirrors rental `isDriverInBookingPool` — empty allowedDriverIds permits any driver
   * (legacy permissive policy; security follow-up tracked in Master Plan P2-PR5).
   */
  private isDriverAllowedInBookingPool(
    driverId: string,
    pool: Pick<BookingDriverPoolContext, 'allowedDriverIds'>,
  ): boolean {
    if (!driverId) return false;
    if (pool.allowedDriverIds.length === 0) return true;
    return pool.allowedDriverIds.includes(driverId);
  }
}
