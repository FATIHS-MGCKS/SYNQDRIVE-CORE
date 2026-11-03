import {
  VsiEvidenceAxisEvaluationState,
  VsiEvidenceAxisNotEvaluatedReason,
  isHistoricalHfRefreshFailureEvaluation,
  isHistoricalHfReplaceablePlaceholder,
  type VsiEvidenceAxisEvaluationV1,
} from './vsi-native-signal-discovery-evaluation-state';
import type {
  VsiNativeDiscoveryHistoricalAxisV1,
  VsiNativeDiscoverySnapshotAxisV1,
  VsiNativeSignalDiscoveryInventoryEntryV1,
  VsiNativeSignalDiscoveryInventoryV1,
} from './vsi-native-signal-discovery-inventory.contract';
import { truncateNativeSignalDiscoveryInventory } from './vsi-native-signal-discovery-inventory.contract';
import { stableNativeDiscoveryInventoryJson } from './vsi-native-discovery-inventory.db.util';

function isP1bSnapshotHistoricalPlaceholder(historical: VsiNativeDiscoveryHistoricalAxisV1): boolean {
  return isHistoricalHfReplaceablePlaceholder(historical.evaluation);
}

function isP1bSnapshotAxisPlaceholder(snapshot: VsiNativeDiscoverySnapshotAxisV1): boolean {
  return (
    snapshot.evaluation.state === VsiEvidenceAxisEvaluationState.NOT_EVALUATED &&
    snapshot.evaluation.notEvaluatedReason ===
      VsiEvidenceAxisNotEvaluatedReason.SNAPSHOT_EXTRACTOR_NOT_RUN
  );
}

function historicalWindowEndMs(axis: VsiNativeDiscoveryHistoricalAxisV1): number {
  const end = axis.sampleMetadata.windowEndAt;
  if (end) {
    const parsed = Date.parse(end);
    if (Number.isFinite(parsed)) return parsed;
  }
  const start = axis.sampleMetadata.windowStartAt;
  if (start) {
    const parsed = Date.parse(start);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function isCurrentWindowEvaluatedState(evaluation: VsiEvidenceAxisEvaluationV1): boolean {
  return (
    evaluation.state === VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED ||
    evaluation.state === VsiEvidenceAxisEvaluationState.EVALUATED_NOT_OBSERVED
  );
}

function mergeHistoricalObservationTimestamps(
  a: VsiNativeDiscoveryHistoricalAxisV1,
  b: VsiNativeDiscoveryHistoricalAxisV1,
): Pick<VsiNativeDiscoveryHistoricalAxisV1, 'firstSeenAt' | 'lastSeenAt'> {
  const firstCandidates = [a.firstSeenAt, b.firstSeenAt].filter(
    (v): v is string => v != null,
  );
  const lastCandidates = [a.lastSeenAt, b.lastSeenAt].filter((v): v is string => v != null);
  return {
    firstSeenAt:
      firstCandidates.length === 0
        ? null
        : firstCandidates.reduce((min, cur) => (cur < min ? cur : min)),
    lastSeenAt:
      lastCandidates.length === 0
        ? null
        : lastCandidates.reduce((max, cur) => (cur > max ? cur : max)),
  };
}

function pickHistoricalEvaluationAxis(
  persisted: VsiNativeDiscoveryHistoricalAxisV1,
  incoming: VsiNativeDiscoveryHistoricalAxisV1,
): VsiNativeDiscoveryHistoricalAxisV1 {
  const persistedEnd = historicalWindowEndMs(persisted);
  const incomingEnd = historicalWindowEndMs(incoming);

  if (incomingEnd > persistedEnd) {
    if (
      isHistoricalHfRefreshFailureEvaluation(incoming.evaluation) &&
      persisted.evaluation.state === VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED
    ) {
      return persisted;
    }
    return incoming;
  }
  if (incomingEnd < persistedEnd) {
    return persisted;
  }

  const incomingEvaluated = isCurrentWindowEvaluatedState(incoming.evaluation);
  const persistedEvaluated = isCurrentWindowEvaluatedState(persisted.evaluation);

  if (incomingEvaluated && !persistedEvaluated) {
    return incoming;
  }
  if (persistedEvaluated && !incomingEvaluated) {
    return persisted;
  }

  if (
    incoming.evaluation.state === VsiEvidenceAxisEvaluationState.EVALUATED_NOT_OBSERVED &&
    persisted.evaluation.state === VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED
  ) {
    return incoming;
  }
  if (
    persisted.evaluation.state === VsiEvidenceAxisEvaluationState.EVALUATED_NOT_OBSERVED &&
    incoming.evaluation.state === VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED
  ) {
    return persisted;
  }

  const persistedCount = persisted.sampleMetadata.pointCount ?? 0;
  const incomingCount = incoming.sampleMetadata.pointCount ?? 0;
  if (incomingCount !== persistedCount) {
    return incomingCount > persistedCount ? incoming : persisted;
  }
  return incoming;
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

  const evaluationAxis = pickHistoricalEvaluationAxis(persisted, incoming);
  const timestamps = mergeHistoricalObservationTimestamps(persisted, incoming);

  return {
    ...evaluationAxis,
    ...timestamps,
    sampleMetadata: evaluationAxis.sampleMetadata,
  };
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
  const historical = preferHistoricalAxis(persisted.historical, incoming.historical);
  const retainedObservedDespiteRefreshFailure =
    persisted.historical.evaluation.state === VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED &&
    isHistoricalHfRefreshFailureEvaluation(incoming.historical.evaluation) &&
    historical.evaluation.state === VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED;
  const refreshFailureLimitation = retainedObservedDespiteRefreshFailure
    ? (incoming.historical.evaluation.notEvaluatedReason ?? '').trim()
    : '';

  return {
    providerNativeSignalName: incoming.providerNativeSignalName,
    aliasVerdict: incoming.aliasVerdict ?? persisted.aliasVerdict,
    canonicalSignalKey: incoming.canonicalSignalKey ?? persisted.canonicalSignalKey,
    snapshot: preferSnapshotAxis(persisted.snapshot, incoming.snapshot),
    historical,
    ingestionLimitations: [
      ...new Set([
        ...persisted.ingestionLimitations,
        ...incoming.ingestionLimitations,
        ...(refreshFailureLimitation ? [refreshFailureLimitation] : []),
      ]),
    ],
  };
}

function maxEvaluatedAtIso(a: string, b: string): string {
  const aMs = Date.parse(a);
  const bMs = Date.parse(b);
  if (!Number.isFinite(aMs)) return b;
  if (!Number.isFinite(bMs)) return a;
  return aMs >= bMs ? a : b;
}

export function mergeNativeDiscoveryInventoryEntries(
  persisted: VsiNativeSignalDiscoveryInventoryV1,
  incoming: VsiNativeSignalDiscoveryInventoryV1,
): VsiNativeSignalDiscoveryInventoryV1 {
  if (stableNativeDiscoveryInventoryJson(persisted) === stableNativeDiscoveryInventoryJson(incoming)) {
    return persisted;
  }
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
    evaluatedAt: maxEvaluatedAtIso(persisted.evaluatedAt, incoming.evaluatedAt),
    entries: [...byName.values()].sort((a, b) =>
      a.providerNativeSignalName.localeCompare(b.providerNativeSignalName),
    ),
    profileLimitations: [...mergedLimitations],
  });
}

/** @internal exported for unit tests */
export const __mergeHistoricalAxisTestExports = {
  preferHistoricalAxis,
  historicalWindowEndMs,
  pickHistoricalEvaluationAxis,
};
