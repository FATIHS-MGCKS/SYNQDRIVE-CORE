import type { MasterVsiSignalDetailDto } from './vsi-master-intelligence-api.types';
import type { MasterIntelligenceContextState } from './master-intelligence.types';
import {
  EMPTY_VSI_LEDGER_FILTERS,
  VSI_LEDGER_APPLICABILITY_VALUES,
  VSI_LEDGER_FRESHNESS_VALUES,
  VSI_LEDGER_OBSERVATION_VALUES,
  VSI_LEDGER_RPM_COMBINED_VALUES,
  VSI_TAB_VALUES,
  type VsiIntelligenceTab,
  type VsiLedgerFilterState,
} from './vsi-ledger-url.types';

const SIGNAL_KEY_RE = /^[a-z0-9_]{1,64}$/;

function parseCsvEnum(
  raw: string | null,
  allowed: readonly string[],
  paramKey: string,
  rejected: string[],
): string[] {
  if (raw == null || raw.trim() === '') return [];
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    if (allowed.includes(part)) out.push(part);
    else rejected.push(paramKey);
  }
  return [...new Set(out)];
}

function parseFlag(raw: string | null, paramKey: string, rejected: string[]): boolean {
  if (raw == null || raw === '') return false;
  if (raw === '1') return true;
  rejected.push(paramKey);
  return false;
}

export function parseVsiLedgerUrlFields(
  params: URLSearchParams,
  rejected: string[],
): Pick<
  MasterIntelligenceContextState,
  'vsiTab' | 'signalKey' | 'ledgerFilters'
> {
  const tabRaw = params.get('tab');
  let vsiTab: VsiIntelligenceTab = 'overview';
  if (tabRaw) {
    if (VSI_TAB_VALUES.includes(tabRaw as VsiIntelligenceTab)) {
      vsiTab = tabRaw as VsiIntelligenceTab;
    } else {
      rejected.push('tab');
    }
  }

  const signalRaw = params.get('signalKey');
  let signalKey: string | null = null;
  if (signalRaw) {
    const trimmed = signalRaw.trim();
    if (SIGNAL_KEY_RE.test(trimmed)) signalKey = trimmed;
    else rejected.push('signalKey');
  }

  const qRaw = params.get('q');
  let q: string | null = null;
  if (qRaw) {
    const trimmed = qRaw.trim();
    if (trimmed.length > 0 && trimmed.length <= 128) q = trimmed;
    else rejected.push('q');
  }

  const ledgerFilters: VsiLedgerFilterState = {
    q,
    appl: parseCsvEnum(params.get('appl'), VSI_LEDGER_APPLICABILITY_VALUES, 'appl', rejected),
    obs: parseCsvEnum(params.get('obs'), VSI_LEDGER_OBSERVATION_VALUES, 'obs', rejected),
    fresh: parseCsvEnum(params.get('fresh'), VSI_LEDGER_FRESHNESS_VALUES, 'fresh', rejected),
    rpm: parseCsvEnum(params.get('rpm'), VSI_LEDGER_RPM_COMBINED_VALUES, 'rpm', rejected),
    lim: parseFlag(params.get('lim'), 'lim', rejected),
    hf: parseFlag(params.get('hf'), 'hf', rejected),
    hideNA: parseFlag(params.get('hideNA'), 'hideNA', rejected),
  };

  if (signalKey && vsiTab === 'overview' && !tabRaw) {
    vsiTab = 'ledger';
  }

  return { vsiTab, signalKey, ledgerFilters };
}

export function appendVsiLedgerParams(params: URLSearchParams, context: MasterIntelligenceContextState): void {
  if (context.vsiTab && context.vsiTab !== 'overview') {
    params.set('tab', context.vsiTab);
  }
  if (context.signalKey) params.set('signalKey', context.signalKey);
  const f = context.ledgerFilters;
  if (f.q) params.set('q', f.q);
  if (f.appl.length) params.set('appl', f.appl.join(','));
  if (f.obs.length) params.set('obs', f.obs.join(','));
  if (f.fresh.length) params.set('fresh', f.fresh.join(','));
  if (f.rpm.length) params.set('rpm', f.rpm.join(','));
  if (f.lim) params.set('lim', '1');
  if (f.hf) params.set('hf', '1');
  if (f.hideNA) params.set('hideNA', '1');
}

export function ledgerContextForVehicleChange(
  patch: Partial<MasterIntelligenceContextState>,
): Partial<MasterIntelligenceContextState> {
  return {
    ...patch,
    vsiTab: 'overview',
    signalKey: null,
    ledgerFilters: { ...EMPTY_VSI_LEDGER_FILTERS },
  };
}

export function resolveApplicabilityValue(signal: MasterVsiSignalDetailDto): string {
  return signal.powertrainApplicability ?? (signal.empiricalObservation === 'NOT_APPLICABLE' ? 'NOT_APPLICABLE' : 'UNKNOWN');
}

export function pruneLedgerFiltersForSignals(
  filters: VsiLedgerFilterState,
  signals: MasterVsiSignalDetailDto[],
): VsiLedgerFilterState {
  const applPresent = new Set(signals.map((s) => resolveApplicabilityValue(s)));
  const obsPresent = new Set(signals.map((s) => s.empiricalObservation));
  const freshPresent = new Set(
    signals.map((s) => s.freshnessClassification ?? 'UNKNOWN'),
  );
  const rpmPresent = new Set<string>(
    signals
      .filter((s) => s.canonicalSignalKey === 'engine_rpm')
      .map((s) => s.rpmCombinedEvidenceAvailabilityV1 ?? 'NOT_PROVEN'),
  );

  return {
    ...filters,
    appl: filters.appl.filter((v) => applPresent.has(v)),
    obs: filters.obs.filter((v) => obsPresent.has(v)),
    fresh: filters.fresh.filter((v) => freshPresent.has(v)),
    rpm: filters.rpm.filter((v) => rpmPresent.has(v)),
  };
}
