import type { Ds4CanonicalMultichannelBucketV1 } from './ds4-powertrain-demand-multichannel-canonicalize.v1';
import { COLD_ENGINE_SHADOW_POLICY } from '../../shadow-detector/detectors/cold-engine-shadow.policy';

export const DS4_POWERTRAIN_COLD_ENGINE_ECT_OBSERVATION_MIN = 8 as const;
export const DS4_POWERTRAIN_COLD_ENGINE_COVERAGE_SCOPE = 'ECT_LABELLED_BUCKETS_ONLY' as const;

export type Ds4ColdEngineScopedCoverageEvidenceV1 = {
  localCoverageScope: typeof DS4_POWERTRAIN_COLD_ENGINE_COVERAGE_SCOPE;
  fullTripColdStateCoverageVerdict: 'UNKNOWN';
  ectPresentBucketCount: number;
  ectMissingBucketCount: number;
  ectColdObservedBucketCount: number;
  ectWarmObservedBucketCount: number;
  gridBucketCount: number;
};

export function computeColdEngineEctCoverageEvidence(
  buckets: readonly Ds4CanonicalMultichannelBucketV1[],
): Ds4ColdEngineScopedCoverageEvidenceV1 {
  const coldMax = COLD_ENGINE_SHADOW_POLICY.coldCoolantMaxC;
  let ectPresentBucketCount = 0;
  let ectMissingBucketCount = 0;
  let ectColdObservedBucketCount = 0;
  let ectWarmObservedBucketCount = 0;

  for (const b of buckets) {
    if (b.coolantC == null) {
      ectMissingBucketCount += 1;
      continue;
    }
    ectPresentBucketCount += 1;
    if (b.coolantC < coldMax) {
      ectColdObservedBucketCount += 1;
    } else {
      ectWarmObservedBucketCount += 1;
    }
  }

  return {
    localCoverageScope: DS4_POWERTRAIN_COLD_ENGINE_COVERAGE_SCOPE,
    fullTripColdStateCoverageVerdict: 'UNKNOWN',
    ectPresentBucketCount,
    ectMissingBucketCount,
    ectColdObservedBucketCount,
    ectWarmObservedBucketCount,
    gridBucketCount: buckets.length,
  };
}
