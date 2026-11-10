import { describe, expect, it } from 'vitest';
import { VSI_TAB_VALUES, VSI_V2_PRIMARY_TAB_VALUES } from './vsi-ledger-url.types';
import { parseVsiLedgerUrlFields } from './vsi-ledger-url.util';
import { resolveVsiTabForRender, isLegacyRevisionsTab } from './vsi-tab-navigation.util';
import { parseMasterIntelligenceContext } from './master-intelligence-url';
import { matchesScope } from './useVsiMasterFsdReadData.test-helpers';

describe('VSI 2.0 navigation', () => {
  it('exposes six primary tabs plus ledger and legacy revisions', () => {
    expect(VSI_V2_PRIMARY_TAB_VALUES).toHaveLength(6);
    expect(VSI_TAB_VALUES).toContain('ledger');
    expect(VSI_TAB_VALUES).toContain('revisions');
    expect(VSI_TAB_VALUES).toContain('signals');
  });

  it('parses new tab values from URL', () => {
    const rejected: string[] = [];
    const parsed = parseVsiLedgerUrlFields(new URLSearchParams('tab=profiles'), rejected);
    expect(parsed.vsiTab).toBe('profiles');
    expect(rejected).toEqual([]);
  });

  it('maps legacy revisions tab to runs renderer', () => {
    expect(resolveVsiTabForRender('revisions')).toBe('runs');
    expect(isLegacyRevisionsTab('revisions')).toBe(true);
    expect(resolveVsiTabForRender('runs')).toBe('runs');
  });

  it('keeps ledger deep links', () => {
    const ctx = parseMasterIntelligenceContext('?view=vsi-intelligence&tab=ledger&signalKey=engine_rpm');
    expect(ctx.vsiTab).toBe('ledger');
    expect(ctx.signalKey).toBe('engine_rpm');
  });
});

describe('FSD stale scope guard', () => {
  it('rejects mismatched DTO scope', () => {
    expect(
      matchesScope(
        { orgId: 'o1', vehicleId: 'v1', providerSourceLinkId: 'l1' },
        { organizationId: 'o1', vehicleId: 'v1', providerSourceLinkId: 'l2' },
      ),
    ).toBe(false);
    expect(
      matchesScope(
        { orgId: 'o1', vehicleId: 'v1', providerSourceLinkId: 'l1' },
        { organizationId: 'o1', vehicleId: 'v1', providerSourceLinkId: 'l1' },
      ),
    ).toBe(true);
  });
});
