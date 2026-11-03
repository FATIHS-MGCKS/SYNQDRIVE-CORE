import { VSI_DISCOVERY_CH_MAX_INVENTORY_SIGNALS } from './vsi-clickhouse-discovery-safety.contract';
import { selectUnionNativeSignalNamesForHfEvaluation } from './vsi-hf-native-discovery.union-key';

describe('selectUnionNativeSignalNamesForHfEvaluation', () => {
  it('prioritizes persisted native names when union exceeds cap', () => {
    const persisted = Array.from({ length: 35 }, (_, i) => `persisted_${String(i).padStart(2, '0')}`);
    const chOnly = ['ch_only_a', 'ch_only_b'];
    const { selected, omitted } = selectUnionNativeSignalNamesForHfEvaluation({
      persistedNativeNames: persisted,
      clickHouseNativeNames: chOnly,
      maxSignals: VSI_DISCOVERY_CH_MAX_INVENTORY_SIGNALS,
    });
    expect(selected).toHaveLength(VSI_DISCOVERY_CH_MAX_INVENTORY_SIGNALS);
    expect(selected.slice(0, 32)).toEqual(persisted.slice(0, 32));
    expect(omitted).toEqual([...persisted.slice(32), ...chOnly]);
  });

  it('dedupes persisted and CH names deterministically', () => {
    const { selected, omitted } = selectUnionNativeSignalNamesForHfEvaluation({
      persistedNativeNames: ['speed', 'rpm'],
      clickHouseNativeNames: ['rpm', 'battery'],
    });
    expect(selected).toEqual(['rpm', 'speed', 'battery']);
    expect(omitted).toEqual([]);
  });
});
