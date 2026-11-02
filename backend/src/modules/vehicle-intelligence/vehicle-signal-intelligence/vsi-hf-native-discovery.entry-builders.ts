import { VsiEvidenceAxisEvaluationState, VsiEvidenceAxisNotEvaluatedReason } from './vsi-native-signal-discovery-evaluation-state';
import type { VsiNativeDiscoverySnapshotAxisV1 } from './vsi-native-signal-discovery-inventory.contract';

/** P1b placeholder — historical axis only; snapshot merge preserves persisted snapshot. */
export function buildHistoricalNotEvaluatedP1bPlaceholderSnapshotAxis(): VsiNativeDiscoverySnapshotAxisV1 {
  return {
    evaluation: {
      state: VsiEvidenceAxisEvaluationState.NOT_EVALUATED,
      notEvaluatedReason: VsiEvidenceAxisNotEvaluatedReason.SNAPSHOT_EXTRACTOR_NOT_RUN,
    },
    lastObservedAt: null,
    lastSourceTimestamp: null,
  };
}
