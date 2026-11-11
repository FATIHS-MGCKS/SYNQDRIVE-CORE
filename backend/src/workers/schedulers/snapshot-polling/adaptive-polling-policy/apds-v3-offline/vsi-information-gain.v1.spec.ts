import { estimateVsiInformationGain } from './vsi-information-gain.v1';

describe('vsi-information-gain.v1', () => {
  const decisionAt = 1_700_000_000_000;

  it('flags future LV source as contradictory', () => {
    const g = estimateVsiInformationGain({
      decisionAtMs: decisionAt,
      lastLvProviderSourceMs: decisionAt + 5_000,
      lastTopLevelProviderSourceMs: decisionAt - 5_000,
      lastPhysicalPollMs: null,
      medianIntervalMs: 600_000,
      profileStability: 'STABLE_PERIODIC',
      observationQuality: 'HIGH',
      p2cTopLevelAdvanceKnown: false,
    });
    expect(g.contradictoryEvidence).toBe(true);
    expect(g.expectedGain).toBe(0);
  });

  it('does not treat cross-group timestamp order as contradictory', () => {
    const g = estimateVsiInformationGain({
      decisionAtMs: decisionAt,
      lastLvProviderSourceMs: decisionAt - 10_000,
      lastTopLevelProviderSourceMs: decisionAt - 100_000,
      lastPhysicalPollMs: decisionAt - 300_000,
      medianIntervalMs: 600_000,
      profileStability: 'STABLE_PERIODIC',
      observationQuality: 'HIGH',
      p2cTopLevelAdvanceKnown: false,
    });
    expect(g.contradictoryEvidence).toBe(false);
  });

  it('increases gain with staleness under stable profile', () => {
    const fresh = estimateVsiInformationGain({
      decisionAtMs: decisionAt,
      lastLvProviderSourceMs: decisionAt - 10_000,
      lastTopLevelProviderSourceMs: decisionAt - 10_000,
      lastPhysicalPollMs: decisionAt - 300_000,
      medianIntervalMs: 600_000,
      profileStability: 'STABLE_PERIODIC',
      observationQuality: 'HIGH',
      p2cTopLevelAdvanceKnown: false,
    });
    const stale = estimateVsiInformationGain({
      decisionAtMs: decisionAt,
      lastLvProviderSourceMs: decisionAt - 500_000,
      lastTopLevelProviderSourceMs: decisionAt - 500_000,
      lastPhysicalPollMs: decisionAt - 300_000,
      medianIntervalMs: 600_000,
      profileStability: 'STABLE_PERIODIC',
      observationQuality: 'HIGH',
      p2cTopLevelAdvanceKnown: false,
    });
    expect(stale.expectedGain).toBeGreaterThan(fresh.expectedGain);
  });
});
