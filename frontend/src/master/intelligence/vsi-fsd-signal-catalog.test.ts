import { describe, expect, it, vi } from 'vitest';
import type { MasterFsdSignalExplorerItemV1 } from './vsi-master-fsd-read-api.types';
import {
  filterSignalsByQuery,
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

function page(items: string[], cursor: string | null, hasMore: boolean) {
  return {
    contractVersion: 'vsi-master-fsd-read-v1' as const,
    organizationId: scope.orgId,
    vehicleId: scope.vehicleId,
    providerSourceLinkId: scope.providerSourceLinkId,
    catalogRunId: 'run-1',
    catalogAuthoritative: true,
    historicalLink: 'LINKED' as const,
    items: items.map(row),
    page: { limit: 50, nextCursor: cursor, hasMore },
    aggregates: { declaredSignalCount: 100, logicalSignalsReturned: items.length },
  };
}

describe('vsi-fsd-signal-catalog.util', () => {
  it('finds matches beyond the first page', async () => {
    const fetch = vi.fn(async (_s, cursor: string | null) => {
      if (!cursor) return page(Array.from({ length: 50 }, (_, i) => `signal_${i}`), 'c2', true);
      return page(['engine_rpm_native'], null, false);
    });
    const outcome = await searchFsdSignalCatalog(scope, 'engine_rpm', fetch);
    expect(outcome.items).toHaveLength(1);
    expect(outcome.items[0].providerNativeSignalName).toBe('engine_rpm_native');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('deduplicates merged catalog pages', () => {
    const merged = mergeSignalCatalogItems([row('a'), row('b')], [row('b'), row('c')]);
    expect(merged.map((r) => r.providerNativeSignalName)).toEqual(['a', 'b', 'c']);
  });

  it('returns empty results when no match in exhaustive scan', async () => {
    const fetch = vi.fn(async () => page(['alpha'], null, false));
    const outcome = await searchFsdSignalCatalog(scope, 'zzzz', fetch);
    expect(outcome.items).toEqual([]);
    expect(outcome.catalogExhaustive).toBe(true);
  });

  it('filters client subset deterministically', () => {
    const items = [row('speed'), row('engineSpeed')];
    expect(filterSignalsByQuery(items, 'engine').map((i) => i.providerNativeSignalName)).toEqual(['engineSpeed']);
  });
});
