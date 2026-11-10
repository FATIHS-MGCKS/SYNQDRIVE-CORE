import { buildDs4RpmReferenceIntelligenceV1ReferenceBlock } from '../../rpm-reference-intelligence-v1/ds4-rpm-reference-intelligence-v1-reference-input';
import { processDs4RpmHfV1bShadowTripTierAware } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b-tier-processor';
import {
  buildTierTripClassification,
  buildTierTripInput,
  TIER_TEST_LINK,
  TIER_TEST_ORG,
  TIER_TEST_TRIP,
  TIER_TEST_VEHICLE,
} from '../../rpm-hf-v1b/__tests__/ds4-rpm-hf-v1b-tier-fixtures';
import {
  API_SYNTHETIC_DIMO,
  buildBoundResearchInput,
} from '../../ds4-rpm-episode-research/__tests__/ds4-rpm-episode-research.test-helpers';
import {
  DS4_RPM_DYNAMICS_RESEARCH_CONTRACT_VERSION,
  type Ds4RpmDynamicsResearchInputV1,
} from '../ds4-rpm-dynamics-research.contract.v1';

type BuildBoundDynamicsOptions = Parameters<typeof buildBoundResearchInput>[0] & {
  cadenceTier?: 'RPM_1S' | 'RPM_2S' | 'RPM_3S';
};

export function buildBoundDynamicsInput(input: BuildBoundDynamicsOptions): Ds4RpmDynamicsResearchInputV1 {
  const tier = input.cadenceTier ?? 'RPM_1S';
  if (tier === 'RPM_1S' && !input.cadenceTier) {
    const base = buildBoundResearchInput(input);
    return { ...base, contractVersion: DS4_RPM_DYNAMICS_RESEARCH_CONTRACT_VERSION };
  }

  const tripId = input.tripId ?? TIER_TEST_TRIP;
  const linkId = input.linkId ?? TIER_TEST_LINK;
  const p50ActiveSeconds = tier === 'RPM_3S' ? 3 : tier === 'RPM_2S' ? 2 : 1;
  const tripInput = buildTierTripInput({
    rpmPoints: input.rpmPoints,
    tierRow: buildTierTripClassification({ tier, tripId, p50ActiveSeconds } as never),
    tripId,
    providerSourceLinkId: linkId,
  });
  if (input.iceRpmApplicability) {
    tripInput.admission.iceRpmApplicability = input.iceRpmApplicability;
  }
  const dupLabels = new Map<string, number>();
  for (const p of input.rpmPoints) {
    dupLabels.set(p.recordedAtIso, (dupLabels.get(p.recordedAtIso) ?? 0) + 1);
  }
  tripInput.dataQuality.duplicateTimestampCount = [...dupLabels.values()].reduce(
    (n, c) => n + (c > 1 ? c - 1 : 0),
    0,
  );
  const tierOut = processDs4RpmHfV1bShadowTripTierAware({
    tripInput,
    attemptCount: 1,
    computedAt: new Date('2026-01-01T11:00:00.000Z'),
    existingSucceededFingerprint: null,
  });
  if (tierOut.kind !== 'SUCCEEDED') {
    throw new Error(`fixture v1b failed: ${tierOut.kind}`);
  }
  return {
    contractVersion: DS4_RPM_DYNAMICS_RESEARCH_CONTRACT_VERSION,
    evidenceOrigin: input.evidenceOrigin ?? 'SYNTHETIC_FIXTURE',
    sourceBundleId: null,
    organizationId: TIER_TEST_ORG,
    vehicleId: TIER_TEST_VEHICLE,
    tripId,
    providerSourceLinkId: linkId,
    dimoVehicleRawJson: input.dimoVehicleRawJson ?? API_SYNTHETIC_DIMO,
    tripInput,
    v1bResult: tierOut.result,
    reference:
      input.reference ??
      buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
        idleRpm: 800,
        maxRpm: 6800,
        idleRpmProvenance: { category: 'USER_CONFIRMED' },
        maxRpmProvenance: { category: 'USER_CONFIRMED' },
        iceRpmApplicability: input.iceRpmApplicability ?? 'APPLICABLE',
      }),
  };
}

export {
  API_SYNTHETIC_DIMO,
  buildBoundResearchInput,
  buildRpmPointsEverySeconds,
  R1_DIMO,
  rpmAtU,
} from '../../ds4-rpm-episode-research/__tests__/ds4-rpm-episode-research.test-helpers';
