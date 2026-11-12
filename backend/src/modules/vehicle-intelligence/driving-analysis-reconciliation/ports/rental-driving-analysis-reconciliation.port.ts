/** Core-owned contract for rental driving-analysis reconciliation (no Rental Prisma types). */
export const RENTAL_DRIVING_ANALYSIS_RECONCILIATION_PORT = Symbol(
  'RENTAL_DRIVING_ANALYSIS_RECONCILIATION_PORT',
);

export const RENTAL_RECONCILIATION_CHECK_BOOKING_WITHOUT_ANALYSIS =
  'BOOKING_WITHOUT_RENTAL_ANALYSIS' as const;

export type RentalReconciliationBookingFinding = {
  checkType: typeof RENTAL_RECONCILIATION_CHECK_BOOKING_WITHOUT_ANALYSIS;
  organizationId: string;
  entityType: 'booking';
  entityId: string;
  detail?: string;
};

export type RentalReconciliationRemediationOutcome = 'enqueued' | 'skipped' | 'failed';

export interface RentalDrivingAnalysisReconciliationPort {
  scanBookingsWithoutRentalAnalysis(input: {
    organizationId: string;
    lookbackFrom: Date;
    limit: number;
  }): Promise<RentalReconciliationBookingFinding[]>;

  remediateBookingWithoutRentalAnalysis(input: {
    finding: RentalReconciliationBookingFinding;
    idempotencyKey: string;
  }): Promise<RentalReconciliationRemediationOutcome>;
}
