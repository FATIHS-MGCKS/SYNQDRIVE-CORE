import {
  DS4_DBI_W0_E9_EXTERNAL_ELIGIBILITY_AUDIT_200K_V1,
  buildE9NullDistributionSelectionBlockV1,
} from '../ds4-dbi-w0-e9-null-selection-report.v1';

describe('ds4-dbi-w0-e9-null-selection-report.v1', () => {
  it('aggregates abstention reasons and empirical eligibility from drawRecords', () => {
    const mc = {
      acceptedIOD: [0.5, 1.0],
      acceptedCount: 2,
      abstainedCount: 2,
      meanIod: 0.75,
      drawRecords: [
        { seed: 1, d8Status: 'KNOWN' as const, d8ReasonCodes: ['MBF_W0_OK'], indexOfDispersion: 0.5 },
        {
          seed: 2,
          d8Status: 'ABSTAIN' as const,
          d8ReasonCodes: ['MBF_W0_INSUFFICIENT_WINDOWS_FOR_BURSTINESS'],
          indexOfDispersion: null,
        },
        {
          seed: 3,
          d8Status: 'ABSTAIN' as const,
          d8ReasonCodes: [
            'MBF_W0_INSUFFICIENT_WINDOWS_FOR_BURSTINESS',
            'MBF_W0_INSUFFICIENT_WINDOWS_FOR_BURSTINESS',
          ],
          indexOfDispersion: null,
        },
        { seed: 4, d8Status: 'KNOWN' as const, d8ReasonCodes: ['MBF_W0_OK'], indexOfDispersion: 1.0 },
      ],
    };
    const block = buildE9NullDistributionSelectionBlockV1({
      model: 'UNRESTRICTED_UNIFORM_ON_EXPOSURE',
      totalDraws: 4,
      mc,
      interpretationLimitation: 'test limitation',
      constructionSemantics: 'test construction',
      includeExternalEligibilityEvidence: false,
    });
    expect(block.totalDraws).toBe(4);
    expect(block.acceptedCount + block.abstainedCount).toBe(block.totalDraws);
    expect(block.empiricalEligibilityRate).toBe(0.5);
    const sumReasons = Object.values(block.abstentionReasonCounts).reduce((a, b) => a + b, 0);
    expect(sumReasons).toBe(2);
    expect(block.abstentionReasonCounts['ABSTAIN::MBF_W0_INSUFFICIENT_WINDOWS_FOR_BURSTINESS']).toBe(2);
    expect(block.selectionHazard.empiricalRateFromThisRunOnly).toBe(0.5);
    expect(block.selectionHazard.d8SupportGateAffectsUnrestrictedReference).toBe(true);
  });

  it('zero accepts yields empirical rate zero with finite-batch warning (not P=0 claim)', () => {
    const mc = {
      acceptedIOD: [],
      acceptedCount: 0,
      abstainedCount: 5,
      meanIod: null,
      drawRecords: Array.from({ length: 5 }, (_, i) => ({
        seed: i,
        d8Status: 'ABSTAIN' as const,
        d8ReasonCodes: ['MBF_W0_INSUFFICIENT_WINDOWS_FOR_BURSTINESS'] as const,
        indexOfDispersion: null,
      })),
    };
    const block = buildE9NullDistributionSelectionBlockV1({
      model: 'UNRESTRICTED_UNIFORM_ON_EXPOSURE',
      totalDraws: 5,
      mc,
      interpretationLimitation: 'x',
      constructionSemantics: 'y',
      includeExternalEligibilityEvidence: true,
    });
    expect(block.empiricalEligibilityRate).toBe(0);
    expect(block.externalEligibilityScaleEvidence).toEqual(DS4_DBI_W0_E9_EXTERNAL_ELIGIBILITY_AUDIT_200K_V1);
    expect(block.selectionHazard.verdict).toBe('HIGH_D8_GATE_CENSORSHIP');
    expect(block.selectionHazard.finiteBatchWarning).toContain('does not imply');
  });

  it('occupancy model selectionHazard does not claim unrestricted reference censoring', () => {
    const mc = {
      acceptedIOD: [0.2],
      acceptedCount: 1,
      abstainedCount: 0,
      meanIod: 0.2,
      drawRecords: [
        { seed: 0, d8Status: 'KNOWN' as const, d8ReasonCodes: ['MBF_W0_OK'], indexOfDispersion: 0.2 },
      ],
    };
    const block = buildE9NullDistributionSelectionBlockV1({
      model: 'OCCUPANCY_CONDITIONED_NULL',
      totalDraws: 1,
      mc,
      interpretationLimitation: 'occ',
      constructionSemantics: 'occ sem',
      includeExternalEligibilityEvidence: false,
    });
    expect(block.selectionHazard.d8SupportGateAffectsUnrestrictedReference).toBe(false);
    expect(block.externalEligibilityScaleEvidence).toBeUndefined();
  });

  it('rejects inconsistent drawRecords length', () => {
    expect(() =>
      buildE9NullDistributionSelectionBlockV1({
        model: 'OCCUPANCY_CONDITIONED_NULL',
        totalDraws: 2,
        mc: {
          acceptedIOD: [],
          acceptedCount: 0,
          abstainedCount: 2,
          meanIod: null,
          drawRecords: [{ seed: 0, d8Status: 'ABSTAIN', d8ReasonCodes: [], indexOfDispersion: null }],
        },
        interpretationLimitation: 'a',
        constructionSemantics: 'b',
        includeExternalEligibilityEvidence: false,
      }),
    ).toThrow(/drawRecords length/);
  });
});
