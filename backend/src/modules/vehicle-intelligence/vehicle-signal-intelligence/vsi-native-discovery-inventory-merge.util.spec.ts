import {
  VsiEvidenceAxisEvaluationState,
  VsiEvidenceAxisNotEvaluatedReason,
} from './vsi-native-signal-discovery-evaluation-state';
import {
  mergeNativeDiscoveryInventoryEntries,
  mergeNativeDiscoveryInventoryEntryAxes,
  __mergeHistoricalAxisTestExports,
} from './vsi-native-discovery-inventory-merge.util';

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

  it('HF merge replaces legacy historical SNAPSHOT_EXTRACTOR_NOT_RUN placeholder', () => {
    const persisted = {
      ...baseEntry,
      historical: {
        ...baseEntry.historical,
        evaluation: {
          state: VsiEvidenceAxisEvaluationState.NOT_EVALUATED,
          notEvaluatedReason: VsiEvidenceAxisNotEvaluatedReason.SNAPSHOT_EXTRACTOR_NOT_RUN,
        },
      },
    };
    const incoming = {
      ...baseEntry,
      historical: {
        evaluation: { state: VsiEvidenceAxisEvaluationState.EVALUATED_NOT_OBSERVED },
        firstSeenAt: null,
        lastSeenAt: null,
        sampleMetadata: {
          windowStartAt: '2026-10-20T00:00:00.000Z',
          windowEndAt: '2026-10-28T00:00:00.000Z',
          pointCount: 0,
          tripCountWithPoints: 0,
          readCapApplied: 12000,
        },
      },
    };
    const merged = mergeNativeDiscoveryInventoryEntryAxes(persisted, incoming);
    expect(merged.historical.evaluation.state).toBe(
      VsiEvidenceAxisEvaluationState.EVALUATED_NOT_OBSERVED,
    );
    expect(merged.historical.evaluation.notEvaluatedReason).toBeUndefined();
  });

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

  it('newer evaluated-empty window replaces stale EVALUATED_OBSERVED', () => {
    const persisted = {
      ...baseEntry,
      historical: {
        evaluation: { state: VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED },
        firstSeenAt: '2026-09-01T00:00:00.000Z',
        lastSeenAt: '2026-09-15T00:00:00.000Z',
        sampleMetadata: {
          windowStartAt: '2026-09-01T00:00:00.000Z',
          windowEndAt: '2026-09-15T00:00:00.000Z',
          pointCount: 500,
          tripCountWithPoints: 2,
          readCapApplied: 12000,
        },
      },
    };
    const incoming = {
      ...baseEntry,
      historical: {
        evaluation: { state: VsiEvidenceAxisEvaluationState.EVALUATED_NOT_OBSERVED },
        firstSeenAt: null,
        lastSeenAt: null,
        sampleMetadata: {
          windowStartAt: '2026-09-16T00:00:00.000Z',
          windowEndAt: '2026-10-28T00:00:00.000Z',
          pointCount: 0,
          tripCountWithPoints: 0,
          readCapApplied: 12000,
        },
      },
    };
    const merged = mergeNativeDiscoveryInventoryEntryAxes(persisted, incoming);
    expect(merged.historical.evaluation.state).toBe(
      VsiEvidenceAxisEvaluationState.EVALUATED_NOT_OBSERVED,
    );
    expect(merged.historical.firstSeenAt).toBe('2026-09-01T00:00:00.000Z');
    expect(merged.historical.lastSeenAt).toBe('2026-09-15T00:00:00.000Z');
  });

  it('failed HF read with fresher window retains OBSERVED and records refresh failure separately', () => {
    const persisted = {
      ...baseEntry,
      historical: {
        evaluation: { state: VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED },
        firstSeenAt: '2026-09-01T00:00:00.000Z',
        lastSeenAt: '2026-09-02T00:00:00.000Z',
        sampleMetadata: {
          windowStartAt: '2026-09-01T00:00:00.000Z',
          windowEndAt: '2026-09-10T00:00:00.000Z',
          pointCount: 10,
          tripCountWithPoints: 1,
          readCapApplied: 12000,
        },
      },
    };
    const incoming = {
      ...baseEntry,
      historical: {
        evaluation: {
          state: VsiEvidenceAxisEvaluationState.NOT_EVALUATED,
          notEvaluatedReason: VsiEvidenceAxisNotEvaluatedReason.HF_READ_FAILED,
        },
        firstSeenAt: null,
        lastSeenAt: null,
        sampleMetadata: {
          windowStartAt: '2026-09-11T00:00:00.000Z',
          windowEndAt: '2026-10-28T00:00:00.000Z',
          pointCount: null,
          tripCountWithPoints: null,
          readCapApplied: null,
        },
      },
    };
    const merged = mergeNativeDiscoveryInventoryEntryAxes(persisted, incoming);
    expect(merged.historical.evaluation.state).toBe(
      VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED,
    );
    expect(merged.historical.firstSeenAt).toBe('2026-09-01T00:00:00.000Z');
    expect(merged.ingestionLimitations).toContain(
      VsiEvidenceAxisNotEvaluatedReason.HF_READ_FAILED,
    );
  });

  it('stale worker with older window does not downgrade fresher NOT_OBSERVED', () => {
    const persisted = {
      ...baseEntry,
      historical: {
        evaluation: { state: VsiEvidenceAxisEvaluationState.EVALUATED_NOT_OBSERVED },
        firstSeenAt: null,
        lastSeenAt: null,
        sampleMetadata: {
          windowStartAt: '2026-09-20T00:00:00.000Z',
          windowEndAt: '2026-10-28T00:00:00.000Z',
          pointCount: 0,
          tripCountWithPoints: 0,
          readCapApplied: 12000,
        },
      },
    };
    const staleIncoming = {
      ...baseEntry,
      historical: {
        evaluation: { state: VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED },
        firstSeenAt: '2026-09-01T00:00:00.000Z',
        lastSeenAt: '2026-09-02T00:00:00.000Z',
        sampleMetadata: {
          windowStartAt: '2026-09-01T00:00:00.000Z',
          windowEndAt: '2026-09-15T00:00:00.000Z',
          pointCount: 50,
          tripCountWithPoints: 1,
          readCapApplied: 12000,
        },
      },
    };
    const merged = mergeNativeDiscoveryInventoryEntryAxes(persisted, staleIncoming);
    expect(merged.historical.evaluation.state).toBe(
      VsiEvidenceAxisEvaluationState.EVALUATED_NOT_OBSERVED,
    );
    expect(merged.historical.firstSeenAt).toBe('2026-09-01T00:00:00.000Z');
  });

  it('merges non-overlapping observation timestamps when fresher window is OBSERVED', () => {
    const persisted = {
      ...baseEntry,
      historical: {
        evaluation: { state: VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED },
        firstSeenAt: '2026-08-01T00:00:00.000Z',
        lastSeenAt: '2026-08-02T00:00:00.000Z',
        sampleMetadata: {
          windowStartAt: '2026-08-01T00:00:00.000Z',
          windowEndAt: '2026-08-31T00:00:00.000Z',
          pointCount: 20,
          tripCountWithPoints: 1,
          readCapApplied: 12000,
        },
      },
    };
    const incoming = {
      ...baseEntry,
      historical: {
        evaluation: { state: VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED },
        firstSeenAt: '2026-09-10T00:00:00.000Z',
        lastSeenAt: '2026-09-11T00:00:00.000Z',
        sampleMetadata: {
          windowStartAt: '2026-09-01T00:00:00.000Z',
          windowEndAt: '2026-10-01T00:00:00.000Z',
          pointCount: 30,
          tripCountWithPoints: 1,
          readCapApplied: 12000,
        },
      },
    };
    const merged = mergeNativeDiscoveryInventoryEntryAxes(persisted, incoming);
    expect(merged.historical.evaluation.state).toBe(
      VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED,
    );
    expect(merged.historical.firstSeenAt).toBe('2026-08-01T00:00:00.000Z');
    expect(merged.historical.lastSeenAt).toBe('2026-09-11T00:00:00.000Z');
  });
});

describe('mergeNativeDiscoveryInventoryEntries', () => {
  const scope = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    providerSourceLinkId: 'link-1',
    providerIdentity: 'DIMO',
  };

  it('keeps max evaluatedAt when stale worker arrives', () => {
    const persisted = {
      contractVersion: 'vsi-native-signal-discovery-v1' as const,
      scope,
      evaluatedAt: '2026-10-28T12:00:00.000Z',
      entries: [],
      profileLimitations: [],
    };
    const incoming = {
      ...persisted,
      evaluatedAt: '2026-10-27T12:00:00.000Z',
      entries: [
        {
          providerNativeSignalName: 'speed',
          aliasVerdict: 'UNKNOWN_SIGNAL' as const,
          canonicalSignalKey: null,
          snapshot: {
            evaluation: {
              state: VsiEvidenceAxisEvaluationState.NOT_EVALUATED,
              notEvaluatedReason: VsiEvidenceAxisNotEvaluatedReason.SNAPSHOT_EXTRACTOR_NOT_RUN,
            },
            lastObservedAt: null,
            lastSourceTimestamp: null,
          },
          historical: {
            evaluation: { state: VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED },
            firstSeenAt: '2026-10-01T00:00:00.000Z',
            lastSeenAt: '2026-10-02T00:00:00.000Z',
            sampleMetadata: {
              windowStartAt: '2026-10-01T00:00:00.000Z',
              windowEndAt: '2026-10-27T00:00:00.000Z',
              pointCount: 1,
              tripCountWithPoints: 1,
              readCapApplied: 12000,
            },
          },
          ingestionLimitations: [],
        },
      ],
    };
    const merged = mergeNativeDiscoveryInventoryEntries(persisted, incoming);
    expect(merged.evaluatedAt).toBe('2026-10-28T12:00:00.000Z');
  });
});

describe('historical window freshness helpers', () => {
  it('orders windowEndAt for pickHistoricalEvaluationAxis', () => {
    const { historicalWindowEndMs, pickHistoricalEvaluationAxis } =
      __mergeHistoricalAxisTestExports;
    const older = {
      evaluation: { state: VsiEvidenceAxisEvaluationState.EVALUATED_OBSERVED },
      firstSeenAt: null,
      lastSeenAt: null,
      sampleMetadata: {
        windowStartAt: '2026-09-01T00:00:00.000Z',
        windowEndAt: '2026-09-10T00:00:00.000Z',
        pointCount: 1,
        tripCountWithPoints: 1,
        readCapApplied: 12000,
      },
    };
    const newerEmpty = {
      evaluation: { state: VsiEvidenceAxisEvaluationState.EVALUATED_NOT_OBSERVED },
      firstSeenAt: null,
      lastSeenAt: null,
      sampleMetadata: {
        windowStartAt: '2026-09-11T00:00:00.000Z',
        windowEndAt: '2026-10-28T00:00:00.000Z',
        pointCount: 0,
        tripCountWithPoints: 0,
        readCapApplied: 12000,
      },
    };
    expect(historicalWindowEndMs(newerEmpty)).toBeGreaterThan(historicalWindowEndMs(older));
    expect(pickHistoricalEvaluationAxis(older, newerEmpty).evaluation.state).toBe(
      VsiEvidenceAxisEvaluationState.EVALUATED_NOT_OBSERVED,
    );
  });
});
