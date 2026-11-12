import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import type { DrivingAnalysisRunStatus } from '@prisma/client';
import { ClickHouseAnalysisHealthService } from '@modules/clickhouse/clickhouse-analysis-health.service';
import { canProceedAnalysisStage } from '@modules/clickhouse/clickhouse-analysis-degradation';
import { DrivingAnalysisRunRepository } from '../driving-analysis-run/driving-analysis-run.repository';
import { DrivingIntelligenceJobDispatcherService } from '../driving-intelligence-jobs/driving-intelligence-jobs.dispatcher.service';
import {
  buildStageStatusMap,
  resolveReadyStageKeys,
} from './driving-analysis-stage.dependencies';
import {
  buildStageJobIdempotencyKey,
  jobTypeToStageKey,
  stageKeyToJobType,
} from './driving-analysis-stage.job-map';
import { DrivingAnalysisStageRepository } from './driving-analysis-stage.repository';
import { deriveRunAnalysisStatus } from './driving-analysis-stage.status-derivation';
import type {
  EnqueueReadyStagesInput,
  EnqueueReadyStagesResult,
  InitializeStagesForRunInput,
  InitializeStagesForRunResult,
} from './driving-analysis-stage.types';
import {
  TRIP_RENTAL_RECOMPUTE_PORT,
  type TripRentalRecomputePort,
} from '../trips/ports/trip-rental-recompute.port';

@Injectable()
export class DrivingAnalysisStageOrchestratorService {
  private readonly logger = new Logger(DrivingAnalysisStageOrchestratorService.name);

  constructor(
    private readonly stageRepository: DrivingAnalysisStageRepository,
    private readonly runRepository: DrivingAnalysisRunRepository,
    private readonly jobDispatcher: DrivingIntelligenceJobDispatcherService,
    @Optional() private readonly clickHouseHealth?: ClickHouseAnalysisHealthService,
    @Optional()
    @Inject(TRIP_RENTAL_RECOMPUTE_PORT)
    private readonly rentalRecompute?: TripRentalRecomputePort,
  ) {}

  initializeStagesForRun(
    input: InitializeStagesForRunInput,
  ): Promise<InitializeStagesForRunResult> {
    return this.stageRepository.initializeStagesForRun(input);
  }

  async enqueueReadyStages(
    input: EnqueueReadyStagesInput,
  ): Promise<EnqueueReadyStagesResult> {
    const stages = await this.stageRepository.findByRun(
      input.organizationId,
      input.analysisRunId,
    );
    const statusMap = buildStageStatusMap(stages);
    const readyStageKeys = resolveReadyStageKeys(statusMap);
    const analysisHealth = this.clickHouseHealth?.getAnalysisHealth();

    const enqueued: EnqueueReadyStagesResult['enqueued'] = [];

    for (const stageKey of readyStageKeys) {
      const stage = stages.find((s) => s.stageKey === stageKey);
      if (!stage || stage.status !== 'PENDING') continue;

      if (analysisHealth) {
        const gate = canProceedAnalysisStage(stageKey, analysisHealth);
        if (gate.degradation) {
          this.logger.warn(
            `Stage ${stageKey} proceeds with ClickHouse degradation ` +
              `(${gate.degradation.limitReason}) run=${input.analysisRunId}`,
          );
        }
      }

      const jobType = stageKeyToJobType(stageKey);
      const idempotencyKey = buildStageJobIdempotencyKey(
        input.tripId,
        input.modelVersion,
        stageKey,
        stage.inputFingerprint,
      );

      try {
        await this.stageRepository.markInProgress(
          input.organizationId,
          input.analysisRunId,
          stageKey,
        );

        const result = await this.jobDispatcher.enqueue({
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          tripId: input.tripId,
          bookingId: null,
          analysisRunId: input.analysisRunId,
          jobType,
          modelVersion: input.modelVersion,
          idempotencyKey,
          correlationId: input.correlationId,
          requestedAt: input.requestedAt,
        });

        let queueError: string | undefined;
        if (!result.enqueued && !result.deduplicated) {
          queueError = `Stage ${stageKey} job persisted as PENDING but not enqueued`;
        }

        enqueued.push({
          stageKey,
          jobType,
          jobId: result.job.id,
          created: result.created,
          enqueued: result.enqueued,
          deduplicated: result.deduplicated,
          queueError,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        enqueued.push({
          stageKey,
          jobType,
          jobId: 'unknown',
          created: false,
          enqueued: false,
          deduplicated: false,
          queueError: message,
        });
      }
    }

    if (enqueued.length > 0) {
      this.logger.log(
        `Enqueued ready stages run=${input.analysisRunId} ready=${readyStageKeys.join(',')} ` +
          `jobs=${enqueued.length}`,
      );
    }

    return { enqueued, readyStageKeys };
  }

  async onJobCompleted(
    organizationId: string,
    analysisRunId: string,
    jobType: Parameters<typeof jobTypeToStageKey>[0],
  ): Promise<void> {
    const stageKey = jobTypeToStageKey(jobType);
    if (!stageKey) return;

    // EVENT_CONTEXT stage advances only after all per-event context jobs finish
    // (see DrivingEventContextJobService.tryCompleteEventContextStage).
    if (jobType === 'DRIVING_EVENT_CONTEXT_ENRICH') {
      return;
    }

    await this.stageRepository.markCompleted(organizationId, analysisRunId, stageKey);
    await this.syncRunStatusFromStages(organizationId, analysisRunId);

    const run = await this.runRepository.findById(organizationId, analysisRunId);
    if (run?.status === 'COMPLETED' && run.tripId) {
      void this.rentalRecompute
        ?.notifyTripAnalysisCompleted({
          organizationId,
          vehicleId: run.vehicleId,
          tripId: run.tripId,
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Rental analysis recompute enqueue failed run=${analysisRunId}: ${message}`,
          );
        });
    }

    if (!run?.tripId) return;

    await this.enqueueReadyStages({
      organizationId,
      vehicleId: run.vehicleId,
      tripId: run.tripId,
      analysisRunId,
      modelVersion: run.modelVersion,
      correlationId: `stage-chain:${analysisRunId}`,
      requestedAt: new Date(),
    });
  }

  async onJobFailed(
    organizationId: string,
    analysisRunId: string,
    jobType: Parameters<typeof jobTypeToStageKey>[0],
    errorCode: string,
    errorMessage?: string | null,
  ): Promise<void> {
    const stageKey = jobTypeToStageKey(jobType);
    if (!stageKey) return;

    await this.stageRepository.markFailed(
      organizationId,
      analysisRunId,
      stageKey,
      errorCode,
      errorMessage,
    );
    await this.syncRunStatusFromStages(organizationId, analysisRunId);
  }

  async syncRunStatusFromStages(
    organizationId: string,
    analysisRunId: string,
  ): Promise<void> {
    const stages = await this.stageRepository.findByRun(organizationId, analysisRunId);
    const derived = deriveRunAnalysisStatus(stages);

    const runStatus = mapDerivedToRunStatus(derived.status);
    await this.runRepository.syncStatusFromStages(organizationId, analysisRunId, {
      status: runStatus,
      stageSummary: derived.stageSummary,
      failedStageCount: derived.failedStageCount,
    });
  }
}

function mapDerivedToRunStatus(
  derived: ReturnType<typeof deriveRunAnalysisStatus>['status'],
): DrivingAnalysisRunStatus {
  switch (derived) {
    case 'COMPLETED':
      return 'COMPLETED';
    case 'FAILED':
      return 'FAILED';
    case 'PENDING':
      return 'PENDING';
    default:
      return 'IN_PROGRESS';
  }
}
