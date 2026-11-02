/**
 * Legacy AI tire spec field aliases (pre–tire_v2 agents, registration payloads).
 * Used on read and before normalize on write — does not mutate stored JSON.
 */
export function mapAiTireSpecLegacyAliases(
  raw: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    ...raw,
    legalMinimumMm: raw.legalMinimumMm ?? raw.legalMinTreadDepthMm,
    recommendedReplacementDepthMm:
      raw.recommendedReplacementDepthMm ?? raw.practicalReplacementDepthMm,
    operationalReplacementDepthMm:
      raw.operationalReplacementDepthMm ?? raw.winterRecommendedMinDepthMm,
  };
}
