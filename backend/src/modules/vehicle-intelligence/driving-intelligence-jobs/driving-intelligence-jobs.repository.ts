import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  TRIP_BOOKING_OVERLAP_PORT,
  type TripBookingOverlapPort,
} from '../trips/ports/trip-booking-overlap.port';
import { validateEnqueueDrivingIntelligenceJobInput } from './driving-intelligence-jobs.contract';
import {
  DRIVING_INTELLIGENCE_JOB_DEFAULT_MAX_ATTEMPTS,
  computeNextRetryAt,
} from './driving-intelligence-jobs.retry-policy';
import type {
  EnqueueDrivingIntelligenceJobInput,
  PersistDrivingIntelligenceJobInput,
} from './driving-intelligence-jobs.types';

const TERMINAL_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'DEAD_LETTER']);

@Injectable()
export class DrivingIntelligenceJobRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TRIP_BOOKING_OVERLAP_PORT)
    private readonly bookingOverlap: TripBookingOverlapPort,
  ) {}

  async assertVehicleInOrg(organizationId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found for organization');
    }
  }

  async assertTripInOrg(
    organizationId: string,
    tripId: string,
  ): Promise<{ vehicleId: string }> {
    const trip = await this.prisma.vehicleTrip.findFirst({
      where: { id: tripId, vehicle: { organizationId } },
      select: { id: true, vehicleId: true },
    });
    if (!trip) {
      throw new NotFoundException('Trip not found for organization');
    }
    return { vehicleId: trip.vehicleId };
  }

  async assertBookingInOrg(
    organizationId: string,
    bookingId: string,
  ): Promise<{ vehicleId: string | null }> {
    return this.bookingOverlap.resolveBookingVehicleForOrganization({
      organizationId,
      bookingId,
    });
  }

  async assertAnalysisRunInOrg(
    organizationId: string,
    analysisRunId: string,
  ): Promise<{ vehicleId: string; tripId: string }> {
    const run = await this.prisma.drivingAnalysisRun.findFirst({
      where: { id: analysisRunId, organizationId },
      select: { id: true, vehicleId: true, tripId: true },
    });
    if (!run) {
      throw new NotFoundException('Analysis run not found for organization');
    }
    return { vehicleId: run.vehicleId, tripId: run.tripId };
  }

  findById(organizationId: string, jobId: string) {
    return this.prisma.drivingIntelligenceJob.findFirst({
      where: { id: jobId, organizationId },
    });
  }

  findByIdempotencyKey(organizationId: string, idempotencyKey: string) {
    return this.prisma.drivingIntelligenceJob.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId,
          idempotencyKey,
        },
      },
    });
  }

  /**
   * Idempotent persist — existing idempotency key returns the stored row unchanged.
   */
  async persistOrGet(input: PersistDrivingIntelligenceJobInput) {
    const existing = await this.findByIdempotencyKey(input.organizationId, input.idempotencyKey);
    if (existing) {
      return { job: existing, created: false, deduplicated: true };
    }

    await this.assertVehicleInOrg(input.organizationId, input.vehicleId);

    if (input.tripId) {
      const trip = await this.assertTripInOrg(input.organizationId, input.tripId);
      if (trip.vehicleId !== input.vehicleId) {
        throw new BadRequestException('Trip vehicle mismatch for organization');
      }
    }

    if (input.bookingId) {
      const booking = await this.assertBookingInOrg(input.organizationId, input.bookingId);
      if (booking.vehicleId != null && booking.vehicleId !== input.vehicleId) {
        throw new BadRequestException('Booking vehicle mismatch for organization');
      }
    }

    const analysisRun = await this.assertAnalysisRunInOrg(input.organizationId, input.analysisRunId);
    if (analysisRun.vehicleId !== input.vehicleId) {
      throw new BadRequestException('Analysis run vehicle mismatch for organization');
    }
    if (input.tripId && analysisRun.tripId !== input.tripId) {
      throw new BadRequestException('Analysis run trip mismatch for organization');
    }

    try {
      const job = await this.prisma.drivingIntelligenceJob.create({
        data: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          tripId: input.tripId,
          bookingId: input.bookingId,
          analysisRunId: input.analysisRunId,
          jobType: input.jobType,
          modelVersion: input.modelVersion,
          idempotencyKey: input.idempotencyKey,
          correlationId: input.correlationId,
          requestedAt: input.requestedAt,
          status: 'PENDING',
          maxAttempts: DRIVING_INTELLIGENCE_JOB_DEFAULT_MAX_ATTEMPTS,
        },
      });
      return { job, created: true, deduplicated: false };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const raced = await this.findByIdempotencyKey(input.organizationId, input.idempotencyKey);
        if (raced) {
          return { job: raced, created: false, deduplicated: true };
        }
      }
      throw err;
    }
  }

  async markEnqueued(jobId: string, bullJobId: string) {
    return this.prisma.drivingIntelligenceJob.update({
      where: { id: jobId },
      data: { status: 'ENQUEUED', bullJobId },
    });
  }

  async markInProgress(jobId: string) {
    return this.prisma.drivingIntelligenceJob.update({
      where: { id: jobId },
      data: {
        status: 'IN_PROGRESS',
        lastAttemptAt: new Date(),
        attemptCount: { increment: 1 },
      },
    });
  }

  async markCompleted(jobId: string, completedAt = new Date()) {
    return this.prisma.drivingIntelligenceJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        completedAt,
        nextRetryAt: null,
        errorCode: null,
        errorMessage: null,
        deadLetteredAt: null,
      },
    });
  }

  async markRetryScheduled(
    jobId: string,
    attemptCount: number,
    errorCode: string,
    errorMessage?: string | null,
  ) {
    const retryAt = computeNextRetryAt(attemptCount);
    return this.prisma.drivingIntelligenceJob.update({
      where: { id: jobId },
      data: {
        status: 'PENDING',
        bullJobId: null,
        errorCode,
        errorMessage: errorMessage ?? null,
        nextRetryAt: retryAt,
      },
    });
  }

  async markDeadLetter(
    jobId: string,
    errorCode: string,
    errorMessage?: string | null,
    deadLetteredAt = new Date(),
  ) {
    return this.prisma.drivingIntelligenceJob.update({
      where: { id: jobId },
      data: {
        status: 'DEAD_LETTER',
        completedAt: deadLetteredAt,
        deadLetteredAt,
        nextRetryAt: null,
        errorCode,
        errorMessage: errorMessage ?? null,
      },
    });
  }

  async markFailed(jobId: string, errorCode: string, errorMessage?: string | null, completedAt = new Date()) {
    return this.prisma.drivingIntelligenceJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        completedAt,
        errorCode,
        errorMessage: errorMessage ?? null,
      },
    });
  }

  isTerminalStatus(status: string): boolean {
    return TERMINAL_STATUSES.has(status);
  }

  shouldSkipEnqueue(status: string): boolean {
    return (
      TERMINAL_STATUSES.has(status) ||
      status === 'ENQUEUED' ||
      status === 'IN_PROGRESS'
    );
  }

  findRetryablePending(limit: number, now = new Date()) {
    return this.prisma.drivingIntelligenceJob.findMany({
      where: {
        status: 'PENDING',
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      orderBy: { nextRetryAt: 'asc' },
      take: limit,
    });
  }

  findStuckInProgress(staleBefore: Date, limit: number) {
    return this.prisma.drivingIntelligenceJob.findMany({
      where: {
        status: 'IN_PROGRESS',
        lastAttemptAt: { lt: staleBefore },
      },
      orderBy: { lastAttemptAt: 'asc' },
      take: limit,
    });
  }

  /**
   * Validate contract + tenant scope + idempotent persist.
   */
  async prepareEnqueue(input: EnqueueDrivingIntelligenceJobInput) {
    const validation = validateEnqueueDrivingIntelligenceJobInput(input);
    if (!validation.ok) {
      throw new BadRequestException({
        message: 'Invalid driving intelligence job payload',
        issues: validation.issues,
      });
    }

    return this.persistOrGet({
      ...validation.normalized,
      jobType: validation.jobType!,
    });
  }
}
