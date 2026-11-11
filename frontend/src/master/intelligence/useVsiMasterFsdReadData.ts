import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type {
  MasterFsdRunHistoryPageDtoV1,
  MasterFsdRunInspectorDtoV1,
  MasterFsdSignalExplorerPageDtoV1,
  MasterFsdSummaryDtoV1,
} from './vsi-master-fsd-read-api.types';
import {
  FSD_SIGNAL_PAGE_LIMIT,
  mergeSignalCatalogItems,
  searchFsdSignalCatalog,
  type FsdCatalogSearchOutcome,
} from './vsi-fsd-signal-catalog.util';

export type VsiFsdReadScope = {
  orgId: string;
  vehicleId: string;
  providerSourceLinkId: string;
};

function matchesScope(
  scope: VsiFsdReadScope | null,
  dto: { organizationId: string; vehicleId: string; providerSourceLinkId: string },
): boolean {
  if (!scope) return false;
  return (
    dto.organizationId === scope.orgId &&
    dto.vehicleId === scope.vehicleId &&
    dto.providerSourceLinkId === scope.providerSourceLinkId
  );
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'FSD read model could not be loaded';
}

export type VsiMasterFsdReadState = {
  summary: MasterFsdSummaryDtoV1 | null;
  summaryLoading: boolean;
  summaryError: string | null;
  signals: MasterFsdSignalExplorerPageDtoV1 | null;
  signalsLoading: boolean;
  signalsError: string | null;
  signalsSearch: FsdCatalogSearchOutcome | null;
  runs: MasterFsdRunHistoryPageDtoV1 | null;
  runsLoading: boolean;
  runsError: string | null;
  inspector: MasterFsdRunInspectorDtoV1 | null;
  inspectorLoading: boolean;
  inspectorError: string | null;
  selectedRunId: string | null;
};

const emptyFsd: VsiMasterFsdReadState = {
  summary: null,
  summaryLoading: false,
  summaryError: null,
  signals: null,
  signalsLoading: false,
  signalsError: null,
  signalsSearch: null,
  runs: null,
  runsLoading: false,
  runsError: null,
  inspector: null,
  inspectorLoading: false,
  inspectorError: null,
  selectedRunId: null,
};

async function fetchSignalPage(
  scope: VsiFsdReadScope,
  cursor: string | null,
): Promise<MasterFsdSignalExplorerPageDtoV1> {
  return api.admin.masterIntelligenceVsi.fsd.signals(scope.orgId, scope.vehicleId, scope.providerSourceLinkId, {
    limit: FSD_SIGNAL_PAGE_LIMIT,
    cursor,
  });
}

export function useVsiMasterFsdReadData(input: {
  orgId: string | null;
  vehicleId: string | null;
  providerSourceLinkId: string | null;
}) {
  const { orgId, vehicleId, providerSourceLinkId } = input;
  const [state, setState] = useState<VsiMasterFsdReadState>(emptyFsd);

  const scopeKey = useMemo(() => {
    if (!orgId || !vehicleId || !providerSourceLinkId) return null;
    return `${orgId}\u0001${vehicleId}\u0001${providerSourceLinkId}`;
  }, [orgId, vehicleId, providerSourceLinkId]);

  const scope = useMemo((): VsiFsdReadScope | null => {
    if (!orgId || !vehicleId || !providerSourceLinkId) return null;
    return { orgId, vehicleId, providerSourceLinkId };
  }, [orgId, vehicleId, providerSourceLinkId]);

  const scopeRef = useRef<VsiFsdReadScope | null>(null);
  const summaryReqRef = useRef(0);
  const signalsReqRef = useRef(0);
  const searchReqRef = useRef(0);
  const runsReqRef = useRef(0);
  const inspectorReqRef = useRef(0);

  useEffect(() => {
    scopeRef.current = scope;
    if (!scope) {
      summaryReqRef.current += 1;
      signalsReqRef.current += 1;
      searchReqRef.current += 1;
      runsReqRef.current += 1;
      inspectorReqRef.current += 1;
      setState({ ...emptyFsd });
      return;
    }

    const reqId = ++summaryReqRef.current;
    signalsReqRef.current += 1;
    searchReqRef.current += 1;
    runsReqRef.current += 1;
    inspectorReqRef.current += 1;

    setState((prev) => ({
      ...prev,
      summaryLoading: true,
      summaryError: null,
      signals: null,
      signalsError: null,
      signalsSearch: null,
      runs: null,
      runsError: null,
      inspector: null,
      inspectorError: null,
      selectedRunId: null,
    }));

    void (async () => {
      try {
        const summary = await api.admin.masterIntelligenceVsi.fsd.summary(
          scope.orgId,
          scope.vehicleId,
          scope.providerSourceLinkId,
        );
        if (summaryReqRef.current !== reqId) return;
        if (!matchesScope(scopeRef.current, summary)) return;
        setState((prev) => ({
          ...prev,
          summary,
          summaryLoading: false,
          summaryError: null,
        }));
      } catch (e) {
        if (summaryReqRef.current !== reqId) return;
        setState((prev) => ({
          ...prev,
          summary: null,
          summaryLoading: false,
          summaryError: errorMessage(e),
        }));
      }
    })();
  }, [scopeKey, scope]);

  const loadSignalsPage = useCallback(
    async (params?: { cursor?: string | null; append?: boolean }) => {
      if (!scope) return;
      const reqId = ++signalsReqRef.current;
      searchReqRef.current += 1;

      setState((prev) => ({
        ...prev,
        signalsLoading: true,
        signalsError: null,
        signalsSearch: null,
      }));

      try {
        const page = await fetchSignalPage(scope, params?.cursor ?? null);
        if (signalsReqRef.current !== reqId) return;
        if (!matchesScope(scopeRef.current, page)) return;

        setState((prev) => {
          const mergedItems =
            params?.append && prev.signals
              ? mergeSignalCatalogItems(prev.signals.items, page.items)
              : page.items;
          return {
            ...prev,
            signals: { ...page, items: mergedItems },
            signalsLoading: false,
            signalsError: null,
            signalsSearch: null,
          };
        });
      } catch (e) {
        if (signalsReqRef.current !== reqId) return;
        setState((prev) => ({
          ...prev,
          signalsLoading: false,
          signalsError: errorMessage(e),
        }));
      }
    },
    [scope],
  );

  const searchSignals = useCallback(
    async (query: string) => {
      if (!scope) return;
      const reqId = ++searchReqRef.current;
      signalsReqRef.current += 1;

      setState((prev) => ({ ...prev, signalsLoading: true, signalsError: null }));

      try {
        const outcome = await searchFsdSignalCatalog(scope, query, fetchSignalPage, {
          isCancelled: () => searchReqRef.current !== reqId,
        });
        if (searchReqRef.current !== reqId) return;

        const base = outcome.basePage;
        if (base && !matchesScope(scopeRef.current, base)) return;

        const displayPage: MasterFsdSignalExplorerPageDtoV1 | null = base
          ? {
              ...base,
              items: outcome.query ? outcome.items : base.items,
              aggregates: {
                ...base.aggregates,
                logicalSignalsReturned: outcome.query ? outcome.items.length : base.aggregates.logicalSignalsReturned,
              },
              page: outcome.query
                ? { limit: FSD_SIGNAL_PAGE_LIMIT, nextCursor: null, hasMore: false }
                : base.page,
            }
          : null;

        setState((prev) => ({
          ...prev,
          signals: displayPage,
          signalsSearch: outcome,
          signalsLoading: false,
          signalsError: null,
        }));
      } catch (e) {
        if (searchReqRef.current !== reqId) return;
        setState((prev) => ({
          ...prev,
          signalsLoading: false,
          signalsError: errorMessage(e),
        }));
      }
    },
    [scope],
  );

  const loadRuns = useCallback(
    async (params?: { cursor?: string | null; append?: boolean }) => {
      if (!scope) return;
      const reqId = ++runsReqRef.current;

      setState((prev) => ({ ...prev, runsLoading: true, runsError: null }));
      try {
        const page = await api.admin.masterIntelligenceVsi.fsd.runs(
          scope.orgId,
          scope.vehicleId,
          scope.providerSourceLinkId,
          { limit: 25, cursor: params?.cursor ?? null },
        );
        if (runsReqRef.current !== reqId) return;
        if (!matchesScope(scopeRef.current, page)) return;
        setState((prev) => {
          const merged =
            params?.append && prev.runs
              ? { ...page, items: [...prev.runs.items, ...page.items] }
              : page;
          return { ...prev, runs: merged, runsLoading: false, runsError: null };
        });
      } catch (e) {
        if (runsReqRef.current !== reqId) return;
        setState((prev) => ({
          ...prev,
          runsLoading: false,
          runsError: errorMessage(e),
        }));
      }
    },
    [scope],
  );

  const loadInspector = useCallback(
    async (runId: string) => {
      if (!scope) return;
      const reqId = ++inspectorReqRef.current;

      setState((prev) => ({
        ...prev,
        selectedRunId: runId,
        inspectorLoading: true,
        inspectorError: null,
        inspector: null,
      }));
      try {
        const inspector = await api.admin.masterIntelligenceVsi.fsd.runInspector(
          scope.orgId,
          scope.vehicleId,
          scope.providerSourceLinkId,
          runId,
        );
        if (inspectorReqRef.current !== reqId) return;
        if (!matchesScope(scopeRef.current, inspector)) return;
        if (inspector.runId !== runId) return;
        setState((prev) => {
          if (prev.selectedRunId !== runId) return prev;
          return {
            ...prev,
            inspector,
            inspectorLoading: false,
            inspectorError: null,
          };
        });
      } catch (e) {
        if (inspectorReqRef.current !== reqId) return;
        setState((prev) => {
          if (prev.selectedRunId !== runId) return prev;
          return {
            ...prev,
            inspector: null,
            inspectorLoading: false,
            inspectorError: errorMessage(e),
          };
        });
      }
    },
    [scope],
  );

  const refreshSummary = useCallback(async () => {
    if (!scope) return;
    const reqId = ++summaryReqRef.current;
    setState((prev) => ({ ...prev, summaryLoading: true, summaryError: null }));
    try {
      const summary = await api.admin.masterIntelligenceVsi.fsd.summary(
        scope.orgId,
        scope.vehicleId,
        scope.providerSourceLinkId,
      );
      if (summaryReqRef.current !== reqId) return;
      if (!matchesScope(scopeRef.current, summary)) return;
      setState((prev) => ({ ...prev, summary, summaryLoading: false, summaryError: null }));
    } catch (e) {
      if (summaryReqRef.current !== reqId) return;
      setState((prev) => ({
        ...prev,
        summaryLoading: false,
        summaryError: errorMessage(e),
      }));
    }
  }, [scope]);

  return {
    ...state,
    scope,
    scopeKey,
    loadSignalsPage,
    searchSignals,
    loadRuns,
    loadInspector,
    refreshSummary,
  };
}
