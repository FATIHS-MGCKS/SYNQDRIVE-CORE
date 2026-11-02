import { createContext } from 'react';
import type { MasterView } from '../navigation/master-nav.types';
import type {
  MasterIntelligenceContextState,
  MasterIntelligenceCrossLinkTarget,
} from './master-intelligence.types';

export type MasterIntelligenceContextValue = {
  view: MasterView;
  context: MasterIntelligenceContextState;
  navigateCrossLink: (
    target: MasterIntelligenceCrossLinkTarget,
    patch?: Partial<MasterIntelligenceContextState>,
    opts?: { replace?: boolean },
  ) => void;
  setContextInUrl: (
    patch: Partial<MasterIntelligenceContextState>,
    opts?: { replace?: boolean },
  ) => void;
};

export const MasterIntelligenceReactContext = createContext<MasterIntelligenceContextValue | null>(
  null,
);
