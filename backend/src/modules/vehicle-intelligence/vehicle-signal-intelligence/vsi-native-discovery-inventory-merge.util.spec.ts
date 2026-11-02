import {
  VsiEvidenceAxisEvaluationState,
  VsiEvidenceAxisNotEvaluatedReason,
} from './vsi-native-signal-discovery-evaluation-state';
import { mergeNativeDiscoveryInventoryEntryAxes } from './vsi-native-discovery-inventory-merge.util';

describe('mergeNativeDiscoveryInventoryEntryAxes', () => {
  const baseEntry = {
    providerNativeSignalName: 'speed',
    aliasVerdict: 'UNKNOWN_SIGNAL' as const,
    canonicalSignalKey: null,
    snapshot: {
      evaluation: {
        state: VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED,
      },
      lastObservedAt: '2026-10-01T00:00:00.000Z',
      lastSourceTimestamp: '2026-10-01T00:00:00.000Z',
    },
    historical: {
      evaluation: {
        state: VsiEvidenceAxisEvaluationState.NOT_EVALUATED,
        notEvaluatedReason: VsiEvidenceAxisNotEvaluatedReason.SNAPSHOT_EXTRACTOR_NOT_RUN,
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
    },
    ingestionLimitations: [] as string[],
  };

  it('preserves snapshot when HF update carries P1b snapshot placeholder', () => {
    const incoming = {
      ...baseEntry,
      historical: {
        evaluation: { state: VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED },
        firstSeenAt: '2026-09-01T00:00:00.000Z',
        lastSeenAt: '2026-09-02T00:00:00.000Z',
        sampleMetadata: {
          windowStartAt: '2026-09-01T00:00:00.000Z',
          windowEndAt: '2026-09-02T00:00:00.000Z',
          pointCount: 100,
          tripCountWithPoints: 1,
          readCapApplied: 12000,
        },
      },
      snapshot: {
        evaluation: {
          state: VsiEvidenceAxisEvaluationState.NOT_EVALUATED,
          notEvaluatedReason: VsiEvidenceAxisNotEvaluatedReason.SNAPSHOT_EXTRACTOR_NOT_RUN,
        },
        lastObservedAt: null,
        lastSourceTimestamp: null,
      },
    };
    const merged = mergeNativeDiscoveryInventoryEntryAxes(baseEntry, incoming);
    expect(merged.snapshot.evaluation.state).toBe(VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED);
    expect(merged.historical.evaluation.state).toBe(VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED);
  });
});
