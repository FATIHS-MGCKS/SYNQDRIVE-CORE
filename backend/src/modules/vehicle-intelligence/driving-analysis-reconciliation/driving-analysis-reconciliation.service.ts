import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma, TripStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ClickHouseAnalysisHealthService } from '@modules/clickhouse/clickhouse-analysis-health.service';
import { isClickHouseReachableForAnalysis } from '@modules/clickhouse/clickhouse-analysis-degradation';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { DrivingAnalysisInitService } from '../driving-analysis-init/driving-analysis-init.service';
import { DRIVING_INTELLIGENCE_PIPELINE_MODEL_VERSION } from '../driving-analysis-init/driving-analysis-init.types';
import { DrivingAnalysisStageOrchestratorService } from '../driving-analysis-stage/driving-analysis-stage.orchestrator.service';
import { DrivingAnalysisStageRepository } from '../driving-analysis-stage/driving-analysis-stage.repository';
import { DrivingIntelligenceJobDispatcherService } from '../driving-intelligence-jobs/driving-intelligence-jobs.dispatcher.service';
import { DrivingIntelligenceJobRepository } from '../driving-intelligence-jobs/driving-intelligence-jobs.repository';
import { DRIVING_INTELLIGENCE_JOB_ERROR_CODES } from '../driving-intelligence-jobs/driving-intelligence-jobs.errors';
import {
  DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES,
  DRIVING_ANALYSIS_RECONCILIATION_DEFAULTS,
  DRIVING_IMPACT_RECONCILE_DETAIL_MISSING_IMPACT,
  DRIVING_IMPACT_RECONCILE_DETAIL_STATUS_DESYNC,
  buildReconciliationIdempotencyKey,
  type DrivingAnalysisReconciliationFinding,
  type DrivingAnalysisReconciliationResult,
} from './driving-analysis-reconciliation.types';
import { parseAnalysisStagesJson } from '../trips/trip-analysis-status';
import {
  RENTAL_DRIVING_ANALYSIS_RECONCILIATION_PORT,
  type RentalDrivingAnalysisReconciliationPort,
} from './ports/rental-driving-analysis-reconciliation.port';

@Injectable()
export class DrivingAnalysisReconciliationService {
  private readonly logger = new Logger(DrivingAnalysisReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analysisInit: DrivingAnalysisInitService,
    private readonly jobDispatcher: DrivingIntelligenceJobDispatcherService,
    private readonly jobRepository: DrivingIntelligenceJobRepository,
    @Inject(RENTAL_DRIVING_ANALYSIS_RECONCILIATION_PORT)
    private readonly rentalReconciliation: RentalDrivingAnalysisReconciliationPort,
    @Optional() private readonly clickHouseHealth?: ClickHouseAnalysisHealthService,
    @Optional() private readonly stageRepository?: DrivingAnalysisStageRepository,
    @Optional() private readonly stageOrchestrator?: DrivingAnalysisStageOrchestratorService,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {}

  /**
   * Tenant-scoped, idempotent periodic reconciliation for driving analysis gaps.
   * Does not touch trip detection — only post-trip / analysis surfaces.
   */
  async runPeriodicReconciliation(
    options?: { maxActions?: number; organizationId?: string },
  ): Promise<DrivingAnalysisReconciliationResult> {
    const maxActions = options?.maxActions ?? DRIVING_ANALYSIS_RECONCILIATION_DEFAULTS.MAX_ACTIONS_PER_RUN;
    const findings: DrivingAnalysisReconciliationFinding[] = [];
    let actionsEnqueued = 0;
    let actionsSkipped = 0;
    let actionsFailed = 0;

    const orgs = options?.organizationId
      ? [{ id: options.organizationId }]
      : await this.prisma.organization.findMany({
          select: { id: true },
          take: 50,
        });

    const lookbackFrom = new Date(
      Date.now() - DRIVING_ANALYSIS_RECONCILIATION_DEFAULTS.LOOKBACK_DAYS * 86_400_000,
    );

    for (const org of orgs) {
      if (actionsEnqueued >= maxActions) break;

      const orgFindings = await this.scanOrganization(org.id, lookbackFrom);
      findings.push(...orgFindings);

      for (const finding of orgFindings) {
        if (actionsEnqueued >= maxActions) break;
        const action = await this.remediateFinding(finding);
        if (action === 'enqueued') actionsEnqueued += 1;
        else if (action === 'skipped') actionsSkipped += 1;
        else actionsFailed += 1;
      }
    }

    if (findings.length > 0) {
      this.logger.log(
        `Driving analysis reconciliation: orgs=${orgs.length} findings=${findings.length} ` +
          `enqueued=${actionsEnqueued} skipped=${actionsSkipped} failed=${actionsFailed}`,
      );
    }

    return {
      scannedOrgs: orgs.length,
      findings,
      actionsEnqueued,
      actionsSkipped,
      actionsFailed,
    };
  }

  private async scanOrganization(
    organizationId: string,
    lookbackFrom: Date,
  ): Promise<DrivingAnalysisReconciliationFinding[]> {
    const limit = DRIVING_ANALYSIS_RECONCILIATION_DEFAULTS.MAX_FINDINGS_PER_CHECK;
    const findings: DrivingAnalysisReconciliationFinding[] = [];

    const tripsWithoutRun = await this.prisma.vehicleTrip.findMany({
      where: {
        vehicle: { organizationId },
        tripStatus: TripStatus.COMPLETED,
        endTime: { gte: lookbackFrom },
        drivingAnalysisRuns: { none: { analysisType: 'TRIP_ENRICHMENT' } },
      },
      select: { id: true, vehicleId: true },
      take: limit,
    });
    for (const trip of tripsWithoutRun) {
      findings.push({
        checkType: DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES.TRIP_WITHOUT_ANALYSIS_RUN,
        organizationId,
        entityType: 'trip',
        entityId: trip.id,
      });
    }

    const stuckBefore = new Date(Date.now() - DRIVING_ANALYSIS_RECONCILIATION_DEFAULTS.STUCK_RUN_MS);
    const stuckRuns = await this.prisma.drivingAnalysisRun.findMany({
      where: {
        organizationId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        startedAt: { lt: stuckBefore },
      },
      select: { id: true, tripId: true },
      take: limit,
    });
    for (const run of stuckRuns) {
      findings.push({
        checkType: DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES.RUN_STUCK_STAGE,
        organizationId,
        entityType: 'analysis_run',
        entityId: run.id,
        detail: `trip=${run.tripId}`,
      });
    }

    const impactCandidates = await this.prisma.vehicleTrip.findMany({
      where: {
        vehicle: { organizationId },
        tripStatus: TripStatus.COMPLETED,
        endTime: { gte: lookbackFrom },
        behaviorEnrichmentStatus: 'COMPLETED',
        drivingImpactStatus: { in: ['PENDING', 'FAILED'] },
      },
      select: { id: true },
      take: limit,
    });
    if (impactCandidates.length > 0) {
      const existingImpact = await this.prisma.tripDrivingImpact.findMany({
        where: { tripId: { in: impactCandidates.map((t) => t.id) } },
        select: { tripId: true },
      });
      const impactTripIds = new Set(existingImpact.map((row) => row.tripId));
      for (const trip of impactCandidates) {
        findings.push({
          checkType: DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES.DRIVING_IMPACT_STATUS_MISMATCH,
          organizationId,
          entityType: 'trip',
          entityId: trip.id,
          detail: impactTripIds.has(trip.id)
            ? DRIVING_IMPACT_RECONCILE_DETAIL_STATUS_DESYNC
            : DRIVING_IMPACT_RECONCILE_DETAIL_MISSING_IMPACT,
        });
      }
    }

    const nativeEvents = await this.prisma.drivingEvent.findMany({
      where: {
        vehicle: { organizationId },
        source: 'TELEMETRY_EVENTS',
        recordedAt: { gte: lookbackFrom },
        tripId: { not: null },
      },
      select: { id: true, tripId: true, metadataJson: true },
      take: limit * 3,
    });
    const nativeTripsSeen = new Set<string>();
    for (const event of nativeEvents) {
      if (!event.tripId || nativeTripsSeen.has(event.tripId)) continue;
      const meta = event.metadataJson as Record<string, unknown> | null;
      const context = meta?.contextAssessment ?? meta?.contextAssessmentJson;
      const hasContext =
        context != null && typeof context === 'object' && Object.keys(context as object).length > 0;
      if (hasContext) continue;
      nativeTripsSeen.add(event.tripId);
      findings.push({
        checkType: DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES.NATIVE_EVENT_WITHOUT_CONTEXT,
        organizationId,
        entityType: 'trip',
        entityId: event.tripId,
        detail: `event=${event.id}`,
      });
      if (nativeTripsSeen.size >= limit) break;
    }

    const misusePending = await this.prisma.vehicleTrip.findMany({
      where: {
        vehicle: { organizationId },
        tripStatus: TripStatus.COMPLETED,
        endTime: { gte: lookbackFrom },
        behaviorEnrichmentStatus: 'COMPLETED',
        OR: [
          { tripAnalysisStatus: 'PARTIAL' },
          { analysisStagesJson: { path: ['misuse'], equals: 'pending' } },
        ],
      },
      select: { id: true },
      take: limit,
    });
    for (const trip of misusePending) {
      findings.push({
        checkType: DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES.MISUSE_WITHOUT_RECONCILIATION,
        organizationId,
        entityType: 'trip',
        entityId: trip.id,
      });
    }

    const rentalBookingFindings =
      await this.rentalReconciliation.scanBookingsWithoutRentalAnalysis({
        organizationId,
        lookbackFrom,
        limit,
      });
    findings.push(...rentalBookingFindings);

    const healthJobs = await this.prisma.drivingIntelligenceJob.findMany({
      where: {
        organizationId,
        jobType: 'DRIVING_HEALTH_IMPACT_PUBLISH',
        status: { in: ['PENDING', 'ENQUEUED', 'IN_PROGRESS', 'FAILED'] },
        tripId: { not: null },
      },
      select: { id: true, tripId: true },
      take: limit,
    });
    if (healthJobs.length > 0) {
      const tripIds = healthJobs.map((j) => j.tripId!).filter(Boolean);
      const trips = await this.prisma.vehicleTrip.findMany({
        where: { id: { in: tripIds } },
        select: { id: true, drivingImpactStatus: true },
      });
      const impactRows = await this.prisma.tripDrivingImpact.findMany({
        where: { tripId: { in: tripIds } },
        select: { tripId: true },
      });
      const impactTripIds = new Set(impactRows.map((r) => r.tripId));
      const tripById = new Map(trips.map((t) => [t.id, t]));
      for (const job of healthJobs) {
        if (!job.tripId) continue;
        const trip = tripById.get(job.tripId);
        const qualified =
          trip?.drivingImpactStatus === 'READY' && impactTripIds.has(job.tripId);
        if (qualified) continue;
        findings.push({
          checkType:
            DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES.HEALTH_IMPACT_WITHOUT_QUALIFIED_INPUT,
          organizationId,
          entityType: 'trip',
          entityId: job.tripId,
          detail: `job=${job.id}`,
        });
      }
    }

    const retryableJobs = await this.jobRepository.findRetryablePending(limit);
    for (const job of retryableJobs.filter((j) => j.organizationId === organizationId)) {
      findings.push({
        checkType: DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES.PENDING_JOB_RETRY,
        organizationId,
        entityType: 'driving_intelligence_job',
        entityId: job.id,
        detail: job.jobType,
      });
    }

    const stuckJobs = await this.jobRepository.findStuckInProgress(
      new Date(Date.now() - DRIVING_ANALYSIS_RECONCILIATION_DEFAULTS.STUCK_JOB_MS),
      limit,
    );
    for (const job of stuckJobs.filter((j) => j.organizationId === organizationId)) {
      findings.push({
        checkType: DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES.RUN_STUCK_STAGE,
        organizationId,
        entityType: 'driving_intelligence_job',
        entityId: job.id,
        detail: `stuck_in_progress jobType=${job.jobType}`,
      });
    }

    const chHealth = this.clickHouseHealth?.getAnalysisHealth();
    if (
      chHealth &&
      isClickHouseReachableForAnalysis(chHealth) &&
      this.stageRepository
    ) {
      const chFailedStages = await this.stageRepository.findFailedClickHouseStages(
        organizationId,
        lookbackFrom,
        limit,
      );
      for (const stage of chFailedStages) {
        findings.push({
          checkType:
            DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES.CLICKHOUSE_HF_ANALYSIS_RETRY,
          organizationId,
          entityType: 'driving_analysis_stage',
          entityId: stage.id,
          detail: `run=${stage.analysisRunId} stage=${stage.stageKey} trip=${stage.analysisRun.tripId}`,
        });
      }
    }

    return findings;
  }

  private async remediateFinding(
    finding: DrivingAnalysisReconciliationFinding,
  ): Promise<'enqueued' | 'skipped' | 'failed'> {
    const idempotencyKey = buildReconciliationIdempotencyKey(
      finding.checkType,
      finding.entityId,
    );

    try {
      switch (finding.checkType) {
        case DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES.TRIP_WITHOUT_ANALYSIS_RUN: {
          const trip = await this.prisma.vehicleTrip.findFirst({
            where: { id: finding.entityId, vehicle: { organizationId: finding.organizationId } },
            select: { vehicleId: true, tripStatus: true },
          });
          if (!trip || trip.tripStatus !== TripStatus.COMPLETED) {
            this.recordReconciliation(finding.checkType, 'skipped');
            return 'skipped';
          }
          const result = await this.analysisInit.initializeForCompletedTrip({
            organizationId: finding.organizationId,
            vehicleId: trip.vehicleId,
            tripId: finding.entityId,
            source: 'REPAIR_FINALIZE',
          });
          const outcome = result.runDeduplicated && result.jobs.every((j) => !j.enqueued)
            ? 'skipped'
            : 'enqueued';
          this.recordReconciliation(finding.checkType, outcome);
          return outcome;
        }

        case DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES.PENDING_JOB_RETRY: {
          const job = await this.jobRepository.findById(finding.organizationId, finding.entityId);
          if (!job || job.status !== 'PENDING') {
            this.recordReconciliation(finding.checkType, 'skipped');
            return 'skipped';
          }
          const dispatched = await this.jobDispatcher.enqueue({
            organizationId: job.organizationId,
            vehicleId: job.vehicleId,
            tripId: job.tripId,
            bookingId: job.bookingId,
            analysisRunId: job.analysisRunId,
            jobType: job.jobType,
            modelVersion: job.modelVersion,
            idempotencyKey: job.idempotencyKey,
            correlationId: job.correlationId,
            requestedAt: job.requestedAt,
          });
          const outcome = dispatched.enqueued ? 'enqueued' : 'skipped';
          this.recordReconciliation(finding.checkType, outcome);
          return outcome;
        }

        case DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES.RUN_STUCK_STAGE: {
          if (finding.entityType === 'analysis_run') {
            await this.prisma.drivingAnalysisRun.updateMany({
              where: {
                id: finding.entityId,
                organizationId: finding.organizationId,
                status: { in: ['PENDING', 'IN_PROGRESS'] },
              },
              data: {
                status: 'FAILED',
                errorCode: DRIVING_INTELLIGENCE_JOB_ERROR_CODES.STALE_IN_PROGRESS,
                errorMessage: 'Reconciliation marked stuck analysis run',
                completedAt: new Date(),
              },
            });
          } else {
            await this.jobRepository.markRetryScheduled(
              finding.entityId,
              1,
              DRIVING_INTELLIGENCE_JOB_ERROR_CODES.STALE_IN_PROGRESS,
              'Reconciliation reset stuck in-progress job',
            );
          }
          this.recordReconciliation(finding.checkType, 'enqueued');
          return 'enqueued';
        }

        case DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES.CLICKHOUSE_HF_ANALYSIS_RETRY: {
          if (!this.stageRepository || !this.stageOrchestrator || !this.clickHouseHealth) {
            this.recordReconciliation(finding.checkType, 'skipped');
            return 'skipped';
          }
          const health = this.clickHouseHealth.getAnalysisHealth();
          if (!isClickHouseReachableForAnalysis(health)) {
            this.recordReconciliation(finding.checkType, 'skipped');
            return 'skipped';
          }

          const stage = await this.prisma.drivingAnalysisStage.findFirst({
            where: { id: finding.entityId, organizationId: finding.organizationId },
            include: {
              analysisRun: { select: { tripId: true, vehicleId: true, modelVersion: true } },
            },
          });
          if (!stage?.analysisRun.tripId) {
            this.recordReconciliation(finding.checkType, 'skipped');
            return 'skipped';
          }

          await this.stageRepository.resetStageToPending(stage.id);
          const enqueueResult = await this.stageOrchestrator.enqueueReadyStages({
            organizationId: finding.organizationId,
            vehicleId: stage.analysisRun.vehicleId,
            tripId: stage.analysisRun.tripId,
            analysisRunId: stage.analysisRunId,
            modelVersion: stage.analysisRun.modelVersion,
            correlationId: `reconcile-ch:${stage.analysisRunId}`,
            requestedAt: new Date(),
          });
          const outcome = enqueueResult.enqueued.some((j) => j.enqueued) ? 'enqueued' : 'skipped';
          this.recordReconciliation(finding.checkType, outcome);
          return outcome;
        }

        case DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES.DRIVING_IMPACT_STATUS_MISMATCH: {
          if (finding.detail === DRIVING_IMPACT_RECONCILE_DETAIL_STATUS_DESYNC) {
            const synced = await this.syncDrivingImpactStatusFromExistingRow(finding.entityId);
            const outcome = synced ? 'enqueued' : 'skipped';
            this.recordReconciliation(finding.checkType, outcome);
            return outcome;
          }
          return this.remediateTripAnalysisJobFinding(
            finding,
            'DRIVING_IMPACT_COMPUTE',
            idempotencyKey,
          );
        }

        case DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES.NATIVE_EVENT_WITHOUT_CONTEXT:
        case DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES.MISUSE_WITHOUT_RECONCILIATION: {
          const jobType =
            finding.checkType === DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES.NATIVE_EVENT_WITHOUT_CONTEXT
              ? 'DRIVING_EVENT_CONTEXT_ENRICH'
              : 'DRIVING_MISUSE_RECONCILE';
          return this.remediateTripAnalysisJobFinding(finding, jobType, idempotencyKey);
        }

        case DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES.BOOKING_WITHOUT_RENTAL_ANALYSIS: {
          const outcome = await this.rentalReconciliation.remediateBookingWithoutRentalAnalysis({
            finding: {
              checkType: DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES.BOOKING_WITHOUT_RENTAL_ANALYSIS,
              organizationId: finding.organizationId,
              entityType: 'booking',
              entityId: finding.entityId,
              detail: finding.detail,
            },
            idempotencyKey,
          });
          this.recordReconciliation(finding.checkType, outcome);
          return outcome;
        }

        case DRIVING_ANALYSIS_RECONCILIATION_CHECK_TYPES.HEALTH_IMPACT_WITHOUT_QUALIFIED_INPUT: {
          this.recordReconciliation(finding.checkType, 'skipped');
          return 'skipped';
        }

        default: {
          break;
        }
      }
    } catch (err) {
      this.logger.warn(
        `Reconciliation remediation failed: ${finding.checkType} ${finding.entityId} ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      this.recordReconciliation(finding.checkType, 'failed');
      return 'failed';
    }

    this.recordReconciliation(finding.checkType, 'skipped');
    return 'skipped';
  }

  /**
   * Impact row exists but trip readiness flag was never advanced — sync without recompute.
   */
  private async syncDrivingImpactStatusFromExistingRow(tripId: string): Promise<boolean> {
    const [trip, impact] = await Promise.all([
      this.prisma.vehicleTrip.findUnique({
        where: { id: tripId },
        select: { id: true, analysisStagesJson: true },
      }),
      this.prisma.tripDrivingImpact.findUnique({
        where: { tripId },
        select: { tripId: true },
      }),
    ]);
    if (!trip || !impact) return false;

    const stages = parseAnalysisStagesJson(trip.analysisStagesJson);
    stages.drivingImpact = 'done';

    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: {
        drivingImpactStatus: 'READY',
        drivingImpactComputedAt: new Date(),
        analysisStagesJson: stages as Prisma.InputJsonValue,
      },
    });
    return true;
  }

  private async remediateTripAnalysisJobFinding(
    finding: DrivingAnalysisReconciliationFinding,
    jobType:
      | 'DRIVING_IMPACT_COMPUTE'
      | 'DRIVING_EVENT_CONTEXT_ENRICH'
      | 'DRIVING_MISUSE_RECONCILE',
    idempotencyKey: string,
  ): Promise<'enqueued' | 'skipped' | 'failed'> {
    const trip = await this.prisma.vehicleTrip.findFirst({
      where: { id: finding.entityId, vehicle: { organizationId: finding.organizationId } },
      select: { vehicleId: true },
    });
    if (!trip) {
      this.recordReconciliation(finding.checkType, 'skipped');
      return 'skipped';
    }

    const run = await this.prisma.drivingAnalysisRun.findFirst({
      where: {
        organizationId: finding.organizationId,
        tripId: finding.entityId,
        analysisType: 'TRIP_ENRICHMENT',
        modelVersion: DRIVING_INTELLIGENCE_PIPELINE_MODEL_VERSION,
      },
      orderBy: { startedAt: 'desc' },
    });
    if (!run) {
      const init = await this.analysisInit.initializeForCompletedTrip({
        organizationId: finding.organizationId,
        vehicleId: trip.vehicleId,
        tripId: finding.entityId,
        source: 'REPAIR_FINALIZE',
      });
      const outcome = init.jobs.some((j) => j.enqueued) ? 'enqueued' : 'skipped';
      this.recordReconciliation(finding.checkType, outcome);
      return outcome;
    }

    const dispatched = await this.jobDispatcher.enqueue({
      organizationId: finding.organizationId,
      vehicleId: trip.vehicleId,
      tripId: finding.entityId,
      analysisRunId: run.id,
      jobType,
      modelVersion: DRIVING_INTELLIGENCE_PIPELINE_MODEL_VERSION,
      idempotencyKey,
      correlationId: `reconcile:${finding.entityId}`,
      requestedAt: new Date(),
    });
    const outcome = dispatched.enqueued ? 'enqueued' : 'skipped';
    this.recordReconciliation(finding.checkType, outcome);
    return outcome;
  }

  private recordReconciliation(
    checkType: string,
    result: 'enqueued' | 'skipped' | 'failed',
  ): void {
    this.tripMetrics?.drivingAnalysisReconciliationActions.inc({
      check_type: checkType,
      result,
    });
  }
}
