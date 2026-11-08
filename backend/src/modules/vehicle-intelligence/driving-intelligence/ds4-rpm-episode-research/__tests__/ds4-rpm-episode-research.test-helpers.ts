import { buildDs4RpmReferenceIntelligenceV1ReferenceBlock } from '../../rpm-reference-intelligence-v1/ds4-rpm-reference-intelligence-v1-reference-input';
import { processDs4RpmHfV1bShadowTripTierAware } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b-tier-processor';
import {
  buildRpmPointsEverySeconds,
  buildTierTripClassification,
  buildTierTripInput,
  TIER_TEST_LINK,
  TIER_TEST_ORG,
  TIER_TEST_TRIP,
  TIER_TEST_VEHICLE,
} from '../../rpm-hf-v1b/__tests__/ds4-rpm-hf-v1b-tier-fixtures';
import type { Ds4RpmEpisodeResearchInputV1 } from '../ds4-rpm-episode-research.contract.v1';
import { DS4_RPM_EPISODE_RESEARCH_CONTRACT_VERSION } from '../ds4-rpm-episode-research.contract.v1';

const API_SYNTHETIC_DIMO = {
  syntheticDevice: { id: 'fixture-synthetic-device' },
};

const R1_DIMO = {
  aftermarketDevice: { serial: 'R1-TEST-001' },
};

export function rpmAtU(u: number, idle = 800, max = 6800): number {
  return idle + (max - idle) * u;
}

export function buildBoundResearchInput(input: {
  rpmPoints: Array<{ recordedAtIso: string; valueRpm: number }>;
  reference?: ReturnType<typeof buildDs4RpmReferenceIntelligenceV1ReferenceBlock>;
  dimoVehicleRawJson?: unknown;
  evidenceOrigin?: Ds4RpmEpisodeResearchInputV1['evidenceOrigin'];
  tripId?: string;
  linkId?: string;
  iceRpmApplicability?: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';
}): Ds4RpmEpisodeResearchInputV1 {
  const tripId = input.tripId ?? TIER_TEST_TRIP;
  const linkId = input.linkId ?? TIER_TEST_LINK;
  const tripInput = buildTierTripInput({
    rpmPoints: input.rpmPoints,
    tierRow: buildTierTripClassification({ tier: 'RPM_1S', tripId } as never),
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
  let dupCount = 0;
  for (const c of dupLabels.values()) {
    if (c > 1) dupCount += c - 1;
  }
  tripInput.dataQuality.duplicateTimestampCount = dupCount;

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
    contractVersion: DS4_RPM_EPISODE_RESEARCH_CONTRACT_VERSION,
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

export { API_SYNTHETIC_DIMO, R1_DIMO, buildRpmPointsEverySeconds };
