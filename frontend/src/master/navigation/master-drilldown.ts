import { syncPlatformOpsUrl } from '../platform-ops/platform-ops-url';
import type { PlatformOpsDiagnosticsTab, PlatformOpsProcessingTab, PlatformOpsSection } from '../platform-ops/types';
import { syncSecurityAccessUrl } from '../security-access/security-access-url';
import type { SecurityAccessSection } from '../security-access/types';
import { pushMasterNavState } from './master-nav-url';
import type { MasterView } from './master-nav.types';

const LEGACY_VIEW_ALIASES: Record<string, MasterView> = {
  'platform-health': 'platform-ops',
  'fleet-connection': 'vehicles',
  'activity-log': 'security-access',
  settings: 'platform-integrations',
};

export function resolveMasterDrilldownView(view: string): MasterView {
  return (LEGACY_VIEW_ALIASES[view] ?? view) as MasterView;
}

function commitSearch(search: string, replace: boolean) {
  const url = `${window.location.pathname}${search}`;
  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
}

/**
 * Applies canonical Master Admin URL state for cross-page drilldowns.
 * Uses pushState by default so browser Back returns to the source view.
 */
export function applyMasterDrilldownUrl(
  view: string,
  params?: Record<string, string>,
  opts?: { replace?: boolean },
): MasterView {
  const resolved = resolveMasterDrilldownView(view);
  const replace = opts?.replace ?? false;

  if (resolved === 'billing') {
    const q = new URLSearchParams({ view: 'billing' });
    if (params) {
      for (const [k, v] of Object.entries(params)) q.set(k, v);
    }
    commitSearch(`?${q.toString()}`, replace);
    return resolved;
  }

  if (resolved === 'platform-ops') {
    const section: PlatformOpsSection =
      (params?.platformOps as PlatformOpsSection | undefined) ??
      (params?.opsTab === 'workers' || params?.opsTab === 'queues' || params?.opsTab === 'schedulers'
        ? 'processing'
        : 'overview');

    const tab = params?.platformOpsTab ?? params?.opsTab;
    syncPlatformOpsUrl(
      {
        section,
        processingTab: (tab === 'workers' || tab === 'queues' || tab === 'schedulers'
          ? tab
          : 'workers') as PlatformOpsProcessingTab,
        diagnosticsTab: (tab === 'alerts' ||
        tab === 'poll-logs' ||
        tab === 'token-health' ||
        tab === 'communication' ||
        tab === 'driving-intelligence-s4' ||
        tab === 'tools'
          ? tab
          : 'alerts') as PlatformOpsDiagnosticsTab,
        incidentId: params?.incidentId ?? null,
        serviceId: params?.serviceId ?? null,
      },
      { replace },
    );
    return resolved;
  }

  if (resolved === 'security-access') {
    const section: SecurityAccessSection =
      view === 'activity-log'
        ? 'audit'
        : ((params?.securityAccess as SecurityAccessSection | undefined) ?? 'audit');
    syncSecurityAccessUrl(
      {
        section,
        auditId: params?.auditId ?? null,
        userId: params?.userId ?? null,
      },
      { replace },
    );
    return resolved;
  }

  if (resolved === 'vehicles') {
    const q = new URLSearchParams(window.location.search);
    q.set('view', 'vehicles');
    q.set('cvSection', params?.cvSection ?? 'overview');
    if (params?.vehicleId) q.set('vehicleId', params.vehicleId);
    else q.delete('vehicleId');
    commitSearch(`?${q.toString()}`, replace);
    return resolved;
  }

  if (resolved === 'organizations') {
    pushMasterNavState(
      {
        view: 'organizations',
        orgId: params?.orgId,
      },
      replace,
    );
    return resolved;
  }

  if (resolved === 'vsi-intelligence' || resolved === 'apds-intelligence') {
    const q = new URLSearchParams(window.location.search);
    q.set('view', resolved);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v) q.set(k, v);
      }
    }
    commitSearch(`?${q.toString()}`, replace);
    return resolved;
  }

  pushMasterNavState({ view: resolved }, replace);
  return resolved;
}
