import {
  buildF03SensitivityMatrixV1,
  exactUniformTauConditionalIodReferenceV1,
  exactUniformTauD8EligibilityProbabilityV1,
  monteCarloUniformTauEligibilityV1,
} from '../ds4-dbi-w0-f03-selection-calibration.v1';

describe('ds4-dbi-w0-f03-selection-calibration.v1', () => {
  it('exact P(KNOWN) and E[IOD|KNOWN] at n=12 E*=660 (independent oracles)', () => {
    const p = exactUniformTauD8EligibilityProbabilityV1({ eventCount: 12, movingExposureSeconds: 660 });
    const cond = exactUniformTauConditionalIodReferenceV1({ eventCount: 12, movingExposureSeconds: 660 });
    expect(p.supported).toBe(true);
    expect(p.pKnown).toBeCloseTo(0.02252486, 6);
    expect(cond.supported).toBe(true);
    expect(cond.meanIodGivenKnown).toBeCloseTo(0.2826087, 5);
    expect(cond.quantilesGivenKnown).not.toBeNull();
  });

  it('exact P(KNOWN) and E[IOD|KNOWN] at n=12 E*=665 (partial final bin)', () => {
    const p = exactUniformTauD8EligibilityProbabilityV1({ eventCount: 12, movingExposureSeconds: 665 });
    const cond = exactUniformTauConditionalIodReferenceV1({ eventCount: 12, movingExposureSeconds: 665 });
    expect(p.supported).toBe(true);
    expect(p.pKnown).toBeCloseTo(0.02806004, 6);
    expect(cond.meanIodGivenKnown).toBeCloseTo(0.3771188, 5);
    expect(p.geometry.binWidthsSeconds.at(-1)).toBeCloseTo(5, 5);
  });

  it('Monte Carlo cross-check lies inside Wilson interval of exact P (660, n=12)', () => {
    const exact = exactUniformTauD8EligibilityProbabilityV1({ eventCount: 12, movingExposureSeconds: 660 });
    const mc = monteCarloUniformTauEligibilityV1({
      eventCount: 12,
      movingExposureSeconds: 660,
      trials: 120_000,
      seed: 0xf03_66012,
    });
    expect(mc.wilson95).not.toBeNull();
    expect(mc.empiricalPKnown).toBeGreaterThanOrEqual(mc.wilson95!.low - 0.005);
    expect(mc.empiricalPKnown).toBeLessThanOrEqual(mc.wilson95!.high + 0.005);
    expect(Math.abs(mc.empiricalPKnown - exact.pKnown!)).toBeLessThan(0.002);
  });

  it('sensitivity matrix has full n×E* grid with exact probabilities', () => {
    const rows = buildF03SensitivityMatrixV1({ mcTrials: 5000 });
    expect(rows.length).toBe(4 * 8);
    for (const row of rows) {
      if (row.eventCount >= 10 && row.movingExposureSeconds >= 60) {
        expect(row.exactPKnown).not.toBeNull();
        expect(row.mcWilson95).not.toBeNull();
      }
    }
  });
});
