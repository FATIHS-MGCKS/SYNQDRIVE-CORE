import type { ServiceComplianceEvaluation } from './service-compliance.types';

/** Canonical service/compliance cause + rental-blocking impact — single policy source. */
export interface ServiceComplianceRentalBlockingDecision {
  tuvOverdue: boolean;
  bokraftOverdue: boolean;
  /** HM/OEM service canonically overdue (CRITICAL), independent of other causes. */
  serviceOverdue: boolean;
  /**
   * Rental UX dedup: service blocking reason only when TÜV/BOKraft are not already blocking.
   * Must not suppress SERVICE_OVERDUE notification emission.
   */
  serviceOverdueBlocksRental: boolean;
}

/**
 * Rental-blocking predicate shared by RentalHealth, notification projection, and metadata.
 * Cause detection (`tuvOverdue`, `bokraftOverdue`, `serviceOverdue`) is separate from
 * `serviceOverdueBlocksRental` which deduplicates blocking_reasons display only.
 */
export function evaluateServiceComplianceRentalBlocking(
  evaluation: ServiceComplianceEvaluation,
): ServiceComplianceRentalBlockingDecision {
  const tuvOverdue = evaluation.tuvBokraft?.tuvOverdue ?? false;
  const bokraftOverdue = evaluation.tuvBokraft?.bokraftOverdue ?? false;
  const serviceOverdue = isHmServiceOverdue(evaluation);
  const serviceOverdueBlocksRental =
    serviceOverdue && !tuvOverdue && !bokraftOverdue;

  return {
    tuvOverdue,
    bokraftOverdue,
    serviceOverdue,
    serviceOverdueBlocksRental,
  };
}

/** True when HM/OEM next service is canonically overdue (CRITICAL), not merely due soon. */
export function isHmServiceOverdue(evaluation: ServiceComplianceEvaluation | null | undefined): boolean {
  if (!evaluation?.nextService) return false;
  return (
    evaluation.nextService.trackingStatus === 'TRACKED' &&
    evaluation.nextService.source === 'HM_OEM' &&
    evaluation.nextService.severity === 'CRITICAL'
  );
}
