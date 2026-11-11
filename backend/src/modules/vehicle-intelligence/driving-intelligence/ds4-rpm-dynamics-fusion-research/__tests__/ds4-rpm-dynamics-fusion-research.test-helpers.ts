import { computeDs4RpmHfV1bTierAwareInputFingerprint } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b-input-fingerprint';
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
import { buildDefaultSyntheticMotionPayload } from '../../ds4-rpm-shadow-correlation/ds4-rpm-shadow-correlation-harness.v1';
import { syntheticDriveLabel } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow-synthetic-drive.harness-fixture';
import {
  API_SYNTHETIC_DIMO,
  R1_DIMO,
} from '../../ds4-rpm-episode-research/__tests__/ds4-rpm-episode-research.test-helpers';
import { executeDs4RpmDynamicsFusionHarness } from '../ds4-rpm-dynamics-fusion-research.harness.v1';
import type { Ds4RpmDynamicsFusionResearchResultV1 } from '../ds4-rpm-dynamics-fusion-research.contract.v1';

export { API_SYNTHETIC_DIMO, R1_DIMO, syntheticDriveLabel, buildRpmPointsEverySeconds };

export function runFusionFixture(input: {
  rpmPoints: Array<{ recordedAtIso: string; valueRpm: number }>;
  cadenceTier?: 'RPM_1S' | 'RPM_2S' | 'RPM_3S';
  tripId?: string;
  dimoVehicleRawJson?: unknown;
  organizationId?: string;
  linkId?: string;
  motionScenarioKey?: string;
  rpmSamplesAttestation?: 'PROVEN_FROM_DIMO_IDENTITY' | 'UNPROVEN';
  v1bFingerprintOverride?: string;
  evidenceKind?: 'SYNTHETIC_FIXTURE' | 'REAL_OBSERVATION';
  /** When true, keep caller rpm timestamps (still widen trip bounds to cover motion + rpm). */
  preserveRpmTimestamps?: boolean;
}): Ds4RpmDynamicsFusionResearchResultV1 {
  const tier = input.cadenceTier ?? 'RPM_1S';
  const step = tier === 'RPM_3S' ? 3 : tier === 'RPM_2S' ? 2 : 1;
  const tripId = input.tripId ?? TIER_TEST_TRIP;
  const tripInput = buildTierTripInput({
    rpmPoints: input.rpmPoints,
    tierRow: buildTierTripClassification({
      tier,
      tripId,
      p50ActiveSeconds: step,
      p75ActiveSeconds: step,
    } as never),
    tripId,
    providerSourceLinkId: input.linkId ?? TIER_TEST_LINK,
  });
  const { payload, runId } = buildDefaultSyntheticMotionPayload(input.motionScenarioKey ?? 'default');
  const motionStart = payload.speeds[0]?.bucketLabelUtc ?? syntheticDriveLabel(0);
  const rpmAnchorMs = Date.parse(tripInput.rpmPoints[0]?.recordedAtIso ?? motionStart);
  const motionStartMs = Date.parse(motionStart);
  const rebaselineMs = motionStartMs - rpmAnchorMs;
  if (!input.preserveRpmTimestamps && rebaselineMs !== 0 && tripInput.rpmPoints.length > 0) {
    for (const p of tripInput.rpmPoints) {
      p.recordedAtIso = new Date(Date.parse(p.recordedAtIso) + rebaselineMs).toISOString();
    }
  }
  tripInput.tripStartIso = motionStart;
  const lastRpmIso = tripInput.rpmPoints[tripInput.rpmPoints.length - 1]?.recordedAtIso;
  const lastMotionIso = payload.speeds[payload.speeds.length - 1]?.bucketLabelUtc;
  const tripEndMs = Math.max(
    motionStartMs + 1000,
    ...[lastRpmIso, lastMotionIso].filter((v): v is string => typeof v === 'string').map((iso) => Date.parse(iso)),
  );
  tripInput.tripEndIso = new Date(tripEndMs).toISOString();
  const generatedAt = new Date('2026-11-03T12:00:00.000Z');
  const v1bOutcome = processDs4RpmHfV1bShadowTripTierAware({
    tripInput,
    attemptCount: 1,
    computedAt: generatedAt,
    existingSucceededFingerprint: null,
  });
  const fingerprint = input.v1bFingerprintOverride ?? computeDs4RpmHfV1bTierAwareInputFingerprint(tripInput);
  const v1bResult = v1bOutcome.kind === 'SUCCEEDED' ? v1bOutcome.result : null;
  return executeDs4RpmDynamicsFusionHarness({
    organizationId: input.organizationId ?? TIER_TEST_ORG,
    vehicleId: TIER_TEST_VEHICLE,
    tripId,
    motionRunId: runId,
    motionPayload: payload,
    tripInput,
    v1bResult,
    v1bRunId: 'fusion-fixture-v1b-run',
    evidenceKind: input.evidenceKind ?? 'SYNTHETIC_FIXTURE',
    dimoVehicleRawJson: input.dimoVehicleRawJson ?? API_SYNTHETIC_DIMO,
    rpmSamples: {
      source: 'PINNED_FIXTURE',
      inputFingerprint: fingerprint,
      providerSourceLinkId: tripInput.providerSourceLinkId,
      telemetrySourceFamily:
        input.dimoVehicleRawJson === R1_DIMO
          ? 'RUPTELA_R1'
          : input.rpmSamplesAttestation === 'UNPROVEN'
            ? null
            : 'API_SYNTHETIC',
      sourceFamilyAttestation: input.rpmSamplesAttestation ?? 'PROVEN_FROM_DIMO_IDENTITY',
      points: tripInput.rpmPoints,
      invalidValueCount: tripInput.dataQuality.invalidValueCount,
      duplicateTimestampCount: tripInput.dataQuality.duplicateTimestampCount,
    },
  });
}
