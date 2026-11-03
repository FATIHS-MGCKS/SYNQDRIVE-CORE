import { computeDs4RpmHfV1bTierAwareInputFingerprint } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b-input-fingerprint';
import { processDs4RpmHfV1bShadowTripTierAware } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b-tier-processor';
import type { Ds4RpmHfV1aTripInputV1 } from '../../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';
import {
  buildRpmPointsEverySeconds,
  buildTierTripClassification,
  buildTierTripInput,
  TIER_TEST_LINK,
  TIER_TEST_ORG,
  TIER_TEST_TRIP,
  TIER_TEST_VEHICLE,
} from '../../rpm-hf-v1b/__tests__/ds4-rpm-hf-v1b-tier-fixtures';
import type { VsiRpmCadenceTierLabel } from '../../../vehicle-signal-intelligence/vsi-rpm-cadence-tier.types';
import { syntheticDriveLabel } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow-synthetic-drive.harness-fixture';
import {
  buildDefaultSyntheticMotionPayload,
  executeDs4RpmShadowCorrelationHarness,
} from '../ds4-rpm-shadow-correlation-harness.v1';
import type { Ds4RpmShadowCorrelationTripReportV1 } from '../ds4-rpm-shadow-correlation-v1.contract';

export type Ds4RpmShadowCorrelationScenarioId =
  | 'RPM_1S_ALIGNED'
  | 'RPM_2S_STEP'
  | 'RPM_3S_STEP'
  | 'SPARSE_NO_OVERLAP'
  | 'EV_NOT_APPLICABLE'
  | 'MISSING_HF'
  | 'TENANT_MISMATCH_NEGATIVE'
  | 'RPM_TIMESTAMP_SHIFT_NEGATIVE';

export const DS4_RPM_SHADOW_CORRELATION_SCENARIO_IDS: Ds4RpmShadowCorrelationScenarioId[] = [
  'RPM_1S_ALIGNED',
  'RPM_2S_STEP',
  'RPM_3S_STEP',
  'SPARSE_NO_OVERLAP',
  'EV_NOT_APPLICABLE',
  'MISSING_HF',
  'TENANT_MISMATCH_NEGATIVE',
  'RPM_TIMESTAMP_SHIFT_NEGATIVE',
];

function tierLabelForScenario(id: Ds4RpmShadowCorrelationScenarioId): VsiRpmCadenceTierLabel {
  switch (id) {
    case 'RPM_2S_STEP':
      return 'RPM_2S';
    case 'RPM_3S_STEP':
      return 'RPM_3S';
    case 'SPARSE_NO_OVERLAP':
      return 'SPARSE';
    default:
      return 'RPM_1S';
  }
}

function buildTripInputForScenario(
  scenarioId: Ds4RpmShadowCorrelationScenarioId,
  motionStartLabel: string,
): Ds4RpmHfV1aTripInputV1 {
  const tripStartIso = motionStartLabel;
  const tripEndIso = syntheticDriveLabel(34);
  const tier = tierLabelForScenario(scenarioId);

  if (scenarioId === 'EV_NOT_APPLICABLE') {
    const base = buildTierTripInput({
      rpmPoints: buildRpmPointsEverySeconds(tripStartIso, 10, 1),
      tierRow: buildTierTripClassification({ tier: 'RPM_1S' }),
      tripId: TIER_TEST_TRIP,
    });
    return {
      ...base,
      tripStartIso,
      tripEndIso,
      organizationId: TIER_TEST_ORG,
      vehicleId: TIER_TEST_VEHICLE,
      admission: {
        ...base.admission,
        iceRpmApplicability: 'NOT_APPLICABLE',
        processingAllowed: false,
        processingStatus: 'DISABLED_NOT_APPLICABLE',
        reasonCode: 'ICE_RPM_NOT_APPLICABLE',
        reasonSummary: 'EV harness fixture',
      },
    };
  }

  let stepSec = 1;
  if (scenarioId === 'RPM_2S_STEP') stepSec = 2;
  if (scenarioId === 'RPM_3S_STEP') stepSec = 3;

  let rpmPoints = buildRpmPointsEverySeconds(tripStartIso, 30, stepSec);
  if (scenarioId === 'MISSING_HF') rpmPoints = [];
  if (scenarioId === 'SPARSE_NO_OVERLAP') {
    rpmPoints = buildRpmPointsEverySeconds(new Date(Date.parse(tripEndIso) + 60_000).toISOString(), 5, 3);
  }
  if (scenarioId === 'RPM_TIMESTAMP_SHIFT_NEGATIVE') {
    rpmPoints = buildRpmPointsEverySeconds(new Date(Date.parse(tripStartIso) + 120_000).toISOString(), 10, 1);
  }

  const base = buildTierTripInput({
    rpmPoints,
    tierRow: buildTierTripClassification({
      tier,
      p50ActiveSeconds: stepSec,
      p75ActiveSeconds: stepSec,
    }),
    providerSourceLinkId: TIER_TEST_LINK,
    tripId: TIER_TEST_TRIP,
  });

  return {
    ...base,
    tripStartIso,
    tripEndIso,
    organizationId: TIER_TEST_ORG,
    vehicleId: TIER_TEST_VEHICLE,
  };
}

export function replayDs4RpmShadowCorrelationScenario(
  scenarioId: Ds4RpmShadowCorrelationScenarioId,
  options: { codeSha: string; generatedAt?: Date },
): Ds4RpmShadowCorrelationTripReportV1 {
  const { payload, runId } = buildDefaultSyntheticMotionPayload(scenarioId);
  const motionStart = payload.speeds[0]?.bucketLabelUtc ?? syntheticDriveLabel(0);
  const tripInput = buildTripInputForScenario(scenarioId, motionStart);
  const generatedAt = options.generatedAt ?? new Date('2026-11-03T12:00:00.000Z');

  const v1bOutcome = processDs4RpmHfV1bShadowTripTierAware({
    tripInput,
    attemptCount: 1,
    computedAt: generatedAt,
    existingSucceededFingerprint: null,
  });

  const fingerprint = computeDs4RpmHfV1bTierAwareInputFingerprint(tripInput);
  const v1bResult =
    v1bOutcome.kind === 'SUCCEEDED'
      ? v1bOutcome.result
      : v1bOutcome.kind === 'DEFER' || v1bOutcome.kind === 'TERMINAL'
        ? v1bOutcome.result
        : null;

  let organizationId = tripInput.organizationId;
  if (scenarioId === 'TENANT_MISMATCH_NEGATIVE') {
    organizationId = 'org-foreign-tenant';
  }

  return executeDs4RpmShadowCorrelationHarness({
    scenarioId,
    organizationId,
    vehicleId: tripInput.vehicleId,
    tripId: tripInput.tripId,
    motionRunId: runId,
    motionPayload: payload,
    tripInput,
    v1bResult,
    v1bInputFingerprint: fingerprint,
    v1bRunId: `synthetic-fixture-v1b-run:${scenarioId}`,
    evidenceKind: 'SYNTHETIC_FIXTURE',
    rpmSamples:
      scenarioId === 'MISSING_HF'
        ? {
            source: 'PINNED_FIXTURE',
            inputFingerprint: fingerprint,
            providerSourceLinkId: tripInput.providerSourceLinkId,
            points: [],
            invalidValueCount: 0,
            duplicateTimestampCount: 0,
          }
        : tripInput.rpmPoints.length > 0
          ? {
              source: 'PINNED_FIXTURE',
              inputFingerprint: fingerprint,
              providerSourceLinkId: tripInput.providerSourceLinkId,
              telemetrySourceFamily: 'API_SYNTHETIC',
              sourceFamilyAttestation: 'PROVEN_FROM_DIMO_IDENTITY',
              points: tripInput.rpmPoints,
              invalidValueCount: tripInput.dataQuality.invalidValueCount,
              duplicateTimestampCount: tripInput.dataQuality.duplicateTimestampCount,
            }
          : null,
    codeSha: options.codeSha,
    generatedAt,
    omissions:
      scenarioId === 'EV_NOT_APPLICABLE' || scenarioId === 'MISSING_HF'
        ? ['V1B_OR_SAMPLES_NOT_ADMITTED']
        : [],
  });
}
