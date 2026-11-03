import {
  VsiEvidenceAxisEvaluationState,
  VsiEvidenceAxisNotEvaluatedReason,
} from './vsi-native-signal-discovery-evaluation-state';
import { buildHistoricalAxisForUnionNativeKey } from './vsi-hf-native-discovery-negative-evidence';

const baseContext = {
  evaluatedWindow: {
    start: new Date('2026-10-20T00:00:00.000Z'),
    end: new Date('2026-10-28T00:00:00.000Z'),
  },
  hadAttributableTrips: true,
  attributionAmbiguous: false,
  chUnavailable: false,
  hadTripQueryFailure: false,
  attributableTripQueryCount: 1,
  attributableQueriesComplete: true,
  unionCapOmitted: false,
  hadQueryTimeout: false,
};

describe('buildHistoricalAxisForUnionNativeKey', () => {
  it('never emits SNAPSHOT_EXTRACTOR_NOT_RUN on historical axis', () => {
    const axis = buildHistoricalAxisForUnionNativeKey({
      nativeName: 'speed',
      aggregate: undefined,
      context: baseContext,
    });
    expect(axis.evaluation.notEvaluatedReason).not.toBe(
      VsiEvidenceAxisNotEvaluatedReason.SNAPSHOT_EXTRACTOR_NOT_RUN,
    );
    expect(axis.evaluation.state).toBe(VsiEvidenceAxisEvaluationState.EVALUATED_NOT_OBSERVED);
  });

  it('cap-omitted keys stay NOT_EVALUATED with HF_UNION_SIGNAL_CAP_OMITTED', () => {
    const axis = buildHistoricalAxisForUnionNativeKey({
      nativeName: 'speed',
      aggregate: undefined,
      context: { ...baseContext, unionCapOmitted: true },
    });
    expect(axis.evaluation.state).toBe(VsiEvidenceAxisEvaluationState.NOT_EVALUATED);
    expect(axis.evaluation.notEvaluatedReason).toBe(
      VsiEvidenceAxisNotEvaluatedReason.HF_UNION_SIGNAL_CAP_OMITTED,
    );
  });

  it('incomplete attributable queries fail closed with HF_MIRROR_INCOMPLETE', () => {
    const axis = buildHistoricalAxisForUnionNativeKey({
      nativeName: 'speed',
      aggregate: undefined,
      context: { ...baseContext, attributableQueriesComplete: false },
    });
    expect(axis.evaluation.notEvaluatedReason).toBe(
      VsiEvidenceAxisNotEvaluatedReason.HF_MIRROR_INCOMPLETE,
    );
  });

  it('maps query timeout to HF_QUERY_TIMEOUT', () => {
    const axis = buildHistoricalAxisForUnionNativeKey({
      nativeName: 'speed',
      aggregate: { pointCount: 0, firstSeenAt: null, lastSeenAt: null, tripCountWithPoints: 0, windowStartAt: null, windowEndAt: null, readCapApplied: null, queryFailed: false },
      context: { ...baseContext, hadQueryTimeout: true },
    });
    expect(axis.evaluation.notEvaluatedReason).toBe(
      VsiEvidenceAxisNotEvaluatedReason.HF_QUERY_TIMEOUT,
    );
  });
});
