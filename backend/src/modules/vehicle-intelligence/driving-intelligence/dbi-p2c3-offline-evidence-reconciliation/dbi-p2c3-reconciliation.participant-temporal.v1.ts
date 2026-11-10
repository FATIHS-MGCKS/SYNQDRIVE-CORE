import type { DbiP2c2OfflineEvidenceBundleV1 } from '../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.contract.v1';
import {
  collectTemporalViolations,
  type DbiP2c2TemporalIntervalV1,
} from '../dbi-p2c2-offline-evidence-adapters/dbi-p2c2-evidence-adapter.temporal.v1';
import type { DbiP2c3ReconciliationDiagnosticCodeV1 } from './dbi-p2c3-reconciliation.contract.v1';

const P2C2_TO_P2C3_TEMPORAL: Record<string, DbiP2c3ReconciliationDiagnosticCodeV1> = {
  INVALID_PROVIDER_BUCKET_LABEL: 'INVALID_PROVIDER_BUCKET_LABEL',
  INVALID_TEMPORAL_INTERVAL_ORDER: 'INVALID_TEMPORAL_INTERVAL_ORDER',
  INVALID_BUCKET_INDEX_ORDER: 'INVALID_BUCKET_INDEX_ORDER',
};

function isNonNegativeIntegerIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value) && value >= 0;
}

type TemporalIngressCollectV1 = {
  readonly intervals: DbiP2c2TemporalIntervalV1[];
  readonly ingressCodes: Set<DbiP2c3ReconciliationDiagnosticCodeV1>;
};

function addIngressCode(
  ingressCodes: Set<DbiP2c3ReconciliationDiagnosticCodeV1>,
  code: DbiP2c3ReconciliationDiagnosticCodeV1,
): void {
  ingressCodes.add(code);
}

function requireIndexPair(
  ingressCodes: Set<DbiP2c3ReconciliationDiagnosticCodeV1>,
  start: unknown,
  end: unknown,
): { startBucketIndex: number; endBucketIndex: number } | null {
  if (!isNonNegativeIntegerIndex(start) || !isNonNegativeIntegerIndex(end)) {
    addIngressCode(ingressCodes, 'INVALID_TEMPORAL_BUCKET_INDEX_SHAPE');
    return null;
  }
  return { startBucketIndex: start, endBucketIndex: end };
}

function pushInterval(
  intervals: DbiP2c2TemporalIntervalV1[],
  start: unknown,
  end: unknown,
  indexPair: { startBucketIndex: number; endBucketIndex: number } | null,
): void {
  const interval: DbiP2c2TemporalIntervalV1 = {
    startIso: typeof start === 'string' ? start : '',
    endIso: typeof end === 'string' ? end : '',
  };
  if (indexPair) {
    interval.startBucketIndex = indexPair.startBucketIndex;
    interval.endBucketIndex = indexPair.endBucketIndex;
  }
  intervals.push(interval);
}

function collectTemporalIngressFromBundle(bundle: DbiP2c2OfflineEvidenceBundleV1): TemporalIngressCollectV1 {
  const intervals: DbiP2c2TemporalIntervalV1[] = [];
  const ingressCodes = new Set<DbiP2c3ReconciliationDiagnosticCodeV1>();

  if (bundle.descriptive?.episodes) {
    for (const episode of bundle.descriptive.episodes) {
      const item = episode?.sourceEpisode;
      if (!item || typeof item !== 'object') {
        pushInterval(intervals, undefined, undefined, null);
        continue;
      }
      const record = item as Record<string, unknown>;
      const indexPair = requireIndexPair(ingressCodes, record.startIdx, record.endIdx);
      pushInterval(
        intervals,
        record.providerBucketLabelStartIso,
        record.providerBucketLabelEndIso,
        indexPair,
      );
    }
  }

  for (const plane of bundle.powertrainProxies ?? []) {
    for (const envelope of plane.candidates ?? []) {
      if (!envelope || typeof envelope !== 'object' || !('sourceModule' in envelope)) {
        pushInterval(intervals, undefined, undefined, null);
        continue;
      }
      const module = envelope.sourceModule;
      const cand = (envelope as { originalCandidate?: unknown }).originalCandidate;
      if (!cand || typeof cand !== 'object') {
        pushInterval(intervals, undefined, undefined, null);
        continue;
      }
      const record = cand as Record<string, unknown>;

      switch (module) {
        case 'P2-B1':
        case 'P2-B2': {
          const indexPair = requireIndexPair(ingressCodes, record.startBucketIndex, record.endBucketIndex);
          pushInterval(
            intervals,
            record.providerBucketLabelStartIso,
            record.providerBucketLabelEndIso,
            indexPair,
          );
          break;
        }
        case 'P2-B3':
        case 'P2-B4':
          pushInterval(intervals, record.startProviderBucketLabelIso, record.endProviderBucketLabelIso, null);
          break;
        default:
          pushInterval(intervals, undefined, undefined, null);
          break;
      }
    }
  }

  return { intervals, ingressCodes };
}

/**
 * P2-C3 temporal ingress gate (W3-047 / W3-B closeout): same ISO/interval semantics as P2-C2 `collectTemporalViolations`.
 * Field families are selected by `sourceModule` only — cross-module label fields cannot satisfy another module's contract.
 */
export function validateParticipantBundleTemporalIntegrity(
  bundle: DbiP2c2OfflineEvidenceBundleV1,
): readonly DbiP2c3ReconciliationDiagnosticCodeV1[] {
  try {
    const { intervals, ingressCodes } = collectTemporalIngressFromBundle(bundle);
    for (const code of collectTemporalViolations(intervals)) {
      const mapped = P2C2_TO_P2C3_TEMPORAL[code];
      if (mapped) ingressCodes.add(mapped);
    }
    return [...ingressCodes].sort();
  } catch {
    return ['INVALID_PROVIDER_BUCKET_LABEL'];
  }
}
