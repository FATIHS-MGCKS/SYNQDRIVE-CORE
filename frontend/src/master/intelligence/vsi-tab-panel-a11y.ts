export const VSI_INTELLIGENCE_TAB_PREFIX = 'vsi-intelligence';

export function vsiIntelligenceTabPanelProps(tabId: string) {
  return {
    id: `${VSI_INTELLIGENCE_TAB_PREFIX}-panel-${tabId}`,
    role: 'tabpanel' as const,
    'aria-labelledby': `${VSI_INTELLIGENCE_TAB_PREFIX}-tab-control-${tabId}`,
  };
}
