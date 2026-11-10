import type { VsiIntelligenceTab } from './vsi-ledger-url.types';

/** Primary six VSI 2.0 sections plus canonical ledger; `revisions` is a legacy URL alias for `runs`. */
export type VsiIntelligenceRenderTab = Exclude<VsiIntelligenceTab, 'revisions'>;

export function resolveVsiTabForRender(tab: VsiIntelligenceTab): VsiIntelligenceRenderTab {
  return tab === 'revisions' ? 'runs' : tab;
}

export function isLegacyRevisionsTab(tab: VsiIntelligenceTab): boolean {
  return tab === 'revisions';
}
