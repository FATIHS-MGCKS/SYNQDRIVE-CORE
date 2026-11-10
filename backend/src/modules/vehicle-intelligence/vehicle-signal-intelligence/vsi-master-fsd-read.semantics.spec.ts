import {
  mapEvidenceStageAvailability,
  mapSignalPresentationState,
  stageEvidenceColumnValue,
} from './vsi-master-fsd-read.semantics';

describe('VsiMasterFsdRead semantics', () => {
  it('does not treat unexecuted snapshot as zero availability', () => {
    expect(mapEvidenceStageAvailability({ stageExecuted: false, stageStatus: null, rowCount: 0 })).toBe(
      'NOT_EXECUTED',
    );
    expect(stageEvidenceColumnValue(false, null)).toBe('NOT_EXECUTED');
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
