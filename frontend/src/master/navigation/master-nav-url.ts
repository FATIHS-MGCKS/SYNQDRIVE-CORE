import type { MasterNavLocationState, MasterView } from './master-nav.types';

const CANONICAL_VIEWS: MasterView[] = [
  'dashboard', 'organizations', 'security-access', 'users', 'vehicles', 'device-inventory', 'prospects', 'billing',
  'activity-log', 'platform-ops', 'platform-health', 'support', 'settings', 'platform-integrations',
  'fleet-connection',
  'parts-accessories', 'insurances', 'voice-assistant', 'high-mobility',
  'architektur', 'changes', 'vehicle-logbook', 'battery-v2-shadow-inspection', 'battery-v2-hv-inspection',
  'vsi-intelligence', 'apds-intelligence', 'tire-v3-calibration-center',
];

const LEGACY_VIEWS: MasterView[] = [
  'hm-compatibility', 'health-tracking', 'trip-detection-logic', 'performance-logic',
];

export const ALL_MASTER_VIEWS: MasterView[] = [...CANONICAL_VIEWS, ...LEGACY_VIEWS];

export function readViewParam(search: string): string | null {
  const params = new URLSearchParams(search);
  return params.get('view') ?? params.get('masterView');
}

export function normalizeMasterNavLocation(search: string): MasterNavLocationState {
  const params = new URLSearchParams(search);
  let view = (readViewParam(search) ?? 'dashboard') as MasterView;
  let settingsTab = params.get('settingsTab') ?? undefined;
  const orgId = params.get('orgId');
  let archCategory = params.get('archCategory');
  let hmTab = params.get('hmTab');

  if (view === 'hm-compatibility') {
    view = 'high-mobility';
    hmTab = hmTab ?? 'eligibility';
  }
  if (view === 'health-tracking') {
    view = 'architektur';
    archCategory = archCategory ?? 'health';
  }
  if (view === 'trip-detection-logic') {
    view = 'architektur';
    archCategory = archCategory ?? 'trips';
  }
  if (view === 'performance-logic') {
    view = 'architektur';
    archCategory = archCategory ?? 'workers';
  }
  if (view === 'settings' && settingsTab === 'monitoring') {
    view = 'platform-ops';
    settingsTab = undefined;
  }
  if (view === 'platform-health') {
    view = 'platform-ops';
  }
  if (view === 'fleet-connection') {
    view = 'vehicles';
    if (!params.get('cvSection')) params.set('cvSection', 'overview');
  }
  if (view === 'users') {
    view = 'security-access';
    if (!params.get('securityAccess')) params.set('securityAccess', 'users');
  }
  if (view === 'activity-log') {
    view = 'security-access';
    if (!params.get('securityAccess')) params.set('securityAccess', 'audit');
  }
  if (view === 'settings') {
    view = 'platform-integrations';
    settingsTab = undefined;
  }

  if (!ALL_MASTER_VIEWS.includes(view)) {
    view = 'dashboard';
  }

  return {
    view,
    settingsTab,
    orgId,
    archCategory,
    hmTab,
  };
}

export function buildMasterNavSearch(state: MasterNavLocationState, preserveBillingAndVoice = true): string {
  const params = new URLSearchParams();
  if (typeof window !== 'undefined' && preserveBillingAndVoice) {
    const current = new URLSearchParams(window.location.search);
    for (const key of ['masterBilling', 'masterBillingTab', 'voiceSection', 'voiceOrgId']) {
      const val = current.get(key);
      if (val) params.set(key, val);
    }
    if (state.view !== 'billing') {
      params.delete('masterBilling');
      params.delete('masterBillingTab');
      if (!state.orgId) params.delete('orgId');
    }
    if (state.view !== 'voice-assistant') {
      params.delete('voiceSection');
      params.delete('voiceOrgId');
    }
  }

  params.set('view', state.view);

  if (state.view === 'settings' && state.settingsTab) {
    params.set('settingsTab', state.settingsTab);
  }
  if (state.orgId && (state.view === 'organizations' || state.view === 'billing')) {
    params.set('orgId', state.orgId);
  }
  if (state.view === 'organizations') {
    const current = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const orgTab = current?.get('orgTab');
    if (orgTab) params.set('orgTab', orgTab);
  }
  if (state.view === 'architektur' && state.archCategory) {
    params.set('archCategory', state.archCategory);
  }
  if (state.view === 'high-mobility' && state.hmTab) {
    params.set('hmTab', state.hmTab);
  }

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function pushMasterNavState(state: MasterNavLocationState, replace = false) {
  if (typeof window === 'undefined') return;
  const next = `${window.location.pathname}${buildMasterNavSearch(state)}`;
  if (replace) {
    window.history.replaceState(state, '', next);
  } else {
    window.history.pushState(state, '', next);
  }
}

export function readInitialMasterNavLocation(): MasterNavLocationState {
  if (typeof window === 'undefined') {
    return { view: 'dashboard' };
  }
  return normalizeMasterNavLocation(window.location.search);
}
