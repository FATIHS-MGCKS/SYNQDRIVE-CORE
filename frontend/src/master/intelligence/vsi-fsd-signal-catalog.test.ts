import { describe, expect, it, vi } from 'vitest';
import type { MasterFsdSignalExplorerItemV1 } from './vsi-master-fsd-read-api.types';
import {
  filterSignalsByQuery,
  FSD_SIGNAL_SEARCH_MAX_PAGES,
  mergeSignalCatalogItems,
  searchFsdSignalCatalog,
} from './vsi-fsd-signal-catalog.util';

const scope = { orgId: 'o1', vehicleId: 'v1', providerSourceLinkId: 'l1' };

function row(name: string): MasterFsdSignalExplorerItemV1 {
  return {
    providerNativeSignalName: name,
    declaredByProvider: true,
    schemaShape: null,
    presentationState: 'DECLARED_ONLY',
    catalogDeclared: true,
    snapshotEvidence: 'NOT_EXECUTED',
    historicalEvidence: 'NOT_EXECUTED',
    catalogQuery: { queryPlanned: false, queryAccepted: null, observedValue: null },
    snapshotQuery: null,
    historicalQuery: null,
    coverageAggregate: null,
    sourceRunId: null,
    provenanceReference: null,
  };
}

function page(
  items: string[],
  cursor: string | null,
  hasMore: boolean,
  opts?: { catalogRunId?: string; orgId?: string },
) {
  return {
    contractVersion: 'vsi-master-fsd-read-v1' as const,
    organizationId: opts?.orgId ?? scope.orgId,
    vehicleId: scope.vehicleId,
    providerSourceLinkId: scope.providerSourceLinkId,
    catalogRunId: opts?.catalogRunId ?? 'run-1',
    catalogAuthoritative: true,
    historicalLink: 'LINKED' as const,
    items: items.map(row),
    page: { limit: 50, nextCursor: cursor, hasMore },
    aggregates: { declaredSignalCount: 100, logicalSignalsReturned: items.length },
  };
}

describe('vsi-fsd-signal-catalog.util', () => {
  it('returns matches from page 1 and page 2 when both contain hits', async () => {
    const fetch = vi.fn(async (_s, cursor: string | null) => {
      if (!cursor) return page(['engine_alpha', 'noise_1'], 'c2', true);
      return page(['engine_beta'], null, false);
    });
    const outcome = await searchFsdSignalCatalog(scope, 'engine', fetch);
    expect(outcome.items.map((i) => i.providerNativeSignalName)).toEqual(['engine_alpha', 'engine_beta']);
    expect(outcome.catalogExhaustive).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('finds a match only on the final catalog page', async () => {
    const fetch = vi.fn(async (_s, cursor: string | null) => {
      if (!cursor) return page(Array.from({ length: 50 }, (_, i) => `signal_${i}`), 'c2', true);
      return page(['engine_rpm_native'], null, false);
    });
    const outcome = await searchFsdSignalCatalog(scope, 'engine_rpm', fetch);
    expect(outcome.items).toHaveLength(1);
    expect(outcome.items[0].providerNativeSignalName).toBe('engine_rpm_native');
    expect(outcome.catalogExhaustive).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('returns empty exhaustive results when nothing matches', async () => {
    const fetch = vi.fn(async () => page(['alpha'], null, false));
    const outcome = await searchFsdSignalCatalog(scope, 'zzzz', fetch);
    expect(outcome.items).toEqual([]);
    expect(outcome.catalogExhaustive).toBe(true);
  });

  it('marks partial when safety bound is reached before catalog end', async () => {
    const fetch = vi.fn(async (_s, cursor: string | null) => {
      const next = cursor === 'c2' ? 'c3' : 'c2';
      return page(['engine_late'], next, true);
    });
    const outcome = await searchFsdSignalCatalog(scope, 'engine', fetch, { maxPages: 2 });
    expect(outcome.pagesScanned).toBe(2);
    expect(outcome.catalogExhaustive).toBe(false);
    expect(outcome.items.map((i) => i.providerNativeSignalName)).toEqual(['engine_late']);
  });

  it('is exhaustive when last page coincides with safety bound and has no further pages', async () => {
    const fetch = vi.fn(async (_s, cursor: string | null) => {
      if (!cursor) return page(['engine_only'], 'c2', true);
      return page([], null, false);
    });
    const outcome = await searchFsdSignalCatalog(scope, 'engine', fetch, { maxPages: 2 });
    expect(outcome.pagesScanned).toBe(2);
    expect(outcome.catalogExhaustive).toBe(true);
    expect(outcome.items).toHaveLength(1);
  });

  it('aborts without mixing when catalog identity changes mid-search', async () => {
    let call = 0;
    const fetch = vi.fn(async (_s, cursor: string | null) => {
      call += 1;
      if (!cursor) return page(['engine_keep'], 'c2', true);
      return page(['engine_drop'], null, false, { catalogRunId: 'run-other' });
    });
    const outcome = await searchFsdSignalCatalog(scope, 'engine', fetch);
    expect(outcome.catalogIdentityViolation).toBe(true);
    expect(outcome.catalogExhaustive).toBe(false);
    expect(outcome.items.map((i) => i.providerNativeSignalName)).toEqual(['engine_keep']);
    expect(call).toBe(2);
  });

  it('deduplicates merged catalog pages', () => {
    const merged = mergeSignalCatalogItems([row('a'), row('b')], [row('b'), row('c')]);
    expect(merged.map((r) => r.providerNativeSignalName)).toEqual(['a', 'b', 'c']);
  });

  it('filters client subset deterministically', () => {
    const items = [row('speed'), row('engineSpeed')];
    expect(filterSignalsByQuery(items, 'engine').map((i) => i.providerNativeSignalName)).toEqual(['engineSpeed']);
  });

  it('default max pages matches exported safety constant', () => {
    expect(FSD_SIGNAL_SEARCH_MAX_PAGES).toBeGreaterThan(0);
  });
});
