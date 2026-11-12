import { Injectable, Logger, OnModuleInit, Optional, Inject } from '@nestjs/common';
import type { DrivingIntelligenceJob, DrivingIntelligenceJobType } from '@prisma/client';
import { DrivingEventContextEnrichJobHandler } from '../event-context/driving-event-context-enrich.handler';
import { DimoTripSegmentValidateJobHandler } from '../dimo-trip-segment-validation/dimo-trip-segment-validation.handler';
import { DrivingMisuseReconcileJobHandler } from '../misuse-cases/misuse-case-reconcile/driving-misuse-reconcile.handler';
import { DrivingAttributionResolveJobHandler } from '../driver-attribution/driving-attribution-resolve.handler';
import { DrivingNativeEventsIngestJobHandler } from './handlers/driving-native-events-ingest.handler';
import {
  RENTAL_DRIVING_ANALYSIS_RECOMPUTE_JOB_HANDLER_PORT,
  type RentalDrivingAnalysisRecomputeJobHandlerPort,
} from './ports/rental-driving-analysis-recompute-job-handler.port';
import { DrivingRouteEnrichJobHandler } from './handlers/driving-route-enrich.handler';
import { DrivingImpactComputeJobHandler } from './handlers/driving-impact-compute.handler';
import { DrivingAssessabilityComputeJobHandler } from './handlers/driving-assessability-compute.handler';
import { DrivingDecisionSummaryComputeJobHandler } from './handlers/driving-decision-summary-compute.handler';
import { DrivingHealthImpactPublishJobHandler } from './handlers/driving-health-impact-publish.handler';
import { DRIVING_INTELLIGENCE_JOB_TYPES } from './driving-intelligence-jobs.types';

export type DrivingIntelligenceJobHandler = (
  job: DrivingIntelligenceJob,
) => Promise<void>;

@Injectable()
export class DrivingIntelligenceJobHandlerRegistry implements OnModuleInit {
  private readonly logger = new Logger(DrivingIntelligenceJobHandlerRegistry.name);
  private readonly handlers = new Map<DrivingIntelligenceJobType, DrivingIntelligenceJobHandler>();

  constructor(
    @Optional() private readonly eventContextHandler?: DrivingEventContextEnrichJobHandler,
    @Optional() private readonly segmentValidateHandler?: DimoTripSegmentValidateJobHandler,
    @Optional() private readonly misuseReconcileHandler?: DrivingMisuseReconcileJobHandler,
    @Optional() private readonly attributionResolveHandler?: DrivingAttributionResolveJobHandler,
    @Optional()
    @Inject(RENTAL_DRIVING_ANALYSIS_RECOMPUTE_JOB_HANDLER_PORT)
    private readonly rentalRecomputeHandler?: RentalDrivingAnalysisRecomputeJobHandlerPort,
    @Optional() private readonly nativeEventsHandler?: DrivingNativeEventsIngestJobHandler,
    @Optional() private readonly routeEnrichHandler?: DrivingRouteEnrichJobHandler,
    @Optional() private readonly impactComputeHandler?: DrivingImpactComputeJobHandler,
    @Optional() private readonly assessabilityComputeHandler?: DrivingAssessabilityComputeJobHandler,
    @Optional() private readonly decisionSummaryHandler?: DrivingDecisionSummaryComputeJobHandler,
    @Optional() private readonly healthImpactPublishHandler?: DrivingHealthImpactPublishJobHandler,
  ) {}

  onModuleInit(): void {
    for (const jobType of DRIVING_INTELLIGENCE_JOB_TYPES) {
      if (jobType === 'RENTAL_DRIVING_ANALYSIS_RECOMPUTE') {
        if (this.rentalRecomputeHandler) {
          this.handlers.set(jobType, (job) => this.rentalRecomputeHandler!.handle(job));
        } else {
          this.handlers.set(jobType, async (job) => {
            throw new Error(
              `RENTAL_DRIVING_ANALYSIS_RECOMPUTE handler not configured (persistentJobId=${job.id})`,
            );
          });
        }
        continue;
      }
      this.handlers.set(jobType, async (job) => {
        this.logger.debug(
          `Stub handler for ${jobType}: persistentJobId=${job.id} analysisRunId=${job.analysisRunId}`,
        );
      });
    }

    if (this.eventContextHandler) {
      this.handlers.set('DRIVING_EVENT_CONTEXT_ENRICH', (job) =>
        this.eventContextHandler!.handle(job),
      );
    }

    if (this.segmentValidateHandler) {
      this.handlers.set('DIMO_TRIP_SEGMENT_VALIDATE', (job) =>
        this.segmentValidateHandler!.handle(job),
      );
    }

    if (this.misuseReconcileHandler) {
      this.handlers.set('DRIVING_MISUSE_RECONCILE', (job) =>
        this.misuseReconcileHandler!.handle(job),
      );
    }

    if (this.attributionResolveHandler) {
      this.handlers.set('DRIVING_ATTRIBUTION_RESOLVE', (job) =>
        this.attributionResolveHandler!.handle(job),
      );
    }

    if (this.nativeEventsHandler) {
      this.handlers.set('DRIVING_NATIVE_EVENTS_INGEST', (job) =>
        this.nativeEventsHandler!.handle(job),
      );
    }

    if (this.routeEnrichHandler) {
      this.handlers.set('DRIVING_ROUTE_ENRICH', (job) => this.routeEnrichHandler!.handle(job));
    }

    if (this.impactComputeHandler) {
      this.handlers.set('DRIVING_IMPACT_COMPUTE', (job) => this.impactComputeHandler!.handle(job));
    }

    if (this.assessabilityComputeHandler) {
      this.handlers.set('DRIVING_ASSESSABILITY_COMPUTE', (job) =>
        this.assessabilityComputeHandler!.handle(job),
      );
    }

    if (this.decisionSummaryHandler) {
      this.handlers.set('DRIVING_DECISION_SUMMARY_COMPUTE', (job) =>
        this.decisionSummaryHandler!.handle(job),
      );
    }

    if (this.healthImpactPublishHandler) {
      this.handlers.set('DRIVING_HEALTH_IMPACT_PUBLISH', (job) =>
        this.healthImpactPublishHandler!.handle(job),
      );
    }
  }

  listRegisteredJobTypes(): DrivingIntelligenceJobType[] {
    return [...this.handlers.keys()];
  }

  async dispatch(job: DrivingIntelligenceJob): Promise<void> {
    const handler = this.handlers.get(job.jobType);
    if (!handler) {
      throw new Error(`No handler registered for job type ${job.jobType}`);
    }
    await handler(job);
  }
}
