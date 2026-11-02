import {
  DS4_RPM_HF_V1B_TEMPORAL_PROFILE_1S,
  DS4_RPM_HF_V1B_TEMPORAL_PROFILE_2S,
  DS4_RPM_HF_V1B_TEMPORAL_PROFILE_3S,
  resolveTemporalCadenceProfileForTier,
} from '../../rpm-hf-v1b/ds4-rpm-hf-v1b-temporal.engine';
import { resolveDs4RpmReferenceIntelligenceV1SequenceMaxGap } from '../ds4-rpm-reference-intelligence-v1-v1b-temporal-binding';

describe('ds4-rpm-reference-intelligence-v1 v1b temporal binding', () => {
  it('prefers authoritative temporalCadenceProfile from V1B tier evidence', () => {
    const out = resolveDs4RpmReferenceIntelligenceV1SequenceMaxGap({
      authoritativeV1bTemporal: {
        cadenceTier: 'RPM_1S',
        temporalCadenceProfile: DS4_RPM_HF_V1B_TEMPORAL_PROFILE_3S,
      },
    });
    expect(out.sequenceMaxGapSeconds).toBe(DS4_RPM_HF_V1B_TEMPORAL_PROFILE_3S.sequenceMaxGapSeconds);
  });

  it('resolves gap from known VSI cadence tier when profile object is absent', () => {
    expect(
      resolveDs4RpmReferenceIntelligenceV1SequenceMaxGap({
        authoritativeV1bTemporal: { cadenceTier: 'RPM_1S', temporalCadenceProfile: null },
      }).sequenceMaxGapSeconds,
    ).toBe(resolveTemporalCadenceProfileForTier('RPM_1S').sequenceMaxGapSeconds);

    expect(
      resolveDs4RpmReferenceIntelligenceV1SequenceMaxGap({
        qualityExposure: {
          contractVersion: 'ds4-rpm-hf-v1b-admission-quality-v1',
          cadenceTier: 'RPM_2S',
          cadenceConfidence: 'HIGH',
          analysisMode: 'HIGH_RESOLUTION',
          analysisReadiness: 'TIER_ANALYTICS_OK',
          tripCoverageBand: 'FULL_SPAN',
          observedBucketCoverageRatio: 1,
          qualityScope: 'OBSERVED_HF_TEMPORAL',
          tierAnalyticsReady: true,
          impliesFullTripCoverage: false,
        },
      }).sequenceMaxGapSeconds,
    ).toBe(DS4_RPM_HF_V1B_TEMPORAL_PROFILE_2S.sequenceMaxGapSeconds);
  });

  it('fail-closes when tier label and profile are unavailable', () => {
    const out = resolveDs4RpmReferenceIntelligenceV1SequenceMaxGap({
      authoritativeV1bTemporal: { cadenceTier: 'SPARSE', temporalCadenceProfile: null },
      qualityExposure: null,
    });
    expect(out.sequenceMaxGapSeconds).toBeNull();
    expect(out.temporalCadenceProfile).toBeNull();
  });
});
