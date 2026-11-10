import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type {
  MasterFsdRunHistoryPageDtoV1,
  MasterFsdRunInspectorDtoV1,
  MasterFsdSignalExplorerPageDtoV1,
  MasterFsdSummaryDtoV1,
} from './vsi-master-fsd-read-api.types';

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
  runs: null,
  runsLoading: false,
  runsError: null,
  inspector: null,
  inspectorLoading: false,
  inspectorError: null,
  selectedRunId: null,
};

export function useVsiMasterFsdReadData(input: {
  orgId: string | null;
  vehicleId: string | null;
  providerSourceLinkId: string | null;
}) {
  const { orgId, vehicleId, providerSourceLinkId } = input;
  const [state, setState] = useState<VsiMasterFsdReadState>(emptyFsd);
  const generationRef = useRef(0);
  const scopeRef = useRef<VsiFsdReadScope | null>(null);

  const reset = useCallback(() => {
    generationRef.current += 1;
    scopeRef.current = null;
    setState({ ...emptyFsd });
  }, []);

  const scope: VsiFsdReadScope | null =
    orgId && vehicleId && providerSourceLinkId
      ? { orgId, vehicleId, providerSourceLinkId }
      : null;

  useEffect(() => {
    if (!scope) {
      reset();
      return;
    }
    const generation = ++generationRef.current;
    scopeRef.current = scope;
    const isCurrent = () => generationRef.current === generation;

    setState((prev) => ({
      ...prev,
      summaryLoading: true,
      summaryError: null,
      signals: null,
      signalsError: null,
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
        if (!isCurrent() || !matchesScope(scopeRef.current, summary)) return;
        setState((prev) => ({
          ...prev,
          summary,
          summaryLoading: false,
          summaryError: null,
        }));
      } catch (e) {
        if (!isCurrent()) return;
        setState((prev) => ({
          ...prev,
          summary: null,
          summaryLoading: false,
          summaryError: errorMessage(e),
        }));
      }
    })();
  }, [scope?.orgId, scope?.vehicleId, scope?.providerSourceLinkId, reset, scope]);

  const loadSignals = useCallback(
    async (params?: { cursor?: string | null; q?: string | null; append?: boolean }) => {
      if (!scope) return;
      const generation = generationRef.current;
      const isCurrent = () => generationRef.current === generation;

      setState((prev) => ({ ...prev, signalsLoading: true, signalsError: null }));
      try {
        const page = await api.admin.masterIntelligenceVsi.fsd.signals(
          scope.orgId,
          scope.vehicleId,
          scope.providerSourceLinkId,
          { limit: 50, cursor: params?.cursor ?? null, q: params?.q ?? null },
        );
        if (!isCurrent() || !matchesScope(scopeRef.current, page)) return;
        setState((prev) => {
          const merged =
            params?.append && prev.signals
              ? {
                  ...page,
                  items: [...prev.signals.items, ...page.items],
                }
              : page;
          return { ...prev, signals: merged, signalsLoading: false, signalsError: null };
        });
      } catch (e) {
        if (!isCurrent()) return;
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
      const generation = generationRef.current;
      const isCurrent = () => generationRef.current === generation;

      setState((prev) => ({ ...prev, runsLoading: true, runsError: null }));
      try {
        const page = await api.admin.masterIntelligenceVsi.fsd.runs(
          scope.orgId,
          scope.vehicleId,
          scope.providerSourceLinkId,
          { limit: 25, cursor: params?.cursor ?? null },
        );
        if (!isCurrent() || !matchesScope(scopeRef.current, page)) return;
        setState((prev) => {
          const merged =
            params?.append && prev.runs
              ? { ...page, items: [...prev.runs.items, ...page.items] }
              : page;
          return { ...prev, runs: merged, runsLoading: false, runsError: null };
        });
      } catch (e) {
        if (!isCurrent()) return;
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
      const generation = generationRef.current;
      const isCurrent = () => generationRef.current === generation;

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
        if (!isCurrent() || !matchesScope(scopeRef.current, inspector)) return;
        setState((prev) => ({
          ...prev,
          inspector,
          inspectorLoading: false,
          inspectorError: null,
        }));
      } catch (e) {
        if (!isCurrent()) return;
        setState((prev) => ({
          ...prev,
          inspector: null,
          inspectorLoading: false,
          inspectorError: errorMessage(e),
        }));
      }
    },
    [scope],
  );

  const refreshSummary = useCallback(async () => {
    if (!scope) return;
    const generation = ++generationRef.current;
    scopeRef.current = scope;
    const isCurrent = () => generationRef.current === generation;
    setState((prev) => ({ ...prev, summaryLoading: true, summaryError: null }));
    try {
      const summary = await api.admin.masterIntelligenceVsi.fsd.summary(
        scope.orgId,
        scope.vehicleId,
        scope.providerSourceLinkId,
      );
      if (!isCurrent() || !matchesScope(scopeRef.current, summary)) return;
      setState((prev) => ({ ...prev, summary, summaryLoading: false, summaryError: null }));
    } catch (e) {
      if (!isCurrent()) return;
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
    loadSignals,
    loadRuns,
    loadInspector,
    refreshSummary,
    reset,
  };
}
