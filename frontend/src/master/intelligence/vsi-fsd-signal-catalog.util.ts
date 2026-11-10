import type {
  MasterFsdSignalExplorerItemV1,
  MasterFsdSignalExplorerPageDtoV1,
} from './vsi-master-fsd-read-api.types';
import type { VsiFsdReadScope } from './useVsiMasterFsdReadData';

export const FSD_SIGNAL_PAGE_LIMIT = 50;
/** Safety bound when scanning catalog for client-side search (disclose if hit). */
export const FSD_SIGNAL_SEARCH_MAX_PAGES = 40;

export type FsdCatalogSearchOutcome = {
  items: MasterFsdSignalExplorerItemV1[];
  catalogExhaustive: boolean;
  pagesScanned: number;
  totalRowsLoaded: number;
  query: string;
  basePage: MasterFsdSignalExplorerPageDtoV1 | null;
};

export function scopeKeyFrom(scope: VsiFsdReadScope): string {
  return `${scope.orgId}:${scope.vehicleId}:${scope.providerSourceLinkId}`;
}

export function normalizeFsdSearchQuery(raw: string): string {
  return raw.trim().toLowerCase();
}

export function filterSignalsByQuery(
  items: MasterFsdSignalExplorerItemV1[],
  query: string,
): MasterFsdSignalExplorerItemV1[] {
  const q = normalizeFsdSearchQuery(query);
  if (!q) return items;
  return items.filter((row) => row.providerNativeSignalName.toLowerCase().includes(q));
}

export function mergeSignalCatalogItems(
  existing: MasterFsdSignalExplorerItemV1[],
  incoming: MasterFsdSignalExplorerItemV1[],
): MasterFsdSignalExplorerItemV1[] {
  const seen = new Set(existing.map((i) => i.providerNativeSignalName));
  const out = [...existing];
  for (const row of incoming) {
    if (seen.has(row.providerNativeSignalName)) continue;
    seen.add(row.providerNativeSignalName);
    out.push(row);
  }
  return out;
}

export type FetchSignalPageFn = (
  scope: VsiFsdReadScope,
  cursor: string | null,
) => Promise<MasterFsdSignalExplorerPageDtoV1>;

export async function searchFsdSignalCatalog(
  scope: VsiFsdReadScope,
  query: string,
  fetchPage: FetchSignalPageFn,
  opts?: {
    maxPages?: number;
    isCancelled?: () => boolean;
  },
): Promise<FsdCatalogSearchOutcome> {
  const q = normalizeFsdSearchQuery(query);
  const maxPages = opts?.maxPages ?? FSD_SIGNAL_SEARCH_MAX_PAGES;
  let cursor: string | null = null;
  let pagesScanned = 0;
  let all: MasterFsdSignalExplorerItemV1[] = [];
  let base: MasterFsdSignalExplorerPageDtoV1 | null = null;
  let lastHasMore = false;

  if (!q) {
    const page = await fetchPage(scope, null);
    return {
      items: page.items,
      catalogExhaustive: !page.page.hasMore,
      pagesScanned: 1,
      totalRowsLoaded: page.items.length,
      query: '',
      basePage: page,
    };
  }

  while (pagesScanned < maxPages) {
    if (opts?.isCancelled?.()) {
      return {
        items: filterSignalsByQuery(all, query),
        catalogExhaustive: false,
        pagesScanned,
        totalRowsLoaded: all.length,
        query,
        basePage: base,
      };
    }
    const page = await fetchPage(scope, cursor);
    if (!base) base = page;
    all = mergeSignalCatalogItems(all, page.items);
    pagesScanned += 1;
    lastHasMore = page.page.hasMore;
    cursor = page.page.nextCursor;
    const matches = filterSignalsByQuery(all, query);
    if (matches.length > 0) {
      return {
        items: matches,
        catalogExhaustive: !lastHasMore && pagesScanned < maxPages,
        pagesScanned,
        totalRowsLoaded: all.length,
        query,
        basePage: base,
      };
    }
    if (!page.page.hasMore || !page.page.nextCursor) {
      return {
        items: [],
        catalogExhaustive: true,
        pagesScanned,
        totalRowsLoaded: all.length,
        query,
        basePage: base,
      };
    }
  }

  return {
    items: filterSignalsByQuery(all, query),
    catalogExhaustive: false,
    pagesScanned,
    totalRowsLoaded: all.length,
    query,
    basePage: base,
  };
}
