import {
  VsiEvidenceAxisEvaluationState,
  VsiEvidenceAxisNotEvaluatedReason,
  type VsiEvidenceAxisEvaluationV1,
} from './vsi-native-signal-discovery-evaluation-state';
import type {
  VsiNativeDiscoveryHistoricalAxisV1,
  VsiNativeDiscoverySnapshotAxisV1,
  VsiNativeSignalDiscoveryInventoryEntryV1,
  VsiNativeSignalDiscoveryInventoryV1,
} from './vsi-native-signal-discovery-inventory.contract';
import { truncateNativeSignalDiscoveryInventory } from './vsi-native-signal-discovery-inventory.contract';

function isP1bSnapshotHistoricalPlaceholder(historical: VsiNativeDiscoveryHistoricalAxisV1): boolean {
  return (
    historical.evaluation.state === VsiEvidenceAxisEvaluationState.NOT_EVALUATED &&
    historical.evaluation.notEvaluatedReason ===
      VsiEvidenceAxisNotEvaluatedReason.SNAPSHOT_EXTRACTOR_NOT_RUN
  );
}

function isP1bSnapshotAxisPlaceholder(snapshot: VsiNativeDiscoverySnapshotAxisV1): boolean {
  return (
    snapshot.evaluation.state === VsiEvidenceAxisEvaluationState.NOT_EVALUATED &&
    snapshot.evaluation.notEvaluatedReason ===
      VsiEvidenceAxisNotEvaluatedReason.SNAPSHOT_EXTRACTOR_NOT_RUN
  );
}

function preferHistoricalAxis(
  persisted: VsiNativeDiscoveryHistoricalAxisV1,
  incoming: VsiNativeDiscoveryHistoricalAxisV1,
): VsiNativeDiscoveryHistoricalAxisV1 {
  if (isP1bSnapshotHistoricalPlaceholder(incoming)) {
    return persisted;
  }
  if (isP1bSnapshotHistoricalPlaceholder(persisted)) {
    return incoming;
  }
  if (
    incoming.evaluation.state === VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED &&
    persisted.evaluation.state !== VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED
  ) {
    return incoming;
  }
  if (
    persisted.evaluation.state === VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED &&
    incoming.evaluation.state !== VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED
  ) {
    return persisted;
  }
  const persistedCount = persisted.sampleMetadata.pointCount ?? 0;
  const incomingCount = incoming.sampleMetadata.pointCount ?? 0;
  if (incomingCount > persistedCount) {
    return incoming;
  }
  if (incomingCount < persistedCount) {
    return persisted;
  }
  return incoming;
}

function preferSnapshotAxis(
  persisted: VsiNativeDiscoverySnapshotAxisV1,
  incoming: VsiNativeDiscoverySnapshotAxisV1,
): VsiNativeDiscoverySnapshotAxisV1 {
  if (isP1bSnapshotAxisPlaceholder(incoming)) {
    return persisted;
  }
  if (isP1bSnapshotAxisPlaceholder(persisted)) {
    return incoming;
  }
  if (
    incoming.evaluation.state === VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED &&
    persisted.evaluation.state !== VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED
  ) {
    return incoming;
  }
  if (
    persisted.evaluation.state === VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED &&
    incoming.evaluation.state !== VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED
  ) {
    return persisted;
  }
  return incoming;
}

export function mergeNativeDiscoveryInventoryEntryAxes(
  persisted: VsiNativeSignalDiscoveryInventoryEntryV1,
  incoming: VsiNativeSignalDiscoveryInventoryEntryV1,
): VsiNativeSignalDiscoveryInventoryEntryV1 {
  return {
    providerNativeSignalName: incoming.providerNativeSignalName,
    aliasVerdict: incoming.aliasVerdict ?? persisted.aliasVerdict,
    canonicalSignalKey: incoming.canonicalSignalKey ?? persisted.canonicalSignalKey,
    snapshot: preferSnapshotAxis(persisted.snapshot, incoming.snapshot),
    historical: preferHistoricalAxis(persisted.historical, incoming.historical),
    ingestionLimitations: [
      ...new Set([...persisted.ingestionLimitations, ...incoming.ingestionLimitations]),
    ],
  };
}

export function mergeNativeDiscoveryInventoryEntries(
  persisted: VsiNativeSignalDiscoveryInventoryV1,
  incoming: VsiNativeSignalDiscoveryInventoryV1,
): VsiNativeSignalDiscoveryInventoryV1 {
  const byName = new Map<string, VsiNativeSignalDiscoveryInventoryEntryV1>();
  for (const entry of persisted.entries) {
    byName.set(entry.providerNativeSignalName, entry);
  }
  for (const entry of incoming.entries) {
    const prev = byName.get(entry.providerNativeSignalName);
    byName.set(
      entry.providerNativeSignalName,
      prev ? mergeNativeDiscoveryInventoryEntryAxes(prev, entry) : entry,
    );
  }
  const mergedLimitations = new Set([
    ...persisted.profileLimitations,
    ...incoming.profileLimitations,
  ]);
  return truncateNativeSignalDiscoveryInventory({
    ...incoming,
    scope: incoming.scope,
    evaluatedAt: incoming.evaluatedAt,
    entries: [...byName.values()].sort((a, b) =>
      a.providerNativeSignalName.localeCompare(b.providerNativeSignalName),
    ),
    profileLimitations: [...mergedLimitations],
  });
}
