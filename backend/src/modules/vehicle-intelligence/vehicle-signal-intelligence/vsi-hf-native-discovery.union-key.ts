import { VSI_DISCOVERY_CH_MAX_INVENTORY_SIGNALS } from './vsi-clickhouse-discovery-safety.contract';

/**
 * Deterministic union-key selection for HF evaluation (persisted snapshot inventory ∪ CH names).
 * Persisted native names are prioritized when the 32-signal cap truncates the union.
 */
export function selectUnionNativeSignalNamesForHfEvaluation(input: {
  persistedNativeNames: readonly string[];
  clickHouseNativeNames: readonly string[];
  maxSignals?: number;
}): { selected: readonly string[]; omitted: readonly string[] } {
  const maxSignals = input.maxSignals ?? VSI_DISCOVERY_CH_MAX_INVENTORY_SIGNALS;
  const persisted = [...new Set(input.persistedNativeNames)].sort((a, b) =>
    a.localeCompare(b),
  );
  const persistedSet = new Set(persisted);
  const chOnly = [...new Set(input.clickHouseNativeNames)]
    .filter((name) => !persistedSet.has(name))
    .sort((a, b) => a.localeCompare(b));
  const merged = [...persisted, ...chOnly];
  return {
    selected: merged.slice(0, maxSignals),
    omitted: merged.slice(maxSignals),
  };
}
