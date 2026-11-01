import { describe, expect, it } from 'vitest';
import {
  buildMasterIntelligenceSearch,
  emptyIntelligenceContext,
  navigateMasterIntelligenceCrossLink,
  parseMasterIntelligenceContext,
} from './master-intelligence-url';
import {
  applyVerifiedProviderSourceLink,
  normalizeContextForIntelligenceView,
  rejectStaleProviderSourceLinkId,
  sanitizeMasterIntelligenceContextForTarget,
} from './master-intelligence-context-hygiene.util';
import { EMPTY_VSI_LEDGER_FILTERS } from './vsi-ledger-url.types';

const org = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const vehicle = '19fedd4b-c4e8-4de8-a125-dab293326e7e';
const link = '9ff5e350-cd4b-4e3a-956a-4f1770b017f2';
const device = 'b2c3d4e5-f6a7-4890-b123-456789abcdef';

function fullContext(
  patch: Partial<ReturnType<typeof emptyIntelligenceContext>> = {},
) {
  return {
    ...emptyIntelligenceContext(),
    orgId: org,
    vehicleId: vehicle,
    providerSourceLinkId: link,
    physicalDeviceId: device,
    apdOpportunityId: 'opp-shadow-1',
    policyVersion: 'P25_APD_B2_V1',
    apdEpochId: null,
    asOf: '2026-10-28T10:00:00.000Z',
    vsiTab: 'ledger' as const,
    signalKey: 'engine_rpm',
    ledgerFilters: { ...EMPTY_VSI_LEDGER_FILTERS, q: 'rpm' },
    rejectedParams: [],
    ...patch,
  };
}

describe('master intelligence context hygiene', () => {
  it('strips VSI-only params from APDS URL build', () => {
    const qs = buildMasterIntelligenceSearch('apds-intelligence', fullContext());
    expect(qs).toContain('view=apds-intelligence');
    expect(qs).toContain('apdOpportunityId=');
    expect(qs).not.toContain('signalKey=');
    expect(qs).not.toContain('tab=ledger');
    expect(qs).not.toContain('physicalDeviceId=');
  });

  it('strips APDS-only params from VSI URL build', () => {
    const qs = buildMasterIntelligenceSearch('vsi-intelligence', fullContext());
    expect(qs).toContain('view=vsi-intelligence');
    expect(qs).toContain('signalKey=engine_rpm');
    expect(qs).not.toContain('apdOpportunityId=');
    expect(qs).not.toContain('policyVersion=');
  });

  it('generic cross-link to VSI clears stale ledger unless explicit tab/signal', () => {
    const sanitized = sanitizeMasterIntelligenceContextForTarget(
      'vsi-intelligence',
      fullContext({ vsiTab: 'overview', signalKey: null, ledgerFilters: { ...EMPTY_VSI_LEDGER_FILTERS, q: 'x' } }),
    );
    expect(sanitized.vsiTab).toBe('overview');
    expect(sanitized.signalKey).toBeNull();
    expect(sanitized.ledgerFilters.q).toBeNull();
    expect(sanitized.apdOpportunityId).toBeNull();
  });

  it('preserves explicit signal deep link on VSI cross-link', () => {
    const sanitized = sanitizeMasterIntelligenceContextForTarget('vsi-intelligence', fullContext(), {
      preserveVsiLedgerState: true,
    });
    expect(sanitized.signalKey).toBe('engine_rpm');
    expect(sanitized.vsiTab).toBe('ledger');
  });

  it('APDS cross-link never carries physicalDeviceId from vehicle alone', () => {
    const sanitized = sanitizeMasterIntelligenceContextForTarget('apds-intelligence', fullContext());
    expect(sanitized.physicalDeviceId).toBeNull();
  });

  it('device-inventory cross-link requires proven physicalDeviceId', () => {
    const blocked = sanitizeMasterIntelligenceContextForTarget('device-inventory', fullContext());
    expect(blocked.physicalDeviceId).toBeNull();
    const allowed = sanitizeMasterIntelligenceContextForTarget('device-inventory', fullContext(), {
      physicalDeviceIdProven: true,
    });
    expect(allowed.physicalDeviceId).toBe(device);
  });

  it('navigateMasterIntelligenceCrossLink sets pdiDeviceId when proven', () => {
    window.history.replaceState(null, '', '/master');
    navigateMasterIntelligenceCrossLink('device-inventory', fullContext(), {
      hygiene: { physicalDeviceIdProven: true },
    });
    const params = new URLSearchParams(window.location.search);
    expect(params.get('view')).toBe('device-inventory');
    expect(params.get('pdiDeviceId')).toBe(device);
  });

  it('rejects stale providerSourceLinkId against verified list', () => {
    expect(rejectStaleProviderSourceLinkId(link, [link])).toBe(link);
    expect(rejectStaleProviderSourceLinkId(link, ['other-link-id'])).toBeNull();
    const reconciled = applyVerifiedProviderSourceLink(fullContext(), ['other-link-id']);
    expect(reconciled.providerSourceLinkId).toBeNull();
    expect(reconciled.signalKey).toBeNull();
  });

  it('normalizes bookmarked APDS URL with leaked VSI params', () => {
    const parsed = parseMasterIntelligenceContext(
      `?view=apds-intelligence&orgId=${org}&vehicleId=${vehicle}&signalKey=engine_rpm&tab=ledger&physicalDeviceId=${device}`,
    );
    const normalized = normalizeContextForIntelligenceView('apds-intelligence', parsed);
    expect(normalized.signalKey).toBeNull();
    expect(normalized.physicalDeviceId).toBeNull();
    expect(normalized.vsiTab).toBe('overview');
  });
});

// @vitest-environment happy-dom
describe('master intelligence context hygiene — history', () => {
  it('APDS generic cross-link to VSI opens overview without stale signal', () => {
    window.history.replaceState(
      null,
      '',
      `/master?view=apds-intelligence&orgId=${org}&vehicleId=${vehicle}&providerSourceLinkId=${link}&signalKey=engine_rpm&tab=ledger`,
    );
    const ctx = parseMasterIntelligenceContext(window.location.search);
    navigateMasterIntelligenceCrossLink('vsi-intelligence', ctx);
    const params = new URLSearchParams(window.location.search);
    expect(params.get('view')).toBe('vsi-intelligence');
    expect(params.get('signalKey')).toBeNull();
    expect(params.get('tab')).toBeNull();
  });

  it('supports back after APDS to VSI push', () => {
    window.history.replaceState(null, '', `/master?view=apds-intelligence&orgId=${org}&vehicleId=${vehicle}`);
    const prior = window.location.search;
    navigateMasterIntelligenceCrossLink('vsi-intelligence', {
      ...emptyIntelligenceContext(),
      orgId: org,
      vehicleId: vehicle,
      providerSourceLinkId: link,
    });
    window.history.back();
    expect(window.location.search).toBe(prior);
  });
});
