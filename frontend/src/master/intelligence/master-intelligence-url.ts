import type { MasterView } from '../navigation/master-nav.types';
import type {
  MasterIntelligenceContextState,
  MasterIntelligenceCrossLinkTarget,
  MasterIntelligenceView,
} from './master-intelligence.types';
import { EMPTY_MASTER_INTELLIGENCE_CONTEXT } from './master-intelligence.types';
import { appendVsiLedgerParams, parseVsiLedgerUrlFields } from './vsi-ledger-url.util';
import {
  buildMasterIntelligenceSearchContext,
  sanitizeMasterIntelligenceContextForTarget,
  type CrossLinkHygieneOptions,
} from './master-intelligence-context-hygiene.util';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const INTELLIGENCE_VIEWS = new Set<MasterIntelligenceView>(['vsi-intelligence', 'apds-intelligence']);

export const MASTER_INTELLIGENCE_QUERY_KEYS = [
  'orgId',
  'vehicleId',
  'providerSourceLinkId',
  'physicalDeviceId',
  'apdOpportunityId',
  'policyVersion',
  'apdEpochId',
  'asOf',
] as const;

function sanitizeUuid(value: string | null, rejected: string[], key: string): string | null {
  if (value == null || value === '') return null;
  const trimmed = value.trim();
  if (!UUID_RE.test(trimmed)) {
    rejected.push(key);
    return null;
  }
  return trimmed;
}

function sanitizeText(value: string | null, rejected: string[], key: string, maxLen = 128): string | null {
  if (value == null || value === '') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLen) {
    rejected.push(key);
    return null;
  }
  return trimmed;
}

function sanitizeIso(value: string | null, rejected: string[], key: string): string | null {
  if (value == null || value === '') return null;
  const trimmed = value.trim();
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) {
    rejected.push(key);
    return null;
  }
  return trimmed;
}

export function parseMasterIntelligenceContext(search: string): MasterIntelligenceContextState {
  const params = new URLSearchParams(search);
  const rejected: string[] = [];

  const ledger = parseVsiLedgerUrlFields(params, rejected);

  return {
    orgId: sanitizeUuid(params.get('orgId'), rejected, 'orgId'),
    vehicleId: sanitizeUuid(params.get('vehicleId'), rejected, 'vehicleId'),
    providerSourceLinkId: sanitizeUuid(params.get('providerSourceLinkId'), rejected, 'providerSourceLinkId'),
    physicalDeviceId: sanitizeUuid(params.get('physicalDeviceId'), rejected, 'physicalDeviceId'),
    apdOpportunityId: sanitizeText(params.get('apdOpportunityId'), rejected, 'apdOpportunityId', 256),
    policyVersion: sanitizeText(params.get('policyVersion'), rejected, 'policyVersion', 64),
    apdEpochId: sanitizeUuid(params.get('apdEpochId'), rejected, 'apdEpochId'),
    asOf: sanitizeIso(params.get('asOf'), rejected, 'asOf'),
    vsiTab: ledger.vsiTab,
    signalKey: ledger.signalKey,
    ledgerFilters: ledger.ledgerFilters,
    rejectedParams: rejected,
  };
}

export function buildMasterIntelligenceSearch(
  view: MasterView,
  context: MasterIntelligenceContextState,
): string {
  const params = new URLSearchParams();
  params.set('view', view);

  const scoped =
    view === 'vsi-intelligence' || view === 'apds-intelligence'
      ? buildMasterIntelligenceSearchContext(view, context)
      : context;

  if (scoped.orgId) params.set('orgId', scoped.orgId);
  if (scoped.vehicleId) params.set('vehicleId', scoped.vehicleId);
  if (scoped.providerSourceLinkId) params.set('providerSourceLinkId', scoped.providerSourceLinkId);
  if (scoped.physicalDeviceId) params.set('physicalDeviceId', scoped.physicalDeviceId);
  if (scoped.apdOpportunityId) params.set('apdOpportunityId', scoped.apdOpportunityId);
  if (scoped.policyVersion) params.set('policyVersion', scoped.policyVersion);
  if (scoped.apdEpochId) params.set('apdEpochId', scoped.apdEpochId);
  if (scoped.asOf) params.set('asOf', scoped.asOf);

  if (view === 'vsi-intelligence') {
    appendVsiLedgerParams(params, scoped);
  }

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function mergeMasterIntelligenceContext(
  base: MasterIntelligenceContextState,
  patch: Partial<MasterIntelligenceContextState>,
): MasterIntelligenceContextState {
  return {
    ...base,
    ...patch,
    ledgerFilters: patch.ledgerFilters
      ? { ...base.ledgerFilters, ...patch.ledgerFilters }
      : base.ledgerFilters,
    rejectedParams: patch.rejectedParams ?? base.rejectedParams,
  };
}

function notifyMasterUrlChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function pushMasterIntelligenceUrl(
  view: MasterView,
  context: MasterIntelligenceContextState,
  opts?: { replace?: boolean },
) {
  if (typeof window === 'undefined') return;
  const next = `${window.location.pathname}${buildMasterIntelligenceSearch(view, context)}`;
  if (opts?.replace) window.history.replaceState(null, '', next);
  else window.history.pushState(null, '', next);
  notifyMasterUrlChange();
}

export function navigateMasterIntelligenceCrossLink(
  target: MasterIntelligenceCrossLinkTarget,
  context: MasterIntelligenceContextState,
  opts?: { replace?: boolean; hygiene?: CrossLinkHygieneOptions },
) {
  if (target === 'vehicles') {
    const sanitized = sanitizeMasterIntelligenceContextForTarget('vehicles', context);
    const params = new URLSearchParams();
    params.set('view', 'vehicles');
    params.set('cvSection', 'vehicles');
    if (sanitized.orgId) params.set('orgId', sanitized.orgId);
    if (sanitized.vehicleId) params.set('vehicleId', sanitized.vehicleId);
    const next = `${window.location.pathname}?${params.toString()}`;
    if (opts?.replace) window.history.replaceState(null, '', next);
    else window.history.pushState(null, '', next);
    notifyMasterUrlChange();
    return;
  }

  if (target === 'device-inventory') {
    const sanitized = sanitizeMasterIntelligenceContextForTarget(
      'device-inventory',
      context,
      opts?.hygiene,
    );
    const params = new URLSearchParams();
    params.set('view', 'device-inventory');
    if (sanitized.orgId) params.set('orgId', sanitized.orgId);
    if (sanitized.physicalDeviceId) params.set('pdiDeviceId', sanitized.physicalDeviceId);
    const next = `${window.location.pathname}?${params.toString()}`;
    if (opts?.replace) window.history.replaceState(null, '', next);
    else window.history.pushState(null, '', next);
    notifyMasterUrlChange();
    return;
  }

  pushMasterIntelligenceUrl(
    target,
    sanitizeMasterIntelligenceContextForTarget(target, context, opts?.hygiene),
    opts,
  );
}

export function isMasterIntelligenceView(view: string): view is MasterIntelligenceView {
  return INTELLIGENCE_VIEWS.has(view as MasterIntelligenceView);
}

export function readMasterIntelligenceView(search: string): MasterView | null {
  const params = new URLSearchParams(search);
  const view = params.get('view') ?? params.get('masterView');
  if (view && isMasterIntelligenceView(view)) return view;
  return null;
}

export function contextHasMinimumForCrossLink(
  target: MasterIntelligenceCrossLinkTarget,
  context: MasterIntelligenceContextState,
): boolean {
  switch (target) {
    case 'vehicles':
      return Boolean(context.vehicleId);
    case 'device-inventory':
      return Boolean(context.physicalDeviceId);
    case 'vsi-intelligence':
      return Boolean(context.orgId && context.vehicleId);
    case 'apds-intelligence':
      return Boolean(context.orgId && context.vehicleId);
    default:
      return false;
  }
}

export function emptyIntelligenceContext(): MasterIntelligenceContextState {
  return { ...EMPTY_MASTER_INTELLIGENCE_CONTEXT };
}
