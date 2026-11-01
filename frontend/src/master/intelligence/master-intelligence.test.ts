import { describe, expect, it, vi } from 'vitest';
import {
  buildMasterIntelligenceSearch,
  contextHasMinimumForCrossLink,
  emptyIntelligenceContext,
  parseMasterIntelligenceContext,
  pushMasterIntelligenceUrl,
  readMasterIntelligenceView,
  navigateMasterIntelligenceCrossLink,
} from './master-intelligence-url';
import { ALL_MASTER_VIEWS } from '../navigation/master-nav-url';
import { MASTER_NAV_GROUPS, MASTER_NAV_ITEM_BY_ID } from '../navigation/master-nav.config';
import { getVisibleMasterNavItemIds } from '../navigation/master-nav-permissions';

vi.mock('../../lib/auth', () => ({
  getStoredUser: () => ({ platformRole: 'MASTER_ADMIN' }),
  isMasterAdmin: () => true,
  hasMasterBillingAccess: () => false,
}));

describe('Master Intelligence URL', () => {
  const org = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
  const vehicle = '19fedd4b-c4e8-4de8-a125-dab293326e7e';
  const link = '9ff5e350-cd4b-4e3a-956a-4f1770b017f2';

  it('parses valid UUID context and rejects invalid ids', () => {
    const ctx = parseMasterIntelligenceContext(
      `?view=vsi-intelligence&orgId=${org}&vehicleId=${vehicle}&providerSourceLinkId=${link}&physicalDeviceId=not-a-uuid`,
    );
    expect(ctx.orgId).toBe(org);
    expect(ctx.vehicleId).toBe(vehicle);
    expect(ctx.providerSourceLinkId).toBe(link);
    expect(ctx.physicalDeviceId).toBeNull();
    expect(ctx.rejectedParams).toContain('physicalDeviceId');
  });

  it('builds canonical search without vsiLinkId alias', () => {
    const qs = buildMasterIntelligenceSearch('apds-intelligence', {
      orgId: org,
      vehicleId: vehicle,
      providerSourceLinkId: link,
      physicalDeviceId: null,
      apdOpportunityId: 'opp-1',
      policyVersion: 'P25_APD_B2_V1',
      apdEpochId: null,
      asOf: '2026-10-28T10:00:00.000Z',
      vsiTab: 'overview',
      signalKey: null,
      ledgerFilters: emptyIntelligenceContext().ledgerFilters,
      rejectedParams: [],
    });
    expect(qs).toContain('view=apds-intelligence');
    expect(qs).toContain(`orgId=${org}`);
    expect(qs).not.toContain('vsiLinkId');
  });

  it('requires vehicle context for vehicle cross-link', () => {
    expect(
      contextHasMinimumForCrossLink('vehicles', {
        orgId: org,
        vehicleId: vehicle,
        providerSourceLinkId: null,
        physicalDeviceId: null,
        apdOpportunityId: null,
        policyVersion: null,
        apdEpochId: null,
        asOf: null,
        vsiTab: 'overview',
        signalKey: null,
        ledgerFilters: emptyIntelligenceContext().ledgerFilters,
        rejectedParams: [],
      }),
    ).toBe(true);
    expect(
      contextHasMinimumForCrossLink('vsi-intelligence', {
        orgId: null,
        vehicleId: vehicle,
        providerSourceLinkId: null,
        physicalDeviceId: null,
        apdOpportunityId: null,
        policyVersion: null,
        apdEpochId: null,
        asOf: null,
        vsiTab: 'overview',
        signalKey: null,
        ledgerFilters: emptyIntelligenceContext().ledgerFilters,
        rejectedParams: [],
      }),
    ).toBe(false);
  });

  it('preserves vehicle deep-link params when navigating to vehicles', () => {
    const ctx = parseMasterIntelligenceContext(
      `?view=vsi-intelligence&orgId=${org}&vehicleId=${vehicle}`,
    );
    const qs = buildMasterIntelligenceSearch('vehicles', ctx);
    expect(qs).toContain('view=vehicles');
    expect(qs).toContain(`vehicleId=${vehicle}`);
    expect(qs).not.toContain('vsiLinkId');
  });
});

// @vitest-environment happy-dom
describe('Master Intelligence URL — history', () => {
  const org = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
  const vehicle = '19fedd4b-c4e8-4de8-a125-dab293326e7e';
  const link = '9ff5e350-cd4b-4e3a-956a-4f1770b017f2';

  it('supports back navigation after pushMasterIntelligenceUrl', () => {
    window.history.replaceState(null, '', '/master?view=vehicles&cvSection=vehicles');
    const prior = window.location.search;
    pushMasterIntelligenceUrl('vsi-intelligence', {
      ...emptyIntelligenceContext(),
      orgId: org,
      vehicleId: vehicle,
    });
    expect(readMasterIntelligenceView(window.location.search)).toBe('vsi-intelligence');
    window.history.back();
    expect(window.location.search).toBe(prior);
  });

  it('adds cvSection when cross-linking to vehicles', () => {
    navigateMasterIntelligenceCrossLink('vehicles', {
      ...emptyIntelligenceContext(),
      orgId: org,
      vehicleId: vehicle,
    });
    const params = new URLSearchParams(window.location.search);
    expect(params.get('view')).toBe('vehicles');
    expect(params.get('cvSection')).toBe('vehicles');
    expect(params.get('vehicleId')).toBe(vehicle);
  });

  it('round-trips VSI -> APDS -> VSI preserving org and vehicle context', () => {
    const base = {
      ...emptyIntelligenceContext(),
      orgId: org,
      vehicleId: vehicle,
      providerSourceLinkId: link,
    };
    window.history.replaceState(null, '', '/master?view=vsi-intelligence');
    navigateMasterIntelligenceCrossLink('apds-intelligence', base);
    let params = new URLSearchParams(window.location.search);
    expect(params.get('view')).toBe('apds-intelligence');
    expect(params.get('orgId')).toBe(org);
    expect(params.get('vehicleId')).toBe(vehicle);
    expect(params.get('providerSourceLinkId')).toBe(link);

    const apdsCtx = parseMasterIntelligenceContext(window.location.search);
    navigateMasterIntelligenceCrossLink('vsi-intelligence', apdsCtx);
    params = new URLSearchParams(window.location.search);
    expect(params.get('view')).toBe('vsi-intelligence');
    expect(params.get('orgId')).toBe(org);
    expect(params.get('vehicleId')).toBe(vehicle);
    expect(params.get('signalKey')).toBeNull();
  });

  it('does not retain invalid physicalDeviceId in parsed context', () => {
    const ctx = parseMasterIntelligenceContext(
      `?view=vsi-intelligence&orgId=${org}&vehicleId=${vehicle}&physicalDeviceId=bad-id`,
    );
    expect(ctx.physicalDeviceId).toBeNull();
    expect(ctx.rejectedParams).toContain('physicalDeviceId');
    expect(ctx.orgId).toBe(org);
  });

  it('updates view on forward navigation after pushState chain', () => {
    window.history.replaceState(null, '', `/master?view=vsi-intelligence&orgId=${org}&vehicleId=${vehicle}`);
    pushMasterIntelligenceUrl('apds-intelligence', {
      ...emptyIntelligenceContext(),
      orgId: org,
      vehicleId: vehicle,
    });
    expect(readMasterIntelligenceView(window.location.search)).toBe('apds-intelligence');
    window.history.forward();
    // forward may no-op if at end; back then forward restores apds
    window.history.back();
    expect(readMasterIntelligenceView(window.location.search)).toBe('vsi-intelligence');
    window.history.forward();
    expect(readMasterIntelligenceView(window.location.search)).toBe('apds-intelligence');
  });
});

describe('Master nav — intelligence entries', () => {
  it('registers vsi/apds views in canonical list', () => {
    expect(ALL_MASTER_VIEWS).toContain('vsi-intelligence');
    expect(ALL_MASTER_VIEWS).toContain('apds-intelligence');
  });

  it('places views under connectivity group', () => {
    const connectivity = MASTER_NAV_GROUPS.find((g) => g.id === 'connectivity');
    expect(connectivity?.items).toEqual([
      'platform-integrations',
      'vsi-intelligence',
      'apds-intelligence',
      'high-mobility',
    ]);
  });

  it('exposes MASTER_ADMIN-only nav items', () => {
    expect(MASTER_NAV_ITEM_BY_ID['vsi-intelligence'].permissions).toEqual(['MASTER_ADMIN']);
    expect(MASTER_NAV_ITEM_BY_ID['apds-intelligence'].permissions).toEqual(['MASTER_ADMIN']);
    expect(getVisibleMasterNavItemIds()).toContain('vsi-intelligence');
    expect(getVisibleMasterNavItemIds()).toContain('apds-intelligence');
  });
});
