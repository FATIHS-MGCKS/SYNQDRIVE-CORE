import { TUV_BOKRAFT_WARNING_DAYS } from './service-compliance.config';
import type { NextServiceComplianceDto, TuvBokraftComplianceDto } from './service-compliance.types';

/** Display-only compliance chip for read-only UIs (Documents tab, dossiers). */
export interface ComplianceDisplayItem {
  label: string;
  status: 'good' | 'warning' | 'critical' | 'unknown' | 'not_applicable';
  uiStatus: 'verified' | 'expiring_soon' | 'expired' | 'missing';
  validTill: string | null;
  lastDate: string | null;
  source: 'service_compliance_service';
  detail: string;
}

/**
 * Maps canonical ServiceComplianceService DTO fields to UI display status.
 * Does NOT recompute overdue dates — only interprets evaluateCompliance() output.
 */
export function mapTuvBokraftToDisplayItem(
  tuv: TuvBokraftComplianceDto,
  kind: 'tuv' | 'bokraft',
): ComplianceDisplayItem {
  const overdue = kind === 'tuv' ? tuv.tuvOverdue : tuv.bokraftOverdue;
  const days = kind === 'tuv' ? tuv.tuvRemainingDays : tuv.bokraftRemainingDays;
  const validTill = kind === 'tuv' ? tuv.tuvValidTill : tuv.bokraftValidTill;
  const lastDate = kind === 'tuv' ? tuv.tuvLastDate : tuv.bokraftLastDate;

  let uiStatus: ComplianceDisplayItem['uiStatus'] = 'missing';
  let status: ComplianceDisplayItem['status'] = 'unknown';
  if (overdue) {
    uiStatus = 'expired';
    status = 'critical';
  } else if (days != null && days <= TUV_BOKRAFT_WARNING_DAYS) {
    uiStatus = 'expiring_soon';
    status = 'warning';
  } else if (validTill) {
    uiStatus = 'verified';
    status = 'good';
  }

  return {
    label: kind === 'tuv' ? 'TÜV / HU' : 'BOKraft',
    status,
    uiStatus,
    validTill,
    lastDate,
    source: 'service_compliance_service',
    detail:
      kind === 'tuv'
        ? overdue
          ? 'TÜV overdue (ServiceComplianceService)'
          : days != null
            ? `${days} days remaining`
            : 'No TÜV date on file'
        : overdue
          ? 'BOKraft overdue (ServiceComplianceService)'
          : days != null
            ? `${days} days remaining`
            : 'No BOKraft date on file',
  };
}

export function mapNextServiceToDisplayItem(next: NextServiceComplianceDto): ComplianceDisplayItem {
  let uiStatus: ComplianceDisplayItem['uiStatus'] = 'missing';
  let status: ComplianceDisplayItem['status'] = 'unknown';
  if (next.severity === 'CRITICAL') {
    uiStatus = 'expired';
    status = 'critical';
  } else if (next.severity === 'WARNING') {
    uiStatus = 'expiring_soon';
    status = 'warning';
  } else if (next.trackingStatus === 'TRACKED') {
    uiStatus = 'verified';
    status = 'good';
  }
  return {
    label: 'Next service',
    status,
    uiStatus,
    validTill: next.projectedDueDate ?? next.hmDerivedDueDate,
    lastDate: next.lastUpdatedAt,
    source: 'service_compliance_service',
    detail: next.message,
  };
}
