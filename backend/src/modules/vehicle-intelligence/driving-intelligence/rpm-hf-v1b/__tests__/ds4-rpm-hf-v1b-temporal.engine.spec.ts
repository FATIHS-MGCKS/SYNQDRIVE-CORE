import { buildSyntheticRpmPointsFromIntervals } from '../../rpm-hf-v1a/ds4-rpm-hf-v1a-data-quality';
import { computeDs4RpmHfV1bTemporalAnalysis, DS4_RPM_HF_V1B_TEMPORAL_PROFILE_2S } from '../ds4-rpm-hf-v1b-temporal.engine';

describe('ds4-rpm-hf-v1b-temporal.engine', () => {
  it('computes bucket coverage at canonical trip boundaries (off-by-one safe)', () => {
    const tripStartIso = '2026-10-28T11:53:00.000Z';
    const tripEndIso = '2026-10-28T11:58:33.729Z';
    const tripStartMs = Date.parse(tripStartIso);
    const tripEndMs = Date.parse(tripEndIso);
    const intervals = Array.from({ length: 122 }, () => 1);
    const points = buildSyntheticRpmPointsFromIntervals({
      tripStartMs: tripStartMs + 60_000,
      intervalsSec: intervals,
      rpmValue: 1500,
    }).map((p) => ({ recordedAtIso: p.recordedAtIso, valueRpm: p.valueRpm }));

    const analysis = computeDs4RpmHfV1bTemporalAnalysis({
      tripStartIso,
      tripEndIso,
      points,
      invalidValueCount: 0,
      duplicateTimestampCount: 0,
    });

    const startBucket = Math.floor(tripStartMs / 1000);
    const endBucket = Math.floor(tripEndMs / 1000);
    expect(analysis.coverage.eligibleOneSecondBuckets).toBe(endBucket - startBucket + 1);
    expect(analysis.rpmValues.validPointCount).toBe(123);
    expect(analysis.coverage.observedUniqueOneSecondBuckets).toBe(123);
    expect(analysis.coverage.leadingMissingSeconds).toBeGreaterThan(0);
    expect(analysis.coverage.trailingMissingSeconds).toBeGreaterThan(0);
    expect(analysis.intervals.gapCountOver2Seconds).toBe(0);
  });

  it('treats RPM=0 as valid measurement, not engine-off proof', () => {
    const tripStartIso = '2026-01-01T10:00:00.000Z';
    const tripEndIso = '2026-01-01T10:00:05.000Z';
    const analysis = computeDs4RpmHfV1bTemporalAnalysis({
      tripStartIso,
      tripEndIso,
      points: [
        { recordedAtIso: '2026-01-01T10:00:01.000Z', valueRpm: 0 },
        { recordedAtIso: '2026-01-01T10:00:03.000Z', valueRpm: 900 },
      ],
      invalidValueCount: 0,
      duplicateTimestampCount: 0,
    });
    expect(analysis.rpmValues.validPointCount).toBe(2);
    expect(analysis.rpmValues.rpmMin).toBe(0);
    expect(analysis.sequences.continuousSequenceCount).toBe(1);
  });

  it('splits continuous sequences when gap exceeds 2 seconds', () => {
    const tripStartIso = '2026-01-01T10:00:00.000Z';
    const tripEndIso = '2026-01-01T10:01:00.000Z';
    const analysis = computeDs4RpmHfV1bTemporalAnalysis({
      tripStartIso,
      tripEndIso,
      points: [
        { recordedAtIso: '2026-01-01T10:00:01.000Z', valueRpm: 1000 },
        { recordedAtIso: '2026-01-01T10:00:02.000Z', valueRpm: 1100 },
        { recordedAtIso: '2026-01-01T10:00:10.000Z', valueRpm: 1200 },
      ],
      invalidValueCount: 0,
      duplicateTimestampCount: 0,
    });
    expect(analysis.sequences.continuousSequenceCount).toBe(2);
    expect(analysis.intervals.gapCountOver2Seconds).toBe(1);
    expect(analysis.intervals.longestObservedGapSeconds).toBe(8);
  });

  it('does not treat 60s between two points as 60s continuous observed duration', () => {
    const analysis = computeDs4RpmHfV1bTemporalAnalysis({
      tripStartIso: '2026-01-01T10:00:00.000Z',
      tripEndIso: '2026-01-01T10:02:00.000Z',
      points: [
        { recordedAtIso: '2026-01-01T10:00:01.000Z', valueRpm: 1000 },
        { recordedAtIso: '2026-01-01T10:01:01.000Z', valueRpm: 1100 },
      ],
      invalidValueCount: 0,
      duplicateTimestampCount: 0,
    });
    expect(analysis.sequences.continuousSequenceCount).toBe(2);
    expect(analysis.sequences.observedSequenceDurationSeconds).toBe(0);
  });

  it('sums 1s-interval continuous observation within a sequence', () => {
    const analysis = computeDs4RpmHfV1bTemporalAnalysis({
      tripStartIso: '2026-01-01T10:00:00.000Z',
      tripEndIso: '2026-01-01T10:00:05.000Z',
      points: [
        { recordedAtIso: '2026-01-01T10:00:01.000Z', valueRpm: 1000 },
        { recordedAtIso: '2026-01-01T10:00:02.000Z', valueRpm: 1000 },
        { recordedAtIso: '2026-01-01T10:00:03.000Z', valueRpm: 1000 },
      ],
      invalidValueCount: 0,
      duplicateTimestampCount: 0,
    });
    expect(analysis.sequences.continuousSequenceCount).toBe(1);
    expect(analysis.sequences.observedSequenceDurationSeconds).toBe(2);
  });

  it('uses 2s bucket semantics and 3s sequence gap for RPM_2S profile without inventing points', () => {
    const analysis = computeDs4RpmHfV1bTemporalAnalysis(
      {
        tripStartIso: '2026-01-01T10:00:00.000Z',
        tripEndIso: '2026-01-01T10:00:20.000Z',
        points: [
          { recordedAtIso: '2026-01-01T10:00:00.000Z', valueRpm: 1000 },
          { recordedAtIso: '2026-01-01T10:00:02.000Z', valueRpm: 1100 },
          { recordedAtIso: '2026-01-01T10:00:04.000Z', valueRpm: 1200 },
        ],
        invalidValueCount: 0,
        duplicateTimestampCount: 0,
      },
      DS4_RPM_HF_V1B_TEMPORAL_PROFILE_2S,
    );
    expect(analysis.rpmValues.validPointCount).toBe(3);
    expect(analysis.sequences.sequenceGapRuleSeconds).toBe(3);
    expect(analysis.sequences.observedSequenceDurationSeconds).toBe(4);
  });
});
