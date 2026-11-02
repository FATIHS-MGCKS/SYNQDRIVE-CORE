import { selectDs4Layer2P2MotionRevisionV1, type Ds4Layer2P2MotionRevisionCandidateV1 } from '../export/ds4-layer2-p2-offline-reconstruction.revision-selector.v1';

function candidate(
  overrides: Partial<Ds4Layer2P2MotionRevisionCandidateV1> & { motionRunId: string; createdAtUtc: string },
): Ds4Layer2P2MotionRevisionCandidateV1 {
  return {
    pinnedSnapshotHash: 'snap',
    combinedInputIdentity: 'cii',
    contentFingerprint: 'cf',
    payloadContract: 'V2_INTENSITY',
    collectionEligible: true,
    collectionIneligibleReason: null,
    speedAuthority: 'C4_ONLY',
    exposureDerivable: true,
    corruptOrMissingPayload: false,
    ...overrides,
  };
}

describe('selectDs4Layer2P2MotionRevisionV1', () => {
  it('selects latest created_at among eligible revisions', () => {
    const result = selectDs4Layer2P2MotionRevisionV1({
      tripId: 'trip-a',
      candidates: [
        candidate({ motionRunId: 'run-old', createdAtUtc: '2026-10-01T10:00:00.000Z' }),
        candidate({ motionRunId: 'run-new', createdAtUtc: '2026-10-02T10:00:00.000Z' }),
      ],
    });
    expect(result.selected.motionRunId).toBe('run-new');
    expect(result.rows.find((r) => r.motionRunId === 'run-old')?.rejectionReasons).toContain(
      'SUPERSEDED_BY_LATER_ELIGIBLE_REVISION',
    );
  });

  it('records explicit rejection reasons for ineligible revisions', () => {
    const result = selectDs4Layer2P2MotionRevisionV1({
      tripId: 'trip-b',
      candidates: [
        candidate({
          motionRunId: 'run-legacy',
          createdAtUtc: '2026-10-01T10:00:00.000Z',
          payloadContract: 'V1_LEGACY',
          collectionEligible: false,
          exposureDerivable: false,
          speedAuthority: null,
        }),
        candidate({ motionRunId: 'run-v2', createdAtUtc: '2026-10-02T10:00:00.000Z' }),
      ],
    });
    expect(result.selected.motionRunId).toBe('run-v2');
    const legacy = result.rows.find((r) => r.motionRunId === 'run-legacy');
    expect(legacy?.rejectionReasons).toEqual(
      expect.arrayContaining(['PAYLOAD_CONTRACT_NOT_V2', 'COLLECTION_INELIGIBLE', 'SPEED_AUTHORITY_UNKNOWN_OR_AMBIGUOUS']),
    );
  });

  it('throws when no eligible revision exists', () => {
    expect(() =>
      selectDs4Layer2P2MotionRevisionV1({
        tripId: 'trip-c',
        candidates: [
          candidate({
            motionRunId: 'run-bad',
            createdAtUtc: '2026-10-01T10:00:00.000Z',
            corruptOrMissingPayload: true,
            collectionEligible: false,
            exposureDerivable: false,
            speedAuthority: null,
          }),
        ],
      }),
    ).toThrow(/No eligible motion revision/);
  });

  it('breaks created_at ties with lexicographic motionRunId (ascending wins)', () => {
    const ts = '2026-10-02T10:00:00.000Z';
    const result = selectDs4Layer2P2MotionRevisionV1({
      tripId: 'trip-tie',
      candidates: [
        candidate({ motionRunId: 'run-z-last', createdAtUtc: ts }),
        candidate({ motionRunId: 'run-a-first', createdAtUtc: ts }),
      ],
    });
    expect(result.selected.motionRunId).toBe('run-a-first');
    const stable = selectDs4Layer2P2MotionRevisionV1({
      tripId: 'trip-tie',
      candidates: [
        candidate({ motionRunId: 'run-z-last', createdAtUtc: ts }),
        candidate({ motionRunId: 'run-a-first', createdAtUtc: ts }),
      ],
    });
    expect(stable.selected.motionRunId).toBe(result.selected.motionRunId);
  });
});
