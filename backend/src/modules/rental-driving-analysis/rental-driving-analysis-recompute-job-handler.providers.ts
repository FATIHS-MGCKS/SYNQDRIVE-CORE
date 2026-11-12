import { RENTAL_DRIVING_ANALYSIS_RECOMPUTE_JOB_HANDLER_PORT } from '@modules/vehicle-intelligence/driving-intelligence-jobs/ports/rental-driving-analysis-recompute-job-handler.port';
import { RentalDrivingAnalysisRecomputeJobHandler } from './rental-driving-analysis-recompute.handler';

/** Reuses the existing Rental handler instance — no duplicate registration. */
export const rentalDrivingAnalysisRecomputeJobHandlerPortProviders = [
  {
    provide: RENTAL_DRIVING_ANALYSIS_RECOMPUTE_JOB_HANDLER_PORT,
    useExisting: RentalDrivingAnalysisRecomputeJobHandler,
  },
] as const;
