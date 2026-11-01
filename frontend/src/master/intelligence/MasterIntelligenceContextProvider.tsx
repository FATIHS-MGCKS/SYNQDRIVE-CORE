import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MasterView } from '../navigation/master-nav.types';
import {
  MasterIntelligenceReactContext,
  type MasterIntelligenceContextValue,
} from './master-intelligence-context-core';
import {
  crossLinkHygieneOptionsFromPatch,
  normalizeContextForIntelligenceView,
} from './master-intelligence-context-hygiene.util';
import {
  mergeMasterIntelligenceContext,
  navigateMasterIntelligenceCrossLink,
  parseMasterIntelligenceContext,
  pushMasterIntelligenceUrl,
  buildMasterIntelligenceSearch,
} from './master-intelligence-url';
import type {
  MasterIntelligenceContextState,
  MasterIntelligenceCrossLinkTarget,
} from './master-intelligence.types';
import { EMPTY_MASTER_INTELLIGENCE_CONTEXT } from './master-intelligence.types';

function readContextFromLocation(view: MasterView): MasterIntelligenceContextState {
  if (typeof window === 'undefined') return EMPTY_MASTER_INTELLIGENCE_CONTEXT;
  const parsed = parseMasterIntelligenceContext(window.location.search);
  if (view === 'vsi-intelligence' || view === 'apds-intelligence') {
    return normalizeContextForIntelligenceView(view, parsed);
  }
  return parsed;
}

export function MasterIntelligenceContextProvider({
  view,
  children,
}: {
  view: MasterView;
  children: ReactNode;
}) {
  const [context, setContext] = useState<MasterIntelligenceContextState>(() =>
    readContextFromLocation(view),
  );

  useEffect(() => {
    const onPopState = () => setContext(readContextFromLocation(view));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [view]);

  useEffect(() => {
    if (view !== 'vsi-intelligence' && view !== 'apds-intelligence') return;
    const raw = parseMasterIntelligenceContext(window.location.search);
    const normalized = normalizeContextForIntelligenceView(view, raw);
    if (buildMasterIntelligenceSearch(view, raw) !== buildMasterIntelligenceSearch(view, normalized)) {
      pushMasterIntelligenceUrl(view, normalized, { replace: true });
    }
  }, [view]);

  const navigateCrossLink = useCallback(
    (
      target: MasterIntelligenceCrossLinkTarget,
      patch?: Partial<MasterIntelligenceContextState>,
      opts?: { replace?: boolean },
    ) => {
      const merged = mergeMasterIntelligenceContext(context, patch ?? {});
      const hygiene = crossLinkHygieneOptionsFromPatch(patch);
      navigateMasterIntelligenceCrossLink(target, merged, { ...opts, hygiene });
      setContext(readContextFromLocation(view));
    },
    [context, view],
  );

  const setContextInUrl = useCallback(
    (patch: Partial<MasterIntelligenceContextState>, opts?: { replace?: boolean }) => {
      const merged = mergeMasterIntelligenceContext(context, patch);
      pushMasterIntelligenceUrl(view, merged, opts);
      setContext(readContextFromLocation(view));
    },
    [context, view],
  );

  const value = useMemo<MasterIntelligenceContextValue>(
    () => ({ view, context, navigateCrossLink, setContextInUrl }),
    [view, context, navigateCrossLink, setContextInUrl],
  );

  return (
    <MasterIntelligenceReactContext.Provider value={value}>{children}</MasterIntelligenceReactContext.Provider>
  );
}
