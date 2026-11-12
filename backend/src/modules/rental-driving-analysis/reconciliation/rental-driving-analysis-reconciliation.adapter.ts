import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DrivingAnalysisInitService } from '@modules/vehicle-intelligence/driving-analysis-init/driving-analysis-init.service';
import { DRIVING_INTELLIGENCE_PIPELINE_MODEL_VERSION } from '@modules/vehicle-intelligence/driving-analysis-init/driving-analysis-init.types';
import { DrivingIntelligenceJobDispatcherService } from '@modules/vehicle-intelligence/driving-intelligence-jobs/driving-intelligence-jobs.dispatcher.service';
import {
  RENTAL_RECONCILIATION_CHECK_BOOKING_WITHOUT_ANALYSIS,
  type RentalDrivingAnalysisReconciliationPort,
  type RentalReconciliationBookingFinding,
  type RentalReconciliationRemediationOutcome,
} from '@modules/vehicle-intelligence/driving-analysis-reconciliation/ports/rental-driving-analysis-reconciliation.port';

@Injectable()
export class RentalDrivingAnalysisReconciliationPortAdapter
  implements RentalDrivingAnalysisReconciliationPort
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly analysisInit: DrivingAnalysisInitService,
    private readonly jobDispatcher: DrivingIntelligenceJobDispatcherService,
  ) {}

  async scanBookingsWithoutRentalAnalysis(input: {
    organizationId: string;
    lookbackFrom: Date;
    limit: number;
  }): Promise<RentalReconciliationBookingFinding[]> {
    const bookingsWithoutAnalysis = await this.prisma.booking.findMany({
      where: {
        organizationId: input.organizationId,
        status: BookingStatus.COMPLETED,
        endDate: { gte: input.lookbackFrom },
        rentalDrivingAnalyses: { none: { supersededAt: null } },
      },
      select: { id: true, vehicleId: true },
      take: input.limit,
    });

    return bookingsWithoutAnalysis.map((booking) => ({
      checkType: RENTAL_RECONCILIATION_CHECK_BOOKING_WITHOUT_ANALYSIS,
      organizationId: input.organizationId,
      entityType: 'booking' as const,
      entityId: booking.id,
      detail: `vehicle=${booking.vehicleId ?? 'none'}`,
    }));
  }

  async remediateBookingWithoutRentalAnalysis(input: {
    finding: RentalReconciliationBookingFinding;
    idempotencyKey: string;
  }): Promise<RentalReconciliationRemediationOutcome> {
    const { finding, idempotencyKey } = input;

    const booking = await this.prisma.booking.findFirst({
      where: { id: finding.entityId, organizationId: finding.organizationId },
      select: { vehicleId: true, status: true },
    });
    if (!booking?.vehicleId || booking.status !== BookingStatus.COMPLETED) {
      return 'skipped';
    }

    const anchorTrip = await this.prisma.vehicleTrip.findFirst({
      where: { assignedBookingId: finding.entityId, vehicleId: booking.vehicleId },
      select: { id: true },
      orderBy: { endTime: 'desc' },
    });
    if (!anchorTrip) {
      return 'skipped';
    }

    const run = await this.prisma.drivingAnalysisRun.findFirst({
      where: {
        organizationId: finding.organizationId,
        tripId: anchorTrip.id,
        analysisType: 'TRIP_ENRICHMENT',
      },
      orderBy: { startedAt: 'desc' },
    });
    if (!run) {
      const init = await this.analysisInit.initializeForCompletedTrip({
        organizationId: finding.organizationId,
        vehicleId: booking.vehicleId,
        tripId: anchorTrip.id,
        source: 'REPAIR_FINALIZE',
      });
      return init.jobs.some((j) => j.enqueued) ? 'enqueued' : 'skipped';
    }

    const dispatched = await this.jobDispatcher.enqueue({
      organizationId: finding.organizationId,
      vehicleId: booking.vehicleId,
      tripId: anchorTrip.id,
      bookingId: finding.entityId,
      analysisRunId: run.id,
      jobType: 'RENTAL_DRIVING_ANALYSIS_RECOMPUTE',
      modelVersion: DRIVING_INTELLIGENCE_PIPELINE_MODEL_VERSION,
      idempotencyKey,
      correlationId: `reconcile-booking:${finding.entityId}`,
      requestedAt: new Date(),
    });
    return dispatched.enqueued ? 'enqueued' : 'skipped';
  }
}
