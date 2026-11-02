import { useContext } from 'react';
import {
  MasterIntelligenceReactContext,
  type MasterIntelligenceContextValue,
} from './master-intelligence-context-core';

export function useMasterIntelligenceContext(): MasterIntelligenceContextValue {
  const ctx = useContext(MasterIntelligenceReactContext);
  if (!ctx) {
    throw new Error('useMasterIntelligenceContext requires MasterIntelligenceContextProvider');
  }
  return ctx;
}

export function useOptionalMasterIntelligenceContext(): MasterIntelligenceContextValue | null {
  return useContext(MasterIntelligenceReactContext);
}
