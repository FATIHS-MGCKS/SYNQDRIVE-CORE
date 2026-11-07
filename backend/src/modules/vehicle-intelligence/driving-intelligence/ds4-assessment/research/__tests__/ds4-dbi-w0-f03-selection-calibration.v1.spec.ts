import {
  buildD8SelectionCalibrationResearchV1,
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

  it('short exposure: K<10 returns exact P(KNOWN)=0 (supported), not UNSUPPORTED', () => {
    const p = exactUniformTauD8EligibilityProbabilityV1({ eventCount: 12, movingExposureSeconds: 59 });
    expect(p.supported).toBe(true);
    expect(p.pKnown).toBe(0);
    expect(p.geometry.totalBinCount).toBeLessThan(10);
    const p2 = exactUniformTauD8EligibilityProbabilityV1({ eventCount: 12, movingExposureSeconds: 540 });
    expect(p2.supported).toBe(true);
    expect(p2.pKnown).toBe(0);
    expect(p2.geometry.totalBinCount).toBe(9);
  });

  it('zero events and n<10 gates yield P(KNOWN)=0', () => {
    const z = exactUniformTauD8EligibilityProbabilityV1({ eventCount: 0, movingExposureSeconds: 720 });
    expect(z.supported).toBe(true);
    expect(z.pKnown).toBe(0);
    const few = exactUniformTauD8EligibilityProbabilityV1({ eventCount: 9, movingExposureSeconds: 720 });
    expect(few.pKnown).toBe(0);
  });

  it('large n,E* exact eligibility remains supported (conditional iod may enumerate-fail)', () => {
    const p = exactUniformTauD8EligibilityProbabilityV1({ eventCount: 40, movingExposureSeconds: 1800 });
    expect(p.supported).toBe(true);
    expect(p.pKnown).toBeGreaterThan(0.99);
    const cond = exactUniformTauConditionalIodReferenceV1({ eventCount: 40, movingExposureSeconds: 1800 });
    expect(cond.supported).toBe(false);
    expect(cond.reason).toMatch(/ENUMERATION_TOO_LARGE/);
    expect(cond.pKnown).toBeGreaterThan(0.99);
  });

  it('trip calibration build skips Monte Carlo by default (kernel path)', () => {
    const report = buildD8SelectionCalibrationResearchV1({
      movingExposureSeconds: 660,
      tauOnsetsSeconds: Array.from({ length: 12 }, (_, i) => i * 50),
      observedD8Status: 'ABSTAIN',
      observedTotalBins: 11,
      observedNonemptyBins: 8,
      observedD8ReasonCodes: ['MBF_W0_INSUFFICIENT_WINDOWS_FOR_BURSTINESS'],
    });
    expect(report.monteCarloCrossCheck).toBeNull();
    expect(report.nullModelReference.pD8KnownExact).toBeCloseTo(0.02252486, 5);
    const withMc = buildD8SelectionCalibrationResearchV1({
      movingExposureSeconds: 660,
      tauOnsetsSeconds: Array.from({ length: 12 }, (_, i) => i * 50),
      observedD8Status: 'ABSTAIN',
      observedTotalBins: 11,
      observedNonemptyBins: 8,
      observedD8ReasonCodes: [],
      mcTrials: 2000,
      mcSeed: 99,
      includeConditionalNullExact: true,
    });
    expect(withMc.monteCarloCrossCheck).not.toBeNull();
    expect(withMc.monteCarloCrossCheck!.trials).toBe(2000);
  });

  it('performance: exact-only trip calibration build completes 500 iterations quickly', () => {
    const t0 = performance.now();
    for (let i = 0; i < 500; i += 1) {
      buildD8SelectionCalibrationResearchV1({
        movingExposureSeconds: 719,
        tauOnsetsSeconds: Array.from({ length: 12 }, (_, j) => j * 55 + (i % 7)),
        observedD8Status: 'ABSTAIN',
        observedTotalBins: 12,
        observedNonemptyBins: 9,
        observedD8ReasonCodes: [],
      });
    }
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(3000);
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
