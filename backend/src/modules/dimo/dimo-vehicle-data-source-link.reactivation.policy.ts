import type { DimoLinkProvenance } from './dimo-vehicle-data-source-link.contract';

export type InactiveLinkReactivationAssessment =
  | { eligible: true; reason: 'explicit_reactivation_eligible' }
  | {
      eligible: false;
      reason:
        | 'backfill_reconciliation_never_reactivates'
        | 'intentional_deactivation'
        | 'deactivation_reason_recorded'
        | 'missing_positive_reactivation_evidence';
    };

export interface InactiveDimoLinkProvenanceRow {
  deactivatedAt: Date | null;
  metadata: unknown;
  /** Column value from audited deactivation — must align with metadata policy checks. */
  deactivationReason?: string | null;
}

function readMetadata(metadata: unknown): Record<string, unknown> {
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  return metadata as Record<string, unknown>;
}

/**
 * Conservative reactivation gate — inactive links are never resurrected unless
 * positive safe provenance exists. Backfill/reconciliation never reactivates.
 */
export function assessInactiveLinkReactivation(
  link: InactiveDimoLinkProvenanceRow,
  provenance: DimoLinkProvenance,
): InactiveLinkReactivationAssessment {
  if (provenance === 'backfill' || provenance === 'reconciliation') {
    return {
      eligible: false,
      reason: 'backfill_reconciliation_never_reactivates',
    };
  }

  const columnReason = link.deactivationReason?.trim() ?? '';
  if (columnReason) {
    return { eligible: false, reason: 'deactivation_reason_recorded' };
  }

  const metadata = readMetadata(link.metadata);
  if (metadata.intentionalDeactivation === true) {
    return { eligible: false, reason: 'intentional_deactivation' };
  }
  if (typeof metadata.deactivationReason === 'string' && metadata.deactivationReason.trim()) {
    return { eligible: false, reason: 'deactivation_reason_recorded' };
  }
  if (metadata.reactivationEligible === true) {
    return { eligible: true, reason: 'explicit_reactivation_eligible' };
  }

  return { eligible: false, reason: 'missing_positive_reactivation_evidence' };
}
