import { computeDs4RpmHfV1bTierAwareInputFingerprint } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b-input-fingerprint';
import type { Ds4RpmHfV1aTripInputV1 } from '../../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';
import {
  buildTierTripClassification,
  buildTierTripInput,
  TIER_TEST_LINK,
  TIER_TEST_ORG,
  TIER_TEST_TRIP,
  TIER_TEST_VEHICLE,
} from '../../rpm-hf-v1b/__tests__/ds4-rpm-hf-v1b-tier-fixtures';
import type { Ds4RpmShadowCorrelationInputV1 } from '../ds4-rpm-shadow-correlation-v1.contract';
import type { Ds4RpmShadowCorrelationJoinOptionsV1 } from '../ds4-rpm-shadow-correlation-temporal-join.v1';

export function buildTripInputForShadowCorrelationTest(
  rpmPoints: ReadonlyArray<{ recordedAtIso: string; valueRpm: number }>,
): Ds4RpmHfV1aTripInputV1 {
  return {
    ...buildTierTripInput({
      rpmPoints: [...rpmPoints],
      tierRow: buildTierTripClassification({ tier: 'RPM_1S' }),
      providerSourceLinkId: TIER_TEST_LINK,
      tripId: TIER_TEST_TRIP,
    }),
    organizationId: TIER_TEST_ORG,
    vehicleId: TIER_TEST_VEHICLE,
    tripStartIso: rpmPoints[0]?.recordedAtIso ?? '2026-01-01T00:00:00.000Z',
    tripEndIso: '2026-01-01T00:10:00.000Z',
  };
}

export function attachCanonicalFingerprints(input: Ds4RpmShadowCorrelationInputV1): {
  input: Ds4RpmShadowCorrelationInputV1;
  joinOptions: Ds4RpmShadowCorrelationJoinOptionsV1;
} {
  const points = input.rpmSamples?.points ?? [];
  const tripInput = buildTripInputForShadowCorrelationTest(points);
  const fingerprint = computeDs4RpmHfV1bTierAwareInputFingerprint(tripInput);

  const canonicalTripRpmPoints = tripInput.rpmPoints.map((p) => ({ ...p }));

  const next: Ds4RpmShadowCorrelationInputV1 = {
    ...input,
    v1b: input.v1b
      ? {
          ...input.v1b,
          inputFingerprint: fingerprint,
          summary: { ...input.v1b.summary, inputFingerprint: fingerprint },
        }
      : null,
    rpmSamples: input.rpmSamples
      ? { ...input.rpmSamples, inputFingerprint: fingerprint }
      : null,
  };

  return {
    input: next,
    joinOptions: {
      provenanceGate: {
        recomputedV1bInputFingerprint: fingerprint,
        evidenceKind: 'SYNTHETIC_FIXTURE',
        canonicalTripRpmPoints,
      },
    },
  };
}
