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
  /** Set when a later page disagrees with scope or catalog identity (stale/mixed catalog). */
  catalogIdentityViolation?: boolean;
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

function pageMatchesScope(
  scope: VsiFsdReadScope,
  page: MasterFsdSignalExplorerPageDtoV1,
): boolean {
  return (
    page.organizationId === scope.orgId &&
    page.vehicleId === scope.vehicleId &&
    page.providerSourceLinkId === scope.providerSourceLinkId
  );
}

function pageMatchesCatalogAnchor(
  anchor: MasterFsdSignalExplorerPageDtoV1,
  page: MasterFsdSignalExplorerPageDtoV1,
): boolean {
  return (
    anchor.catalogRunId === page.catalogRunId &&
    anchor.organizationId === page.organizationId &&
    anchor.vehicleId === page.vehicleId &&
    anchor.providerSourceLinkId === page.providerSourceLinkId
  );
}

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
    if (!pageMatchesScope(scope, page)) {
      return {
        items: filterSignalsByQuery(all, query),
        catalogExhaustive: false,
        pagesScanned,
        totalRowsLoaded: all.length,
        query,
        basePage: base,
        catalogIdentityViolation: true,
      };
    }
    if (!base) {
      base = page;
    } else if (!pageMatchesCatalogAnchor(base, page)) {
      return {
        items: filterSignalsByQuery(all, query),
        catalogExhaustive: false,
        pagesScanned,
        totalRowsLoaded: all.length,
        query,
        basePage: base,
        catalogIdentityViolation: true,
      };
    }
    all = mergeSignalCatalogItems(all, page.items);
    pagesScanned += 1;
    lastHasMore = page.page.hasMore;
    cursor = page.page.nextCursor;
    if (!page.page.hasMore || !page.page.nextCursor) {
      break;
    }
  }

  const matches = filterSignalsByQuery(all, query);
  const hitBoundWithMore = pagesScanned >= maxPages && lastHasMore;
  return {
    items: matches,
    catalogExhaustive: !hitBoundWithMore,
    pagesScanned,
    totalRowsLoaded: all.length,
    query,
    basePage: base,
  };
}
