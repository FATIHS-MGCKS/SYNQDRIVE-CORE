import { processDiV0MotionCoreShadowFromEvidenceAdaptation } from '../motion-core-shadow-worker/di-v0-motion-core-shadow-processor';
import type { DiV0MotionCoreShadowPayloadV1 } from '../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import { syntheticDriveEvidence } from '../motion-core-shadow-worker/di-v0-motion-core-shadow-synthetic-drive.harness-fixture';
import type { Ds4RpmHfV1aTripInputV1 } from '../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';
import type { Ds4RpmHfV1bShadowResultV1 } from '../rpm-hf-v1b/ds4-rpm-hf-v1b.contract';
import type {
  Ds4RpmShadowCorrelationInputV1,
  Ds4RpmShadowCorrelationRpmSampleEvidenceV1,
  Ds4RpmShadowCorrelationTripReportV1,
} from './ds4-rpm-shadow-correlation-v1.contract';
import { joinDs4EventsWithRpmEvidenceV1 } from './ds4-rpm-shadow-correlation-temporal-join.v1';
import {
  buildDs4RpmShadowCorrelationProvenanceManifest,
  buildDs4RpmShadowCorrelationTripReport,
} from './ds4-rpm-shadow-correlation-report.v1';

export type Ds4RpmShadowCorrelationHarnessExecuteInput = {
  scenarioId: string | null;
  organizationId: string;
  vehicleId: string;
  tripId: string;
  motionRunId: string;
  motionPayload: DiV0MotionCoreShadowPayloadV1;
  tripInput: Ds4RpmHfV1aTripInputV1;
  v1bResult: Ds4RpmHfV1bShadowResultV1 | null;
  v1bInputFingerprint: string;
  rpmSamples: Ds4RpmShadowCorrelationRpmSampleEvidenceV1 | null;
  codeSha: string;
  generatedAt?: Date;
  omissions?: string[];
  unknowns?: string[];
};

export function buildDefaultSyntheticMotionPayload(): {
  payload: DiV0MotionCoreShadowPayloadV1;
  runId: string;
} {
  const processed = processDiV0MotionCoreShadowFromEvidenceAdaptation(syntheticDriveEvidence(), {
    pinnedSnapshotHash: 'harness-pin',
    combinedInputIdentity: 'harness-input',
  });
  return { payload: processed.payload, runId: 'motion-harness-run-1' };
}

export function executeDs4RpmShadowCorrelationHarness(
  input: Ds4RpmShadowCorrelationHarnessExecuteInput,
): Ds4RpmShadowCorrelationTripReportV1 {
  const generatedAt = input.generatedAt ?? new Date('2026-11-03T12:00:00.000Z');

  const correlationInput: Ds4RpmShadowCorrelationInputV1 = {
    contractVersion: 'ds4-rpm-shadow-correlation-v1',
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    motion: {
      runId: input.motionRunId,
      pinnedSnapshotHash: input.motionPayload.contract.algorithmVersions.bundle,
      inputFingerprint: 'harness-motion-fp',
    },
    events: input.motionPayload.events,
    v1b: input.v1bResult
      ? {
          runId: 'v1b-harness-run-1',
          engineVersion: input.v1bResult.engineVersion,
          inputFingerprint: input.v1bInputFingerprint,
          summary: input.v1bResult,
        }
      : null,
    rpmSamples: input.rpmSamples,
  };

  const joined = joinDs4EventsWithRpmEvidenceV1(correlationInput, {
    payloadForIntensity: input.motionPayload,
  });

  const provenance = buildDs4RpmShadowCorrelationProvenanceManifest({
    codeSha: input.codeSha,
    generatedAt,
    motionRunId: input.motionRunId,
    v1bRunId: input.v1bResult ? 'v1b-harness-run-1' : null,
    v1bInputFingerprint: input.v1bInputFingerprint,
    rpmSampleInputFingerprint: input.rpmSamples?.inputFingerprint ?? null,
    rpmSampleSource: input.rpmSamples?.source ?? null,
    v1bEngineVersion: input.v1bResult?.engineVersion ?? null,
    omissions: [
      'V1B_PERSISTENCE_AGGREGATES_ONLY_NO_RAW_IN_DB',
      ...(input.omissions ?? []),
    ],
    unknowns: input.unknowns ?? ['PRODUCTION_MAIN_DRIFT_NOT_EVALUATED_IN_FIXTURE_REPLAY'],
  });

  return buildDs4RpmShadowCorrelationTripReport({
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    scenarioId: input.scenarioId,
    events: joined,
    provenance,
  });
}

/** Documented gap: frozen Audi/Arteon multicadence replay lives in V1B tier fixtures — not expanded here. */
export const DS4_RPM_SHADOW_CORRELATION_DATASET_GAPS = [
  'AUDI_ARTEON_LIVE_COHORT_REPLAY_NOT_IN_HARNESS_V1',
  'VIDEO_GROUND_TRUTH_INDEPENDENT_VALIDATION_NOT_CLAIMED',
] as const;
