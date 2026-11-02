import {
  classifyVsiRpmCadenceTierV1,
  classifyVsiRpmCadenceTierV1WithTuning,
  VSI_RPM_CADENCE_TIER_DEFAULT_TUNING,
} from './vsi-rpm-cadence-tier.util';

describe('vsi-rpm-cadence-tier.util unit', () => {
  it('R0: thin evidence → UNKNOWN', () => {
    const result = classifyVsiRpmCadenceTierV1({
      intervalsSec: [1, 1],
      rpmPointCount: 5,
      tripDurationSeconds: 100,
    });
    expect(result.tier).toBe('UNKNOWN');
    expect(result.decisionCode).toBe('EVIDENCE_THIN');
    expect(result.cadenceConfidence).toBeNull();
  });

  it('dedupes are reflected only via rpmPointCount input (no timestamp dedupe here)', () => {
    const result = classifyVsiRpmCadenceTierV1({
      intervalsSec: [1, 1, 1, 1, 1, 1, 1, 1, 1],
      rpmPointCount: 8,
      tripDurationSeconds: 20,
    });
    expect(result.tier).toBe('UNKNOWN');
    expect(result.decisionCode).toBe('EVIDENCE_THIN');
  });

  it('R1: P50>3 → SPARSE', () => {
    const intervals = Array.from({ length: 20 }, () => 4);
    const result = classifyVsiRpmCadenceTierV1({
      intervalsSec: intervals,
      rpmPointCount: 21,
      tripDurationSeconds: 200,
    });
    expect(result.tier).toBe('SPARSE');
    expect(result.decisionCode).toBe('P50_GT_3S');
  });

  it('R2: quorum floor for tier 1 requires 40 active intervals', () => {
    const intervals = Array.from({ length: 30 }, () => 1);
    const result = classifyVsiRpmCadenceTierV1({
      intervalsSec: intervals,
      rpmPointCount: 31,
      tripDurationSeconds: 60,
    });
    expect(result.tier).toBe('UNKNOWN');
    expect(result.decisionCode).toBe('QUORUM');
  });

  it('R3: irregular spread → SPARSE even when P50=2', () => {
    const intervals = [...Array.from({ length: 15 }, () => 2), ...Array.from({ length: 10 }, () => 5)];
    const result = classifyVsiRpmCadenceTierV1({
      intervalsSec: intervals,
      rpmPointCount: intervals.length + 1,
      tripDurationSeconds: 300,
    });
    expect(result.tier).toBe('SPARSE');
    expect(result.decisionCode).toBe('IRREGULAR_SPREAD');
  });

  it('cadence HIGH does not imply full-trip analysis readiness when coverage minimal', () => {
    const intervals = Array.from({ length: 25 }, () => 2);
    const result = classifyVsiRpmCadenceTierV1({
      intervalsSec: intervals,
      rpmPointCount: 26,
      tripDurationSeconds: 500,
    });
    expect(result.tier).toBe('RPM_2S');
    expect(result.cadenceConfidence).toBe('HIGH');
    expect(result.tripCoverageBand).toBe('MINIMAL_SPAN');
    expect(result.analysisReadiness).toBe('ACTIVE_SPAN_ONLY');
  });

  it('activeDensityVsTier is local active-span density, not global completeness', () => {
    const intervals = Array.from({ length: 25 }, () => 2);
    const result = classifyVsiRpmCadenceTierV1({
      intervalsSec: intervals,
      rpmPointCount: 26,
      tripDurationSeconds: 500,
    });
    expect(result.activeSpanRatio).toBeCloseTo(0.1, 2);
    expect(result.activeDensityVsTier).toBeCloseTo(1, 5);
    expect(result.semantics.densityNote).toBe('ACTIVE_SPAN_LOCAL_DENSITY_NOT_GLOBAL_COMPLETENESS');
  });

  it('trip boundaries: intervals outside active gate do not enter tier stats', () => {
    const result = classifyVsiRpmCadenceTierV1({
      intervalsSec: [1, 1, 1, 1, 1, 1, 1, 1, 1, 20, 30],
      rpmPointCount: 12,
      tripDurationSeconds: 120,
    });
    expect(result.activeIntervalCount).toBe(9);
    expect(result.tier).toBe('UNKNOWN');
  });

  it('FABLE P50 uses ceil-index percentile (even 1s/3s mix → p50=1, not median 2)', () => {
    const intervals = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3];
    const result = classifyVsiRpmCadenceTierV1({
      intervalsSec: intervals,
      rpmPointCount: 21,
      tripDurationSeconds: 80,
    });
    expect(result.p50ActiveSeconds).toBe(1);
    expect(result.tierCandidateSeconds).toBe(1);
    expect(result.tier).toBe('UNKNOWN');
    expect(result.decisionCode).toBe('QUORUM');
  });

  it('uniform 2s active band: P50 selects RPM_2S tier; spread affects confidence', () => {
    const intervals = Array.from({ length: 40 }, () => 2);
    const result = classifyVsiRpmCadenceTierV1({
      intervalsSec: intervals,
      rpmPointCount: 41,
      tripDurationSeconds: 200,
    });
    expect(result.tier).toBe('RPM_2S');
    expect(result.p50ActiveSeconds).toBe(2);
    expect(result.cadenceConfidence).toBe('HIGH');
  });
});

describe('vsi-rpm-cadence-tier sensitivity matrix (frozen tuning knobs)', () => {
  it('purity HIGH threshold 0.75 / 0.80 / 0.85 monotonic confidence', () => {
    const intervals = [...Array.from({ length: 40 }, () => 2), ...Array.from({ length: 8 }, () => 4)];
    const trip = {
      intervalsSec: intervals,
      rpmPointCount: intervals.length + 1,
      tripDurationSeconds: 200,
    };
    const at75 = classifyVsiRpmCadenceTierV1WithTuning(trip, {
      ...VSI_RPM_CADENCE_TIER_DEFAULT_TUNING,
      purityHighMin: 0.75,
    });
    const at80 = classifyVsiRpmCadenceTierV1WithTuning(trip, {
      ...VSI_RPM_CADENCE_TIER_DEFAULT_TUNING,
      purityHighMin: 0.8,
    });
    const at85 = classifyVsiRpmCadenceTierV1WithTuning(trip, {
      ...VSI_RPM_CADENCE_TIER_DEFAULT_TUNING,
      purityHighMin: 0.85,
    });
    expect(at75.cadenceConfidence).toBe('HIGH');
    expect(at80.cadenceConfidence).toBe('HIGH');
    expect(at85.cadenceConfidence).not.toBe('HIGH');
  });

  it('quorum 30 / 40 / 60 seconds changes UNKNOWN vs tier without retargeting tier speed', () => {
    const short = {
      intervalsSec: Array.from({ length: 32 }, () => 1),
      rpmPointCount: 33,
      tripDurationSeconds: 60,
    };
    const q30 = classifyVsiRpmCadenceTierV1WithTuning(short, {
      ...VSI_RPM_CADENCE_TIER_DEFAULT_TUNING,
      quorumObservedSeconds: 30,
    });
    const q40 = classifyVsiRpmCadenceTierV1WithTuning(short, {
      ...VSI_RPM_CADENCE_TIER_DEFAULT_TUNING,
      quorumObservedSeconds: 40,
    });
    const q60 = classifyVsiRpmCadenceTierV1WithTuning(short, {
      ...VSI_RPM_CADENCE_TIER_DEFAULT_TUNING,
      quorumObservedSeconds: 60,
    });
    expect(q30.tier).toBe('RPM_1S');
    expect(q40.tier).toBe('UNKNOWN');
    expect(q60.tier).toBe('UNKNOWN');
  });

  it('P75 gate c+1 vs c+2: looser gate never assigns slower tier', () => {
    const mixed = [...Array.from({ length: 12 }, () => 2), ...Array.from({ length: 8 }, () => 4)];
    const strict = classifyVsiRpmCadenceTierV1WithTuning(
      {
        intervalsSec: mixed,
        rpmPointCount: 21,
        tripDurationSeconds: 200,
      },
      { ...VSI_RPM_CADENCE_TIER_DEFAULT_TUNING, p75SpreadMaxOffsetSeconds: 1 },
    );
    const loose = classifyVsiRpmCadenceTierV1WithTuning(
      {
        intervalsSec: mixed,
        rpmPointCount: 21,
        tripDurationSeconds: 200,
      },
      { ...VSI_RPM_CADENCE_TIER_DEFAULT_TUNING, p75SpreadMaxOffsetSeconds: 2 },
    );
    expect(strict.tier).toBe('SPARSE');
    expect(loose.tier).toBe('RPM_2S');
  });

  it('P50 tier uses FABLE ceil-index percentile (371cba40 shape → RPM_2S)', () => {
    const intervals = [...Array.from({ length: 20 }, () => 1.799), ...Array.from({ length: 18 }, () => 3)];
    const result = classifyVsiRpmCadenceTierV1({
      intervalsSec: intervals,
      rpmPointCount: intervals.length + 1,
      tripDurationSeconds: 2000,
    });
    expect(result.p50ActiveSeconds).toBe(1.799);
    expect(result.tier).toBe('RPM_2S');
  });
});
