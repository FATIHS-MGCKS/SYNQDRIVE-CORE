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
import { syntheticDriveLabel } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow-synthetic-drive.harness-fixture';
import { buildDefaultSyntheticMotionPayload } from '../../ds4-rpm-shadow-correlation/ds4-rpm-shadow-correlation-harness.v1';
import type { Ds4RpmRealDataOfflineInputBundleV1 } from '../ds4-rpm-real-data-replay.contract.v1';
import { DS4_RPM_REAL_DATA_REPLAY_EXECUTOR_CONTRACT_VERSION } from '../ds4-rpm-real-data-replay.contract.v1';

export const SYNTHETIC_DIMO_RAW_JSON = {
  syntheticDevice: { integration: 'harness-offline' },
} as const;

export const R1_DIMO_RAW_JSON = {
  aftermarketDevice: { serial: 'R1-HARNESS-OFFLINE' },
} as const;

export const UNKNOWN_DIMO_RAW_JSON = { unrelated: true } as const;

function buildAlignedTripInput(motionStart: string): Ds4RpmHfV1aTripInputV1 {
  const tripStartIso = motionStart;
  const tripEndIso = syntheticDriveLabel(34);
  const base = buildTierTripInput({
    rpmPoints: buildRpmPointsEverySeconds(tripStartIso, 30, 1),
    tierRow: buildTierTripClassification({ tier: 'RPM_1S' }),
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

function finalizeBundle(
  partial: Omit<
    Ds4RpmRealDataOfflineInputBundleV1,
    'contractVersion' | 'executionBoundary' | 'ownerAuthorizedProductionExecutionDeclared'
  >,
): Ds4RpmRealDataOfflineInputBundleV1 {
  return {
    contractVersion: DS4_RPM_REAL_DATA_REPLAY_EXECUTOR_CONTRACT_VERSION,
    executionBoundary: 'OFFLINE_INJECTED_BUNDLE_ONLY',
    ownerAuthorizedProductionExecutionDeclared: false,
    ...partial,
  };
}

function processV1b(tripInput: Ds4RpmHfV1aTripInputV1, generatedAt: Date) {
  return processDs4RpmHfV1bShadowTripTierAware({
    tripInput,
    attemptCount: 1,
    computedAt: generatedAt,
    existingSucceededFingerprint: null,
  });
}

export function buildSyntheticApiBundleValid(
  generatedAt = new Date('2026-11-04T08:00:00.000Z'),
): Ds4RpmRealDataOfflineInputBundleV1 {
  const { payload, runId } = buildDefaultSyntheticMotionPayload('b2-valid-synthetic');
  const motionStart = payload.speeds[0]?.bucketLabelUtc ?? syntheticDriveLabel(0);
  const tripInput = buildAlignedTripInput(motionStart);
  const v1bOutcome = processV1b(tripInput, generatedAt);
  const v1bResult = v1bOutcome.kind === 'SUCCEEDED' ? v1bOutcome.result : null;
  return finalizeBundle({
    bundleId: 'fixture-synthetic-api-valid',
    cohortVehicleLabel: 'AUDI_A4',
    organizationId: TIER_TEST_ORG,
    vehicleId: TIER_TEST_VEHICLE,
    tripId: TIER_TEST_TRIP,
    providerSourceLinkId: TIER_TEST_LINK,
    dimoVehicleRawJson: SYNTHETIC_DIMO_RAW_JSON,
    dimoQueryFromIso: tripInput.tripStartIso,
    dimoQueryToIso: tripInput.tripEndIso,
    dimoBucketIntervalSeconds: 1,
    speedCoBucketedWithRpm: true,
    motionRunId: runId,
    motionPayload: payload,
    tripInput,
    v1bRunId: 'fixture-v1b-run-valid',
    v1bResult,
    canSpeedObservations: [],
    scenarioLabel: 'PR_B2_SYNTHETIC_VALID',
  });
}

export function buildR1BlockedBundle(
  generatedAt = new Date('2026-11-04T08:00:00.000Z'),
): Ds4RpmRealDataOfflineInputBundleV1 {
  const base = buildSyntheticApiBundleValid(generatedAt);
  return finalizeBundle({
    ...base,
    bundleId: 'fixture-r1-blocked',
    cohortVehicleLabel: 'VW_TIGUAN',
    dimoVehicleRawJson: R1_DIMO_RAW_JSON,
    scenarioLabel: 'PR_B2_R1_BLOCKED',
  });
}

export function buildUnknownSourceBundle(
  generatedAt = new Date('2026-11-04T08:00:00.000Z'),
): Ds4RpmRealDataOfflineInputBundleV1 {
  const base = buildSyntheticApiBundleValid(generatedAt);
  return finalizeBundle({
    ...base,
    bundleId: 'fixture-unknown-source',
    dimoVehicleRawJson: UNKNOWN_DIMO_RAW_JSON,
    scenarioLabel: 'PR_B2_UNKNOWN_SOURCE',
  });
}

export function buildTeslaNotApplicableBundle(
  generatedAt = new Date('2026-11-04T08:00:00.000Z'),
): Ds4RpmRealDataOfflineInputBundleV1 {
  const { payload, runId } = buildDefaultSyntheticMotionPayload('b2-ev');
  const motionStart = payload.speeds[0]?.bucketLabelUtc ?? syntheticDriveLabel(0);
  const tripStartIso = motionStart;
  const tripEndIso = syntheticDriveLabel(34);
  const base = buildTierTripInput({
    rpmPoints: buildRpmPointsEverySeconds(tripStartIso, 10, 1),
    tierRow: buildTierTripClassification({ tier: 'RPM_1S' }),
    tripId: TIER_TEST_TRIP,
  });
  const tripInput: Ds4RpmHfV1aTripInputV1 = {
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
  const v1bOutcome = processV1b(tripInput, generatedAt);
  const v1bResult =
    v1bOutcome.kind === 'DEFER' || v1bOutcome.kind === 'TERMINAL'
      ? v1bOutcome.result
      : v1bOutcome.kind === 'SUCCEEDED'
        ? v1bOutcome.result
        : null;
  return finalizeBundle({
    bundleId: 'fixture-tesla-ice-na',
    cohortVehicleLabel: 'TESLA_MODEL_3',
    organizationId: TIER_TEST_ORG,
    vehicleId: TIER_TEST_VEHICLE,
    tripId: TIER_TEST_TRIP,
    providerSourceLinkId: TIER_TEST_LINK,
    dimoVehicleRawJson: SYNTHETIC_DIMO_RAW_JSON,
    dimoQueryFromIso: tripStartIso,
    dimoQueryToIso: tripEndIso,
    dimoBucketIntervalSeconds: 1,
    speedCoBucketedWithRpm: true,
    motionRunId: runId,
    motionPayload: payload,
    tripInput,
    v1bRunId: 'fixture-v1b-ev',
    v1bResult,
    canSpeedObservations: [],
    scenarioLabel: 'PR_B2_EV_NOT_APPLICABLE',
  });
}

export function buildCrossTenantBundle(
  generatedAt = new Date('2026-11-04T08:00:00.000Z'),
): Ds4RpmRealDataOfflineInputBundleV1 {
  const base = buildSyntheticApiBundleValid(generatedAt);
  return finalizeBundle({
    ...base,
    bundleId: 'fixture-cross-tenant',
    organizationId: 'org-foreign',
    scenarioLabel: 'PR_B2_TENANT_MISMATCH',
  });
}

export function buildWrongSourceLinkBundle(
  generatedAt = new Date('2026-11-04T08:00:00.000Z'),
): Ds4RpmRealDataOfflineInputBundleV1 {
  const base = buildSyntheticApiBundleValid(generatedAt);
  return finalizeBundle({
    ...base,
    bundleId: 'fixture-wrong-link',
    providerSourceLinkId: 'link-wrong',
    scenarioLabel: 'PR_B2_SOURCE_LINK_MISMATCH',
  });
}

export function buildV1bNonAdmissionBundle(
  generatedAt = new Date('2026-11-04T08:00:00.000Z'),
): Ds4RpmRealDataOfflineInputBundleV1 {
  const base = buildSyntheticApiBundleValid(generatedAt);
  if (!base.v1bResult) {
    throw new Error('fixture requires succeeded v1b baseline');
  }
  const v1bResult = {
    ...base.v1bResult,
    admission: {
      ...base.v1bResult.admission,
      processingAllowed: false,
      reasonCode: 'ADMISSION_DENIED_HARNESS',
    },
  };
  return finalizeBundle({
    ...base,
    bundleId: 'fixture-v1b-denied',
    v1bResult,
    scenarioLabel: 'PR_B2_V1B_DENIED',
  });
}

export function buildCadenceMismatchBundle(
  generatedAt = new Date('2026-11-04T08:00:00.000Z'),
): Ds4RpmRealDataOfflineInputBundleV1 {
  const { payload, runId } = buildDefaultSyntheticMotionPayload('b2-2s-step');
  const motionStart = payload.speeds[0]?.bucketLabelUtc ?? syntheticDriveLabel(0);
  const tripStartIso = motionStart;
  const tripEndIso = syntheticDriveLabel(34);
  const tripInput = buildTierTripInput({
    rpmPoints: buildRpmPointsEverySeconds(tripStartIso, 30, 2),
    tierRow: buildTierTripClassification({
      tier: 'RPM_1S',
      p50ActiveSeconds: 2,
      p75ActiveSeconds: 2,
    }),
    providerSourceLinkId: TIER_TEST_LINK,
    tripId: TIER_TEST_TRIP,
  });
  const aligned: Ds4RpmHfV1aTripInputV1 = {
    ...tripInput,
    tripStartIso,
    tripEndIso,
    organizationId: TIER_TEST_ORG,
    vehicleId: TIER_TEST_VEHICLE,
  };
  const v1bOutcome = processV1b(aligned, generatedAt);
  const v1bResult = v1bOutcome.kind === 'SUCCEEDED' ? v1bOutcome.result : null;
  return finalizeBundle({
    bundleId: 'fixture-cadence-mismatch',
    cohortVehicleLabel: 'VW_ARTEON',
    organizationId: TIER_TEST_ORG,
    vehicleId: TIER_TEST_VEHICLE,
    tripId: TIER_TEST_TRIP,
    providerSourceLinkId: TIER_TEST_LINK,
    dimoVehicleRawJson: SYNTHETIC_DIMO_RAW_JSON,
    dimoQueryFromIso: tripStartIso,
    dimoQueryToIso: tripEndIso,
    dimoBucketIntervalSeconds: 1,
    speedCoBucketedWithRpm: true,
    motionRunId: runId,
    motionPayload: payload,
    tripInput: aligned,
    v1bRunId: 'fixture-v1b-2s',
    v1bResult,
    canSpeedObservations: [],
    scenarioLabel: 'PR_B2_CADENCE_MISMATCH',
  });
}

export function buildMissingRpmWindowBundle(
  generatedAt = new Date('2026-11-04T08:00:00.000Z'),
): Ds4RpmRealDataOfflineInputBundleV1 {
  const { payload, runId } = buildDefaultSyntheticMotionPayload('b2-missing');
  const motionStart = payload.speeds[0]?.bucketLabelUtc ?? syntheticDriveLabel(0);
  const tripStartIso = motionStart;
  const tripEndIso = syntheticDriveLabel(34);
  const tripInput = buildTierTripInput({
    rpmPoints: [],
    tierRow: buildTierTripClassification({ tier: 'RPM_1S' }),
    providerSourceLinkId: TIER_TEST_LINK,
    tripId: TIER_TEST_TRIP,
  });
  const aligned: Ds4RpmHfV1aTripInputV1 = {
    ...tripInput,
    tripStartIso,
    tripEndIso,
    organizationId: TIER_TEST_ORG,
    vehicleId: TIER_TEST_VEHICLE,
  };
  const v1bOutcome = processV1b(aligned, generatedAt);
  const v1bResult =
    v1bOutcome.kind === 'SUCCEEDED' ||
    v1bOutcome.kind === 'DEFER' ||
    v1bOutcome.kind === 'TERMINAL'
      ? v1bOutcome.result
      : null;
  return finalizeBundle({
    bundleId: 'fixture-missing-rpm',
    cohortVehicleLabel: 'AUDI_A4',
    organizationId: TIER_TEST_ORG,
    vehicleId: TIER_TEST_VEHICLE,
    tripId: TIER_TEST_TRIP,
    providerSourceLinkId: TIER_TEST_LINK,
    dimoVehicleRawJson: SYNTHETIC_DIMO_RAW_JSON,
    dimoQueryFromIso: tripStartIso,
    dimoQueryToIso: tripEndIso,
    dimoBucketIntervalSeconds: 1,
    speedCoBucketedWithRpm: true,
    motionRunId: runId,
    motionPayload: payload,
    tripInput: aligned,
    v1bRunId: 'fixture-v1b-missing',
    v1bResult,
    canSpeedObservations: [],
    scenarioLabel: 'PR_B2_MISSING_RPM',
  });
}

export function buildDuplicateTimestampBundle(
  generatedAt = new Date('2026-11-04T08:00:00.000Z'),
): Ds4RpmRealDataOfflineInputBundleV1 {
  const base = buildSyntheticApiBundleValid(generatedAt);
  const anchorLabel =
    base.motionPayload.events.find((e) => e.kind === 'ACCELERATION')?.startLabel ??
    base.tripInput.rpmPoints[0]?.recordedAtIso ??
    base.tripInput.tripStartIso;
  const tripInput: Ds4RpmHfV1aTripInputV1 = {
    ...base.tripInput,
    rpmPoints: [
      ...base.tripInput.rpmPoints.filter((p) => p.recordedAtIso !== anchorLabel),
      { recordedAtIso: anchorLabel, valueRpm: 1500 },
      { recordedAtIso: anchorLabel, valueRpm: 1600 },
    ],
    dataQuality: {
      ...base.tripInput.dataQuality,
      duplicateTimestampCount: 1,
    },
  };
  const v1bOutcome = processV1b(tripInput, generatedAt);
  const v1bResult = v1bOutcome.kind === 'SUCCEEDED' ? v1bOutcome.result : base.v1bResult;
  return finalizeBundle({
    ...base,
    bundleId: 'fixture-duplicate-ts',
    tripInput,
    v1bResult,
    scenarioLabel: 'PR_B2_DUPLICATE_TS',
  });
}

export const PR_B2_FIXTURE_BUNDLE_BUILDERS = [
  buildSyntheticApiBundleValid,
  buildR1BlockedBundle,
  buildUnknownSourceBundle,
  buildTeslaNotApplicableBundle,
  buildCrossTenantBundle,
  buildWrongSourceLinkBundle,
  buildV1bNonAdmissionBundle,
  buildCadenceMismatchBundle,
  buildMissingRpmWindowBundle,
  buildDuplicateTimestampBundle,
] as const;
