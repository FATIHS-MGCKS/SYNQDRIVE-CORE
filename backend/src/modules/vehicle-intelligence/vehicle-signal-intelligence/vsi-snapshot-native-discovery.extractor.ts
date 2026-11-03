/**
 * Universal snapshot/VLS native signal discovery (P1b).
 *
 * Top-level DIMO rawPayloadJson key walk — bounded, no raw values persisted.
 */

import { evaluateCanonicalProviderNativeAlias, VSI_CANONICAL_SIGNAL_DEFINITIONS, type VsiCanonicalSignalKey } from './canonical-signal-keys';
import type { VsiDeclaredCatalogSnapshot } from './vsi-declared-catalog.resolver';
import {
  VsiProviderCatalogStatus,
} from './vehicle-signal-evidence.contract';
import {
  emptyNativeSignalDiscoveryInventory,
  truncateNativeSignalDiscoveryInventory,
  VsiNativeDiscoveryIngestionLimitation,
  type VsiNativeSignalDiscoveryInventoryEntryV1,
  type VsiNativeSignalDiscoveryInventoryScopeV1,
  type VsiNativeSignalDiscoveryInventoryV1,
} from './vsi-native-signal-discovery-inventory.contract';
import {
  VsiEvidenceAxisEvaluationState,
  VsiEvidenceAxisNotEvaluatedReason,
  type VsiEvidenceAxisEvaluationV1,
} from './vsi-native-signal-discovery-evaluation-state';
import {
  readRawScalarSignal,
  resolveSignalTimestampEvidence,
} from './vsi-raw-payload-signals.util';
import type { VsiLatestStateSnapshot } from './vsi-readonly-composer.types';

/** Bounded top-level key scan (presence-only inventory). */
export const VSI_SNAPSHOT_NATIVE_DISCOVERY_MAX_PAYLOAD_KEYS = 512;

const SKIP_NON_SIGNAL_ROOT_KEYS = new Set(['aftermarketDevice', 'syntheticDevice']);

export function isDimoRawPayloadSignalNode(node: unknown): boolean {
  return (
    node != null &&
    typeof node === 'object' &&
    !Array.isArray(node) &&
    Object.prototype.hasOwnProperty.call(node, 'value')
  );
}

export function listDimoNativeSignalKeysFromRawPayload(
  raw: unknown,
  maxKeys: number = VSI_SNAPSHOT_NATIVE_DISCOVERY_MAX_PAYLOAD_KEYS,
): { keys: readonly string[]; scanTruncated: boolean } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { keys: [], scanTruncated: false };
  }
  const root = raw as Record<string, unknown>;
  const sorted = Object.keys(root)
    .filter((name) => !SKIP_NON_SIGNAL_ROOT_KEYS.has(name))
    .filter((name) => isDimoRawPayloadSignalNode(root[name]))
    .sort((a, b) => a.localeCompare(b));
  const scanTruncated = sorted.length > maxKeys;
  return { keys: sorted.slice(0, maxKeys), scanTruncated };
}

function resolveNativeAliasVerdictForDiscovery(nativeName: string): {
  verdict: 'EXPLICIT_PRIMARY_ALIAS' | 'ALIAS_CONFLICT_UNRESOLVED' | 'UNKNOWN_SIGNAL';
  canonicalSignalKey: string | null;
} {
  let matched: VsiCanonicalSignalKey | null = null;
  for (const key of Object.keys(VSI_CANONICAL_SIGNAL_DEFINITIONS) as VsiCanonicalSignalKey[]) {
    const verdict = evaluateCanonicalProviderNativeAlias(key, nativeName);
    if (verdict === 'EXPLICIT_PRIMARY_ALIAS') {
      if (matched && matched !== key) {
        return { verdict: 'ALIAS_CONFLICT_UNRESOLVED', canonicalSignalKey: null };
      }
      matched = key;
    }
  }
  if (matched) {
    return { verdict: 'EXPLICIT_PRIMARY_ALIAS', canonicalSignalKey: matched };
  }
  return { verdict: 'UNKNOWN_SIGNAL', canonicalSignalKey: null };
}

function declaredCatalogIngestionLimitation(
  declaredCatalog: VsiDeclaredCatalogSnapshot,
  nativeName: string,
): string {
  const status = declaredCatalog.byNativeSignalName.get(nativeName);
  if (status === VsiProviderCatalogStatus.LISTED) {
    return 'DECLARED_CATALOG_LISTED';
  }
  if (status === VsiProviderCatalogStatus.NOT_LISTED) {
    return 'DECLARED_CATALOG_NOT_LISTED';
  }
  return 'DECLARED_CATALOG_UNKNOWN';
}

function buildHistoricalNotEvaluatedP1b(): {
  evaluation: VsiEvidenceAxisEvaluationV1;
  firstSeenAt: null;
  lastSeenAt: null;
  sampleMetadata: VsiNativeSignalDiscoveryInventoryEntryV1['historical']['sampleMetadata'];
} {
  return {
    evaluation: {
      state: VsiEvidenceAxisEvaluationState.NOT_EVALUATED,
      notEvaluatedReason: VsiEvidenceAxisNotEvaluatedReason.HF_HISTORICAL_NOT_ATTEMPTED,
    },
    firstSeenAt: null,
    lastSeenAt: null,
    sampleMetadata: {
      windowStartAt: null,
      windowEndAt: null,
      pointCount: null,
      tripCountWithPoints: null,
      readCapApplied: null,
    },
  };
}

function evaluateSnapshotAxisForNativeKey(input: {
  raw: unknown;
  nativeName: string;
  projectionAsOfMs: number;
  stateAttributed: boolean;
}): Pick<
  VsiNativeSignalDiscoveryInventoryEntryV1,
  'snapshot' | 'ingestionLimitations'
> {
  const limitations: string[] = [];
  if (!input.stateAttributed) {
    return {
      snapshot: {
        evaluation: {
          state: VsiEvidenceAxisEvaluationState.NOT_EVALUATED,
          notEvaluatedReason: VsiEvidenceAxisNotEvaluatedReason.LINK_ATTRIBUTION_AMBIGUOUS,
        },
        lastObservedAt: null,
        lastSourceTimestamp: null,
      },
      ingestionLimitations: limitations,
    };
  }

  const { keyPresent, value, sourceMs } = readRawScalarSignal(input.raw, input.nativeName);
  if (!keyPresent) {
    return {
      snapshot: {
        evaluation: {
          state: VsiEvidenceAxisEvaluationState.NOT_EVALUATED,
          notEvaluatedReason: VsiEvidenceAxisNotEvaluatedReason.SNAPSHOT_EXTRACTOR_NOT_RUN,
        },
        lastObservedAt: null,
        lastSourceTimestamp: null,
      },
      ingestionLimitations: limitations,
    };
  }

  const tsEvidence = resolveSignalTimestampEvidence({
    signalSourceMs: sourceMs,
    projectionAsOfMs: input.projectionAsOfMs,
  });
  limitations.push(...tsEvidence.limitations);

  if (value == null || !Number.isFinite(value)) {
    return {
      snapshot: {
        evaluation: { state: VsiEvidenceAxisEvaluationState.EVALUATED_NOT_OBSERVED },
        lastObservedAt: null,
        lastSourceTimestamp: tsEvidence.source?.toISOString() ?? null,
      },
      ingestionLimitations: limitations,
    };
  }

  if (tsEvidence.source == null && tsEvidence.observed == null) {
    if (limitations.includes('FUTURE_SIGNAL_TIMESTAMP_REJECTED')) {
      return {
        snapshot: {
          evaluation: { state: VsiEvidenceAxisEvaluationState.EVALUATED_NOT_OBSERVED },
          lastObservedAt: null,
          lastSourceTimestamp: null,
        },
        ingestionLimitations: limitations,
      };
    }
    return {
      snapshot: {
        evaluation: {
          state: VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED,
        },
        lastObservedAt: null,
        lastSourceTimestamp: null,
      },
      ingestionLimitations: [...limitations, 'MISSING_SOURCE_MEASUREMENT_TIMESTAMP'],
    };
  }

  const observedIso = tsEvidence.observed?.toISOString() ?? null;
  return {
    snapshot: {
      evaluation: { state: VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED },
      lastObservedAt: observedIso,
      lastSourceTimestamp: tsEvidence.source?.toISOString() ?? null,
    },
    ingestionLimitations: limitations,
  };
}

export function buildSnapshotNativeDiscoveryInventory(input: {
  scope: VsiNativeSignalDiscoveryInventoryScopeV1;
  evaluatedAt: Date;
  latestState: VsiLatestStateSnapshot | null;
  declaredCatalog: VsiDeclaredCatalogSnapshot;
  projectionAsOf: Date;
  stateAttributed: boolean;
  providerIdentity: string;
}): VsiNativeSignalDiscoveryInventoryV1 {
  const base = emptyNativeSignalDiscoveryInventory(input.scope, input.evaluatedAt);
  const profileLimitations = [...base.profileLimitations, ...input.declaredCatalog.limitations];

  if (!input.latestState) {
    return {
      ...base,
      profileLimitations: [
        ...profileLimitations,
        VsiEvidenceAxisNotEvaluatedReason.INVENTORY_NOT_REFRESHED,
      ],
    };
  }

  const raw = input.latestState.rawPayloadJson;
  const { keys, scanTruncated } = listDimoNativeSignalKeysFromRawPayload(raw);
  if (scanTruncated) {
    profileLimitations.push(VsiNativeDiscoveryIngestionLimitation.SNAPSHOT_INGEST_FIELD_LIST_BOUNDED);
  }

  const projectionAsOfMs = input.projectionAsOf.getTime();
  const entries: VsiNativeSignalDiscoveryInventoryEntryV1[] = [];
  const seen = new Set<string>();

  for (const nativeName of keys) {
    if (seen.has(nativeName)) {
      continue;
    }
    seen.add(nativeName);
    const alias = resolveNativeAliasVerdictForDiscovery(nativeName);
    const snapshotPart = evaluateSnapshotAxisForNativeKey({
      raw,
      nativeName,
      projectionAsOfMs,
      stateAttributed: input.stateAttributed,
    });
    entries.push({
      providerNativeSignalName: nativeName,
      aliasVerdict: alias.verdict,
      canonicalSignalKey: alias.canonicalSignalKey,
      snapshot: snapshotPart.snapshot,
      historical: buildHistoricalNotEvaluatedP1b(),
      ingestionLimitations: [
        declaredCatalogIngestionLimitation(input.declaredCatalog, nativeName),
        ...snapshotPart.ingestionLimitations,
      ],
    });
  }

  return truncateNativeSignalDiscoveryInventory({
    ...base,
    entries,
    profileLimitations,
  });
}
