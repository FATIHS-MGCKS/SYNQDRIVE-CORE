/** Display-only evidence dimension kinds for the VSI Evidence Ledger foundation (P2-C). */

export type EvidenceDimensionKind =
  | 'applicability'
  | 'declared'
  | 'observation'
  | 'freshness'
  | 'quality'
  | 'confidence'
  | 'combinedRpm';

export type EvidencePresentationTier = 'emphasis' | 'neutral' | 'muted' | 'amber';

export type EvidenceSummaryItem = {
  kind: EvidenceDimensionKind;
  /** Raw enum / classifier value from the read DTO; null renders as missing (—). */
  value: string | null;
  /** Amber outline for combined RPM when attribution limitations are present. */
  attributionLimited?: boolean;
};
