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

function pushCandidateInterval(
  intervals: DbiP2c2TemporalIntervalV1[],
  start: unknown,
  end: unknown,
  startBucketIndex?: unknown,
  endBucketIndex?: unknown,
): void {
  const interval: DbiP2c2TemporalIntervalV1 = {
    startIso: typeof start === 'string' ? start : '',
    endIso: typeof end === 'string' ? end : '',
  };
  if (
    typeof startBucketIndex === 'number' &&
    Number.isFinite(startBucketIndex) &&
    typeof endBucketIndex === 'number' &&
    Number.isFinite(endBucketIndex)
  ) {
    interval.startBucketIndex = startBucketIndex;
    interval.endBucketIndex = endBucketIndex;
  }
  intervals.push(interval);
}

function collectIntervalsFromBundle(bundle: DbiP2c2OfflineEvidenceBundleV1): DbiP2c2TemporalIntervalV1[] {
  const intervals: DbiP2c2TemporalIntervalV1[] = [];

  if (bundle.descriptive?.episodes) {
    for (const episode of bundle.descriptive.episodes) {
      const item = episode?.sourceEpisode;
      if (!item || typeof item !== 'object') {
        pushCandidateInterval(intervals, undefined, undefined, undefined, undefined);
        continue;
      }
      pushCandidateInterval(
        intervals,
        (item as { providerBucketLabelStartIso?: unknown }).providerBucketLabelStartIso,
        (item as { providerBucketLabelEndIso?: unknown }).providerBucketLabelEndIso,
        (item as { startIdx?: unknown }).startIdx,
        (item as { endIdx?: unknown }).endIdx,
      );
    }
  }

  for (const plane of bundle.powertrainProxies ?? []) {
    for (const envelope of plane.candidates ?? []) {
      if (!envelope || typeof envelope !== 'object' || !('originalCandidate' in envelope)) {
        pushCandidateInterval(intervals, undefined, undefined);
        continue;
      }
      const cand = (envelope as { originalCandidate: unknown }).originalCandidate;
      if (!cand || typeof cand !== 'object') {
        pushCandidateInterval(intervals, undefined, undefined);
        continue;
      }
      const record = cand as Record<string, unknown>;
      const b34Start = record.startProviderBucketLabelIso;
      const b34End = record.endProviderBucketLabelIso;
      if (b34Start !== undefined || b34End !== undefined) {
        pushCandidateInterval(intervals, b34Start, b34End);
        continue;
      }
      pushCandidateInterval(
        intervals,
        record.providerBucketLabelStartIso,
        record.providerBucketLabelEndIso,
        record.startBucketIndex,
        record.endBucketIndex,
      );
    }
  }

  return intervals;
}

/**
 * P2-C3 temporal ingress gate (W3-047): same semantics as P2-C2 `collectTemporalViolations`.
 * Runs on the isolated bundle snapshot before identity, inventory, pairwise, or digest.
 */
export function validateParticipantBundleTemporalIntegrity(
  bundle: DbiP2c2OfflineEvidenceBundleV1,
): readonly DbiP2c3ReconciliationDiagnosticCodeV1[] {
  let intervals: DbiP2c2TemporalIntervalV1[];
  try {
    intervals = collectIntervalsFromBundle(bundle);
  } catch {
    return ['INVALID_PROVIDER_BUCKET_LABEL'];
  }

  const p2c2Codes = collectTemporalViolations(intervals);
  const mapped = new Set<DbiP2c3ReconciliationDiagnosticCodeV1>();
  for (const code of p2c2Codes) {
    const p3 = P2C2_TO_P2C3_TEMPORAL[code];
    if (p3) mapped.add(p3);
  }
  return [...mapped].sort();
}
