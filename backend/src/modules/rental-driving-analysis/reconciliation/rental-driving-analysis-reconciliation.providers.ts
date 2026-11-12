import { RENTAL_DRIVING_ANALYSIS_RECONCILIATION_PORT } from '@modules/vehicle-intelligence/driving-analysis-reconciliation/ports/rental-driving-analysis-reconciliation.port';
import { RentalDrivingAnalysisReconciliationPortAdapter } from './rental-driving-analysis-reconciliation.adapter';

export const rentalDrivingAnalysisReconciliationPortProviders = [
  RentalDrivingAnalysisReconciliationPortAdapter,
  {
    provide: RENTAL_DRIVING_ANALYSIS_RECONCILIATION_PORT,
    useExisting: RentalDrivingAnalysisReconciliationPortAdapter,
  },
];
