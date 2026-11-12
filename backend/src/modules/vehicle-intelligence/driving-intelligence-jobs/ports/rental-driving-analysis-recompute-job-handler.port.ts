import type { DrivingIntelligenceJob } from '@prisma/client';

export const RENTAL_DRIVING_ANALYSIS_RECOMPUTE_JOB_HANDLER_PORT = Symbol(
  'RENTAL_DRIVING_ANALYSIS_RECOMPUTE_JOB_HANDLER_PORT',
);

export interface RentalDrivingAnalysisRecomputeJobHandlerPort {
  handle(job: DrivingIntelligenceJob): Promise<void>;
}
