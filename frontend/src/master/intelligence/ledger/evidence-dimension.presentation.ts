import type { EvidenceDimensionKind, EvidencePresentationTier } from './evidence-dimension.types';

const EMPHASIS_VALUES: Partial<Record<EvidenceDimensionKind, Set<string>>> = {
  observation: new Set(['OBSERVED']),
  freshness: new Set(['FRESH']),
  combinedRpm: new Set(['PROVEN_LIVE']),
};

const MUTED_VALUES: Partial<Record<EvidenceDimensionKind, Set<string>>> = {
  applicability: new Set(['NOT_APPLICABLE']),
  observation: new Set(['NOT_APPLICABLE']),
  combinedRpm: new Set(['NOT_APPLICABLE']),
};

const AMBER_VALUES: Partial<Record<EvidenceDimensionKind, Set<string>>> = {
  freshness: new Set(['STALE']),
  combinedRpm: new Set(['NOT_PROVEN']),
};

export function resolveEvidencePresentationTier(
  kind: EvidenceDimensionKind,
  value: string | null | undefined,
  opts?: { attributionLimited?: boolean },
): EvidencePresentationTier {
  if (opts?.attributionLimited && kind === 'combinedRpm') return 'amber';
  if (value == null || value === '') return 'neutral';
  const normalized = value.trim();
  if (MUTED_VALUES[kind]?.has(normalized)) return 'muted';
  if (AMBER_VALUES[kind]?.has(normalized)) return 'amber';
  if (EMPHASIS_VALUES[kind]?.has(normalized)) return 'emphasis';
  return 'neutral';
}

export function dimensionLabelKey(kind: EvidenceDimensionKind): string {
  return `master.intelligence.vsi.ledger.dimension.${kind}`;
}

export function dimensionValueKey(kind: EvidenceDimensionKind, value: string): string | null {
  switch (kind) {
    case 'applicability':
      if (value === 'APPLICABLE' || value === 'NOT_APPLICABLE' || value === 'UNKNOWN') {
        return `master.intelligence.vsi.ledger.applicability.${value}`;
      }
      return null;
    case 'declared':
      if (value === 'LISTED' || value === 'NOT_LISTED' || value === 'UNKNOWN') {
        return `master.intelligence.vsi.ledger.declared.${value}`;
      }
      return null;
    case 'observation':
      if (
        value === 'NOT_APPLICABLE' ||
        value === 'NEVER_OBSERVED' ||
        value === 'OBSERVED' ||
        value === 'OBSERVED_STALE' ||
        value === 'NOT_OBSERVED_IN_WINDOW'
      ) {
        return `master.intelligence.vsi.signals.empirical.${value}`;
      }
      return null;
    case 'freshness':
      if (value === 'FRESH' || value === 'STALE' || value === 'UNKNOWN') {
        return `master.intelligence.vsi.ledger.freshness.${value}`;
      }
      return null;
    case 'confidence':
      if (value === 'HIGH' || value === 'MEDIUM' || value === 'LOW' || value === 'UNKNOWN') {
        return `master.intelligence.confidence.${value}`;
      }
      return null;
    case 'combinedRpm':
      if (
        value === 'PROVEN_LIVE' ||
        value === 'PROVEN_HISTORICAL_ONLY' ||
        value === 'NOT_PROVEN' ||
        value === 'NOT_APPLICABLE'
      ) {
        return `master.intelligence.vsi.signals.rpmCombined.${value}`;
      }
      return null;
    case 'quality':
      return `master.intelligence.vsi.ledger.quality.${value}`;
    default:
      return null;
  }
}
