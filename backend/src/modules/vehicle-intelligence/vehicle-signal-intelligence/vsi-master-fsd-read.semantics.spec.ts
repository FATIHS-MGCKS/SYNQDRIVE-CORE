import {
  isStageNotStarted,
  mapEvidenceStageAvailability,
  mapSignalPresentationState,
  stageEvidenceColumnValue,
} from './vsi-master-fsd-read.semantics';

describe('VsiMasterFsdRead semantics', () => {
  describe('mapEvidenceStageAvailability (table)', () => {
    const cases: Array<{
      name: string;
      input: { stageStatus: string | null; rowCount: number; eligibleSignalCount?: number | null };
      expected: ReturnType<typeof mapEvidenceStageAvailability>;
    }> = [
      { name: 'not started PLANNED', input: { stageStatus: 'PLANNED', rowCount: 0 }, expected: 'NOT_EXECUTED' },
      { name: 'not started SKIPPED', input: { stageStatus: 'SKIPPED', rowCount: 5 }, expected: 'NOT_EXECUTED' },
      { name: 'in progress no rows', input: { stageStatus: 'IN_PROGRESS', rowCount: 0 }, expected: 'PARTIAL' },
      { name: 'in progress with rows', input: { stageStatus: 'IN_PROGRESS', rowCount: 3 }, expected: 'PARTIAL' },
      {
        name: 'unknown outcome partial',
        input: { stageStatus: 'UNKNOWN_OUTCOME', rowCount: 4, eligibleSignalCount: 10 },
        expected: 'PARTIAL',
      },
      { name: 'unknown outcome empty', input: { stageStatus: 'UNKNOWN_OUTCOME', rowCount: 0 }, expected: 'NOT_AVAILABLE' },
      {
        name: 'failed partial',
        input: { stageStatus: 'FAILED', rowCount: 2, eligibleSignalCount: 8 },
        expected: 'PARTIAL',
      },
      { name: 'failed empty', input: { stageStatus: 'FAILED', rowCount: 0 }, expected: 'NOT_AVAILABLE' },
      {
        name: 'succeeded full planned subset',
        input: { stageStatus: 'SUCCEEDED', rowCount: 5, eligibleSignalCount: 5 },
        expected: 'AVAILABLE',
      },
      {
        name: 'succeeded incomplete planned subset',
        input: { stageStatus: 'SUCCEEDED', rowCount: 3, eligibleSignalCount: 5 },
        expected: 'PARTIAL',
      },
      {
        name: 'succeeded no eligible denominator',
        input: { stageStatus: 'SUCCEEDED', rowCount: 2, eligibleSignalCount: null },
        expected: 'AVAILABLE',
      },
      { name: 'succeeded zero rows', input: { stageStatus: 'SUCCEEDED', rowCount: 0 }, expected: 'NOT_AVAILABLE' },
    ];

    it.each(cases)('$name', ({ input, expected }) => {
      expect(mapEvidenceStageAvailability(input)).toBe(expected);
    });
  });

  it('does not treat unknown-outcome partial as NOT_EXECUTED for column presentation', () => {
    expect(isStageNotStarted('UNKNOWN_OUTCOME')).toBe(false);
    expect(stageEvidenceColumnValue('UNKNOWN_OUTCOME', 'OBSERVED')).toBe('OBSERVED');
    expect(stageEvidenceColumnValue('PLANNED', null)).toBe('NOT_EXECUTED');
  });

  it('separates NULL observed from missing and query failed', () => {
    expect(
      mapSignalPresentationState({
        evidenceState: 'OBSERVED',
        qualityJson: { observationKind: 'NULL' },
      }),
    ).toBe('NULL_OBSERVED');
    expect(
      mapSignalPresentationState({
        evidenceState: 'OBSERVED',
        qualityJson: { observationKind: 'ABSENT' },
      }),
    ).toBe('MISSING');
    expect(
      mapSignalPresentationState({
        evidenceState: 'QUERY_FAILED',
        qualityJson: {},
      }),
    ).toBe('QUERY_FAILED');
  });
});
