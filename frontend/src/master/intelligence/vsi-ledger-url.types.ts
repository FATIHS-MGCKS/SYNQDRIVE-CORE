export type VsiIntelligenceTab = 'overview' | 'ledger' | 'revisions';

export type VsiLedgerFilterState = {
  q: string | null;
  appl: string[];
  obs: string[];
  fresh: string[];
  rpm: string[];
  lim: boolean;
  hf: boolean;
  hideNA: boolean;
};

export const EMPTY_VSI_LEDGER_FILTERS: VsiLedgerFilterState = {
  q: null,
  appl: [],
  obs: [],
  fresh: [],
  rpm: [],
  lim: false,
  hf: false,
  hideNA: false,
};

export const VSI_TAB_VALUES: readonly VsiIntelligenceTab[] = ['overview', 'ledger', 'revisions'];

export const VSI_LEDGER_APPLICABILITY_VALUES = ['APPLICABLE', 'NOT_APPLICABLE', 'UNKNOWN'] as const;
export const VSI_LEDGER_OBSERVATION_VALUES = [
  'NOT_APPLICABLE',
  'NEVER_OBSERVED',
  'OBSERVED',
  'OBSERVED_STALE',
  'NOT_OBSERVED_IN_WINDOW',
] as const;
export const VSI_LEDGER_FRESHNESS_VALUES = ['FRESH', 'STALE', 'UNKNOWN'] as const;
export const VSI_LEDGER_RPM_COMBINED_VALUES = [
  'PROVEN_LIVE',
  'PROVEN_HISTORICAL_ONLY',
  'NOT_PROVEN',
  'NOT_APPLICABLE',
] as const;
